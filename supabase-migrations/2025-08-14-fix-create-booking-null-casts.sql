-- Fix: explicit casts for nulls in RETURN QUERY to match function result type
-- Date: 2025-08-14
-- Context: Prevent "structure of query does not match function result type" in create_booking_with_validations

begin;

create or replace function public.create_booking_with_validations(
  p_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamptz
)
returns table(success boolean, booking_id integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_confirmed_count int;
  v_pkg user_packages%rowtype;
  v_booking_id int;
begin
  perform pg_advisory_xact_lock(p_user_id);

  select cs.*, ct.id as ct_id
  into v_session
  from class_sessions cs
  join class_types ct on ct.id = cs.class_type_id
  where cs.id = p_class_session_id
  for update;
  if not found then
    return query select false, null::integer, 'Sesión no encontrada'::text;
    return;
  end if;

  select count(*) into v_confirmed_count
  from bookings b
  where b.class_session_id = p_class_session_id
    and upper(b.status) = 'CONFIRMED';
  if v_confirmed_count >= coalesce(v_session.capacity, 0) then
    return query select false, null::integer, 'Clase completa'::text;
    return;
  end if;

  select up.*
  into v_pkg
  from user_packages up
  join packages p on p.id = up.package_id
  join package_allowed_class_types pact on pact.package_id = p.id
  where up.user_id = p_user_id
    and up.status in ('active')
    and up.current_classes_remaining > 0
    and pact.class_type_id = v_session.ct_id
  order by coalesce(up.updated_at, now()) desc,
           coalesce(up.activation_date, up.purchase_date) desc
  limit 1
  for update;
  if not found then
    return query select false, null::integer, 'No tienes un bono válido para este tipo de clase'::text;
    return;
  end if;

  update user_packages
  set current_classes_remaining = current_classes_remaining - 1,
      classes_used_this_month = coalesce(classes_used_this_month, 0) + 1,
      status = case when current_classes_remaining - 1 <= 0 then 'expired' else status end,
      updated_at = now()
  where id = v_pkg.id;

  insert into bookings(user_id, class_session_id, booking_date_time, status, is_from_package, user_package_id)
  values (p_user_id, p_class_session_id, coalesce(p_booking_date_time, now()), 'CONFIRMED', true, v_pkg.id)
  returning id into v_booking_id;

  return query select true, v_booking_id, 'Reserva creada correctamente'::text;
exception
  when others then
    return query select false, null::integer, ('Error al crear reserva: ' || sqlerrm)::text;
end;
$$;

commit;
