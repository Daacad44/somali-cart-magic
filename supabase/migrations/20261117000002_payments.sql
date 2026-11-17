-- =====================================================================
-- Payments support for the `waafi-pay` edge function (service role only)
--   start_payment(...)  — atomic double-charge guard + payment row insert
--   refund_order(...)   — marks a paid order refunded and restocks items
-- =====================================================================

-- Atomically starts a payment attempt for an order:
--  * locks the order row (serialises concurrent attempts),
--  * marks in-flight payments older than p_stale_after as failed/TIMEOUT,
--  * refuses paid/refunded/cancelled/zero-total orders (ORDER_NOT_PAYABLE),
--  * refuses while another attempt is in flight (PAYMENT_IN_PROGRESS),
--  * inserts the payments row with amount/currency taken from the order,
--  * sets orders.payment_status = 'pending' (unless inserted as approved, e.g. cash).
create or replace function public.start_payment(
  p_order_id      uuid,
  p_provider      text,
  p_wallet        text,
  p_account_no    text,
  p_reference_id  text,
  p_request_id    text,
  p_initiated_by  uuid,
  p_status        text default 'pending',
  p_stale_after   interval default interval '3 minutes'
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_order   public.orders;
  v_payment public.payments;
begin
  if p_status not in ('pending', 'approved') then raise exception 'INVALID_STATUS'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  update public.payments
     set status = 'failed',
         response_code = 'TIMEOUT',
         response_msg = coalesce(response_msg, 'Stale attempt: no final gateway result')
   where order_id = p_order_id
     and status in ('initiated', 'pending')
     and created_at < now() - p_stale_after;

  if v_order.payment_status in ('paid', 'refunded')
     or v_order.status in ('cancelled', 'refunded')
     or v_order.total <= 0 then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

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

-- Marks a paid order as refunded and puts the items back in stock.
-- Idempotent: calling it on an already refunded order is a no-op.
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
    if v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
     set payment_status = 'refunded',
         status = 'refunded'
   where id = p_order_id
   returning * into v_order;
  return v_order;
end $$;

revoke execute on function public.start_payment(uuid, text, text, text, text, text, uuid, text, interval)
  from public, anon, authenticated;
revoke execute on function public.refund_order(uuid) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.start_payment(uuid, text, text, text, text, text, uuid, text, interval) to service_role;
    grant execute on function public.refund_order(uuid) to service_role;
    grant execute on function public.mark_order_paid(uuid) to service_role;
  end if;
end $$;

-- Speeds up the in-flight lookup above.
create index if not exists payments_order_status_idx on public.payments(order_id, status);
