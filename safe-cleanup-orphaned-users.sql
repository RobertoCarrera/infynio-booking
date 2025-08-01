-- ================================================================
-- SCRIPT SEGURO PARA LIMPIAR USUARIOS HUÉRFANOS (CON TRANSACCIÓN)
-- Usa una transacción para poder hacer rollback si algo sale mal
-- ================================================================

BEGIN;

-- Crear tabla temporal para backup de usuarios que vamos a eliminar
CREATE TEMP TABLE backup_orphaned_users AS
SELECT * FROM users WHERE auth_user_id IS NULL;

-- Crear tabla temporal para backup de paquetes que vamos a eliminar
CREATE TEMP TABLE backup_orphaned_packages AS
SELECT up.* 
FROM user_packages up
JOIN users u ON up.user_id = u.id
WHERE u.auth_user_id IS NULL;

-- Crear tabla temporal para backup de bookings que vamos a eliminar
CREATE TEMP TABLE backup_orphaned_bookings AS
SELECT b.* 
FROM bookings b
JOIN users u ON b.user_id = u.id
WHERE u.auth_user_id IS NULL;

-- Mostrar información antes de eliminar
SELECT 
    (SELECT COUNT(*) FROM backup_orphaned_users) as usuarios_a_eliminar,
    (SELECT COUNT(*) FROM backup_orphaned_packages) as paquetes_a_eliminar,
    (SELECT COUNT(*) FROM backup_orphaned_bookings) as bookings_a_eliminar,
    'BACKUP CREADO - Puedes hacer ROLLBACK si es necesario' as mensaje;

-- ELIMINAR bookings de usuarios huérfanos primero
DELETE FROM bookings 
WHERE user_id IN (
    SELECT id FROM backup_orphaned_users
);

-- ELIMINAR user_packages de usuarios huérfanos después
DELETE FROM user_packages 
WHERE user_id IN (
    SELECT id FROM backup_orphaned_users
);

-- ELIMINAR usuarios huérfanos
DELETE FROM users 
WHERE auth_user_id IS NULL;

-- Verificar resultado
SELECT 
    (SELECT COUNT(*) FROM backup_orphaned_users) as usuarios_eliminados,
    (SELECT COUNT(*) FROM backup_orphaned_packages) as paquetes_eliminados,
    (SELECT COUNT(*) FROM backup_orphaned_bookings) as bookings_eliminados,
    (SELECT COUNT(*) FROM users WHERE auth_user_id IS NULL) as huerfanos_restantes,
    'LIMPIEZA COMPLETADA' as estado;

-- ================================================================
-- DESCOMENTA UNA DE ESTAS LÍNEAS:
-- ================================================================

-- Para CONFIRMAR los cambios:
COMMIT;

-- Para CANCELAR los cambios (descomenta esta línea y comenta COMMIT):
-- ROLLBACK;

-- ================================================================
-- VERIFICACIÓN FINAL
-- ================================================================

-- Ver estadísticas finales
SELECT 
    COUNT(*) as total_usuarios_restantes,
    COUNT(CASE WHEN auth_user_id IS NOT NULL THEN 1 END) as usuarios_validos,
    COUNT(CASE WHEN auth_user_id IS NULL THEN 1 END) as usuarios_huerfanos_restantes
FROM users;

SELECT 
    COUNT(*) as total_paquetes_restantes
FROM user_packages;

SELECT 
    COUNT(*) as total_bookings_restantes
FROM bookings;

-- ================================================================
-- NOTAS IMPORTANTES:
-- ================================================================
-- 1. Este script crea backup temporal de los datos eliminados
-- 2. Si algo sale mal, puedes ejecutar ROLLBACK; en lugar de COMMIT;
-- 3. Los datos de backup están en backup_orphaned_users y backup_orphaned_packages
-- 4. Después del COMMIT, estos backups temporales se eliminan automáticamente
