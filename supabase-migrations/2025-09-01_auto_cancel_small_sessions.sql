-- Auto-cancel small non-personal sessions and refund their package
-- Cancels any class_session whose class_type_id NOT IN (4,22,23), that starts within 2 hours
-- and currently has exactly 1 confirmed booking. Uses existing cancelation/refund routines.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_cancel_small_sessions()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_now timestamp := now();
  v_cutoff timestamp := v_now + interval '2 hours';
  r record;
  v_cancel_result json;
BEGIN
  -- Iterate over sessions that meet criteria
  FOR r IN
    SELECT cs.id AS session_id, cs.schedule_date, cs.schedule_time
    FROM class_sessions cs
    WHERE cs.class_type_id NOT IN (4,22,23)
      AND (cs.schedule_date + cs.schedule_time::interval) <= v_cutoff
      AND (cs.schedule_date + cs.schedule_time::interval) > v_now
      AND (
        SELECT COUNT(*) FROM bookings b WHERE b.class_session_id = cs.id AND upper(b.status) = 'CONFIRMED'
      ) = 1
  LOOP
    -- Find the single confirmed booking for the session
    SELECT id INTO r
    FROM bookings
    WHERE class_session_id = r.session_id AND upper(status) = 'CONFIRMED'
    LIMIT 1;

    IF FOUND THEN
      -- Use existing admin_cancel_booking_force which refunds to the associated package
      BEGIN
        PERFORM * FROM public.admin_cancel_booking_force(r.id);
      EXCEPTION WHEN OTHERS THEN
        -- swallow and continue; accumulate errors in log table if desired
        RAISE NOTICE 'Failed to auto-cancel booking %: %', r.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Auto-cancel completed');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

COMMIT;
