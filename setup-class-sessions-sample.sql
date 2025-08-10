-- Insertar sesiones de clase de ejemplo para probar el calendario
-- Asegúrate de que ya existan los tipos de clase (ejecuta setup-class-types.sql primero)

-- Limpiar sesiones existentes (opcional)
-- DELETE FROM class_sessions;

-- Insertar sesiones para esta semana
INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time) VALUES
-- Lunes
(1, 15, '2025-07-21', '09:00:00'), -- Yoga Principiantes
(3, 20, '2025-07-21', '10:30:00'), -- Aeróbicos
(5, 12, '2025-07-21', '17:00:00'), -- Spinning
(7, 10, '2025-07-21', '18:30:00'), -- CrossFit

-- Martes
(2, 18, '2025-07-22', '08:30:00'), -- Pilates
(6, 25, '2025-07-22', '10:00:00'), -- Zumba
(1, 15, '2025-07-22', '17:30:00'), -- Yoga Principiantes
(9, 12, '2025-07-22', '19:00:00'), -- Funcional

-- Miércoles
(5, 12, '2025-07-23', '09:00:00'), -- Spinning
(8, 10, '2025-07-23', '10:30:00'), -- Aqua Aeróbicos
(2, 18, '2025-07-23', '17:00:00'), -- Pilates
(7, 10, '2025-07-23', '18:30:00'), -- CrossFit

-- Jueves
(1, 15, '2025-07-24', '08:30:00'), -- Yoga Principiantes
(3, 20, '2025-07-24', '10:00:00'), -- Aeróbicos
(6, 25, '2025-07-24', '17:30:00'), -- Zumba
(5, 12, '2025-07-24', '19:00:00'), -- Spinning

-- Viernes
(9, 12, '2025-07-25', '09:00:00'), -- Funcional
(2, 18, '2025-07-25', '10:30:00'), -- Pilates
(8, 10, '2025-07-25', '16:30:00'), -- Aqua Aeróbicos
(7, 10, '2025-07-25', '18:00:00'), -- CrossFit

-- Próxima semana (ejemplos adicionales)
(1, 15, '2025-07-28', '09:00:00'), -- Yoga Principiantes
(3, 20, '2025-07-28', '10:30:00'), -- Aeróbicos
(5, 12, '2025-07-28', '17:00:00'), -- Spinning
(6, 25, '2025-07-29', '10:00:00'), -- Zumba
(2, 18, '2025-07-29', '17:30:00'), -- Pilates
(7, 10, '2025-07-30', '18:30:00'); -- CrossFit

-- Verificar los datos insertados
SELECT 
    cs.id,
    cs.schedule_date,
    cs.schedule_time,
    cs.capacity,
    ct.name as class_type_name,
    ct.duration_minutes
FROM class_sessions cs
JOIN class_types ct ON cs.class_type_id = ct.id
ORDER BY cs.schedule_date, cs.schedule_time;
