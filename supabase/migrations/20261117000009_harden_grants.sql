-- Supabase security advisor fixes: signed-in-only RPCs are not callable by anon;
-- internal helpers / trigger functions are not exposed through the API.
revoke execute on function public.cancel_order(uuid, text) from public, anon;
revoke execute on function public.create_order(jsonb, jsonb, text, uuid, numeric) from public, anon;
revoke execute on function public.dashboard_stats(int) from public, anon;
-- has_permission stays executable by anon: RLS policies call it for anonymous visitors
-- (it returns false when auth.uid() is null).
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.my_permissions() from public, anon;
revoke execute on function public.resolve_order_review(uuid, text) from public, anon;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.current_role_name() from public, anon, authenticated;
revoke execute on function public.guard_profile_privileges() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = public;
