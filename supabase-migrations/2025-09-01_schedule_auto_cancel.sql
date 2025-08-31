-- Schedule the auto_cancel_small_sessions() function to run periodically.
-- This uses the pg_cron extension if available. Interval: every 15 minutes.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- create job if not exists
    PERFORM cron.schedule('auto_cancel_small_sessions_every_15m', '*/15 * * * *', 'SELECT public.auto_cancel_small_sessions();');
  ELSE
    RAISE NOTICE 'pg_cron not installed; please schedule auto_cancel_small_sessions externally (every 15 minutes recommended)';
  END IF;
END$$;

COMMIT;
