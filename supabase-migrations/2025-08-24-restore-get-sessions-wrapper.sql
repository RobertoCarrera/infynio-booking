-- Restore positional signature wrapper for get_sessions_for_calendar
-- Date: 2025-08-24
-- Purpose: Provide the (date, date, integer) signature that the frontend used by delegating
-- to the existing implementation with signature (integer, date, date).
-- Run this in Supabase SQL editor or as a migration.

CREATE OR REPLACE FUNCTION public.get_sessions_for_calendar(
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_user_id integer DEFAULT NULL::integer
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
LANGUAGE sql
STABLE
AS $$
  -- Delegate to the implementation that expects (p_user_id, p_start_date, p_end_date)
  SELECT * FROM public.get_sessions_for_calendar(p_user_id, p_start_date, p_end_date);
$$;

-- Grant execute to common roles (safe to re-run)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Test (run in SQL editor):
-- SELECT * FROM public.get_sessions_for_calendar('2025-08-18'::date, '2025-08-24'::date, 1) LIMIT 100;
