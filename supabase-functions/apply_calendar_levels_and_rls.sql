-- Consolidated SQL to create calendar RPCs (with levels), RLS policies, and grant cancel RPC
-- Run this in Supabase SQL editor. It avoids DO/EXECUTE quoting to prevent syntax errors.

-- 0) Optional cleanup: remove older overloads that cause ambiguity
DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(date, date);
DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(integer, date, date);

-- 1) Counts RPC (SECURITY DEFINER + safe search_path + GUC)
CREATE OR REPLACE FUNCTION public.get_sessions_with_booking_counts(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  class_type_id INTEGER,
  level_id INTEGER,
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  confirmed_bookings_count INTEGER,
  available_spots INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('search_path', 'public, pg_temp', true);
  PERFORM set_config('app.call', 'get_sessions_with_booking_counts', true);
  RETURN QUERY
  SELECT 
    cs.id,
    cs.class_type_id,
    cs.level_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    COALESCE(b.confirmed_count, 0)::INTEGER as confirmed_bookings_count,
    (cs.capacity - COALESCE(b.confirmed_count, 0))::INTEGER as available_spots
  FROM class_sessions cs
  LEFT JOIN (
    SELECT class_session_id, COUNT(*) as confirmed_count
    FROM bookings WHERE status = 'CONFIRMED'
    GROUP BY class_session_id
  ) b ON cs.id = b.class_session_id
  WHERE (p_start_date IS NULL OR cs.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR cs.schedule_date <= p_end_date)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sessions_with_booking_counts(date, date) TO authenticated;

-- 2) Calendar RPC (levels + counts + self flags)
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

-- 3) RLS policies on bookings
DROP POLICY IF EXISTS allow_select_for_calendar ON public.bookings;
CREATE POLICY allow_select_for_calendar ON public.bookings
  FOR SELECT TO public
  USING (current_setting('app.call', true) IN ('get_sessions_for_calendar','get_sessions_with_booking_counts'));

DROP POLICY IF EXISTS allow_insert_via_function ON public.bookings;
CREATE POLICY allow_insert_via_function ON public.bookings
  FOR INSERT TO public
  WITH CHECK (current_setting('app.call', true) = 'create_booking_with_validations');

-- 4) Ensure unique booking per user/session when confirmed
CREATE UNIQUE INDEX IF NOT EXISTS unique_confirmed_user_session_booking 
ON bookings (user_id, class_session_id) 
WHERE status = 'CONFIRMED';

-- 5) Ensure cancel RPC exists and is granted
CREATE OR REPLACE FUNCTION public.cancel_booking_with_refund(
  p_booking_id integer,
  p_user_id integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_pkg_id int;
  v_pkg record;
BEGIN
  PERFORM pg_advisory_xact_lock(p_booking_id);

  SELECT *
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
    AND user_id = p_user_id
    AND upper(status) = 'CONFIRMED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Reserva no encontrada o ya cancelada'::text);
  END IF;

  IF v_booking.cancellation_time IS NOT NULL AND now() > v_booking.cancellation_time THEN
    RETURN json_build_object('success', false, 'error', 'No se puede cancelar: fuera de plazo'::text);
  END IF;

  UPDATE bookings
  SET status = 'CANCELLED',
      cancellation_time = coalesce(cancellation_time, now())
  WHERE id = p_booking_id;

  v_pkg_id := v_booking.user_package_id;

  IF v_pkg_id IS NOT NULL THEN
    UPDATE user_packages
    SET current_classes_remaining = current_classes_remaining + 1,
      classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
      status = case when current_classes_remaining + 1 > 0 and status in ('expired','depleted') then 'active' else status end,
      updated_at = now()
    WHERE id = v_pkg_id;
  ELSE
    SELECT up.*
    INTO v_pkg
    FROM user_packages up
    WHERE up.user_id = p_user_id
      AND up.status in ('active','expired','depleted')
    ORDER BY up.updated_at desc nulls last, up.purchase_date desc
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE user_packages
      SET current_classes_remaining = current_classes_remaining + 1,
        classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
        status = case when current_classes_remaining + 1 > 0 and status in ('expired','depleted') then 'active' else status end,
        updated_at = now()
      WHERE id = v_pkg.id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Reserva cancelada correctamente'::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', ('Error al cancelar: ' || sqlerrm)::text);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_booking_with_refund(INTEGER, INTEGER) TO authenticated;
