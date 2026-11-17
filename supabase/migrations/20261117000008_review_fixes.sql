-- =====================================================================
-- Fixes from the independent security/integration review
--  * stock: aggregate per product on order, record what was actually
--    deducted, flag (never silently clamp) shortages, restock only that
--  * cashier discount cap (store_settings.max_cashier_discount_pct)
--  * fulfilment state machine in update_order_status
--  * stale payment window 6 min (WaafiPay gives the payer 5 min), and
--    expiring stale attempts also resets orders.payment_status
--  * orders.needs_review flag for staff follow-up
-- =====================================================================

alter table public.orders
  add column if not exists needs_review  boolean not null default false,
  add column if not exists review_reason text;
alter table public.order_items
  add column if not exists stock_deducted int not null default 0;
alter table public.store_settings
  add column if not exists max_cashier_discount_pct numeric(5,4) not null default 0.20
    check (max_cashier_discount_pct between 0 and 1);

create index if not exists orders_needs_review_idx on public.orders(needs_review) where needs_review;

-- Expires in-flight attempts older than p_stale_after; resets the order's
-- payment_status to 'failed' when nothing is in flight any more.
create or replace function public.expire_stale_payments(p_order_id uuid, p_stale_after interval default interval '6 minutes')
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments
     set status = 'failed', response_code = 'TIMEOUT',
         response_msg = coalesce(response_msg, 'Stale attempt: no final gateway result')
   where order_id = p_order_id and status in ('initiated', 'pending')
     and created_at < now() - p_stale_after;

  update public.orders set payment_status = 'failed'
   where id = p_order_id and payment_status = 'pending'
     and not exists (select 1 from public.payments
                      where order_id = p_order_id and status in ('initiated', 'pending'));
end $$;
revoke execute on function public.expire_stale_payments(uuid, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order: per-product aggregated stock check + discount cap
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_items jsonb,
  p_shipping jsonb default '{}'::jsonb,
  p_channel text default 'online',
  p_customer_id uuid default null,
  p_discount numeric default 0
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_settings  public.store_settings;
  v_order     public.orders;
  v_customer  uuid;
  v_item      jsonb;
  v_product   public.products;
  v_qty       int;
  v_need      record;
  v_subtotal  numeric(12,2) := 0;
  v_shipping  numeric(12,2) := 0;
  v_tax       numeric(12,2) := 0;
  v_discount  numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_channel not in ('online','pos') then raise exception 'INVALID_CHANNEL'; end if;

  select * into v_settings from public.store_settings where id = 1;

  if p_channel = 'pos' then
    if not public.has_permission('pos.use') then raise exception 'FORBIDDEN'; end if;
    v_customer := p_customer_id;
  else
    v_discount := 0;
    select id into v_customer from public.customers where user_id = v_uid;
    if v_customer is null then
      insert into public.customers (user_id, full_name, phone, email)
      select v_uid, coalesce(p_shipping->>'name', pr.full_name), coalesce(p_shipping->>'phone', pr.phone), pr.email
      from public.profiles pr where pr.id = v_uid
      returning id into v_customer;
    end if;
  end if;

  -- Validate quantities, then lock products and check stock per product
  -- (the same product may appear on several variant lines).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'quantity')::int, 0) <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  end loop;
  for v_need in
    select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::int) as qty
      from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    select * into v_product from public.products where id = v_need.product_id and is_active for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.stock < v_need.qty then raise exception 'OUT_OF_STOCK:%', v_product.name; end if;
  end loop;

  insert into public.orders (channel, customer_id, user_id, created_by, currency,
                             shipping_name, shipping_phone, shipping_address,
                             shipping_city, shipping_district, notes)
  values (p_channel, v_customer,
          case when p_channel = 'online' then v_uid else (select user_id from public.customers where id = v_customer) end,
          case when p_channel = 'pos' then v_uid else null end,
          v_settings.currency,
          p_shipping->>'name', p_shipping->>'phone', p_shipping->>'address',
          p_shipping->>'city', p_shipping->>'district', p_shipping->>'notes')
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    insert into public.order_items (order_id, product_id, product_name, sku, image,
                                    unit_price, quantity, variants, line_total)
    values (v_order.id, v_product.id, v_product.name, v_product.sku, v_product.images[1],
            v_product.price, v_qty, coalesce(v_item->'variants', '{}'::jsonb),
            round(v_product.price * v_qty, 2));
    v_subtotal := v_subtotal + round(v_product.price * v_qty, 2);
  end loop;

  if p_channel = 'online' then
    v_shipping := case when v_settings.free_shipping_over is not null
                        and v_subtotal >= v_settings.free_shipping_over then 0
                       else v_settings.shipping_fee end;
  end if;

  -- Discount: must leave a positive total; cashiers are capped.
  if v_discount > 0 then
    if v_discount >= v_subtotal then raise exception 'DISCOUNT_TOO_HIGH'; end if;
    if not public.has_permission('orders.manage')
       and v_discount > round(v_subtotal * v_settings.max_cashier_discount_pct, 2) then
      raise exception 'DISCOUNT_TOO_HIGH';
    end if;
  end if;
  v_tax := round((v_subtotal - v_discount) * v_settings.tax_rate, 2);

  update public.orders
     set subtotal = v_subtotal, shipping_fee = v_shipping, tax = v_tax,
         discount = v_discount,
         total = v_subtotal - v_discount + v_shipping + v_tax
   where id = v_order.id
   returning * into v_order;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'order.create', 'order', v_order.id::text,
          jsonb_build_object('channel', p_channel, 'total', v_order.total, 'discount', v_discount));
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- mark_order_paid: deduct what is available, record it, flag shortages
-- ---------------------------------------------------------------------
create or replace function public.mark_order_paid(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item  public.order_items;
  v_stock int;
  v_take  int;
  v_short text[] := '{}';
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status = 'paid' then return v_order; end if;  -- idempotent

  for v_item in select * from public.order_items where order_id = p_order_id loop
    if v_item.product_id is null then continue; end if;
    select stock into v_stock from public.products where id = v_item.product_id for update;
    v_take := least(coalesce(v_stock, 0), v_item.quantity);
    update public.products set stock = stock - v_take where id = v_item.product_id;
    update public.order_items set stock_deducted = v_take where id = v_item.id;
    if v_take < v_item.quantity then
      v_short := v_short || format('%s (%s/%s)', v_item.product_name, v_take, v_item.quantity);
    end if;
  end loop;

  update public.orders
     set payment_status = 'paid',
         status = case when status = 'pending' then 'paid' else status end,
         paid_at = now(),
         needs_review = needs_review or cardinality(v_short) > 0 or v_order.status = 'cancelled',
         review_reason = concat_ws('; ', review_reason,
           case when cardinality(v_short) > 0 then 'STOCK_SHORT: ' || array_to_string(v_short, ', ') end,
           case when v_order.status = 'cancelled' then 'PAID_AFTER_CANCEL' end)
   where id = p_order_id
   returning * into v_order;

  if v_order.needs_review then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (null, 'order.needs_review', 'order', p_order_id::text,
            jsonb_build_object('reason', v_order.review_reason));
  end if;
  return v_order;
end $$;
revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- refund_order: restock only what was actually deducted
-- ---------------------------------------------------------------------
create or replace function public.refund_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item  public.order_items;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status = 'refunded' then return v_order; end if;
  if v_order.payment_status <> 'paid' then raise exception 'ORDER_NOT_PAID'; end if;

  for v_item in select * from public.order_items where order_id = p_order_id loop
    if v_item.product_id is not null and v_item.stock_deducted > 0 then
      update public.products set stock = stock + v_item.stock_deducted where id = v_item.product_id;
      update public.order_items set stock_deducted = 0 where id = v_item.id;
    end if;
  end loop;

  update public.orders set payment_status = 'refunded', status = 'refunded'
   where id = p_order_id returning * into v_order;
  return v_order;
end $$;
revoke execute on function public.refund_order(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- start_payment: 6-minute stale window, resets order status on expiry
-- ---------------------------------------------------------------------
create or replace function public.start_payment(
  p_order_id      uuid,
  p_provider      text,
  p_wallet        text,
  p_account_no    text,
  p_reference_id  text,
  p_request_id    text,
  p_initiated_by  uuid,
  p_status        text default 'pending',
  p_stale_after   interval default interval '6 minutes'
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_order   public.orders;
  v_payment public.payments;
begin
  if p_status not in ('pending', 'approved') then raise exception 'INVALID_STATUS'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.payment_status in ('paid', 'refunded')
     or v_order.status in ('cancelled', 'refunded')
     or v_order.total <= 0 then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  perform public.expire_stale_payments(p_order_id, p_stale_after);

  if exists (select 1 from public.payments
              where order_id = p_order_id and status in ('initiated', 'pending')) then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  insert into public.payments (order_id, provider, wallet, account_no, amount, currency,
                               status, reference_id, request_id, initiated_by)
  values (p_order_id, p_provider, p_wallet, p_account_no, v_order.total, v_order.currency,
          p_status, p_reference_id, p_request_id, p_initiated_by)
  returning * into v_payment;

  if p_status = 'pending' then
    update public.orders set payment_status = 'pending' where id = p_order_id;
  end if;
  return v_payment;
end $$;
revoke execute on function public.start_payment(uuid, text, text, text, text, text, uuid, text, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- cancel_order: 6-minute stale window
-- ---------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_order.user_id = auth.uid()
          or public.has_permission('orders.manage')
          or (v_order.created_by = auth.uid() and public.has_permission('pos.use'))) then
    raise exception 'FORBIDDEN';
  end if;
  if v_order.payment_status in ('paid', 'refunded') then raise exception 'ORDER_ALREADY_PAID'; end if;
  if v_order.status = 'cancelled' then return v_order; end if;

  perform public.expire_stale_payments(p_order_id);

  if exists (select 1 from public.payments
              where order_id = p_order_id and status in ('initiated', 'pending')) then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.orders
     set status = 'cancelled', cancelled_at = now(),
         notes = coalesce(notes, '') || case when p_reason is not null then E'\n[cancel] ' || p_reason else '' end
   where id = p_order_id returning * into v_order;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- update_order_status: fulfilment only, on paid orders, forward-only
-- ---------------------------------------------------------------------
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.has_permission('orders.manage') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('processing','shipped','delivered') then raise exception 'INVALID_STATUS'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('cancelled','refunded') then raise exception 'INVALID_TRANSITION'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'ORDER_NOT_PAID'; end if;

  update public.orders set status = p_status where id = p_order_id returning * into v_order;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.status', 'order', p_order_id::text, jsonb_build_object('status', p_status));
  return v_order;
end $$;

-- Staff can clear the review flag once handled.
create or replace function public.resolve_order_review(p_order_id uuid, p_note text default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.has_permission('orders.manage') then raise exception 'FORBIDDEN'; end if;
  update public.orders
     set needs_review = false,
         notes = coalesce(notes, '') || E'\n[review resolved] ' || coalesce(p_note, '')
   where id = p_order_id returning * into v_order;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.review_resolved', 'order', p_order_id::text, jsonb_build_object('note', p_note));
  return v_order;
end $$;
grant execute on function public.resolve_order_review(uuid, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.start_payment(uuid, text, text, text, text, text, uuid, text, interval) to service_role;
    grant execute on function public.refund_order(uuid) to service_role;
    grant execute on function public.mark_order_paid(uuid) to service_role;
    grant execute on function public.expire_stale_payments(uuid, interval) to service_role;
  end if;
end $$;
