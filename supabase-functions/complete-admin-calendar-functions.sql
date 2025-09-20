-- ================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ================================================

-- A. Limpieza: eliminar sobrecargas antiguas que rompen PostgREST (PGRST203)
--    Mantendremos una única versión canónica con firma (p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL, p_user_id INTEGER)
DO $$
BEGIN
  -- Eliminar posibles variantes con 2 y 3 parámetros (ordenes distintos)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_sessions_for_calendar') THEN
    BEGIN
      PERFORM 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_sessions_for_calendar' AND p.pronargs = 2;
      IF FOUND THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(date, date)';
      END IF;

      PERFORM 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_sessions_for_calendar' AND p.pronargs = 3;
      IF FOUND THEN
        -- Intentar ambas permutaciones comunes
        EXECUTE 'DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(date, date, integer)';
        EXECUTE 'DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(integer, date, date)';
      END IF;
    EXCEPTION WHEN others THEN
      -- No interrumpir la ejecución si alguna variante no existe exactamente
      NULL;
    END;
  END IF;
END$$;

-- 1. PRIMERO: Crear índice único para prevenir duplicados
CREATE UNIQUE INDEX IF NOT EXISTS unique_confirmed_user_session_booking 
ON bookings (user_id, class_session_id) 
WHERE status = 'CONFIRMED';

-- 2. Función para obtener sesiones con contadores
CREATE OR REPLACE FUNCTION get_sessions_with_booking_counts(
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
  -- Ensure predictable name resolution
  PERFORM set_config('search_path', 'public, pg_temp', true);
  -- Mark context so RLS can allow SELECT on bookings during this RPC
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
    SELECT 
      class_session_id,
      COUNT(*) as confirmed_count
    FROM bookings 
    WHERE status = 'CONFIRMED'
    GROUP BY class_session_id
  ) b ON cs.id = b.class_session_id
  WHERE 
    (p_start_date IS NULL OR cs.schedule_date >= p_start_date)
    AND (p_end_date IS NULL OR cs.schedule_date <= p_end_date)
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$;

-- 2b. Función para obtener sesiones para calendario (incluye nombre de tipo, nivel y flags del propio usuario)
CREATE OR REPLACE FUNCTION get_sessions_for_calendar(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_user_id INTEGER
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
  -- Ensure predictable name resolution
  PERFORM set_config('search_path', 'public, pg_temp', true);
  -- Mark context so RLS can allow SELECT on bookings during this RPC
  PERFORM set_config('app.call', 'get_sessions_for_calendar', true);
  RETURN QUERY
  SELECT 
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name AS class_type_name,
    ct.description AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    cs.level_id,
    l.name AS level_name,
    l.color AS level_color,
    COALESCE(bc.confirmed_count, 0)::INTEGER AS confirmed_bookings_count,
    (cs.capacity - COALESCE(bc.confirmed_count, 0))::INTEGER AS available_spots,
    (sb.id IS NOT NULL) AS is_self_booked,
    sb.id AS self_booking_id,
    sb.cancellation_time AS self_cancellation_time,
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

-- Ensure authenticated users can execute both RPCs
GRANT EXECUTE ON FUNCTION public.get_sessions_for_calendar(date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sessions_with_booking_counts(date, date) TO authenticated;

-- Policy: allow SELECT on bookings when reading via calendar RPCs (guarded by GUC)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'allow_select_for_calendar'
  ) THEN
    EXECUTE $$CREATE POLICY allow_select_for_calendar ON public.bookings
      FOR SELECT
      TO public
      USING (
        current_setting('app.call', true) IN ('get_sessions_for_calendar','get_sessions_with_booking_counts')
      )$$;
  END IF;
END$$;

-- 3. Función para crear reserva con validaciones
CREATE OR REPLACE FUNCTION public.create_booking_with_validations(
  p_user_id INTEGER,
  p_class_session_id INTEGER,
  p_booking_date_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  success BOOLEAN,
  booking_id INTEGER,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_capacity INTEGER;
  v_current_bookings INTEGER;
  v_user_package_id INTEGER;
  v_booking_id INTEGER;
  v_classes_remaining INTEGER;
  v_classes_used INTEGER;
  v_new_status TEXT;
BEGIN
  -- Ensure predictable name resolution under SECURITY DEFINER
  PERFORM set_config('search_path', 'public, pg_temp', true);
  -- Mark context so RLS policy can allow insert via this RPC only
  PERFORM set_config('app.call', 'create_booking_with_validations', true);
  -- Verificar si ya existe una reserva confirmada
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE user_id = p_user_id 
    AND class_session_id = p_class_session_id 
    AND status = 'CONFIRMED'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario ya está inscrito en esta clase'::TEXT;
    RETURN;
  END IF;

  -- Obtener capacidad de la sesión
  SELECT capacity INTO v_capacity
  FROM class_sessions
  WHERE id = p_class_session_id;

  -- Contar reservas actuales confirmadas
  SELECT COUNT(*) INTO v_current_bookings
  FROM bookings
  WHERE class_session_id = p_class_session_id 
  AND status = 'CONFIRMED';

  -- Verificar capacidad
  IF v_current_bookings >= v_capacity THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'La clase está completa'::TEXT;
    RETURN;
  END IF;

  -- Obtener paquete activo del usuario
  SELECT id, current_classes_remaining, classes_used_this_month
  INTO v_user_package_id, v_classes_remaining, v_classes_used
  FROM user_packages
  WHERE user_id = p_user_id
  AND status = 'active'
  AND current_classes_remaining > 0
  ORDER BY purchase_date ASC
  LIMIT 1;

  -- Verificar que tiene paquete disponible
  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario no tiene bonos disponibles'::TEXT;
    RETURN;
  END IF;

  -- TRANSACCIÓN: Crear reserva y actualizar paquete
  BEGIN
    -- Crear la reserva
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
      p_booking_date_time,
      'CONFIRMED',
      TRUE,
      NULL,
      NULL,
      v_user_package_id
    ) RETURNING id INTO v_booking_id;

    -- Actualizar el paquete
    v_classes_remaining := v_classes_remaining - 1;
    v_classes_used := v_classes_used + 1;
  v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

    UPDATE user_packages
    SET 
      current_classes_remaining = v_classes_remaining,
      classes_used_this_month = v_classes_used,
      status = v_new_status
    WHERE id = v_user_package_id;

    -- Retornar éxito
    RETURN QUERY SELECT TRUE, v_booking_id, 'Reserva creada correctamente'::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- En caso de error, rollback automático
    RETURN QUERY SELECT FALSE, NULL::INTEGER, ('Error: ' || SQLERRM)::TEXT;
  END;
END;
$$;

-- Permitir a usuarios autenticados ejecutar la función (ejecuta con privilegios del propietario)
GRANT EXECUTE ON FUNCTION public.create_booking_with_validations(INTEGER, INTEGER, TIMESTAMPTZ) TO authenticated;

-- Política RLS: permitir INSERT a bookings solo cuando es invocado por la función (detectado por GUC app.call)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'allow_insert_via_function'
  ) THEN
    EXECUTE $$CREATE POLICY allow_insert_via_function ON public.bookings
      FOR INSERT
      TO public
      WITH CHECK (
        current_setting('app.call', true) = 'create_booking_with_validations'
      )$$;
  END IF;
END$$;

-- 3b. Actualizar función create_session_with_personal_booking para soportar level_id en las inserciones
CREATE OR REPLACE FUNCTION public.create_session_with_personal_booking(
  p_class_type_id INTEGER,
  p_schedule_date DATE,
  p_schedule_time TIME,
  p_capacity INTEGER,
  p_personal_user_id INTEGER DEFAULT NULL,
  p_level_id INTEGER DEFAULT NULL
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
  PERFORM set_config('search_path', 'public, pg_catalog', true);

  SELECT name, is_personal INTO v_class_type_name, v_is_personal
  FROM class_types WHERE id = p_class_type_id LIMIT 1;

  IF v_is_personal IS NULL THEN
    v_is_personal := (COALESCE(v_class_type_name, '') ~* 'personal|individual');
  END IF;

  IF p_personal_user_id IS NULL THEN
    INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time, personal_user_id, level_id)
    VALUES (p_class_type_id, COALESCE(p_capacity, 1), p_schedule_date, p_schedule_time, NULL, p_level_id)
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

  SELECT up.id INTO v_user_package_id
  FROM user_packages up
  WHERE up.user_id = p_personal_user_id
    AND up.status = 'active'
    AND up.current_classes_remaining > 0
    AND (
      v_is_personal
      OR NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = up.package_id)
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
  ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'Usuario no tiene bonos disponibles para este tipo de clase'::TEXT;
    RETURN;
  END IF;

  UPDATE user_packages
  SET
    current_classes_remaining = current_classes_remaining - 1,
    classes_used_this_month = classes_used_this_month + 1,
    status = CASE WHEN current_classes_remaining - 1 <= 0 THEN 'depleted' ELSE status END
  WHERE id = v_user_package_id
    AND current_classes_remaining > 0
  RETURNING id INTO v_user_package_id;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'Paquete ya reclamado por otra transacción, reintenta'::TEXT;
    RETURN;
  END IF;

  INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time, personal_user_id, level_id)
  VALUES (p_class_type_id, COALESCE(p_capacity, 1), p_schedule_date, p_schedule_time, p_personal_user_id, p_level_id)
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    UPDATE user_packages
    SET
      current_classes_remaining = current_classes_remaining + 1,
      classes_used_this_month = GREATEST(classes_used_this_month - 1, 0),
      status = CASE WHEN current_classes_remaining + 1 > 0 THEN 'active' ELSE status END
    WHERE id = v_user_package_id;

    RETURN QUERY SELECT FALSE, NULL::JSON, NULL::JSON, 'No se pudo crear la sesión tras reclamar el paquete'::TEXT;
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
    p_personal_user_id,
    v_session_id,
    NOW(),
    'CONFIRMED',
    TRUE,
    NULL,
    NULL,
    v_user_package_id
  ) RETURNING id INTO v_booking_id;

  RETURN QUERY SELECT TRUE,
    (SELECT row_to_json(cs) FROM (SELECT * FROM class_sessions WHERE id = v_session_id) cs),
    (SELECT row_to_json(bk) FROM (SELECT * FROM bookings WHERE id = v_booking_id) bk),
    'Sesión y reserva creadas correctamente'::TEXT;
  RETURN;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    IF v_session_id IS NOT NULL THEN
      DELETE FROM class_sessions WHERE id = v_session_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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

GRANT EXECUTE ON FUNCTION public.create_session_with_personal_booking(INTEGER, DATE, TIME, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Asegurar permisos para cancelación con reembolso (definida en migraciones)
GRANT EXECUTE ON FUNCTION public.cancel_booking_with_refund(INTEGER, INTEGER) TO authenticated;

-- 4. Función para obtener información completa de una reserva
CREATE OR REPLACE FUNCTION get_booking_with_user(p_booking_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  user_id INTEGER,
  class_session_id INTEGER,
  booking_date_time TIMESTAMPTZ,
  status TEXT,
  cancellation_time TIMESTAMPTZ,
  user_name TEXT,
  user_surname TEXT,
  user_email TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.user_id,
    b.class_session_id,
    b.booking_date_time,
    b.status,
    b.cancellation_time,
    u.name as user_name,
    u.surname as user_surname,
    u.email as user_email
  FROM bookings b
  JOIN users u ON b.user_id = u.id
  WHERE b.id = p_booking_id;
END;
$$;

-- ================================================
-- VERIFICACIÓN: Comprobar que se crearon correctamente
-- ================================================

-- Verificar que el índice se creó
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'bookings' 
AND indexname = 'unique_confirmed_user_session_booking';

-- Verificar que las funciones existen
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN (
  'get_sessions_with_booking_counts', 
  'get_sessions_for_calendar',
  'create_booking_with_validations', 
  'get_booking_with_user'
);
