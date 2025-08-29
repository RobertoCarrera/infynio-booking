-- Crear función atómica para crear sesión y, opcionalmente, booking ligado a user_package
BEGIN;

CREATE OR REPLACE FUNCTION public.create_session_with_personal_booking(
  p_class_type_id INTEGER,
  p_schedule_date DATE,
  p_schedule_time TIME,
  p_capacity INTEGER,
  p_personal_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  session_row JSON,
  booking_row JSON,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id INTEGER;
  v_booking_id INTEGER;
  v_user_package_id INTEGER;
  v_class_type_name TEXT;
  v_is_personal BOOLEAN := FALSE;
BEGIN
  -- Ensure function runs with proper search_path and privileges
  PERFORM set_config('search_path', 'public, pg_catalog', true);

  -- Get class type name and is_personal flag for package matching
  SELECT name, is_personal INTO v_class_type_name, v_is_personal
  FROM class_types WHERE id = p_class_type_id LIMIT 1;

  -- If is_personal is NULL, fall back to the name heuristic
  IF v_is_personal IS NULL THEN
    v_is_personal := (COALESCE(v_class_type_name, '') ~* 'personal|individual');
  END IF;

  -- If no personal user provided, create session only and return
  IF p_personal_user_id IS NULL THEN
    INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time, personal_user_id)
    VALUES (p_class_type_id, COALESCE(p_capacity, 1), p_schedule_date, p_schedule_time, NULL)
    RETURNING id INTO v_session_id;

    IF v_session_id IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'No se pudo crear la sesión'::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT TRUE,
      (SELECT row_to_json(cs) FROM (SELECT * FROM class_sessions WHERE id = v_session_id) cs),
      NULL::JSON,
      'Sesión creada sin booking'::TEXT;
    RETURN;
  END IF;

  -- Attempt to atomically claim a user_package for this user (prevent races)
  -- First, select a candidate and lock it using FOR UPDATE SKIP LOCKED
  SELECT up.id INTO v_user_package_id
  FROM user_packages up
  WHERE up.user_id = p_personal_user_id
    AND up.status = 'active'
    AND up.current_classes_remaining > 0
    AND (
      -- If class type is personal accept any package
      v_is_personal
      -- Or the package does not exist (admin/open package)
      OR NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = up.package_id)
      -- Or the package exists and its class_type is NULL or matches by name or id
      OR EXISTS (
        SELECT 1 FROM packages p
        WHERE p.id = up.package_id
          AND (
            p.class_type IS NULL
            OR p.class_type::text = v_class_type_name
            OR p.class_type::text = p_class_type_id::text
          )
      )
    )
  ORDER BY up.purchase_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'Usuario no tiene bonos disponibles para este tipo de clase'::TEXT;
    RETURN;
  END IF;

  -- Try to decrement the chosen package in a single UPDATE (guard against concurrent claims)
  UPDATE user_packages
  SET
    current_classes_remaining = current_classes_remaining - 1,
    classes_used_this_month = classes_used_this_month + 1,
    status = CASE WHEN current_classes_remaining - 1 <= 0 THEN 'depleted' ELSE status END
  WHERE id = v_user_package_id
    AND current_classes_remaining > 0
  RETURNING id INTO v_user_package_id;

  IF v_user_package_id IS NULL THEN
    -- Someone else claimed it, inform caller
    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'Paquete ya reclamado por otra transacción, reintenta'::TEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Claimed user_package id=% for user=%', v_user_package_id, p_personal_user_id;

  -- Insert session now that package is claimed
  INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time, personal_user_id)
  VALUES (p_class_type_id, COALESCE(p_capacity, 1), p_schedule_date, p_schedule_time, p_personal_user_id)
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- Rollback claim (best-effort) if session couldn't be created
    UPDATE user_packages
    SET
      current_classes_remaining = current_classes_remaining + 1,
      classes_used_this_month = GREATEST(classes_used_this_month - 1, 0),
      status = CASE WHEN current_classes_remaining + 1 > 0 THEN 'active' ELSE status END
    WHERE id = v_user_package_id;

    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'No se pudo crear la sesión tras reclamar el paquete'::TEXT;
    RETURN;
  END IF;

  -- Create booking linked to claimed package
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
    p_personal_user_id,
    v_session_id,
    NOW(),
    'CONFIRMED',
    TRUE,
    NULL,
    NULL,
    v_user_package_id
  ) RETURNING id INTO v_booking_id;

  RAISE NOTICE 'Created session id=% and booking id=% for user=% using user_package=%', v_session_id, v_booking_id, p_personal_user_id, v_user_package_id;

  RETURN QUERY SELECT TRUE,
    (SELECT row_to_json(cs) FROM (SELECT * FROM class_sessions WHERE id = v_session_id) cs),
    (SELECT row_to_json(bk) FROM (SELECT * FROM bookings WHERE id = v_booking_id) bk),
    'Sesión y reserva creadas correctamente'::TEXT;
  RETURN;
EXCEPTION WHEN OTHERS THEN
  -- Clean up on error: try to undo claimed package and created session
  PERFORM pg_sleep(0);
  BEGIN
    IF v_session_id IS NOT NULL THEN
      DELETE FROM class_sessions WHERE id = v_session_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- If we had claimed a package but failed later, try to revert the decrement (best-effort)
  BEGIN
    IF v_user_package_id IS NOT NULL THEN
      UPDATE user_packages
      SET
        current_classes_remaining = current_classes_remaining + 1,
        classes_used_this_month = GREATEST(classes_used_this_month - 1, 0),
        status = CASE WHEN current_classes_remaining + 1 > 0 THEN 'active' ELSE status END
      WHERE id = v_user_package_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, ('Error: ' || SQLERRM)::TEXT;
END;
$$;

COMMIT;

-- Grant execute to authenticated role (Supabase typical setup)
GRANT EXECUTE ON FUNCTION public.create_session_with_personal_booking(INTEGER, DATE, TIME, INTEGER, INTEGER) TO authenticated;

-- Ensure a non-negative constraint on user_packages.current_classes_remaining (safe add)
DO $$
BEGIN
  ALTER TABLE user_packages
    ADD CONSTRAINT user_packages_nonnegative_remaining CHECK (current_classes_remaining >= 0);
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists, skip
  NULL;
END;
$$;

-- Helpful index for package claims
CREATE INDEX IF NOT EXISTS idx_user_packages_user_status_remaining_purchase ON user_packages (user_id, status, current_classes_remaining, purchase_date);
