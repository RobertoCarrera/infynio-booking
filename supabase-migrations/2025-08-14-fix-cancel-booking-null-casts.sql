-- Fix: explicit casts in cancel_booking_with_refund JSON returns
-- Date: 2025-08-14

begin;

create or replace function public.cancel_booking_with_refund(
  p_booking_id integer,
  p_user_id integer
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_pkg_id int;
  v_pkg record;
begin
  perform pg_advisory_xact_lock(p_booking_id);

  select *
  into v_booking
  from bookings
  where id = p_booking_id
    and user_id = p_user_id
    and upper(status) = 'CONFIRMED'
  for update;
  if not found then
    return json_build_object('success', false, 'error', 'Reserva no encontrada o ya cancelada'::text);
  end if;

  if v_booking.cancellation_time is not null and now() > v_booking.cancellation_time then
    return json_build_object('success', false, 'error', 'No se puede cancelar: fuera de plazo'::text);
  end if;

  update bookings
  set status = 'CANCELLED',
      cancellation_time = coalesce(cancellation_time, now())
  where id = p_booking_id;

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
    where up.user_id = p_user_id
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

  return json_build_object('success', true, 'message', 'Reserva cancelada correctamente'::text);
exception
  when others then
    return json_build_object('success', false, 'error', ('Error al cancelar: ' || sqlerrm)::text);
end;
$$;

commit;
