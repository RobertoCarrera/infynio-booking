-- Multi class-type package mapping + bookings link to consumed user_package
-- Date: 2025-08-13
-- Purpose: Allow one package to cover multiple class types (e.g., Mat=2 and Funcional=9),
--          while each booking records the exact session class type and the precise user_package used.
-- Safety: Includes IF NOT EXISTS guards. Functions are SECURITY DEFINER and keep search_path to public.

begin;

-- 1) Mapping table for allowed class types per package
create table if not exists package_allowed_class_types (
  package_id integer not null references packages(id) on delete cascade,
  class_type_id integer not null references class_types(id) on delete cascade,
  primary key (package_id, class_type_id)
);

-- 2) Seed mapping from existing packages.class_type (single-type packages)
insert into package_allowed_class_types (package_id, class_type_id)
select p.id, p.class_type
from packages p
where p.class_type is not null
  and not exists (
    select 1
    from package_allowed_class_types t
    where t.package_id = p.id and t.class_type_id = p.class_type
  );

-- 3) Optional: auto-map combined Mat + Funcional packages by name heuristic (adjust as needed)
insert into package_allowed_class_types (package_id, class_type_id)
select p.id, ct.id
from packages p
join class_types ct on ct.id in (2, 9)
where (p.name ilike '%mat%' and p.name ilike '%funcional%')
  and not exists (
    select 1 from package_allowed_class_types x
    where x.package_id = p.id and x.class_type_id = ct.id
  );

-- 4) Add bookings.user_package_id to persist the exact package used
alter table bookings
  add column if not exists user_package_id integer references user_packages(id);

create index if not exists idx_pact_package on package_allowed_class_types(package_id);
create index if not exists idx_pact_class_type on package_allowed_class_types(class_type_id);
create index if not exists idx_bookings_user_package on bookings(user_package_id);

-- 5) Preserve old function and create new using mapping; persist user_package_id
do $$
begin
  if to_regprocedure('public.create_booking_with_validations(integer, integer, timestamptz)') is not null
     and to_regprocedure('public.create_booking_with_validations_old(integer, integer, timestamptz)') is null then
    execute 'alter function public.create_booking_with_validations(integer, integer, timestamptz) rename to create_booking_with_validations_old';
  end if;
end
$$;

create function public.create_booking_with_validations(
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
    return query select false, null, 'Sesión no encontrada';
    return;
  end if;

  select count(*) into v_confirmed_count
  from bookings b
  where b.class_session_id = p_class_session_id
    and upper(b.status) = 'CONFIRMED';
  if v_confirmed_count >= coalesce(v_session.capacity, 0) then
    return query select false, null, 'Clase completa';
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
    return query select false, null, 'No tienes un bono válido para este tipo de clase';
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

  return query select true, v_booking_id, 'Reserva creada correctamente';
exception
  when others then
    return query select false, null, 'Error al crear reserva: ' || sqlerrm;
end;
$$;

-- 6) Preserve old function and create new cancel with precise refunding
do $$
begin
  if to_regprocedure('public.cancel_booking_with_refund(integer, integer)') is not null
     and to_regprocedure('public.cancel_booking_with_refund_old(integer, integer)') is null then
    execute 'alter function public.cancel_booking_with_refund(integer, integer) rename to cancel_booking_with_refund_old';
  end if;
end
$$;

create function public.cancel_booking_with_refund(
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
    return json_build_object('success', false, 'error', 'Reserva no encontrada o ya cancelada');
  end if;

  if v_booking.cancellation_time is not null and now() > v_booking.cancellation_time then
    return json_build_object('success', false, 'error', 'No se puede cancelar: fuera de plazo');
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

  return json_build_object('success', true, 'message', 'Reserva cancelada correctamente');
exception
  when others then
    return json_build_object('success', false, 'error', 'Error al cancelar: ' || sqlerrm);
end;
$$;

-- 7) Optional: preserve old cancel_class and provide mapping-aware version
do $$
begin
  if to_regprocedure('public.cancel_class(integer, character varying)') is not null
     and to_regprocedure('public.cancel_class_old(integer, character varying)') is null then
    execute 'alter function public.cancel_class(integer, character varying) rename to cancel_class_old';
  end if;
end
$$;

create function public.cancel_class(
  p_user_id integer,
  p_class_type character varying
) returns boolean
language plpgsql
as $$
declare
  v_package_id integer;
begin
  select up.id
  into v_package_id
  from user_packages up
  join packages p on p.id = up.package_id
  left join package_allowed_class_types pact on pact.package_id = p.id
  left join class_types ct on ct.id = pact.class_type_id
  where up.user_id = p_user_id
    and up.status in ('active','expired')
    and (
      ct.name = p_class_type
      or p.class_type is null
    )
  order by up.updated_at desc, up.purchase_date desc
  limit 1;

  if v_package_id is null then
    return false;
  end if;

  update user_packages
  set classes_used_this_month = greatest(0, classes_used_this_month - 1),
      current_classes_remaining = current_classes_remaining + 1
  where id = v_package_id;

  return true;
end;
$$;

commit;
