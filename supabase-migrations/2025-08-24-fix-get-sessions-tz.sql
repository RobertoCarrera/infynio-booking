-- Fix get_sessions_for_calendar: ensure cancellation_time is returned as timestamptz
-- Date: 2025-08-24
-- Purpose: The function returned a timestamp without time zone while its RETURNS TABLE declared timestamptz.
-- This replacement casts cancellation_time to timestamptz to match the declared return type.

CREATE OR REPLACE FUNCTION public.get_sessions_for_calendar(
  p_user_id integer,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date
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
    WHERE b.user_id = p_user_id AND b.status = 'CONFIRMED'
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
  WHERE (p_start_date IS NULL OR cs.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR cs.schedule_date <= p_end_date)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

-- grant execute (safe to re-run)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(integer, date, date) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Test suggestion:
-- SELECT * FROM public.get_sessions_for_calendar(1, '2025-08-18'::date, '2025-08-24'::date) LIMIT 100;
