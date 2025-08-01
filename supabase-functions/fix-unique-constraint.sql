-- Comando simple para crear índice único y prevenir duplicados
-- Ejecutar este comando primero en Supabase SQL Editor

-- Crear índice único para prevenir duplicados
CREATE UNIQUE INDEX IF NOT EXISTS unique_confirmed_user_session_booking 
ON bookings (user_id, class_session_id) 
WHERE status = 'CONFIRMED';

-- Verificar que se creó correctamente
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'bookings' 
AND indexname = 'unique_confirmed_user_session_booking';
