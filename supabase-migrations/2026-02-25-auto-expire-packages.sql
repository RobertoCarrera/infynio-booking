-- Migration: Auto-expire user packages
-- 1) Create a function to mark expired packages as 'inactive'
-- 2) Schedule a daily cron job to run this function

BEGIN;

-- 1. Create the function
CREATE OR REPLACE FUNCTION public.mark_expired_packages_inactive()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Update packages that are 'active' but their expiry date is in the past (yesterday or earlier)
  WITH rows_updated AS (
    UPDATE public.user_packages
    SET status = 'inactive',
        updated_at = now()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_DATE
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM rows_updated;

  IF v_count > 0 THEN
    RAISE NOTICE 'Marked % packages as inactive due to expiration.', v_count;
  END IF;
END;
$$;

-- 2. Schedule the cron job (if pg_cron is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule to run every day at 03:00 AM UTC
    -- Check if job already exists to avoid duplicates (optional, cron.schedule handles updates by job name if supported, else we just schedule)
    -- We use a unique job name 'daily_package_expiry_check'
    PERFORM cron.schedule('daily_package_expiry_check', '0 3 * * *', 'SELECT public.mark_expired_packages_inactive();');
    
    RAISE NOTICE 'Scheduled daily_package_expiry_check cron job.';
  ELSE
    RAISE NOTICE 'pg_cron extension not found. Please set up an external scheduler or trigger to call mark_expired_packages_inactive().';
  END IF;
END$$;

COMMIT;
