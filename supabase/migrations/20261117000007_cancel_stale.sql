-- cancel_order: an order whose payment attempt never got a final gateway
-- result (e.g. the edge function was killed) must not stay un-cancellable.
-- Attempts older than 3 minutes are expired before the check.
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

  update public.payments
     set status = 'failed', response_code = 'TIMEOUT',
         response_msg = coalesce(response_msg, 'Stale attempt: no final gateway result')
   where order_id = p_order_id and status in ('initiated', 'pending')
     and created_at < now() - interval '3 minutes';

  if exists (select 1 from public.payments
              where order_id = p_order_id and status in ('initiated', 'pending')) then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.orders
     set status = 'cancelled', cancelled_at = now(),
         payment_status = case when payment_status = 'pending' then 'failed' else payment_status end,
         notes = coalesce(notes, '') || case when p_reason is not null then E'\n[cancel] ' || p_reason else '' end
   where id = p_order_id returning * into v_order;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
  return v_order;
end $$;
