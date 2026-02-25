-- Revert 2026-03-01-fix-get-sessions-for-calendar-waiting-list.sql
-- Restoring original get_sessions_for_calendar function from apply_calendar_levels_and_rls.sql

-- Drop the function first to allow return type change (rollback)
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
  personal_user_id INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    (cs.capacity - COALESCE(bc.confirmed_count, 0))::INTEGER AS available_spots,
    (sb.id IS NOT NULL) AS is_self_booked,
    sb.id AS self_booking_id,
    sb.cancellation_time::timestamptz AS self_cancellation_time,
    cs.personal_user_id AS personal_user_id
  FROM class_sessions cs
  JOIN class_types ct ON ct.id = cs.class_type_id
  LEFT JOIN (
    SELECT class_session_id, COUNT(*) AS confirmed_count
    FROM bookings
    WHERE status = 'CONFIRMED'
    GROUP BY class_session_id
  ) bc ON bc.class_session_id = cs.id
  LEFT JOIN public.levels l ON l.id = cs.level_id
  LEFT JOIN LATERAL (
    SELECT b.id, b.cancellation_time
    FROM bookings b
    WHERE b.class_session_id = cs.id 
      AND b.user_id = p_user_id
      AND b.status = 'CONFIRMED'
    ORDER BY b.id DESC
    LIMIT 1
  ) sb ON TRUE
  WHERE (p_start_date IS NULL OR cs.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR cs.schedule_date <= p_end_date)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO authenticated;
