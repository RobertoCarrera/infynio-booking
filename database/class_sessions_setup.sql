-- =============================================
-- TABLAS PARA SISTEMA DE RESERVAS DE CLASES
-- =============================================

-- Tabla de tipos de clases
CREATE TABLE IF NOT EXISTS public.class_types (
  id SERIAL NOT NULL,
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT NULL,
  duration_minutes INTEGER NOT NULL,
  CONSTRAINT class_types_pkey PRIMARY KEY (id)
);

-- Tabla de sesiones de clases
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id SERIAL NOT NULL,
  class_type_id INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  schedule_date DATE NOT NULL,
  schedule_time TIME WITHOUT TIME ZONE NOT NULL,
  CONSTRAINT class_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT class_sessions_ibfk_1 FOREIGN KEY (class_type_id) REFERENCES class_types (id)
);

-- Tabla de reservas/bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id SERIAL NOT NULL,
  user_id INTEGER NOT NULL,
  class_session_id INTEGER NOT NULL,
  booking_time TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  cancellation_time TIMESTAMP WITHOUT TIME ZONE,
  status CHARACTER VARYING(20) DEFAULT 'confirmed',
  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT bookings_session_fk FOREIGN KEY (class_session_id) REFERENCES class_sessions (id),
  CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'cancelled'))
);

-- =============================================
-- FUNCIONES PARA GESTIÓN DE RESERVAS
-- =============================================

-- Función para verificar si una reserva se puede cancelar
CREATE OR REPLACE FUNCTION can_cancel_booking(booking_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  cancel_time TIMESTAMP;
BEGIN
  SELECT cancellation_time INTO cancel_time FROM bookings WHERE id = booking_id;
  RETURN NOW() < cancel_time;
END;
$$ LANGUAGE plpgsql;

-- Función para cancelar una clase (devolver al usuario)
CREATE OR REPLACE FUNCTION cancel_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    -- Buscar el paquete más reciente del tipo especificado
    SELECT up.id
    INTO v_package_id
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL) -- Admin packages don't have class_type restriction
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
            'booking_time', b.booking_time,
            'status', b.status
          )
        )
        FROM bookings b
        WHERE b.class_session_id = cs.id AND b.status = 'confirmed'
      ),
      '[]'::JSON
    ) AS bookings
  FROM class_sessions cs
  LEFT JOIN class_types ct ON ct.id = cs.class_type_id
  ORDER BY cs.schedule_date, cs.schedule_time;
END;
$$ LANGUAGE plpgsql;

-- Función para procesar rollover mensual
CREATE OR REPLACE FUNCTION process_monthly_rollover()
RETURNS VOID AS $$
BEGIN
  -- Mover clases no usadas a rollover y resetear el contador mensual
  UPDATE user_packages 
  SET 
    rollover_classes_remaining = rollover_classes_remaining + (monthly_classes_limit - classes_used_this_month),
    classes_used_this_month = 0,
    next_rollover_reset_date = (DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month'))::date
  WHERE 
    status = 'active' 
    AND (next_rollover_reset_date IS NULL OR next_rollover_reset_date <= CURRENT_DATE)
    AND package_id IS NOT NULL 
    AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND NOT is_single_class);
        
    -- Expirar clases sueltas que han pasado su fecha
  UPDATE user_packages 
  SET status = 'expired'
  WHERE 
    status = 'active' 
    AND next_rollover_reset_date IS NOT NULL
    AND next_rollover_reset_date <= CURRENT_DATE
    AND package_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND is_single_class);
END;
$$ LANGUAGE plpgsql;

-- Función para usar una clase del usuario
CREATE OR REPLACE FUNCTION user_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
    v_monthly_available INTEGER;
    v_rollover_available INTEGER;
BEGIN
    -- Buscar un paquete activo del tipo especificado con clases disponibles
    SELECT up.id, 
           (up.monthly_classes_limit - up.classes_used_this_month),
           up.rollover_classes_remaining
    INTO v_package_id, v_monthly_available, v_rollover_available
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL) -- Admin packages don't have class_type restriction
      AND up.status = 'active'
      AND (
          (up.monthly_classes_limit - up.classes_used_this_month) > 0 
          OR up.rollover_classes_remaining > 0
      )
    ORDER BY up.created_at DESC
    LIMIT 1;
    
    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay clases disponibles
    END IF;
    
    -- Usar primero las clases del mes actual, luego las de rollover
    IF v_monthly_available > 0 THEN
        UPDATE user_packages 
        SET 
            classes_used_this_month = classes_used_this_month + 1,
            current_classes_remaining = current_classes_remaining - 1
        WHERE id = v_package_id;
    ELSE
        UPDATE user_packages 
        SET 
            rollover_classes_remaining = rollover_classes_remaining - 1,
            current_classes_remaining = current_classes_remaining - 1
        WHERE id = v_package_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- DATOS DE EJEMPLO
-- =============================================

-- Insertar tipos de clases
INSERT INTO public.class_types (name, description, duration_minutes) VALUES
('MAT-FUNCIONAL', 'Clase de entrenamiento funcional en colchoneta', 60),
('REFORMER', 'Clase de Pilates con máquina Reformer', 50),
('YOGA', 'Clase de Yoga y relajación', 75),
('HIIT', 'Entrenamiento de alta intensidad', 45)
ON CONFLICT DO NOTHING;

-- Insertar sesiones de clases para la próxima semana
INSERT INTO public.class_sessions (class_type_id, capacity, schedule_date, schedule_time) VALUES
-- Lunes
(1, 12, CURRENT_DATE + INTERVAL '1 day', '09:00:00'),
(2, 8, CURRENT_DATE + INTERVAL '1 day', '10:30:00'),
(1, 12, CURRENT_DATE + INTERVAL '1 day', '18:00:00'),
(3, 15, CURRENT_DATE + INTERVAL '1 day', '19:30:00'),

-- Martes  
(2, 8, CURRENT_DATE + INTERVAL '2 days', '08:30:00'),
(4, 10, CURRENT_DATE + INTERVAL '2 days', '10:00:00'),
(1, 12, CURRENT_DATE + INTERVAL '2 days', '17:30:00'),
(2, 8, CURRENT_DATE + INTERVAL '2 days', '19:00:00'),

-- Miércoles
(1, 12, CURRENT_DATE + INTERVAL '3 days', '09:00:00'),
(3, 15, CURRENT_DATE + INTERVAL '3 days', '10:30:00'),
(4, 10, CURRENT_DATE + INTERVAL '3 days', '18:00:00'),
(1, 12, CURRENT_DATE + INTERVAL '3 days', '19:30:00'),

-- Jueves
(2, 8, CURRENT_DATE + INTERVAL '4 days', '08:30:00'),
(1, 12, CURRENT_DATE + INTERVAL '4 days', '10:00:00'),
(2, 8, CURRENT_DATE + INTERVAL '4 days', '17:30:00'),
(3, 15, CURRENT_DATE + INTERVAL '4 days', '19:00:00'),

-- Viernes
(4, 10, CURRENT_DATE + INTERVAL '5 days', '09:00:00'),
(1, 12, CURRENT_DATE + INTERVAL '5 days', '10:30:00'),
(2, 8, CURRENT_DATE + INTERVAL '5 days', '18:00:00'),
(1, 12, CURRENT_DATE + INTERVAL '5 days', '19:30:00'),

-- Sábado
(3, 15, CURRENT_DATE + INTERVAL '6 days', '10:00:00'),
(2, 8, CURRENT_DATE + INTERVAL '6 days', '11:30:00'),
(4, 10, CURRENT_DATE + INTERVAL '6 days', '17:00:00')
ON CONFLICT DO NOTHING;
