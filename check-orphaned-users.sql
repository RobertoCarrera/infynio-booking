-- ================================================================
-- SCRIPT SIMPLE PARA VER USUARIOS HUÉRFANOS (SOLO CONSULTAS)
-- Ejecuta esto primero para ver qué hay antes de eliminar
-- ================================================================

-- Ver cuántos usuarios huérfanos hay
SELECT 
    COUNT(*) as total_orphaned_users,
    'Usuarios sin auth_user_id (huérfanos)' as description
FROM users 
WHERE auth_user_id IS NULL;

-- Ver el detalle de usuarios huérfanos
SELECT 
    id,
    email,
    name,
    surname,
    role_id,
    auth_user_id,
    'HUÉRFANO' as status
FROM users 
WHERE auth_user_id IS NULL
ORDER BY id;

-- Ver cuántos user_packages están asociados a usuarios huérfanos
SELECT 
    COUNT(*) as total_orphaned_packages,
    'Paquetes de usuarios huérfanos que se eliminarán' as description
FROM user_packages up
WHERE up.user_id IN (
    SELECT id FROM users WHERE auth_user_id IS NULL
);

-- Ver cuántos bookings están asociados a usuarios huérfanos
SELECT 
    COUNT(*) as total_orphaned_bookings,
    'Bookings de usuarios huérfanos que se eliminarán' as description
FROM bookings b
WHERE b.user_id IN (
    SELECT id FROM users WHERE auth_user_id IS NULL
);

-- Ver detalle de los paquetes que se eliminarán
SELECT 
    up.id as package_id,
    up.user_id,
    u.email as user_email,
    up.package_id as package_type,
    up.status,
    'SE ELIMINARÁ' as action
FROM user_packages up
JOIN users u ON up.user_id = u.id
WHERE u.auth_user_id IS NULL
ORDER BY up.user_id;

-- Ver detalle de los bookings que se eliminarán
SELECT 
    b.id as booking_id,
    b.user_id,
    u.email as user_email,
    b.class_session_id,
    b.status,
    'SE ELIMINARÁ' as action
FROM bookings b
JOIN users u ON b.user_id = u.id
WHERE u.auth_user_id IS NULL
ORDER BY b.user_id;

-- Estadísticas generales
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN auth_user_id IS NOT NULL THEN 1 END) as users_with_auth,
    COUNT(CASE WHEN auth_user_id IS NULL THEN 1 END) as orphaned_users,
    'ESTADÍSTICAS ACTUALES' as description
FROM users;
