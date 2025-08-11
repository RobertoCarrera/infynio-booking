-- User calendar enhancements: unified RPC for sessions with counts, self booking flag, and attendees
-- Run this in Supabase SQL editor or via migration tooling
set search_path = public;

-- Function: get_sessions_for_calendar
-- Returns sessions between dates with booking counts, available spots, class type info,
-- a flag if the given user is booked (and the booking id + cancellation_time), and obfuscated attendees list.
create or replace function public.get_sessions_for_calendar(
  p_start_date date default null,
  p_end_date date default null,
  p_user_id integer default null
) returns table(
  id integer,
  class_type_id integer,
  capacity integer,
  schedule_date date,
  schedule_time time,
  class_type_name text,
  class_type_description text,
  class_type_duration integer,
  confirmed_bookings_count integer,
  available_spots integer,
  is_self_booked boolean,
  self_booking_id integer,
  self_cancellation_time timestamptz,
  attendees json
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with counts as (
    select class_session_id, count(*)::int as confirmed_count
    from bookings
    where upper(status) = 'CONFIRMED'
    group by class_session_id
  ), self as (
    select b.class_session_id,
           true as is_self_booked,
           b.id as self_booking_id,
           b.cancellation_time as self_cancellation_time
    from bookings b
    where b.user_id = p_user_id
      and upper(b.status) = 'CONFIRMED'
  ), att as (
    select b.class_session_id,
           json_agg(
             json_build_object(
               'name', coalesce(u.name, ''),
               'surname_initial', case when coalesce(u.surname, '') <> '' then upper(substr(u.surname,1,1)) else '' end
             )
             order by b.booking_date_time asc
           ) as attendees
    from bookings b
    join users u on u.id = b.user_id
    where upper(b.status) = 'CONFIRMED'
    group by b.class_session_id
  )
  select cs.id,
         cs.class_type_id,
         cs.capacity,
         cs.schedule_date,
         cs.schedule_time,
         ct.name,
         ct.description,
         ct.duration_minutes,
         coalesce(c.confirmed_count, 0) as confirmed_bookings_count,
         (cs.capacity - coalesce(c.confirmed_count, 0))::int as available_spots,
         coalesce(s.is_self_booked, false) as is_self_booked,
         s.self_booking_id,
         s.self_cancellation_time,
         coalesce(a.attendees, '[]'::json) as attendees
  from class_sessions cs
  join class_types ct on ct.id = cs.class_type_id
  left join counts c on c.class_session_id = cs.id
  left join self s on s.class_session_id = cs.id
  left join att a on a.class_session_id = cs.id
  where (p_start_date is null or cs.schedule_date >= p_start_date)
    and (p_end_date is null or cs.schedule_date <= p_end_date)
  order by cs.schedule_date, cs.schedule_time;
end;
$$;

comment on function public.get_sessions_for_calendar(date, date, integer)
  is 'Sessions with counts, available spots, type info, self booking flag/id/cancel deadline, and attendees (name + surname initial) for the given user.';

-- Grant execute to common roles
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
