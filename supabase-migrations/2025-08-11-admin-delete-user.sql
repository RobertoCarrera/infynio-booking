-- Admin cascade deletion for users
-- Ensures dependent rows (bookings, user_packages, etc.) are removed before deleting the users row
-- SECURITY DEFINER with admin role check via auth.uid() against public.users.role_id

create or replace function admin_delete_user(p_auth_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoker uuid := auth.uid();
  v_role int;
  v_user_id bigint;
  v_deleted_bookings int := 0;
  v_deleted_packages int := 0;
begin
  if v_invoker is null then
    raise exception 'Not authenticated';
  end if;

  select role_id into v_role from users where auth_user_id = v_invoker;
  if v_role is distinct from 1 then
    raise exception 'Admin role required';
  end if;

  select id into v_user_id from users where auth_user_id = p_auth_user_id;
  if v_user_id is null then
    return json_build_object('success', false, 'message', 'User not found');
  end if;

  -- Remove dependent rows first
  delete from bookings where user_id = v_user_id;
  get diagnostics v_deleted_bookings = row_count;

  delete from user_packages where user_id = v_user_id;
  get diagnostics v_deleted_packages = row_count;

  -- Optional: clean other dependencies here (payments, etc.) if present
  -- delete from payments where user_id = v_user_id;

  -- Finally remove the user row
  delete from users where id = v_user_id;

  return json_build_object(
    'success', true,
    'deleted_bookings', v_deleted_bookings,
    'deleted_packages', v_deleted_packages,
    'message', 'User data deleted'
  );
exception
  when others then
    return json_build_object('success', false, 'message', SQLERRM);
end;
$$;

grant execute on function admin_delete_user(uuid) to authenticated;
