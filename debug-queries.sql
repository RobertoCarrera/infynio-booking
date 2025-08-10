-- Verificar datos para septiembre 2025
-- Ejecutar estas consultas en tu dashboard de Supabase

-- 1. Verificar que existen datos en el rango solicitado
SELECT COUNT(*) as total_sessions
FROM class_sessions 
WHERE schedule_date BETWEEN '2025-09-01' AND '2025-09-06';

-- 2. Ver las primeras sesiones en ese rango
SELECT 
    cs.id,
    cs.schedule_date,
    cs.schedule_time,
    cs.capacity,
    cs.class_type_id,
    ct.name as class_type_name,
    ct.duration_minutes
FROM class_sessions cs
LEFT JOIN class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_date BETWEEN '2025-09-01' AND '2025-09-06'
ORDER BY cs.schedule_date, cs.schedule_time
LIMIT 10;

-- 3. Verificar que la relación funciona
SELECT 
    cs.id,
    cs.schedule_date,
    cs.schedule_time,
    cs.class_type_id,
    ct.name as class_type_name
FROM class_sessions cs
JOIN class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_date BETWEEN '2025-09-01' AND '2025-09-06'
LIMIT 5;

-- 4. Verificar todas las fechas disponibles
SELECT DISTINCT schedule_date 
FROM class_sessions 
WHERE schedule_date >= '2025-09-01'
ORDER BY schedule_date 
LIMIT 20;

-- 5. Verificar tipos de datos
SELECT 
    schedule_date,
    pg_typeof(schedule_date) as date_type,
    schedule_time,
    pg_typeof(schedule_time) as time_type
FROM class_sessions 
LIMIT 1;
