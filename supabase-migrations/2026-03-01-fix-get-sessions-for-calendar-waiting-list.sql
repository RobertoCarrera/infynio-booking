-- Fix get_sessions_for_calendar to include waiting_list status
-- It seems the current version of get_sessions_for_calendar does not return is_in_waiting_list
-- This migration updates the function to include that field

-- First, drop the existing function to change return type
DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(date, date, integer);

CREATE OR REPLACE FUNCTION public.get_sessions_for_calendar(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  class_type_id INTEGER,
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  class_type_name TEXT,
  class_type_description TEXT,
  class_type_duration INTEGER,
  level_id INTEGER,
  level_name TEXT,
  level_color TEXT,
  confirmed_bookings_count INTEGER,
  available_spots INTEGER,
  is_self_booked BOOLEAN,
  self_booking_id INTEGER,
  self_cancellation_time TIMESTAMPTZ,
  personal_user_id INTEGER,
  is_in_waiting_list BOOLEAN,
  waiting_list_priority INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set specific session variables to bypass RLS policies carefully
  PERFORM set_config('search_path', 'public, pg_temp', true);
  PERFORM set_config('app.call', 'get_sessions_for_calendar', true);
  
  RETURN QUERY
  SELECT 
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name::text AS class_type_name,
    ct.description::text AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    cs.level_id,
    l.name::text AS level_name,
    l.color::text AS level_color,
    COALESCE(bc.confirmed_count, 0)::INTEGER AS confirmed_bookings_count,
    GREATEST(0, cs.capacity - COALESCE(bc.confirmed_count, 0))::INTEGER AS available_spots,
    (sb_check.id IS NOT NULL) AS is_self_booked,
    sb_check.id AS self_booking_id,
    sb_check.cancellation_time::timestamptz AS self_cancellation_time,
    cs.personal_user_id AS personal_user_id,
    (wl.id IS NOT NULL) AS is_in_waiting_list,
    wl.id::INTEGER AS waiting_list_priority -- Using ID as a proxy for priority/order
  FROM class_sessions cs
  JOIN class_types ct ON ct.id = cs.class_type_id
  -- 1. Bookings count
  LEFT JOIN (
    SELECT class_session_id, COUNT(*) AS confirmed_count
    FROM bookings
    WHERE status = 'confirmed' -- Case insensitive check might be safer, but schema says 'confirmed'
    GROUP BY class_session_id
  ) bc ON bc.class_session_id = cs.id
  -- 2. Levels
  LEFT JOIN public.levels l ON l.id = cs.level_id
  -- 3. Self booking check (LATERAL is efficient for specific user)
  LEFT JOIN LATERAL (
    SELECT b.id, b.cancellation_time
    FROM bookings b
    WHERE b.class_session_id = cs.id 
      AND b.user_id = p_user_id
      AND b.status = 'confirmed'
    LIMIT 1
  ) sb_check ON TRUE
  -- 4. Waiting List check (LATERAL)
  LEFT JOIN LATERAL (
    SELECT w.id
    FROM waiting_list w
    WHERE w.class_session_id = cs.id
      AND w.user_id = p_user_id
      AND w.status = 'waiting'
    LIMIT 1
  ) wl ON TRUE
  WHERE (p_start_date IS NULL OR cs.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR cs.schedule_date <= p_end_date)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO service_role;

