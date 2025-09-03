-- Preview Migration: auto_cancel_small_sessions_preview
-- Purpose: read-only preview of sessions that would be auto-cancelled.
-- This function does NOT perform cancellations; it returns a JSON report of candidate sessions
-- and their confirmed bookings using the same selection logic as the destructive function.

CREATE OR REPLACE FUNCTION public.auto_cancel_small_sessions_preview()
RETURNS jsonb
LANGUAGE sql
AS $$
SELECT jsonb_build_object(
  'candidates', COALESCE(jsonb_agg(
    jsonb_build_object(
      'class_session_id', cs.id,
      'starts_at', (cs.schedule_date + cs.schedule_time::interval) AT TIME ZONE 'Europe/Madrid',
      'class_type_id', cs.class_type_id,
      'confirmed_count', cnt.confirmed_count,
      'bookings', bookings_arr
    )
  ), '[]'::jsonb)
)
FROM class_sessions cs
-- count confirmed bookings per session
JOIN (
  SELECT b.class_session_id, COUNT(*) FILTER (WHERE UPPER(b.status) = 'CONFIRMED') AS confirmed_count
  FROM bookings b
  GROUP BY b.class_session_id
) cnt ON cnt.class_session_id = cs.id
-- aggregate confirmed bookings for the session
LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('booking_id', b.id, 'user_id', b.user_id, 'status', b.status, 'email', u.email, 'name', COALESCE(u.name, ''))), '[]'::jsonb) AS bookings_arr
  FROM bookings b
  JOIN users u ON u.id = b.user_id
  WHERE b.class_session_id = cs.id AND UPPER(b.status) = 'CONFIRMED'
) bookings ON true
WHERE cs.personal_user_id IS NULL
  AND cnt.confirmed_count = 1
  AND ((cs.schedule_date + cs.schedule_time::interval) AT TIME ZONE 'Europe/Madrid') BETWEEN now() AND now() + interval '2 hours';
$$;

-- Usage: run `SELECT public.auto_cancel_small_sessions_preview();` in Supabase SQL editor.
