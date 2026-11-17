-- Integration tests for schema, RLS and RPCs. Run on a fresh DB after
-- stub_supabase.sql + migrations + seed.sql (see scripts/test-db.sh).
-- Every assertion raises on failure; the script must finish with "ALL DB TESTS PASSED".
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.so',    '{"full_name":"Owner"}',    '{"role":"owner"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'cashier@test.so',  '{"full_name":"Cashier"}',  '{"role":"staff"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'amina@test.so',    '{"full_name":"Amina","phone":"252612345678"}', '{}'),
  ('00000000-0000-0000-0000-0000000000b2', 'hassan@test.so',   '{"full_name":"Hassan"}',   '{}');
insert into public.user_permissions (user_id, permission) values
  ('00000000-0000-0000-0000-0000000000c1', 'pos.use'),
  ('00000000-0000-0000-0000-0000000000c1', 'payments.initiate');

create temp table t_ctx (k text primary key, v text);
grant all on t_ctx to authenticated, anon, service_role;

do $$ begin
  assert (select role from profiles where email='owner@test.so') = 'owner', 'owner profile created';
  assert (select count(*) from customers where email='amina@test.so') = 1, 'customer row auto-created';
  assert (select count(*) from customers where email='cashier@test.so') = 0, 'staff has no customer row';
end $$;

-- ---------- anon: catalogue visibility ----------
update products set is_active = false where slug = 'wireless-speaker-system';
set role anon;
do $$ begin
  assert (select count(*) from products) = 7, 'anon sees only active products';
  assert (select count(*) from orders) = 0, 'anon sees no orders';
  assert (select count(*) from wallet_prefixes) >= 4, 'anon can read wallet prefixes';
end $$;
reset role;
update products set is_active = true where slug = 'wireless-speaker-system';

-- ---------- customer A places an online order ----------
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare o orders; p products;
begin
  select * into p from products where slug = 'premium-wireless-headphones';
  o := create_order(
    jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 2, 'variants', '{"Color":"Navy"}'::jsonb)),
    '{"name":"Amina","phone":"252612345678","city":"Mogadishu","district":"Hodan","address":"KM4"}'::jsonb,
    'online', null, 50);
  assert o.subtotal = 179.98, 'subtotal is server-priced: ' || o.subtotal;
  assert o.discount = 0, 'customers cannot self-discount';
  assert o.shipping_fee = 5.99, 'shipping from settings';
  assert o.tax = round(179.98 * 0.05, 2), 'tax 5%';
  assert o.total = 179.98 + 5.99 + round(179.98 * 0.05, 2), 'total';
  assert o.payment_status = 'unpaid' and o.status = 'pending', 'initial statuses';
  insert into t_ctx values ('order_a', o.id::text);

  -- cannot escalate own role
  begin
    update profiles set role = 'admin' where id = auth.uid();
    assert false, 'role escalation must fail';
  exception when raise_exception then null; end;

  -- cannot write payments directly
  begin
    insert into payments (order_id, amount, reference_id) values (o.id, 1, 'x');
    assert false, 'customer must not insert payments';
  exception when insufficient_privilege then null; end;

  -- out of stock
  begin
    perform create_order(jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 9999)), '{}'::jsonb, 'online');
    assert false, 'out of stock must fail';
  exception when raise_exception then
    assert sqlerrm like 'OUT_OF_STOCK:%', 'out of stock code';
  end;

  -- dashboard forbidden
  begin
    perform dashboard_stats(30);
    assert false, 'customer dashboard must fail';
  exception when raise_exception then null; end;

  -- POS channel forbidden for customers
  begin
    perform create_order(jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 1)), '{}'::jsonb, 'pos');
    assert false, 'customer cannot use pos';
  exception when raise_exception then null; end;
end $$;

-- mark_order_paid is not executable by clients
do $$ begin
  begin
    perform mark_order_paid((select v::uuid from t_ctx where k='order_a'));
    assert false, 'mark_order_paid must be service-only';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- customer B isolation ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from orders) = 0, 'customer B cannot see A orders';
  assert (select count(*) from order_items) = 0, 'customer B cannot see A items';
  assert (select count(*) from customers) = 1, 'customer B sees only own customer row';
  begin
    perform cancel_order((select v::uuid from t_ctx where k='order_a'));
    assert false, 'B cannot cancel A order';
  exception when raise_exception then null; end;
end $$;

-- ---------- cashier: POS order ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare o orders; p products; c uuid;
begin
  assert has_permission('pos.use'), 'cashier has pos.use';
  assert not has_permission('users.manage'), 'cashier lacks users.manage';
  assert (select count(*) from orders) = 0, 'cashier cannot see online orders without orders.view';

  insert into customers (full_name, phone) values ('Walk-in Faadumo', '252771234567') returning id into c;
  select * into p from products where slug = 'organic-skincare-set';
  o := create_order(jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 1)),
                    '{"name":"Faadumo","phone":"252771234567"}'::jsonb, 'pos', c, 9.99);
  assert o.channel = 'pos' and o.created_by = auth.uid(), 'pos order attribution';
  assert o.shipping_fee = 0, 'no shipping on POS';
  assert o.discount = 9.99, 'discount applied';
  assert o.total = 79.99 - 9.99 + round(70.00 * 0.05, 2), 'pos total: ' || o.total;
  assert (select count(*) from orders) = 1, 'cashier sees own POS order';
  insert into t_ctx values ('order_pos', o.id::text);
  begin
    perform dashboard_stats(30);
    assert false, 'cashier without dashboard.view must fail';
  exception when raise_exception then null; end;
end $$;

-- ---------- service role: payment approved ----------
reset role;
set request.jwt.claim.role = 'service_role';
set request.jwt.claim.sub = '';
do $$
declare o orders; stock_before int; stock_after int; pid uuid;
begin
  select product_id into pid from order_items where order_id = (select v::uuid from t_ctx where k='order_a');
  select stock into stock_before from products where id = pid;
  o := mark_order_paid((select v::uuid from t_ctx where k='order_a'));
  o := mark_order_paid((select v::uuid from t_ctx where k='order_a'));   -- idempotent
  select stock into stock_after from products where id = pid;
  assert stock_after = stock_before - 2, 'stock decremented exactly once';
  assert o.payment_status = 'paid' and o.status = 'paid' and o.paid_at is not null, 'order paid';
end $$;

-- ---------- customer A cannot cancel a paid order ----------
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin
    perform cancel_order((select v::uuid from t_ctx where k='order_a'));
    assert false, 'paid order cannot be cancelled';
  exception when raise_exception then
    assert sqlerrm like '%ORDER_ALREADY_PAID%', 'paid cancel code';
  end;
end $$;

-- ---------- cashier cancels own unpaid POS order ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ declare o orders; begin
  o := cancel_order((select v::uuid from t_ctx where k='order_pos'), 'customer left');
  assert o.status = 'cancelled', 'pos order cancelled';
end $$;

-- ---------- owner: dashboard ----------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare s jsonb; begin
  assert has_permission('users.manage'), 'owner has everything';
  assert array_length(my_permissions(), 1) = (select count(*) from permissions), 'owner gets all permissions';
  s := dashboard_stats(30);
  assert (s->>'paid_orders')::int = 1, 'dashboard counts paid order';
  assert (s->>'revenue')::numeric > 0, 'dashboard revenue';
  assert (select count(*) from orders) = 2, 'owner sees all orders';
end $$;


-- ---------- payments: start_payment / double-charge guard / refund ----------
reset role;
set request.jwt.claim.role = 'service_role';
set request.jwt.claim.sub = '';
do $$
declare o orders; p products; pay payments; stock0 int; stock1 int;
begin
  -- fresh online order for customer A
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select * into p from products where slug = 'smart-watch-pro';
  o := create_order(jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 1)), '{}'::jsonb, 'online');
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  pay := start_payment(o.id, 'waafipay', 'EVC_PLUS', '252612345678', 'T-1', 'r1',
                       '00000000-0000-0000-0000-0000000000b1');
  assert pay.amount = o.total, 'payment amount taken from order total';
  assert (select payment_status from orders where id = o.id) = 'pending', 'order pending';

  begin
    perform start_payment(o.id, 'waafipay', 'EVC_PLUS', '252612345678', 'T-2', 'r2', null);
    assert false, 'second concurrent attempt must fail';
  exception when raise_exception then assert sqlerrm like '%PAYMENT_IN_PROGRESS%', 'in-progress code'; end;

  -- simulate stale attempt -> next attempt allowed
  update payments set created_at = now() - interval '10 minutes' where id = pay.id;
  pay := start_payment(o.id, 'waafipay', 'ZAAD', '252631234567', 'T-3', 'r3', null);
  assert (select status from payments where reference_id = 'T-1') = 'failed', 'stale attempt expired';

  -- approve
  update payments set status = 'approved', transaction_id = '123' where id = pay.id;
  select stock into stock0 from products where id = p.id;
  perform mark_order_paid(o.id);
  begin
    perform start_payment(o.id, 'waafipay', 'EVC_PLUS', '252612345678', 'T-4', 'r4', null);
    assert false, 'paid order not payable';
  exception when raise_exception then assert sqlerrm like '%ORDER_NOT_PAYABLE%', 'not payable code'; end;

  -- refund restocks once
  perform refund_order(o.id);
  perform refund_order(o.id);
  select stock into stock1 from products where id = p.id;
  assert stock1 = stock0, 'refund restocked exactly once';
  assert (select payment_status from orders where id = o.id) = 'refunded', 'order refunded';
end $$;

-- start_payment / refund_order are not callable by clients
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin
    perform refund_order((select v::uuid from t_ctx where k='order_a'));
    assert false, 'refund_order must be service-only';
  exception when insufficient_privilege then null; end;
end $$;

-- stuck pending order can be cancelled after 3 minutes
reset role;
do $$
declare o orders; p products;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select * into p from products where slug = 'running-shoes-elite';
  o := create_order(jsonb_build_array(jsonb_build_object('product_id', p.id, 'quantity', 1)), '{}'::jsonb, 'online');
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform start_payment(o.id, 'waafipay', 'EVC_PLUS', '252612345678', 'T-9', 'r9', null);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform cancel_order(o.id);
    assert false, 'fresh in-flight payment blocks cancel';
  exception when raise_exception then assert sqlerrm like '%PAYMENT_IN_PROGRESS%', 'blocked'; end;
  update payments set created_at = now() - interval '5 minutes' where reference_id = 'T-9';
  o := cancel_order(o.id, 'stuck');
  assert o.status = 'cancelled' and o.payment_status = 'failed', 'stuck order cancelled';
end $$;

reset role;
select 'ALL DB TESTS PASSED' as result;
