-- =============================================
-- SCRIPT DE CORRECCIÓN - Resolver conflictos
-- =============================================

-- 1. Eliminar la función conflictiva para recrearla con la estructura correcta
DROP FUNCTION IF EXISTS get_class_sessions();

-- 2. Recrear get_class_sessions con la estructura correcta
CREATE OR REPLACE FUNCTION get_class_sessions()
RETURNS TABLE (
  id INTEGER,
  class_type_id INTEGER,
  capacity INTEGER,
  schedule_date DATE,
  schedule_time TIME,
  class_type_name TEXT,
  class_type_description TEXT,
  class_type_duration INTEGER,
  bookings JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    ct.name::TEXT AS class_type_name,
    ct.description::TEXT AS class_type_description,
    ct.duration_minutes AS class_type_duration,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', b.id,
            'user_id', b.user_id,
            'booking_date_time', b.booking_date_time,
            'status', b.status,
            'cancellation_time', b.cancellation_time
          )
        )
        FROM bookings b
        WHERE b.class_session_id = cs.id 
          AND b.status = 'confirmed' -- Solo reservas confirmadas
      ),
      '[]'::JSON
    ) AS bookings
  FROM class_sessions cs
  LEFT JOIN class_types ct ON ct.id = cs.class_type_id
  WHERE cs.schedule_date >= CURRENT_DATE -- Solo sesiones futuras
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$ LANGUAGE plpgsql;

-- 3. Función simplificada para crear reservas (SIN is_from_package)
-- Simplemente usa el sistema de packages existente
CREATE OR REPLACE FUNCTION create_booking_from_package(
    p_user_id INTEGER,
    p_class_session_id INTEGER,
    p_class_type TEXT
)
RETURNS JSON AS $$
DECLARE
    v_booking_id INTEGER;
    v_session_data RECORD;
    v_cancellation_time TIMESTAMP;
    v_can_use_class BOOLEAN;
BEGIN
    -- Verificar si el usuario puede usar una clase
    SELECT user_class(p_user_id, p_class_type) INTO v_can_use_class;
    
    IF NOT v_can_use_class THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tienes clases disponibles de este tipo'
        );
    END IF;
    
    -- Obtener información de la sesión para calcular cancellation_time
    SELECT schedule_date, schedule_time
    INTO v_session_data
    FROM class_sessions
    WHERE id = p_class_session_id;
    
    IF v_session_data IS NULL THEN
        -- Devolver la clase si no se pudo obtener la sesión
        PERFORM cancel_class(p_user_id, p_class_type);
        RETURN json_build_object(
            'success', false,
            'error', 'Sesión de clase no encontrada'
        );
    END IF;
    
    -- Calcular tiempo límite de cancelación (12 horas antes)
    v_cancellation_time := (v_session_data.schedule_date + v_session_data.schedule_time) - INTERVAL '12 hours';
    
    -- Crear la reserva (SIN is_from_package, más simple) pero registrar paquete si aplica
    INSERT INTO bookings (
        user_id,
        class_session_id,
        booking_date_time,
        status,
        cancellation_time,
        user_package_id
    ) VALUES (
        p_user_id,
        p_class_session_id,
        NOW(),
        'confirmed',
        v_cancellation_time,
        (SELECT up.id FROM user_packages up WHERE up.user_id = p_user_id AND up.status = 'active' AND up.current_classes_remaining > 0 ORDER BY up.purchase_date ASC LIMIT 1)
    ) RETURNING id INTO v_booking_id;
    
    RETURN json_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'cancellation_time', v_cancellation_time
    );
    
EXCEPTION WHEN OTHERS THEN
    -- Si algo falla, devolver la clase al usuario
    PERFORM cancel_class(p_user_id, p_class_type);
    RETURN json_build_object(
        'success', false,
        'error', 'Error al crear la reserva: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- 4. Función simplificada para cancelar reservas
CREATE OR REPLACE FUNCTION cancel_booking_safe(
    p_booking_id INTEGER,
    p_user_id INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_booking RECORD;
    v_class_type TEXT;
    v_can_cancel BOOLEAN;
BEGIN
    -- Obtener información de la reserva
    SELECT 
        b.*,
        ct.name as class_type_name
    INTO v_booking
    FROM bookings b
    JOIN class_sessions cs ON b.class_session_id = cs.id
    JOIN class_types ct ON cs.class_type_id = ct.id
    WHERE b.id = p_booking_id 
      AND b.user_id = p_user_id
      AND b.status = 'confirmed';
    
    IF v_booking IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Reserva no encontrada o ya cancelada'
        );
    END IF;
    
    -- Verificar si se puede cancelar
    SELECT can_cancel_booking(p_booking_id) INTO v_can_cancel;
    
    IF NOT v_can_cancel THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede cancelar: han pasado más de 12 horas del límite'
        );
    END IF;
    
        -- Cancelar la reserva and refund to specific package when known
        UPDATE bookings 
        SET status = 'cancelled'
        WHERE id = p_booking_id;

        IF v_booking.user_package_id IS NOT NULL THEN
            UPDATE user_packages
            SET classes_used_this_month = GREATEST(0, classes_used_this_month - 1),
                    current_classes_remaining = current_classes_remaining + 1
            WHERE id = v_booking.user_package_id;
        ELSE
            PERFORM cancel_class(p_user_id, v_booking.class_type_name);
        END IF;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Reserva cancelada exitosamente'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error al cancelar la reserva: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql;
