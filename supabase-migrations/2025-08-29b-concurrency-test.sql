-- Concurrency test for create_session_with_personal_booking
--
-- This file provides two ways to test concurrent claims against the RPC:
-- A) Automated (requires the pg_background extension installed on the server)
-- B) Manual (run N client shells in parallel using psql)
--
-- Run instructions:
-- 1) Automated (pg_background) - only if the extension exists and you have permission.
--    - To try:
--      CREATE EXTENSION IF NOT EXISTS pg_background;
--    - Then run the block below. It will launch N background workers that call the RPC and collect results.
--
-- 2) Manual - recommended when you can't install extensions (Supabase often forbids pg_background).
--    - Open N separate terminals and run the sample psql command in each (replace the connection string as needed):
--
--    psql "postgresql://<USER>:<PASS>@<HOST>:<PORT>/<DB>" -c "SELECT * FROM public.create_session_with_personal_booking(4, '2025-08-27', '11:00:00', 1, 165);"
--
--    Run the command simultaneously in N shells and observe results (each will print returned JSON row).
--
-- Automated block (attempts to use pg_background)
DO $$
DECLARE
  job_pids INTEGER[] := ARRAY[]::INTEGER[];
  res TEXT;
  i INTEGER;
  job_count INTEGER := 5; -- number of concurrent workers to launch
  bg_available BOOLEAN := FALSE;
BEGIN
  -- Detect pg_background availability
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pg_background'
  ) INTO bg_available;

  IF NOT bg_available THEN
    RAISE NOTICE 'pg_background is not installed on this DB. Use manual psql parallel shells described in this file.';
    RETURN;
  END IF;

  RAISE NOTICE 'Launching % background workers calling the RPC...', job_count;

  FOR i IN 1..job_count LOOP
    -- Launch a background job that calls the RPC. We add a small random sleep to spread attempts.
    job_pids := job_pids || pg_background_launch(format($q$
      SELECT to_json(t) FROM (
        SELECT * FROM public.create_session_with_personal_booking(4, '2025-08-27', '11:00:00', 1, 165)
      ) t;
    $q$));
  END LOOP;

  -- Wait a bit for jobs to finish
  PERFORM pg_sleep(1);

  -- Gather results
  FOREACH i IN ARRAY job_pids LOOP
    BEGIN
      res := pg_background_result(i);
      RAISE NOTICE 'Job % result: %', i, res;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Job % failed to return result: %', i, SQLERRM;
    END;
  END LOOP;
END$$;

-- End of concurrency test
-- Notes:
-- - If pg_background is not available, use the manual psql method to run multiple shells in parallel.
-- - After test, check the affected user_packages and bookings to confirm correct atomic behavior, e.g.:
--   SELECT * FROM user_packages WHERE user_id = 165 ORDER BY purchase_date DESC;
--   SELECT * FROM bookings WHERE user_id = 165 ORDER BY booking_date_time DESC LIMIT 20;
-- - Clean up any test sessions/bookings if needed.
