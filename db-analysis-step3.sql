-- =============================================
-- 3. CHECK CONSTRAINTS (AQUÍ ESTÁ EL PROBLEMA!)
-- =============================================
-- Ejecuta esta consulta para ver qué valores acepta class_type:

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
    AND tc.table_name = 'packages'
ORDER BY tc.table_name, tc.constraint_name;
