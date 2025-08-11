-- Security hardening: auth checks in RPCs, protective indexes, and capacity guard
set search_path = public;

-- 1) Unique partial index to prevent duplicate confirmed bookings per user/session
create unique index if not exists uniq_booking_user_session_confirmed
  on bookings(user_id, class_session_id)
  where upper(status) = 'CONFIRMED';

-- 2) Helpful date index for sessions queries
create index if not exists idx_class_sessions_date on class_sessions(schedule_date);

-- 3) Capacity guard: disallow reducing capacity below current confirmed bookings
create or replace function public.class_sessions_capacity_guard_fn()
returns trigger
language plpgsql
as $$
declare
  v_confirmed int;
begin
  if tg_op = 'UPDATE' and new.capacity is not null and new.capacity <> old.capacity then
    select count(*) into v_confirmed
    from bookings
    where class_session_id = new.id
      and upper(status) = 'CONFIRMED';
    if new.capacity < v_confirmed then
      raise exception 'La capacidad (%) no puede ser menor que las reservas confirmadas (%)', new.capacity, v_confirmed
        using errcode = '23514'; -- check_violation
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists class_sessions_capacity_guard_trg on public.class_sessions;
create trigger class_sessions_capacity_guard_trg
before update on public.class_sessions
for each row execute function public.class_sessions_capacity_guard_fn();

-- 4) Auth helpers inside RPCs
-- Assumptions:
--   - Admins are users with role_id = 1 in public.users
--   - Caller identity is auth.uid(), mapped to public.users.auth_user_id

-- 4a) Harden create_booking_with_validations with identity check
create or replace function public.create_booking_with_validations(
  p_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamptz default now()
)
returns table(success boolean, booking_id integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_uid uuid;
  v_caller_id int;
  v_caller_role int;
  v_is_admin boolean;
  v_capacity int;
  v_current_bookings int;
  v_booking_id int;
  v_up_id int;
  v_classes_remaining int;
  v_classes_used int;
  v_new_status text;
  v_class_type_id int;
  v_class_type_name text;
  v_is_personal boolean;
  v_sched_date date;
  v_sched_time time;
  v_cancel_deadline timestamptz;
begin
  -- Identify caller
  select auth.uid() into v_caller_uid;
  select u.id, coalesce(u.role_id, 0) into v_caller_id, v_caller_role from users u where u.auth_user_id = v_caller_uid;
  v_is_admin := (v_caller_role = 1);

  if not v_is_admin and (v_caller_id is distinct from p_user_id) then
    return query select false, null::int, 'No autorizado';
    return;
  end if;

  perform pg_advisory_xact_lock(p_class_session_id);

  select cs.capacity, cs.schedule_date, cs.schedule_time, ct.id, ct.name
    into v_capacity, v_sched_date, v_sched_time, v_class_type_id, v_class_type_name
  from class_sessions cs
  join class_types ct on ct.id = cs.class_type_id
  where cs.id = p_class_session_id;

  if v_capacity is null then
    return query select false, null::int, 'Sesión no encontrada';
    return;
  end if;

  v_is_personal := (v_class_type_name = 'Personalizada');

  if exists (
    select 1 from bookings
    where user_id = p_user_id
      and class_session_id = p_class_session_id
      and upper(status) = 'CONFIRMED'
  ) then
    return query select false, null::int, 'Usuario ya inscrito en esta clase';
    return;
  end if;

  select count(*) into v_current_bookings
  from bookings
  where class_session_id = p_class_session_id
    and upper(status) = 'CONFIRMED';

  if v_current_bookings >= v_capacity then
    return query select false, null::int, 'La clase está completa';
    return;
  end if;

  select up.id, up.current_classes_remaining, up.classes_used_this_month
    into v_up_id, v_classes_remaining, v_classes_used
  from user_packages up
  join packages p on p.id = up.package_id
  where up.user_id = p_user_id
    and up.status = 'active'
    and up.current_classes_remaining > 0
    and (
      (v_is_personal and p.is_personal = true)
      or (not v_is_personal and p.class_type = v_class_type_id)
    )
  order by up.purchase_date asc
  for update
  limit 1;

  if v_up_id is null then
    return query select false, null::int, 'Usuario no tiene bonos compatibles disponibles';
    return;
  end if;

  v_cancel_deadline := (v_sched_date::timestamp + v_sched_time) - interval '12 hours';

  begin
    insert into bookings(
      user_id, class_session_id, booking_date_time,
      status, is_from_package, cancellation_time, payment_id
    ) values (
      p_user_id, p_class_session_id, p_booking_date_time,
      'CONFIRMED', true, v_cancel_deadline, null
    )
    returning id into v_booking_id;

    v_classes_remaining := v_classes_remaining - 1;
    v_classes_used := v_classes_used + 1;
    v_new_status := case when v_classes_remaining <= 0 then 'expired' else 'active' end;

    update user_packages
    set current_classes_remaining = v_classes_remaining,
        classes_used_this_month = v_classes_used,
        status = v_new_status,
        updated_at = now()
    where id = v_up_id;

    return query select true, v_booking_id, 'Reserva creada correctamente';
  exception when others then
    return query select false, null::int, 'Error: ' || sqlerrm;
  end;
end;
$$;

-- 4b) Harden cancel_booking_with_refund with identity check
create or replace function public.cancel_booking_with_refund(
  p_booking_id integer,
  p_user_id integer
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_uid uuid;
  v_caller_id int;
  v_caller_role int;
  v_is_admin boolean;
  v_booking record;
  v_pkg record;
  v_new_remaining int;
  v_new_used int;
  v_new_status text;
begin
  -- Identify caller
  select auth.uid() into v_caller_uid;
  select u.id, coalesce(u.role_id, 0) into v_caller_id, v_caller_role from users u where u.auth_user_id = v_caller_uid;
  v_is_admin := (v_caller_role = 1);

  -- Only allow non-admins to cancel their own bookings; admins can cancel anyone's
  if not v_is_admin and (v_caller_id is distinct from p_user_id) then
    return json_build_object('success', false, 'error', 'No autorizado');
  end if;

  perform pg_advisory_xact_lock(p_booking_id);

  select * into v_booking
  from bookings
  where id = p_booking_id
    and user_id = p_user_id
    and upper(status) = 'CONFIRMED'
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Reserva no encontrada o ya cancelada');
  end if;

  -- Enforce 12h cutoff ONLY for non-admins; admins bypass this restriction
  if not v_is_admin and v_booking.cancellation_time is not null and now() > v_booking.cancellation_time then
    return json_build_object('success', false, 'error', 'No se puede cancelar: fuera de plazo');
  end if;

  update bookings
  set status = 'CANCELLED',
      cancellation_time = coalesce(cancellation_time, now())
  where id = p_booking_id;

  if coalesce(v_booking.is_from_package, false) then
    select up.* into v_pkg
    from user_packages up
    where up.user_id = p_user_id
      and up.status in ('active','expired')
    order by up.updated_at desc nulls last, up.purchase_date desc
    for update
    limit 1;

    if found then
      v_new_remaining := v_pkg.current_classes_remaining + 1;
      v_new_used := greatest(0, coalesce(v_pkg.classes_used_this_month,0) - 1);
      v_new_status := case when v_new_remaining > 0 then 'active' else v_pkg.status end;

      update user_packages
      set current_classes_remaining = v_new_remaining,
          classes_used_this_month = v_new_used,
          status = v_new_status,
          updated_at = now()
      where id = v_pkg.id;
    end if;
  end if;

  return json_build_object('success', true, 'message', 'Reserva cancelada correctamente');
exception when others then
  return json_build_object('success', false, 'error', 'Error al cancelar: ' || sqlerrm);
end;
$$;

-- 4c) Admin-only: update_session_time
create or replace function public.update_session_time(
  p_session_id integer,
  p_schedule_date date,
  p_schedule_time time
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_uid uuid;
  v_role int;
  v_is_admin boolean;
begin
  select auth.uid() into v_caller_uid;
  select coalesce(u.role_id, 0) into v_role from users u where u.auth_user_id = v_caller_uid;
  v_is_admin := (v_role = 1);
  if not v_is_admin then
    return json_build_object('success', false, 'error', 'Solo administradores pueden actualizar horarios de sesión');
  end if;

  update class_sessions
  set schedule_date = p_schedule_date,
      schedule_time = p_schedule_time
  where id = p_session_id;

  update bookings
  set cancellation_time = (p_schedule_date::timestamp + p_schedule_time) - interval '12 hours'
  where class_session_id = p_session_id
    and upper(status) = 'CONFIRMED';

  return json_build_object('success', true, 'message', 'Sesión actualizada');
exception when others then
  return json_build_object('success', false, 'error', 'Error: ' || sqlerrm);
end;
$$;
