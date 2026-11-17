-- Lets staff see the display name of another staff member (e.g. the cashier
-- printed on a reprinted receipt) without exposing the whole profiles table.
create or replace function public.staff_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select full_name from public.profiles
  where id = p_user_id and role in ('owner','admin','staff') and public.is_staff()
$$;
revoke execute on function public.staff_display_name(uuid) from public, anon;
grant execute on function public.staff_display_name(uuid) to authenticated;
