-- Harden super_admin grant: only grant when the email is verified, and re-check at verification time.
create or replace function public.grant_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and lower(new.email) = 'divintelteam@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'super_admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

create or replace trigger on_auth_user_confirmed_grant_platform_admin
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.grant_platform_admin();