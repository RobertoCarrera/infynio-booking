-- ================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ================================================

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
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  confirmed_bookings_count INTEGER,
  available_spots INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.class_type_id,
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

-- 3. Función para crear reserva con validaciones
CREATE OR REPLACE FUNCTION create_booking_with_validations(
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
    v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'expired' ELSE 'active' END;

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
  'create_booking_with_validations', 
  'get_booking_with_user'
);
