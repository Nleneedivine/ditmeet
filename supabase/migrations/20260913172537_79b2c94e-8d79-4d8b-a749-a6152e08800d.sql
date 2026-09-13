-- Trigger functions should not be callable via the API at all
revoke execute on function public.grant_platform_admin() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
-- has_role is used by the app when signed in; keep it for authenticated only
revoke execute on function public.has_role(uuid, public.app_role) from anon;