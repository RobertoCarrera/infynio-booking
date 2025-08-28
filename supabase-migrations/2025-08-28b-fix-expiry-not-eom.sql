-- Fix: stop forcing end-of-month expiry and use expires_at for single-class packages
-- 1) Drop any CHECK constraint that enforces next_rollover_reset_date to be end-of-month
-- 2) Update process_monthly_rollover to expire singles by expires_at

BEGIN;

-- 1) Drop EOM check constraints on user_packages.next_rollover_reset_date
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_packages'
      AND c.contype = 'c'
  LOOP
    IF position('next_rollover_reset_date' IN r.def) > 0
       AND (position('1 mon -1 days' IN r.def) > 0 OR position('date_trunc' IN r.def) > 0)
    THEN
      EXECUTE format('ALTER TABLE public.user_packages DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
END $$;

-- 2) Update process_monthly_rollover: expire single-class packages by expires_at
CREATE OR REPLACE FUNCTION public.process_monthly_rollover()
RETURNS VOID AS $$
BEGIN
  -- Move unused monthly classes to rollover and reset counters; also set next month reset date
  UPDATE user_packages up
  SET 
    rollover_classes_remaining = rollover_classes_remaining + (monthly_classes_limit - classes_used_this_month),
    classes_used_this_month = 0,
    next_rollover_reset_date = (DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month'))::date
  WHERE 
    status = 'active' 
    AND (next_rollover_reset_date IS NULL OR next_rollover_reset_date <= CURRENT_DATE)
    AND package_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM packages p WHERE p.id = up.package_id AND NOT p.is_single_class
    );

  -- Expire single-class packages based on explicit expires_at
  UPDATE user_packages up
  SET status = 'expired'
  WHERE 
    status = 'active' 
    AND up.expires_at IS NOT NULL
    AND up.expires_at <= CURRENT_DATE
    AND package_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM packages p WHERE p.id = up.package_id AND p.is_single_class
    );
END;
$$ LANGUAGE plpgsql;

COMMIT;
