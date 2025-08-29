-- Migration: Remove monthly_classes_limit and rollover_classes_remaining
-- 1) Backup user_packages
-- 2) Update PL/pgSQL functions that referenced the removed columns
-- 3) Drop columns from user_packages

BEGIN;

-- 1) Backup user_packages (full row copy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_packages_backup_before_rollover_drop') THEN
    CREATE TABLE public.user_packages_backup_before_rollover_drop AS
    SELECT *, now() as backup_at FROM public.user_packages;
  END IF;
END$$;

-- Ensure we have an expires_at column and migrate next_rollover_reset_date into it
ALTER TABLE public.user_packages
  ADD COLUMN IF NOT EXISTS expires_at date;

-- Populate expires_at from next_rollover_reset_date where appropriate (do not overwrite existing expires_at)
UPDATE public.user_packages
SET expires_at = next_rollover_reset_date
WHERE expires_at IS NULL
  AND next_rollover_reset_date IS NOT NULL;

-- 2) Update/replace functions that reference monthly_classes_limit or rollover_classes_remaining
-- Replace process_monthly_rollover: remove rollover accumulation logic
CREATE OR REPLACE FUNCTION process_monthly_rollover()
RETURNS VOID AS $$
BEGIN
  -- Reset classes_used_this_month monthly for non-single-class packages
  UPDATE user_packages
  SET classes_used_this_month = 0
  WHERE status = 'active'
    AND package_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND NOT is_single_class);

  -- Expire single-class packages whose expires_at is in the past
  UPDATE user_packages
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= CURRENT_DATE
    AND package_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND is_single_class);
END;
$$ LANGUAGE plpgsql;

-- Replace user_class function to use only current_classes_remaining
CREATE OR REPLACE FUNCTION user_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    -- Buscar un paquete activo del tipo especificado con clases disponibles
    SELECT up.id
    INTO v_package_id
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id
      AND (p.class_type = p_class_type OR up.package_id IS NULL)
      AND up.status = 'active'
      AND up.current_classes_remaining > 0
    ORDER BY up.created_at DESC
    LIMIT 1;

    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay clases disponibles
    END IF;

    -- Decrementar el contador de clases disponibles y aumentar usado del mes
    UPDATE user_packages
    SET classes_used_this_month = classes_used_this_month + 1,
        current_classes_remaining = current_classes_remaining - 1
    WHERE id = v_package_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Replace cancel_class to not reference rollover
CREATE OR REPLACE FUNCTION cancel_class(p_user_id INTEGER, p_class_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    SELECT up.id
    INTO v_package_id
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id
      AND (p.class_type = p_class_type OR up.package_id IS NULL)
      AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1;

    IF v_package_id IS NULL THEN
        RETURN FALSE;
    END IF;

  UPDATE user_packages 
  SET classes_used_this_month = GREATEST(0, classes_used_this_month - 1),
    current_classes_remaining = current_classes_remaining + 1
  WHERE id = v_package_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 3) Drop columns from user_packages (if exist)
ALTER TABLE public.user_packages
  DROP COLUMN IF EXISTS monthly_classes_limit,
  DROP COLUMN IF EXISTS rollover_classes_remaining;

-- Also drop the old rollover date column now that values were migrated to expires_at
ALTER TABLE public.user_packages
  DROP COLUMN IF EXISTS next_rollover_reset_date;

COMMIT;

-- Notes:
-- * This migration preserves a full backup table `user_packages_backup_before_rollover_drop`.
-- * If you need to preserve rollover counts into another structure, migrate data from the backup table before dropping it.
