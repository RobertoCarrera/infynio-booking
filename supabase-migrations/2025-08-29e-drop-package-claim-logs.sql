-- Migration: Drop package_claim_logs and remove related FK/constraints
-- WARNING: This permanently removes audit records. Ensure you have backed up the table before running.
-- Recommended backup command (run on DB server or via psql):
-- COPY (SELECT * FROM public.package_claim_logs) TO '/var/tmp/package_claim_logs_backup.csv' CSV HEADER;

BEGIN;

-- Remove FK constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'package_claim_logs' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_package_id'
  ) THEN
    ALTER TABLE package_claim_logs DROP CONSTRAINT IF EXISTS fk_pcl_user_packages;
  END IF;
END$$;

-- Optionally create an archive table before dropping (uncomment to use)
-- CREATE TABLE package_claim_logs_archive AS TABLE package_claim_logs WITH NO DATA;
-- INSERT INTO package_claim_logs_archive SELECT * FROM package_claim_logs;

-- Finally drop the table
DROP TABLE IF EXISTS public.package_claim_logs;

COMMIT;

-- Note: Functions that previously inserted into package_claim_logs were updated in previous migrations
-- to remove those inserts. If you maintain any custom SQL that still writes to this table,
-- remove or adapt it before running this migration.
