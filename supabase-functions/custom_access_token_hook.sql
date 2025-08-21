-- Custom Access Token (JWT) Claims hook: single JSONB arg and JSONB return
-- This signature is required for the function to appear in the Supabase Hooks UI
-- Schema must be public
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_is_active boolean;
  v_event jsonb := event;
begin
  -- Extract the authenticated user's UUID from the event
  v_uid := coalesce(
    (event->'user'->>'id')::uuid,
    (event->>'user_id')::uuid,
    (event->'claims'->>'sub')::uuid
  );

  if v_uid is null then
    return v_event;
  end if;

  select u.is_active into v_is_active
  from public.users u
  where u.auth_user_id = v_uid
  limit 1;

  -- Block token issuance for deactivated users and return a friendly message
  if coalesce(v_is_active, true) = false then
    -- Supabase surface will surface this message; choose a clear Spanish message
    raise exception using errcode = '28000', message = 'Cuenta desactivada, contactar con el administrador';
  end if;

  -- Optionally enrich claims (example: include role_id)
  return jsonb_set(
    v_event,
    '{claims}',
    coalesce(v_event->'claims','{}'::jsonb) || jsonb_build_object(
      'role_id', coalesce((select u.role_id from public.users u where u.auth_user_id = v_uid), 0)
    ),
    true
  );
end;
$$;

-- Allow the auth hook invoker to execute it
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
