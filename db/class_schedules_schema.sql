-- Tabla para almacenar los horarios de las clases
CREATE TABLE IF NOT EXISTS class_schedules (
    id SERIAL PRIMARY KEY,
    class_type_id INTEGER NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 10 CHECK (max_capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint para evitar solapamiento de horarios el mismo día
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    
    -- Índice único para evitar duplicados exactos
    -- Eliminado para permitir gestión avanzada de recurrencia (historico/futuro)
    -- UNIQUE(class_type_id, day_of_week, start_time)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_class_schedules_day_time ON class_schedules(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_class_schedules_class_type ON class_schedules(class_type_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_active ON class_schedules(is_active);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at en class_schedules
DROP TRIGGER IF EXISTS update_class_schedules_updated_at ON class_schedules;
CREATE TRIGGER update_class_schedules_updated_at
    BEFORE UPDATE ON class_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Datos de ejemplo para los horarios
INSERT INTO class_schedules (class_type_id, day_of_week, start_time, end_time, max_capacity, is_active) VALUES
-- Barre (ID 1)
(1, 1, '09:00', '09:50', 15, true), -- Lunes 9:00
(1, 3, '18:00', '18:50', 15, true), -- Miércoles 18:00
(1, 5, '19:00', '19:50', 15, true), -- Viernes 19:00

-- Mat (ID 2)
(2, 2, '10:00', '10:50', 12, true), -- Martes 10:00
(2, 4, '17:00', '17:50', 12, true), -- Jueves 17:00
(2, 6, '11:00', '11:50', 12, true), -- Sábado 11:00

-- Reformer (ID 3)
(3, 1, '18:30', '19:20', 8, true),  -- Lunes 18:30
(3, 3, '19:30', '20:20', 8, true),  -- Miércoles 19:30
(3, 5, '18:00', '18:50', 8, true),  -- Viernes 18:00

-- Funcional (ID 9)
(9, 2, '19:00', '19:50', 10, true), -- Martes 19:00
(9, 4, '20:00', '20:50', 10, true), -- Jueves 20:00
(9, 6, '10:00', '10:50', 10, true), -- Sábado 10:00

-- Personalizada (ID 4) - Horarios más flexibles
(4, 1, '16:00', '16:50', 1, true),  -- Lunes 16:00
(4, 2, '16:00', '16:50', 1, true),  -- Martes 16:00
(4, 3, '16:00', '16:50', 1, true),  -- Miércoles 16:00
(4, 4, '16:00', '16:50', 1, true),  -- Jueves 16:00
(4, 5, '16:00', '16:50', 1, true)   -- Viernes 16:00
ON CONFLICT (class_type_id, day_of_week, start_time) DO NOTHING;

-- Comentarios de documentación
COMMENT ON TABLE class_schedules IS 'Horarios semanales recurrentes para cada tipo de clase';
COMMENT ON COLUMN class_schedules.day_of_week IS '0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado';
COMMENT ON COLUMN class_schedules.start_time IS 'Hora de inicio de la clase (formato HH:MM)';
COMMENT ON COLUMN class_schedules.end_time IS 'Hora de fin de la clase (formato HH:MM)';
COMMENT ON COLUMN class_schedules.max_capacity IS 'Número máximo de participantes para esta clase';
COMMENT ON COLUMN class_schedules.is_active IS 'Si el horario está activo y se pueden hacer reservas';
