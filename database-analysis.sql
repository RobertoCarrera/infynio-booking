-- 🔍 SCRIPT DE ANÁLISIS COMPLETO DE BASE DE DATOS
-- Este script extrae toda la información de estructura y datos

-- =============================================
-- 1. INFORMACIÓN DE TODAS LAS TABLAS
-- =============================================
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- =============================================
-- 2. ESTRUCTURA DETALLADA DE CADA TABLA
-- =============================================

-- TABLA: users
SELECT 
    'users' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- TABLA: class_types
SELECT 
    'class_types' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'class_types'
ORDER BY ordinal_position;

-- TABLA: packages
SELECT 
    'packages' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'packages'
ORDER BY ordinal_position;

-- TABLA: user_packages
SELECT 
    'user_packages' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'user_packages'
ORDER BY ordinal_position;

-- TABLA: class_sessions
SELECT 
    'class_sessions' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'class_sessions'
ORDER BY ordinal_position;

-- TABLA: bookings
SELECT 
    'bookings' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'bookings'
ORDER BY ordinal_position;

-- TABLA: waiting_list
SELECT 
    'waiting_list' as tabla,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'waiting_list'
ORDER BY ordinal_position;

-- =============================================
-- 3. CONSTRAINTS Y RESTRICCIONES
-- =============================================

-- Check constraints
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- Foreign keys
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Unique constraints
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name;

-- =============================================
-- 4. DATOS EXISTENTES EN TABLAS PRINCIPALES
-- =============================================

-- Datos en class_types
SELECT 'CLASS_TYPES' as seccion, * FROM class_types ORDER BY id;

-- Datos en packages
SELECT 'PACKAGES' as seccion, * FROM packages ORDER BY id;

-- Datos en users (solo algunos campos por privacidad)
SELECT 
    'USERS' as seccion,
    id,
    name,
    surname,
    email,
    role_id,
    created_at
FROM users 
WHERE id IN (23, 58) OR id <= 5
ORDER BY id;

-- Datos en user_packages para usuarios 23 y 58
SELECT 
    'USER_PACKAGES' as seccion,
    up.*,
    p.name as package_name
FROM user_packages up
LEFT JOIN packages p ON up.package_id = p.id
WHERE up.user_id IN (23, 58)
ORDER BY up.user_id, up.id;

-- Datos en class_sessions (próximas fechas)
SELECT 
    'CLASS_SESSIONS' as seccion,
    cs.*,
    ct.name as class_type_name
FROM class_sessions cs
LEFT JOIN class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_date >= CURRENT_DATE
ORDER BY cs.schedule_date, cs.schedule_time
LIMIT 20;

-- Datos en bookings para usuarios 23 y 58
SELECT 
    'BOOKINGS' as seccion,
    b.*,
    cs.schedule_date,
    cs.schedule_time,
    ct.name as class_type_name
FROM bookings b
LEFT JOIN class_sessions cs ON b.class_session_id = cs.id
LEFT JOIN class_types ct ON cs.class_type_id = ct.id
WHERE b.user_id IN (23, 58)
ORDER BY b.user_id, cs.schedule_date;

-- Datos en waiting_list para usuarios 23 y 58
SELECT 
    'WAITING_LIST' as seccion,
    wl.*,
    cs.schedule_date,
    cs.schedule_time,
    ct.name as class_type_name
FROM waiting_list wl
LEFT JOIN class_sessions cs ON wl.class_session_id = cs.id
LEFT JOIN class_types ct ON cs.class_type_id = ct.id
WHERE wl.user_id IN (23, 58)
ORDER BY wl.user_id, cs.schedule_date;

-- =============================================
-- 5. INFORMACIÓN ADICIONAL ÚTIL
-- =============================================

-- Índices existentes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Secuencias (para IDs auto-incrementales)
SELECT 
    sequence_name,
    data_type,
    numeric_precision,
    increment,
    minimum_value,
    maximum_value,
    start_value,
    cycle_option
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- Funciones y triggers personalizados
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_type IN ('FUNCTION', 'PROCEDURE')
ORDER BY routine_name;

-- =============================================
-- 6. VERIFICACIONES FINALES
-- =============================================

-- Contar registros en cada tabla
SELECT 'users' as tabla, COUNT(*) as total FROM users
UNION ALL
SELECT 'class_types' as tabla, COUNT(*) as total FROM class_types
UNION ALL
SELECT 'packages' as tabla, COUNT(*) as total FROM packages
UNION ALL
SELECT 'user_packages' as tabla, COUNT(*) as total FROM user_packages
UNION ALL
SELECT 'class_sessions' as tabla, COUNT(*) as total FROM class_sessions
UNION ALL
SELECT 'bookings' as tabla, COUNT(*) as total FROM bookings
UNION ALL
SELECT 'waiting_list' as tabla, COUNT(*) as total FROM waiting_list
ORDER BY tabla;

-- Estado de las tablas
SELECT 
    schemaname,
    tablename,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT '🎯 ANÁLISIS COMPLETO TERMINADO! 🎯' as mensaje;
