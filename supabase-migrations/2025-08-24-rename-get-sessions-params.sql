-- Rename parameters of canonical get_sessions_for_calendar to avoid PostgREST name collision
-- Date: 2025-08-24
-- Purpose: Change parameter names so PostgREST can disambiguate named-parameter RPC calls.

CREATE OR REPLACE FUNCTION public.get_sessions_for_calendar(
  p_uid integer,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date
)
RETURNS TABLE(
  id integer,
  class_type_id integer,
  capacity integer,
  schedule_date date,
  schedule_time time without time zone,
  class_type_name text,
  class_type_description text,
  class_type_duration integer,
  confirmed_bookings_count integer,
  available_spots integer,
  is_self_booked boolean,
  self_booking_id integer,
  self_cancellation_time timestamp with time zone,
  personal_user_id integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH counts AS (
    SELECT class_session_id, COUNT(*)::INT AS confirmed_count
    FROM bookings
    WHERE status = 'CONFIRMED'
    GROUP BY class_session_id
  ), self_b AS (
    SELECT b.class_session_id, b.id AS booking_id, b.cancellation_time::timestamptz AS cancellation_time
    FROM bookings b
    WHERE b.user_id = p_uid AND b.status = 'CONFIRMED'
  )
  SELECT
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name::TEXT AS class_type_name,
    ct.description::TEXT AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    COALESCE(c.confirmed_count, 0) AS confirmed_bookings_count,
    GREATEST(0, cs.capacity - COALESCE(c.confirmed_count, 0)) AS available_spots,
    (sb.booking_id IS NOT NULL) AS is_self_booked,
    sb.booking_id AS self_booking_id,
    sb.cancellation_time AS self_cancellation_time,
    cs.personal_user_id
  FROM class_sessions cs
  JOIN class_types ct ON ct.id = cs.class_type_id
  LEFT JOIN counts c ON c.class_session_id = cs.id
  LEFT JOIN self_b sb ON sb.class_session_id = cs.id
  WHERE (p_start IS NULL OR cs.schedule_date >= p_start)
    AND (p_end IS NULL OR cs.schedule_date <= p_end)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(integer, date, date) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Test suggestion (SQL editor):
-- SELECT * FROM public.get_sessions_for_calendar(1, '2025-08-18'::date, '2025-08-24'::date) LIMIT 5;

-- Note: This changes the parameter names only; the function identity (by argument types) remains the same.
-- After applying, PostgREST will see distinct parameter name sets between the canonical function (p_uid,p_start,p_end)
-- and the wrapper (p_start_date,p_end_date,p_user_id), resolving ambiguity for named RPC calls.
