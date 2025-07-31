-- Consulta para obtener todos los packages existentes
SELECT 
    id,
    name,
    class_type,
    class_count,
    price,
    is_single_class,
    is_personal,
    created_at,
    updated_at
FROM packages 
ORDER BY class_type, class_count, is_personal;
