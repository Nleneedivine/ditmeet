revoke execute on function public.grant_platform_admin() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
-- has_role stays callable by authenticated: the app and RLS-adjacent checks use it, and it only reveals role membership