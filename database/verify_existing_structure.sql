-- =============================================
-- SCRIPT DE VERIFICACIÓN DE ESTRUCTURA EXISTENTE
-- =============================================
-- Este script NO modifica nada, solo consulta para verificar la estructura actual

-- 1. Verificar estructura de la tabla bookings existente
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bookings'
ORDER BY ordinal_position;

-- 2. Verificar estructura de class_types
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'class_types'
ORDER BY ordinal_position;

-- 3. Verificar estructura de class_sessions
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'class_sessions'
ORDER BY ordinal_position;

-- 4. Ver algunos datos de ejemplo de class_types
SELECT 
    id,
    name,
    description,
    duration_minutes
FROM public.class_types
LIMIT 10;

-- 5. Ver algunas sesiones de clase de ejemplo
SELECT 
    cs.id,
    cs.class_type_id,
    ct.name as class_type_name,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time
FROM public.class_sessions cs
LEFT JOIN public.class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_date >= CURRENT_DATE
ORDER BY cs.schedule_date, cs.schedule_time
LIMIT 10;

-- 6. Ver si hay reservas existentes
SELECT COUNT(*) as total_bookings FROM public.bookings;

-- 7. Ver estructura de reservas existentes (si las hay)
SELECT 
    b.id,
    b.user_id,
    b.class_session_id,
    b.booking_date_time,
    b.status,
    b.cancellation_time,
    b.is_from_package,
    b.payment_id
FROM public.bookings b
LIMIT 5;

-- 8. Verificar si existen las funciones que necesitamos
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('user_class', 'cancel_class', 'can_cancel_booking', 'get_class_sessions')
ORDER BY routine_name;
