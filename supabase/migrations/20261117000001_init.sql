-- =====================================================================
-- Botan E-commerce — core schema
-- Roles: owner > admin > staff (granular permissions) > customer
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profiles & permissions
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  email       text,
  role        text not null default 'customer'
              check (role in ('owner','admin','staff','customer')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Catalogue of grantable permissions (staff only; owner/admin have all)
create table public.permissions (
  key          text primary key,
  label_en     text not null,
  label_so     text not null,
  group_name   text not null,
  sort_order   int  not null default 0
);

insert into public.permissions (key, label_en, label_so, group_name, sort_order) values
  ('dashboard.view',     'View dashboard',            'Arag dashboard-ka',           'general',   10),
  ('reports.view',       'View reports',              'Arag warbixinnada',           'general',   20),
  ('pos.use',            'Use POS / cashier',         'Isticmaal POS / khasnajiga',  'sales',     30),
  ('payments.initiate',  'Send payment requests',     'Dir codsiga lacag-bixinta',   'sales',     40),
  ('payments.refund',    'Reverse / refund payments', 'Celi lacagaha',               'sales',     50),
  ('orders.view',        'View all orders',           'Arag dhammaan dalabyada',     'orders',    60),
  ('orders.manage',      'Update / cancel orders',    'Wax ka beddel / jooji dalab', 'orders',    70),
  ('customers.view',     'View customers',            'Arag macaamiisha',            'customers', 80),
  ('customers.manage',   'Create / edit customers',   'Abuur / beddel macaamiil',    'customers', 90),
  ('products.manage',    'Manage products & stock',   'Maamul alaabta & kaydka',     'catalog',  100),
  ('users.manage',       'Manage users & permissions','Maamul isticmaalayaasha',     'admin',    110),
  ('settings.manage',    'Manage store settings',     'Maamul settings-ka',          'admin',    120);

create table public.user_permissions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  permission  text not null references public.permissions(key) on delete cascade,
  granted_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, permission)
);

-- ---------------------------------------------------------------------
-- Permission helpers (security definer => usable inside RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_active and (
      pr.role in ('owner','admin')
      or (pr.role = 'staff' and exists (
            select 1 from public.user_permissions up
            where up.user_id = pr.id and up.permission = p))
    )
  )
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and is_active and role in ('owner','admin','staff'))
$$;

create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when (select role from public.profiles where id = auth.uid() and is_active) in ('owner','admin')
      then array(select key from public.permissions order by sort_order)
    else array(select permission from public.user_permissions where user_id = auth.uid()
               and exists (select 1 from public.profiles where id = auth.uid() and is_active))
  end
$$;

-- ---------------------------------------------------------------------
-- Store settings & wallet routing
-- ---------------------------------------------------------------------
create table public.store_settings (
  id              int primary key default 1 check (id = 1),
  store_name      text not null default 'Botan E-commerce',
  currency        text not null default 'USD',
  shipping_fee    numeric(12,2) not null default 5.99,
  free_shipping_over numeric(12,2),
  tax_rate        numeric(5,4) not null default 0.05,   -- 0.05 = 5%
  phone           text,
  address         text,
  receipt_footer  text default 'Mahadsanid! Thank you for shopping with us.',
  updated_at      timestamptz not null default now()
);
insert into public.store_settings (id) values (1);

-- Maps the first digits of a local Somali number (after 252) to a wallet.
-- Admin-editable: VERIFY these with your WaafiPay account manager.
create table public.wallet_prefixes (
  prefix        text primary key check (prefix ~ '^[0-9]{1,4}$'),
  wallet        text not null check (wallet in ('EVC_PLUS','ZAAD','SAHAL','WAAFI','JEEB','EDAHAB')),
  provider_name text not null,
  is_active     boolean not null default true
);
insert into public.wallet_prefixes (prefix, wallet, provider_name) values
  ('61', 'EVC_PLUS', 'Hormuud'),
  ('77', 'EVC_PLUS', 'Hormuud'),
  ('63', 'ZAAD',     'Telesom'),
  ('90', 'SAHAL',    'Golis');

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_so     text,
  slug        text not null unique,
  description text,
  icon        text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  name_so          text,
  slug             text not null unique,
  description      text,
  description_so   text,
  category_id      uuid references public.categories(id) on delete set null,
  price            numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  sku              text unique,
  stock            int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 5,
  images           text[] not null default '{}',
  -- [{ "type": "Size", "options": ["S","M"] }]
  variant_options  jsonb not null default '[]'::jsonb,
  tags             text[] not null default '{}',
  is_active        boolean not null default true,
  is_featured      boolean not null default false,
  flash_sale_ends_at timestamptz,
  rating           numeric(2,1) not null default 0,
  review_count     int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_active_idx on public.products(is_active);
create index products_search_idx on public.products
  using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(name_so,'') || ' ' || coalesce(description,'')));

-- ---------------------------------------------------------------------
-- Customers (may or may not have a login)
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  full_name   text not null,
  phone       text,
  email       text,
  address     text,
  city        text,
  district    text,
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone);
create index customers_name_idx on public.customers(lower(full_name));

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique
                  default ('ORD-' || nextval('public.order_number_seq')::text),
  channel         text not null default 'online' check (channel in ('online','pos')),
  customer_id     uuid references public.customers(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,  -- customer login that placed it
  created_by      uuid references public.profiles(id),                -- staff (POS)
  status          text not null default 'pending'
                  check (status in ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  payment_status  text not null default 'unpaid'
                  check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  subtotal        numeric(12,2) not null default 0,
  shipping_fee    numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  currency        text not null default 'USD',
  shipping_name   text,
  shipping_phone  text,
  shipping_address text,
  shipping_city   text,
  shipping_district text,
  notes           text,
  paid_at         timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id);
create index orders_customer_idx on public.orders(customer_id);
create index orders_created_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  sku           text,
  image         text,
  unit_price    numeric(12,2) not null,
  quantity      int not null check (quantity > 0),
  variants      jsonb not null default '{}'::jsonb,
  line_total    numeric(12,2) not null
);
create index order_items_order_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------
-- Payments (written only by edge functions with service role)
-- ---------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  provider              text not null default 'waafipay' check (provider in ('waafipay','cash')),
  wallet                text check (wallet in ('EVC_PLUS','ZAAD','SAHAL','WAAFI','JEEB','EDAHAB','CASH')),
  account_no            text,
  amount                numeric(12,2) not null,
  currency              text not null default 'USD',
  status                text not null default 'initiated'
                        check (status in ('initiated','pending','approved','failed','cancelled','reversed')),
  reference_id          text not null unique,
  request_id            text,
  transaction_id        text,
  issuer_transaction_id text,
  response_code         text,
  response_msg          text,
  raw_response          jsonb,
  initiated_by          uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);
create index payments_created_idx on public.payments(created_at desc);

-- ---------------------------------------------------------------------
-- Wishlist & audit
-- ---------------------------------------------------------------------
create table public.wishlists (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger t_profiles_touch  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger t_products_touch  before update on public.products  for each row execute function public.touch_updated_at();
create trigger t_customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger t_orders_touch    before update on public.orders    for each row execute function public.touch_updated_at();
create trigger t_payments_touch  before update on public.payments  for each row execute function public.touch_updated_at();

-- Non-privileged users can never change their own role / active flag.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Only the user-management service can change role or status';
  end if;
  return new;
end $$;
create trigger t_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- New auth user => profile + linked customer record
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text := coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1));
  v_phone text := coalesce(new.raw_user_meta_data->>'phone', new.phone);
  v_role  text := coalesce(new.raw_app_meta_data->>'role', 'customer');
begin
  if v_role not in ('owner','admin','staff','customer') then v_role := 'customer'; end if;
  insert into public.profiles (id, full_name, phone, email, role)
  values (new.id, v_name, v_phone, new.email, v_role)
  on conflict (id) do nothing;

  if v_role = 'customer' then
    insert into public.customers (user_id, full_name, phone, email)
    values (new.id, v_name, v_phone, new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RPCs
-- =====================================================================

-- Creates an order with server-side pricing.
-- p_items:    [{ "product_id": uuid, "quantity": int, "variants": {..} }]
-- p_shipping: { name, phone, address, city, district, notes }
-- p_channel:  'online' (logged-in customer) | 'pos' (staff with pos.use)
-- p_customer_id: required for POS (existing customer) — may be null for walk-in
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
    v_discount := 0;  -- customers cannot self-discount
    select id into v_customer from public.customers where user_id = v_uid;
    if v_customer is null then
      insert into public.customers (user_id, full_name, phone, email)
      select v_uid, coalesce(p_shipping->>'name', pr.full_name), coalesce(p_shipping->>'phone', pr.phone), pr.email
      from public.profiles pr where pr.id = v_uid
      returning id into v_customer;
    end if;
  end if;

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
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;

    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_active
      for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_product.name;
    end if;

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
  v_discount := least(v_discount, v_subtotal);
  v_tax := round((v_subtotal - v_discount) * v_settings.tax_rate, 2);

  update public.orders
     set subtotal = v_subtotal, shipping_fee = v_shipping, tax = v_tax,
         discount = v_discount,
         total = v_subtotal - v_discount + v_shipping + v_tax
   where id = v_order.id
   returning * into v_order;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'order.create', 'order', v_order.id::text,
          jsonb_build_object('channel', p_channel, 'total', v_order.total));

  return v_order;
end $$;

-- Called by the payment edge function (service role) when WaafiPay approves.
create or replace function public.mark_order_paid(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_item public.order_items;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status = 'paid' then return v_order; end if;  -- idempotent

  for v_item in select * from public.order_items where order_id = p_order_id loop
    update public.products set stock = greatest(stock - v_item.quantity, 0)
     where id = v_item.product_id;
  end loop;

  update public.orders
     set payment_status = 'paid',
         status = case when status = 'pending' then 'paid' else status end,
         paid_at = now()
   where id = p_order_id
   returning * into v_order;
  return v_order;
end $$;
revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated;

-- Cancel an unpaid order (customer: own order; staff: orders.manage or creator with pos.use)
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
  if v_order.payment_status = 'paid' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if v_order.payment_status = 'pending' then raise exception 'PAYMENT_IN_PROGRESS'; end if;

  update public.orders set status = 'cancelled', cancelled_at = now(),
         notes = coalesce(notes, '') || case when p_reason is not null then E'\n[cancel] ' || p_reason else '' end
   where id = p_order_id returning * into v_order;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
  return v_order;
end $$;

-- Staff: move an order through fulfilment
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.has_permission('orders.manage') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('processing','shipped','delivered','cancelled') then raise exception 'INVALID_STATUS'; end if;
  update public.orders set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_order_id returning * into v_order;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.status', 'order', p_order_id::text, jsonb_build_object('status', p_status));
  return v_order;
end $$;

-- Dashboard KPIs
create or replace function public.dashboard_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_permission('dashboard.view') then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'revenue',        coalesce((select sum(total) from orders where payment_status = 'paid'
                                and paid_at >= now() - make_interval(days => p_days)), 0),
    'revenue_prev',   coalesce((select sum(total) from orders where payment_status = 'paid'
                                and paid_at <  now() - make_interval(days => p_days)
                                and paid_at >= now() - make_interval(days => p_days * 2)), 0),
    'orders',         (select count(*) from orders where created_at >= now() - make_interval(days => p_days)),
    'orders_prev',    (select count(*) from orders where created_at < now() - make_interval(days => p_days)
                                and created_at >= now() - make_interval(days => p_days * 2)),
    'paid_orders',    (select count(*) from orders where payment_status = 'paid'
                                and paid_at >= now() - make_interval(days => p_days)),
    'customers',      (select count(*) from customers),
    'new_customers',  (select count(*) from customers where created_at >= now() - make_interval(days => p_days)),
    'products',       (select count(*) from products where is_active),
    'pending_payments', (select count(*) from payments where status in ('initiated','pending')),
    'by_wallet',      coalesce((select jsonb_agg(x) from (
                         select wallet, count(*) as count, sum(amount) as amount
                         from payments where status = 'approved'
                           and created_at >= now() - make_interval(days => p_days)
                         group by wallet order by sum(amount) desc) x), '[]'::jsonb),
    'by_channel',     coalesce((select jsonb_agg(x) from (
                         select channel, count(*) as count, sum(total) as amount
                         from orders where payment_status = 'paid'
                           and paid_at >= now() - make_interval(days => p_days)
                         group by channel) x), '[]'::jsonb),
    'daily',          coalesce((select jsonb_agg(x order by x.day) from (
                         select d::date as day,
                                coalesce((select sum(total) from orders o
                                          where o.payment_status = 'paid' and o.paid_at::date = d::date), 0) as revenue,
                                (select count(*) from orders o where o.created_at::date = d::date) as orders
                         from generate_series(now() - make_interval(days => p_days - 1), now(), interval '1 day') d) x), '[]'::jsonb),
    'low_stock',      coalesce((select jsonb_agg(x) from (
                         select id, name, stock, low_stock_threshold from products
                         where is_active and stock <= low_stock_threshold
                         order by stock asc limit 10) x), '[]'::jsonb),
    'top_products',   coalesce((select jsonb_agg(x) from (
                         select oi.product_id, oi.product_name, sum(oi.quantity) as quantity, sum(oi.line_total) as amount
                         from order_items oi join orders o on o.id = oi.order_id
                         where o.payment_status = 'paid' and o.paid_at >= now() - make_interval(days => p_days)
                         group by oi.product_id, oi.product_name
                         order by sum(oi.line_total) desc limit 5) x), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.permissions      enable row level security;
alter table public.user_permissions enable row level security;
alter table public.store_settings   enable row level security;
alter table public.wallet_prefixes  enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;
alter table public.wishlists        enable row level security;
alter table public.audit_log        enable row level security;

-- profiles
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.has_permission('users.manage'));
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- permissions catalogue: readable by any signed-in user
create policy permissions_select on public.permissions for select using (auth.uid() is not null);

-- user_permissions: own rows, or user managers (writes go through edge function)
create policy user_permissions_select on public.user_permissions for select
  using (user_id = auth.uid() or public.has_permission('users.manage'));

-- settings & wallet prefixes: public read, settings.manage write
create policy settings_select on public.store_settings for select using (true);
create policy settings_update on public.store_settings for update
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create policy prefixes_select on public.wallet_prefixes for select using (true);
create policy prefixes_write on public.wallet_prefixes for all
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

-- catalogue
create policy categories_select on public.categories for select
  using (is_active or public.has_permission('products.manage'));
create policy categories_write on public.categories for all
  using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));

create policy products_select on public.products for select
  using (is_active or public.has_permission('products.manage') or public.has_permission('pos.use'));
create policy products_write on public.products for all
  using (public.has_permission('products.manage')) with check (public.has_permission('products.manage'));

-- customers
create policy customers_select on public.customers for select
  using (user_id = auth.uid() or public.has_permission('customers.view')
         or public.has_permission('customers.manage') or public.has_permission('pos.use'));
create policy customers_insert on public.customers for insert
  with check (public.has_permission('customers.manage') or public.has_permission('pos.use'));
create policy customers_update on public.customers for update
  using (user_id = auth.uid() or public.has_permission('customers.manage'))
  with check (user_id = auth.uid() or public.has_permission('customers.manage'));
create policy customers_delete on public.customers for delete
  using (public.has_permission('customers.manage'));

-- orders (inserts only through create_order RPC)
create policy orders_select on public.orders for select
  using (user_id = auth.uid()
         or public.has_permission('orders.view')
         or public.has_permission('orders.manage')
         or (created_by = auth.uid() and public.has_permission('pos.use')));

create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id));  -- inherits orders RLS

-- payments (writes only by service role)
create policy payments_select on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id));

-- wishlists
create policy wishlists_own on public.wishlists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log
create policy audit_select on public.audit_log for select
  using (public.has_permission('users.manage') or public.has_permission('reports.view'));

-- =====================================================================
-- Grants for RPCs
-- =====================================================================
grant execute on function public.has_permission(text)   to authenticated;
grant execute on function public.my_permissions()        to authenticated;
grant execute on function public.is_staff()              to authenticated;
grant execute on function public.create_order(jsonb, jsonb, text, uuid, numeric) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.dashboard_stats(int) to authenticated;

-- =====================================================================
-- Realtime (live payment status in checkout & POS)
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payments;
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- =====================================================================
-- Storage bucket for product images
-- =====================================================================
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
      on conflict (id) do nothing;
    execute $p$create policy "product images public read" on storage.objects for select
              using (bucket_id = 'product-images')$p$;
    execute $p$create policy "product images staff write" on storage.objects for insert
              with check (bucket_id = 'product-images' and public.has_permission('products.manage'))$p$;
    execute $p$create policy "product images staff update" on storage.objects for update
              using (bucket_id = 'product-images' and public.has_permission('products.manage'))$p$;
    execute $p$create policy "product images staff delete" on storage.objects for delete
              using (bucket_id = 'product-images' and public.has_permission('products.manage'))$p$;
  end if;
end $$;
