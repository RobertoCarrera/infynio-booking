-- Agregar sesiones de clase para septiembre 2025 para que coincidan con el calendario
-- El calendario actual está pidiendo datos para 2025-09-08 a 2025-09-13

-- Insertar sesiones para la semana del 8 al 13 de septiembre 2025
INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time) VALUES
-- Lunes 8 septiembre
(1, 15, '2025-09-08', '09:00:00'), -- Yoga Principiantes
(3, 20, '2025-09-08', '10:30:00'), -- Aeróbicos
(5, 12, '2025-09-08', '17:00:00'), -- Spinning
(7, 10, '2025-09-08', '18:30:00'), -- CrossFit

-- Martes 9 septiembre
(2, 18, '2025-09-09', '08:30:00'), -- Pilates
(6, 25, '2025-09-09', '10:00:00'), -- Zumba
(1, 15, '2025-09-09', '17:30:00'), -- Yoga Principiantes
(9, 12, '2025-09-09', '19:00:00'), -- Funcional

-- Miércoles 10 septiembre
(5, 12, '2025-09-10', '09:00:00'), -- Spinning
(8, 10, '2025-09-10', '10:30:00'), -- Aqua Aeróbicos
(2, 18, '2025-09-10', '17:00:00'), -- Pilates
(7, 10, '2025-09-10', '18:30:00'), -- CrossFit

-- Jueves 11 septiembre
(1, 15, '2025-09-11', '08:30:00'), -- Yoga Principiantes
(3, 20, '2025-09-11', '10:00:00'), -- Aeróbicos
(6, 25, '2025-09-11', '17:30:00'), -- Zumba
(5, 12, '2025-09-11', '19:00:00'), -- Spinning

-- Viernes 12 septiembre
(9, 12, '2025-09-12', '09:00:00'), -- Funcional
(2, 18, '2025-09-12', '10:30:00'), -- Pilates
(8, 10, '2025-09-12', '16:30:00'), -- Aqua Aeróbicos
(7, 10, '2025-09-12', '18:00:00'), -- CrossFit

-- Sábado 13 septiembre (por si acaso)
(1, 15, '2025-09-13', '10:00:00'), -- Yoga Principiantes
(5, 12, '2025-09-13', '11:30:00'); -- Spinning

-- Verificar las nuevas sesiones insertadas
SELECT 
    cs.id,
    cs.schedule_date,
    cs.schedule_time,
    cs.capacity,
    ct.name as class_type_name,
    ct.duration_minutes
FROM class_sessions cs
JOIN class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_date BETWEEN '2025-09-08' AND '2025-09-13'
ORDER BY cs.schedule_date, cs.schedule_time;

-- También mostrar todas las fechas disponibles para debug
SELECT DISTINCT schedule_date 
FROM class_sessions 
ORDER BY schedule_date 
LIMIT 20;
