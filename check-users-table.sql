-- =============================================
-- VERIFICAR ESTRUCTURA EXACTA DE LA TABLA USERS
-- =============================================
-- Ejecuta esta consulta para ver todas las columnas de la tabla users:

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- También verificar algunos usuarios existentes para ver los datos reales:
SELECT * FROM users WHERE id IN (23, 58) LIMIT 2;
