-- =============================================
-- 6. VERIFICAR SI EXISTEN USUARIOS 23 Y 58
-- =============================================
-- Ejecuta esta consulta para ver si los usuarios existen:

SELECT 
    id,
    name,
    surname,
    email,
    role_id,
    created_at
FROM users 
WHERE id IN (23, 58)
ORDER BY id;
