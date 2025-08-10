-- Crear tabla de tipos de clases si no existe
CREATE TABLE IF NOT EXISTS class_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    duration_minutes INTEGER DEFAULT 60,
    price DECIMAL(10,2) DEFAULT 0.00,
    color VARCHAR(7) DEFAULT '#007bff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar tipos de clases de ejemplo
INSERT INTO class_types (id, name, description, duration_minutes, price, color) VALUES
(1, 'Yoga Principiantes', 'Clase de yoga para personas que empiezan', 60, 15.00, '#28a745'),
(2, 'Pilates', 'Clase de pilates para tonificar y fortalecer', 60, 18.00, '#17a2b8'),
(3, 'Aeróbicos', 'Clase de ejercicios aeróbicos para mejorar la resistencia', 45, 12.00, '#ffc107'),
(4, 'Clase Personal', 'Clase personalizada uno a uno', 60, 35.00, '#dc3545'),
(5, 'Spinning', 'Clase de ciclismo indoor de alta intensidad', 45, 15.00, '#fd7e14'),
(6, 'Zumba', 'Clase de baile fitness divertida y energética', 60, 14.00, '#e83e8c'),
(7, 'CrossFit', 'Entrenamiento funcional de alta intensidad', 60, 20.00, '#6f42c1'),
(8, 'Aqua Aeróbicos', 'Ejercicios aeróbicos en el agua', 45, 16.00, '#20c997'),
(9, 'Funcional', 'Entrenamiento funcional para mejorar la fuerza', 60, 17.00, '#6c757d');

-- Actualizar las sesiones existentes para que coincidan con los IDs
-- (Las que ya insertaste deberían funcionar con estos IDs)

-- Crear índice para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_class_sessions_date_time ON class_sessions(schedule_date, schedule_time);
CREATE INDEX IF NOT EXISTS idx_class_sessions_class_type ON class_sessions(class_type_id);
