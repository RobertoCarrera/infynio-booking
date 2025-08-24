-- Revert / remove accidental overload of get_sessions_for_calendar
-- Date: 2025-08-24
-- Purpose: Drop the problematic overload with signature (date, date, integer)
-- IMPORTANT: run in Supabase SQL editor or via your migration tooling after review.

-- 0) Optional: save existing function DDL to a table for backup
-- (run first if you want a recoverable backup inside the DB)
-- Ensure backup schema exists so the INSERT below won't fail
CREATE SCHEMA IF NOT EXISTS schema_backups;

CREATE TABLE IF NOT EXISTS schema_backups.function_ddl_backup (
  created_at timestamptz not null default now(),
  obj_oid oid,
  name text,
  identity_args text,
  ddl text
);

INSERT INTO schema_backups.function_ddl_backup(obj_oid, name, identity_args, ddl)
SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'get_sessions_for_calendar'
  AND n.nspname = 'public'
  AND pg_get_function_identity_arguments(p.oid) = 'p_start_date date, p_end_date date, p_user_id integer';

-- 1) Drop the exact overload that caused PGRST203 ambiguity
-- This drops: get_sessions_for_calendar(date, date, integer)
DROP FUNCTION IF EXISTS public.get_sessions_for_calendar(date, date, integer);

-- 2) Verify remaining overloads (run after applying)
-- SELECT oid, proname, pg_get_function_identity_arguments(oid) AS signature FROM pg_proc WHERE proname = 'get_sessions_for_calendar' ORDER BY signature;

-- 3) Optional: If you also added schema changes (columns) for personal sessions and want to revert them,
-- check for column presence first; do NOT DROP automatically here.
-- Example check (run in SQL editor):
-- SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='class_sessions' AND column_name='personal_user_id';

-- If you confirm the column exists and you want to drop it, run (after backup):
-- ALTER TABLE public.class_sessions DROP COLUMN IF EXISTS personal_user_id;

-- 4) Test the RPC from SQL after this script runs:
-- SELECT * FROM public.get_sessions_for_calendar('2025-08-18'::date, '2025-08-24'::date, 1);

-- 5) If the app still errors, ensure the frontend RPC call uses named parameters matching the remaining overload,
-- or use positional order that matches the remaining signature. Example Supabase JS:
-- await supabase.rpc('get_sessions_for_calendar', { p_user_id: 1, p_start_date: '2025-08-18', p_end_date: '2025-08-24' });

-- Notes:
-- - The INSERT above writes a copy of the function DDL to a small backup table inside the DB (schema_backups.function_ddl_backup).
--   If the schema 'schema_backups' does not exist, the INSERT will fail; you can create it first:
--     CREATE SCHEMA IF NOT EXISTS schema_backups;
-- - If you prefer to just DROP the function without an in-DB backup, remove the INSERT block and run the DROP.

-- End of migration file
