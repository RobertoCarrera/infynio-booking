-- Admin force-cancel booking regardless of time limits or past classes
-- Requires caller be admin (users.role_id = 1). SECURITY DEFINER to bypass RLS.

begin;

-- Ensure roles can use the schema (non-destructive)
grant usage on schema public to authenticated, anon;

create or replace function public.admin_cancel_booking_force(
  p_booking_id integer
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_uid uuid;
  v_is_admin boolean := false;
  v_booking record;
  v_pkg_id int;
  v_pkg record;
begin
  -- Verify caller is authenticated and admin
  v_actor_uid := auth.uid();
  if v_actor_uid is null then
    return json_build_object('success', false, 'error', 'No autenticado'::text);
  end if;

  select exists(
    select 1 from users u where u.auth_user_id = v_actor_uid and u.role_id = 1
  ) into v_is_admin;

  if not v_is_admin then
    return json_build_object('success', false, 'error', 'Solo administradores'::text);
  end if;

  perform pg_advisory_xact_lock(p_booking_id);

  select *
  into v_booking
  from bookings
  where id = p_booking_id
    and upper(status) = 'CONFIRMED'
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Reserva no encontrada o ya cancelada'::text);
  end if;

  -- Force cancel regardless of cancellation_time or class time
  update bookings
  set status = 'CANCELLED',
      cancellation_time = coalesce(cancellation_time, now())
  where id = p_booking_id;

  -- Refund class back to a package
  v_pkg_id := v_booking.user_package_id;

  if v_pkg_id is not null then
    update user_packages
    set current_classes_remaining = current_classes_remaining + 1,
        classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
        status = case when current_classes_remaining + 1 > 0 and status = 'expired' then 'active' else status end,
        updated_at = now()
    where id = v_pkg_id;
  else
    select up.*
    into v_pkg
    from user_packages up
    where up.user_id = v_booking.user_id
      and up.status in ('active','expired')
    order by up.updated_at desc nulls last, up.purchase_date desc
    limit 1
    for update;

    if found then
      update user_packages
      set current_classes_remaining = current_classes_remaining + 1,
          classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
          status = case when current_classes_remaining + 1 > 0 and status = 'expired' then 'active' else status end,
          updated_at = now()
      where id = v_pkg.id;
    end if;
  end if;

  return json_build_object('success', true, 'message', 'Reserva cancelada por admin'::text);
exception
  when others then
    return json_build_object('success', false, 'error', ('Error al cancelar: ' || sqlerrm)::text);
end;
$$;

grant execute on function public.admin_cancel_booking_force(integer) to authenticated, anon;

commit;
