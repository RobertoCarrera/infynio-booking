-- Personalized classes mapping and booking selection adjustments
-- Date: 2025-08-14

begin;

-- 1) Backfill mapping for personalized Mat/Funcional pairs (4,22) and Reformer Personalizada (23)
insert into package_allowed_class_types (package_id, class_type_id)
select p.id, ct
from packages p
cross join (values (4),(22)) as v(ct)
where p.is_personal is true
  and p.class_type in (2,4,9,22) -- cover legacy tagging and explicit personalized ids
  and not exists (
    select 1 from package_allowed_class_types x
    where x.package_id = p.id and x.class_type_id = v.ct
  );

insert into package_allowed_class_types (package_id, class_type_id)
select p.id, 23
from packages p
where p.is_personal is true
  and p.class_type in (3,23)
  and not exists (
    select 1 from package_allowed_class_types x
    where x.package_id = p.id and x.class_type_id = 23
  );

-- 2) Update booking function to respect personal vs non-personal and pairs
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
  v_cancel_deadline timestamptz;
  v_is_personal boolean;
  v_types int[];
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

  v_is_personal := v_session.ct_id in (4,22,23);
  v_types := case
               when v_session.ct_id = any(array[2,9]) then array[2,9]
               when v_session.ct_id = any(array[4,22]) then array[4,22]
               when v_session.ct_id = 3 then array[3]
               when v_session.ct_id = 23 then array[23]
               else array[v_session.ct_id]
             end;

  select up.*
  into v_pkg
  from user_packages up
  join packages p on p.id = up.package_id
  left join package_allowed_class_types pact on pact.package_id = p.id
  where up.user_id = p_user_id
    and up.status in ('active')
    and up.current_classes_remaining > 0
    and p.is_personal = v_is_personal
    and (
      pact.class_type_id = any(v_types)
      or p.class_type = any(v_types)
    )
  order by coalesce(up.updated_at, now()) desc,
           coalesce(up.activation_date, up.purchase_date) desc
  limit 1
  for update of up;
  if not found then
    return query select false, null::integer, 'No tienes un bono válido para este tipo de clase'::text;
    return;
  end if;

  v_cancel_deadline := (v_session.schedule_date::timestamp + v_session.schedule_time) - interval '12 hours';

  update user_packages
  set current_classes_remaining = current_classes_remaining - 1,
      classes_used_this_month = coalesce(classes_used_this_month, 0) + 1,
      status = case when current_classes_remaining - 1 <= 0 then 'expired' else status end,
      updated_at = now()
  where id = v_pkg.id;

  insert into bookings(user_id, class_session_id, booking_date_time, status, is_from_package, user_package_id, cancellation_time)
  values (p_user_id, p_class_session_id, coalesce(p_booking_date_time, now()), 'CONFIRMED', true, v_pkg.id, v_cancel_deadline)
  returning id into v_booking_id;

  return query select true, v_booking_id, 'Reserva creada correctamente'::text;
exception
  when others then
    return query select false, null::integer, ('Error al crear reserva: ' || sqlerrm)::text;
end;
$$;

commit;
