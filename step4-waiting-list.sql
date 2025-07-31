-- 4. ESTRUCTURA DE waiting_list
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'waiting_list'
ORDER BY ordinal_position;
