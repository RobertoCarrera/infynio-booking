-- =============================================
-- SCRIPT SEGURO PARA SISTEMA DE RESERVAS
-- Solo agrega funciones, NO modifica tablas existentes
-- =============================================

-- IMPORTANTE: Este script se adapta a tu estructura existente de bookings:
-- - booking_date_time (en lugar de booking_time)
-- - is_from_package boolean
-- - payment_id para pagos
-- - Estructura ya existente

-- =============================================
-- FUNCIONES ADAPTADAS A TU ESTRUCTURA EXISTENTE
-- =============================================

-- Función para verificar si una reserva se puede cancelar
-- Adaptada a tu campo 'cancellation_time'
CREATE OR REPLACE FUNCTION can_cancel_booking(booking_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  cancel_time TIMESTAMP;
BEGIN
  SELECT cancellation_time INTO cancel_time 
  FROM bookings 
  WHERE id = booking_id;
  
  -- Si no hay cancellation_time, no se puede cancelar
  IF cancel_time IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN NOW() < cancel_time;
END;
$$ LANGUAGE plpgsql;

-- Función para cancelar una clase (devolver al usuario)
-- Mantiene la lógica de tu sistema de packages
CREATE OR REPLACE FUNCTION cancel_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    -- Solo procesar si la reserva era de un package (no de pago directo)
    -- Buscar el paquete más reciente del tipo especificado
    SELECT up.id
    INTO v_package_id
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL)
      AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1;
    
    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay paquetes del tipo especificado
    END IF;
    
    -- Devolver la clase (preferir devolver a las clases del mes actual)
    UPDATE user_packages 
    SET 
        classes_used_this_month = GREATEST(0, classes_used_this_month - 1),
        current_classes_remaining = current_classes_remaining + 1
    WHERE id = v_package_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener sesiones de clases con información completa
-- Adaptada a tu estructura de bookings existente
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
            'is_from_package', b.is_from_package,
            'payment_id', b.payment_id
          )
        )
        FROM bookings b
        WHERE b.class_session_id = cs.id 
          AND b.status NOT IN ('cancelled', 'no-show') -- Ajustar según tus estados
      ),
      '[]'::JSON
    ) AS bookings
  FROM class_sessions cs
  LEFT JOIN class_types ct ON ct.id = cs.class_type_id
  WHERE cs.schedule_date >= CURRENT_DATE -- Solo sesiones futuras
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$ LANGUAGE plpgsql;

-- Función para usar una clase del usuario (adaptada a tu estructura)
CREATE OR REPLACE FUNCTION user_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
    v_monthly_available INTEGER;
BEGIN
    -- Buscar un paquete activo del tipo especificado con clases disponibles
    SELECT up.id, 
           (up.monthly_classes_limit - up.classes_used_this_month),
           up.current_classes_remaining
    INTO v_package_id, v_monthly_available, v_rollover_available
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL)
      AND up.status = 'active'
      AND up.current_classes_remaining > 0
    ORDER BY up.created_at DESC
    LIMIT 1;
    
    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay clases disponibles
    END IF;
    
    -- Usar primero las clases del mes actual, luego las de rollover
    UPDATE user_packages 
    SET 
        classes_used_this_month = classes_used_this_month + 1,
        current_classes_remaining = current_classes_remaining - 1
    WHERE id = v_package_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Función helper para crear una reserva desde package
-- Nueva función que maneja la lógica específica de tu sistema
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
    
    -- Crear la reserva y registrar el user_package_id usado
    INSERT INTO bookings (
        user_id,
        class_session_id,
        booking_date_time,
        status,
        cancellation_time,
        is_from_package,
        payment_id,
        user_package_id
    ) VALUES (
        p_user_id,
        p_class_session_id,
        NOW(),
        'confirmed',
        v_cancellation_time,
        true,
        NULL,
        (SELECT id FROM user_packages up WHERE up.user_id = p_user_id AND up.status = 'active' AND up.current_classes_remaining >= 0 ORDER BY up.purchase_date ASC LIMIT 1)
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

-- Función para cancelar una reserva específica
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
    
    -- Cancelar la reserva
    UPDATE bookings 
    SET status = 'cancelled'
    WHERE id = p_booking_id;

    -- Si era de un package, devolver la clase al paquete concreto usado
    IF v_booking.is_from_package THEN
        IF v_booking.user_package_id IS NOT NULL THEN
            UPDATE user_packages
            SET classes_used_this_month = GREATEST(0, classes_used_this_month - 1),
                current_classes_remaining = current_classes_remaining + 1
            WHERE id = v_booking.user_package_id;
        ELSE
            -- Fallback: devolver a un paquete reciente del mismo tipo
            PERFORM cancel_class(p_user_id, v_booking.class_type_name);
        END IF;
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
