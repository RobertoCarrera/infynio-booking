-- Fix booking validation logic for Syncro (ID 28):
-- Explicitly allow packages of type 2 (Mat) or 9 (Funcional) to book class type 28 (Syncro)

BEGIN;

-- 1) Update Admin booking function
CREATE OR REPLACE FUNCTION public.admin_create_booking_for_user(
  p_target_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamp with time zone DEFAULT now()
)
RETURNS TABLE(success boolean, booking_id integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_capacity INTEGER;
  v_current_bookings INTEGER;
  v_user_package_id INTEGER;
  v_booking_id INTEGER;
  v_classes_remaining INTEGER;
  v_classes_used INTEGER;
  v_new_status TEXT;
  v_is_personal boolean;
  v_is_personal_flag boolean;
  v_ct_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE user_id = p_target_user_id 
      AND class_session_id = p_class_session_id 
      AND status = 'CONFIRMED'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario ya está inscrito en esta clase'::TEXT;
    RETURN;
  END IF;

  -- Load session and capacity
  SELECT id, class_type_id, capacity, schedule_date
    INTO v_session
  FROM class_sessions
  WHERE id = p_class_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Sesión no encontrada'::TEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_current_bookings FROM bookings WHERE class_session_id = p_class_session_id AND status = 'CONFIRMED';
  IF v_current_bookings >= COALESCE(v_session.capacity, 0) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'La clase está completa'::TEXT;
    RETURN;
  END IF;

  -- Determine personalness from class_types if available; otherwise use a name heuristic
  SELECT ct.is_personal, ct.name INTO v_is_personal_flag, v_ct_name
  FROM class_types ct
  WHERE ct.id = v_session.class_type_id;

  IF v_is_personal_flag IS NOT NULL THEN
    v_is_personal := v_is_personal_flag;
  ELSE
    v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
  END IF;

  -- Select a candidate package and lock it to avoid races. 
  SELECT up.id, up.current_classes_remaining
    INTO v_user_package_id, v_classes_remaining
  FROM user_packages up
  JOIN packages pa ON pa.id = up.package_id
  WHERE up.user_id = p_target_user_id
    AND up.status = 'active'
    AND up.current_classes_remaining > 0
    AND pa.is_personal = v_is_personal
    AND (
      up.expires_at IS NULL OR v_session.schedule_date <= up.expires_at
    )
    AND (
      pa.class_type = v_session.class_type_id
      OR EXISTS (
        SELECT 1 FROM package_allowed_class_types pact
        WHERE pact.package_id = pa.id AND pact.class_type_id = v_session.class_type_id
      )
      -- FIX: Allow Syncro (28) for Mat (2) or Funcional (9) packages
      OR (pa.class_type IN (2, 9) AND v_session.class_type_id = 28)
    )
  ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario no tiene bonos válidos para esta fecha y tipo de clase'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO bookings (
      user_id,
      class_session_id,
      booking_date_time,
      status,
      is_from_package,
      cancellation_time,
      payment_id,
      user_package_id
    ) VALUES (
      p_target_user_id,
      p_class_session_id,
      p_booking_date_time,
      'CONFIRMED',
      TRUE,
      NULL,
      NULL,
      v_user_package_id
    ) RETURNING id INTO v_booking_id;

    v_classes_remaining := v_classes_remaining - 1;
    v_classes_used := COALESCE(v_classes_used, 0) + 1;
    v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

    UPDATE user_packages
    SET 
      current_classes_remaining = v_classes_remaining,
      classes_used_this_month = COALESCE(classes_used_this_month, 0) + 1,
      status = v_new_status
    WHERE id = v_user_package_id;

    RETURN QUERY SELECT TRUE, v_booking_id, 'Reserva creada correctamente (admin)'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, ('Error: ' || SQLERRM)::TEXT;
  END;
END;
$function$;

-- 2) Update User booking function
CREATE OR REPLACE FUNCTION public.create_booking_with_validations(
  p_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamp with time zone DEFAULT now()
)
RETURNS TABLE(success boolean, booking_id integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_current_bookings int;
  v_user_package_id int;
  v_classes_remaining int;
  v_new_status text;
  v_booking_id int;
  v_is_personal boolean;
  v_is_personal_flag boolean; -- nullable flag from class_types
  v_ct_name text; -- class type name for heuristic fallback
BEGIN
  SELECT id, class_type_id, capacity, schedule_date, schedule_time
    INTO v_session
  FROM class_sessions
  WHERE id = p_class_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::int, 'Sesión no encontrada'::text;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_current_bookings
  FROM bookings
  WHERE class_session_id = p_class_session_id AND status = 'CONFIRMED';

  IF v_current_bookings >= COALESCE(v_session.capacity, 0) THEN
    RETURN QUERY SELECT false, NULL::int, 'La clase está completa'::text;
    RETURN;
  END IF;

  -- Determine personalness from class_types if available; otherwise use a name heuristic
  SELECT ct.is_personal, ct.name INTO v_is_personal_flag, v_ct_name
  FROM class_types ct
  WHERE ct.id = v_session.class_type_id;

  IF v_is_personal_flag IS NOT NULL THEN
    v_is_personal := v_is_personal_flag;
  ELSE
    v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
  END IF;

  -- Candidate packages: rely on expires_at only
  WITH candidates AS (
    SELECT
      up.id,
      up.current_classes_remaining,
      up.expires_at,
      up.purchase_date,
      pa.class_type,
      pa.is_personal,
      pa.is_single_class,
      EXISTS (
        SELECT 1 FROM package_allowed_class_types pact
        WHERE pact.package_id = pa.id AND pact.class_type_id = v_session.class_type_id
      ) AS has_mapping
    FROM user_packages up
    JOIN packages pa ON pa.id = up.package_id
    WHERE up.user_id = p_user_id
      AND up.status = 'active'
      AND up.current_classes_remaining > 0
      AND pa.is_personal = v_is_personal
  ), filtered AS (
    SELECT c.*
    FROM candidates c
    WHERE (
      c.class_type = v_session.class_type_id
      OR c.has_mapping
      -- FIX: Allow Syncro (28) for Mat (2) or Funcional (9) packages
      OR (c.class_type IN (2, 9) AND v_session.class_type_id = 28)
    )
    AND (
      c.expires_at IS NULL OR v_session.schedule_date <= c.expires_at
    )
    ORDER BY (c.expires_at IS NULL) ASC, c.expires_at ASC, c.purchase_date ASC
    LIMIT 1
  )
  SELECT id, current_classes_remaining INTO v_user_package_id, v_classes_remaining FROM filtered;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::int, 'No tienes un bono válido para esta fecha y tipo de clase'::text;
    RETURN;
  END IF;

  INSERT INTO bookings (
    user_id,
    class_session_id,
    booking_date_time,
    status,
    is_from_package,
    cancellation_time,
    payment_id,
    user_package_id
  ) VALUES (
    p_user_id,
    p_class_session_id,
    COALESCE(p_booking_date_time, now()),
    'CONFIRMED',
    TRUE,
    NULL,
    NULL,
    v_user_package_id
  ) RETURNING id INTO v_booking_id;

  v_classes_remaining := v_classes_remaining - 1;
  v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

  UPDATE user_packages
  SET current_classes_remaining = v_classes_remaining,
      status = v_new_status
  WHERE id = v_user_package_id;

  RETURN QUERY SELECT true, v_booking_id, 'Reserva creada correctamente'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::int, ('Error: ' || SQLERRM)::text;
END;
$function$;

COMMIT;
