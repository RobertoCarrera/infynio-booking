-- Add explicit is_personal boolean to class_types and backfill from name heuristic
BEGIN;

ALTER TABLE IF EXISTS class_types
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;

-- Backfill using current heuristic (name contains personal/individual or personalizada)
UPDATE class_types
SET is_personal = TRUE
WHERE name ~* 'personal|individual|personalizada';

COMMIT;

-- Note: after running this migration, review rows and adjust manually if needed.
