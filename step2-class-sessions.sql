-- 2. ESTRUCTURA DE class_sessions
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'class_sessions'
ORDER BY ordinal_position;
