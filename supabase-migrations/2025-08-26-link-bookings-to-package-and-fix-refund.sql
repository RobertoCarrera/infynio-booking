-- Ensure bookings track the exact user_package used, and cancellations refund to that same package.
-- Safe, idempotent: uses CREATE OR REPLACE.

-- 1) Admin create booking: set bookings.user_package_id
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

  -- Select a candidate package and lock it to avoid races. Prefer packages that expire sooner (NULLs last).
  SELECT up.id, up.current_classes_remaining
    INTO v_user_package_id, v_classes_remaining
  FROM user_packages up
  JOIN packages pa ON pa.id = up.package_id
  WHERE up.user_id = p_target_user_id
    AND up.status = 'active'
    AND up.current_classes_remaining > 0
    AND pa.is_personal = v_is_personal
    AND up.expires_at IS NOT NULL
    AND date_part('year', up.expires_at) = date_part('year', v_session.schedule_date)
    AND date_part('month', up.expires_at) = date_part('month', v_session.schedule_date)
    AND (
      pa.class_type = v_session.class_type_id
      OR EXISTS (
        SELECT 1 FROM package_allowed_class_types pact
        WHERE pact.package_id = pa.id AND pact.class_type_id = v_session.class_type_id
      )
    )
  ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- We lock the chosen user_package with FOR UPDATE SKIP LOCKED above and will
  -- decrement/update it once after inserting the booking to avoid double-decrement.

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario no tiene bonos válidos para este mes y tipo de clase'::TEXT;
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
    v_classes_used := v_classes_used + 1;
  v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

    UPDATE user_packages
    SET 
      current_classes_remaining = v_classes_remaining,
      classes_used_this_month = v_classes_used,
      status = v_new_status
    WHERE id = v_user_package_id;

    RETURN QUERY SELECT TRUE, v_booking_id, 'Reserva creada correctamente (admin)'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, ('Error: ' || SQLERRM)::TEXT;
  END;
END;
$function$;

-- 2) Normal create booking: set bookings.user_package_id
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

  WITH candidates AS (
    SELECT
      up.id,
      up.current_classes_remaining,
  up.expires_at,
      up.purchase_date,
      pa.class_type,
      pa.is_personal,
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
      AND up.expires_at IS NOT NULL
      AND date_part('year', up.expires_at) = date_part('year', v_session.schedule_date)
      AND date_part('month', up.expires_at) = date_part('month', v_session.schedule_date)
  ), filtered AS (
    SELECT c.*
    FROM candidates c
    WHERE (
      c.class_type = v_session.class_type_id
      OR c.has_mapping
    )
    ORDER BY c.purchase_date ASC
    LIMIT 1
  )
  SELECT id, current_classes_remaining INTO v_user_package_id, v_classes_remaining FROM filtered;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::int, 'No tienes un bono válido para este mes y tipo de clase'::text;
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

-- 3) JSON variant: include user_package_id from RPC result
CREATE OR REPLACE FUNCTION public.create_booking_with_validations_json(
  p_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; BEGIN
  SELECT * INTO r FROM public.create_booking_with_validations(p_user_id, p_class_session_id, p_booking_date_time) LIMIT 1;
  IF r.success IS TRUE THEN
    RETURN json_build_object('success', true, 'booking_id', r.booking_id, 'message', r.message);
  ELSE
    RETURN json_build_object('success', false, 'error', coalesce(r.message, 'Error al crear la reserva'));
  END IF;
END; $function$;

-- 4) Cancel booking: prefer refund to the recorded user_package_id
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

-- 5) Admin force cancel: refund to booking.user_package_id when present
CREATE OR REPLACE FUNCTION public.admin_cancel_booking_force(
  p_booking_id integer
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id INTEGER;
  v_session_id INTEGER;
  v_is_personal BOOLEAN;
  v_personal_user_id INTEGER;
  v_refund_pkg_id INTEGER;
  -- previously missing: variables used in SELECT INTO below
  v_is_personal_flag BOOLEAN;
  v_ct_name TEXT;
BEGIN
  SELECT user_id, class_session_id, user_package_id
  INTO v_user_id, v_session_id, v_refund_pkg_id
  FROM bookings WHERE id = p_booking_id;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Reserva no encontrada'::TEXT;
    RETURN;
  END IF;

  UPDATE bookings SET status = 'CANCELLED', cancellation_time = NOW() WHERE id = p_booking_id;

  IF v_refund_pkg_id IS NOT NULL THEN
  -- compute new remaining deterministically
  UPDATE user_packages
  SET current_classes_remaining = current_classes_remaining + 1,
    classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
  status = CASE WHEN (coalesce(current_classes_remaining, 0) + 1) > 0 THEN 'active' ELSE 'depleted' END,
    updated_at = now()
  WHERE id = v_refund_pkg_id;
    -- Log refund action for audit
    BEGIN
      -- Logging to package_claim_logs removed per cleanup decision.
    EXCEPTION WHEN OTHERS THEN
      -- ignore logging failures
      NULL;
    END;
  ELSE
    WITH to_update AS (
      SELECT id
      FROM user_packages
    WHERE user_id = v_user_id AND status IN ('active','expired','depleted')
      ORDER BY purchase_date ASC
      LIMIT 1
    )
  UPDATE user_packages
  SET current_classes_remaining = current_classes_remaining + 1,
    classes_used_this_month = greatest(0, coalesce(classes_used_this_month, 0) - 1),
  status = CASE WHEN (coalesce(current_classes_remaining, 0) + 1) > 0 THEN 'active' ELSE 'depleted' END,
    updated_at = now()
  FROM to_update
  WHERE user_packages.id = to_update.id;
    -- Log refund to the selected package (if any)
    BEGIN
      -- Logging to package_claim_logs removed per cleanup decision.
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Determine if the session's class type is personal via class_types flag or name heuristic
  SELECT ct.is_personal, cs.personal_user_id, ct.name INTO v_is_personal_flag, v_personal_user_id, v_ct_name
  FROM class_sessions cs
  JOIN class_types ct ON ct.id = cs.class_type_id
  WHERE cs.id = v_session_id;

  IF v_is_personal_flag IS NOT NULL THEN
    v_is_personal := v_is_personal_flag;
  ELSE
    v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
  END IF;

  IF v_is_personal THEN
      IF v_personal_user_id = v_user_id THEN
        -- Delete any remaining bookings (should be none with status CONFIRMED, but remove any lingering rows)
        DELETE FROM bookings WHERE class_session_id = v_session_id;
        -- Now safe to delete the session
        DELETE FROM class_sessions WHERE id = v_session_id;
      END IF;
    END IF;

  RETURN QUERY SELECT TRUE, 'Reserva cancelada'::TEXT;
END;
$function$;

-- Allow authenticated users to call the admin RPC (SECURITY DEFINER handles privileges inside)
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking_force(INTEGER) TO authenticated;
