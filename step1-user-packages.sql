-- 1. ESTRUCTURA DE user_packages
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'user_packages'
ORDER BY ordinal_position;
