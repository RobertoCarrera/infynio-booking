-- ================================================================
-- SCRIPT PARA LIMPIAR USUARIOS HUÉRFANOS
-- Elimina usuarios que no tienen auth_user_id (no están en auth.users)
-- junto con todos sus user_packages relacionados
-- ================================================================

-- PASO 1: Ver cuántos usuarios huérfanos hay
SELECT 
    COUNT(*) as total_orphaned_users,
    'Usuarios sin auth_user_id (huérfanos)' as description
FROM users 
WHERE auth_user_id IS NULL;

-- PASO 2: Ver el detalle de usuarios huérfanos
SELECT 
    id,
    email,
    name,
    surname,
    role_id,
    'HUÉRFANO - Sin auth_user_id' as status
FROM users 
WHERE auth_user_id IS NULL
ORDER BY id DESC;

-- PASO 3: Ver cuántos user_packages están asociados a usuarios huérfanos
SELECT 
    COUNT(*) as total_orphaned_packages,
    'Paquetes de usuarios huérfanos' as description
FROM user_packages up
JOIN users u ON up.user_id = u.id
WHERE u.auth_user_id IS NULL;

-- PASO 3.1: Ver cuántos bookings están asociados a usuarios huérfanos
SELECT 
    COUNT(*) as total_orphaned_bookings,
    'Bookings de usuarios huérfanos' as description
FROM bookings b
JOIN users u ON b.user_id = u.id
WHERE u.auth_user_id IS NULL;

-- PASO 4: ELIMINAR TODOS LOS BOOKINGS DE USUARIOS HUÉRFANOS PRIMERO
-- Esto elimina las reservas para evitar errores de FK
DELETE FROM bookings 
WHERE user_id IN (
    SELECT id 
    FROM users 
    WHERE auth_user_id IS NULL
);

-- PASO 5: ELIMINAR TODOS LOS USER_PACKAGES DE USUARIOS HUÉRFANOS
-- Esto elimina los paquetes para evitar errores de FK
DELETE FROM user_packages 
WHERE user_id IN (
    SELECT id 
    FROM users 
    WHERE auth_user_id IS NULL
);

-- PASO 6: ELIMINAR TODOS LOS USUARIOS HUÉRFANOS
-- Ahora elimina los usuarios sin dependencias
DELETE FROM users 
WHERE auth_user_id IS NULL;

-- PASO 7: Verificar que la limpieza fue exitosa
SELECT 
    COUNT(*) as remaining_orphaned_users,
    'Usuarios huérfanos restantes (debería ser 0)' as description
FROM users 
WHERE auth_user_id IS NULL;

-- PASO 8: Mostrar estadísticas finales
SELECT 
    COUNT(*) as total_users,
    'Total de usuarios después de limpieza' as description
FROM users;

SELECT 
    COUNT(*) as users_with_auth,
    'Usuarios con auth_user_id (válidos)' as description
FROM users 
WHERE auth_user_id IS NOT NULL;

SELECT 
    COUNT(*) as remaining_bookings,
    'Bookings restantes' as description
FROM bookings;

SELECT 
    COUNT(*) as remaining_packages,
    'User packages restantes' as description
FROM user_packages;

-- ================================================================
-- INFORMACIÓN ADICIONAL
-- ================================================================

-- Para ver usuarios válidos restantes:
-- SELECT * FROM users WHERE auth_user_id IS NOT NULL ORDER BY id DESC;

-- Para ver todos los user_packages restantes:
-- SELECT COUNT(*) as total_packages FROM user_packages;

-- Para restaurar un usuario específico si es necesario:
-- INSERT INTO users (email, name, role_id, auth_user_id) 
-- VALUES ('email@example.com', 'Name', 2, 'nuevo-uuid-generado');
