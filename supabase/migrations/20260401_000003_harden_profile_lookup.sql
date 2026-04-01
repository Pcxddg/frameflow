drop function if exists public.lookup_profile_by_email(text);

create or replace function public.lookup_profile_by_email(target_board_id text, target_email text)
returns table(id uuid, email_lowercase text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email_lowercase
  from public.profiles p
  where public.board_role(target_board_id) = 'owner'
    and p.email_lowercase = lower(trim(target_email))
  limit 1;
$$;

revoke all on function public.lookup_profile_by_email(text, text) from public;
grant execute on function public.lookup_profile_by_email(text, text) to authenticated;
grant execute on function public.lookup_profile_by_email(text, text) to service_role;
