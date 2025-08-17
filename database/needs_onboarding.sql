-- Function: needs_onboarding(uid uuid)
-- Returns true if the given auth user requires onboarding (missing or incomplete profile)
-- Safe to create idempotently

create or replace function public.needs_onboarding(uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_surname text;
  v_phone text;
begin
  -- If there's no matching row, onboarding is needed
  select u.name, u.surname, u.telephone
  into v_name, v_surname, v_phone
  from public.users u
  where u.auth_user_id = uid
  limit 1;

  if not found then
    return true;
  end if;

  if coalesce(trim(v_name), '') = '' then
    return true;
  end if;
  if coalesce(trim(v_surname), '') = '' then
    return true;
  end if;
  if coalesce(trim(v_phone), '') = '' then
    return true;
  end if;

  return false;
end;
$$;

-- Optional: grant execute to anon/authenticated roles as needed
-- grant execute on function public.needs_onboarding(uuid) to anon, authenticated;
