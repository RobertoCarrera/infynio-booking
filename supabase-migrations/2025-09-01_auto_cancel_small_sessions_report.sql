-- Migration: auto_cancel_small_sessions_report
-- Purpose: cancel group class sessions that start within ~2 hours and have (confirmed) bookings,
--          call existing admin cancel RPC for each booking and return a JSON report of cancelled items.
-- Assumptions:
--  - There exists a PL/pgSQL function `public.admin_cancel_booking_force(booking_id)` which performs
--    the cancel + refund logic for a single booking. Adjust the call below if the RPC has a different name or signature.
--  - Table/column names used below exist: class_sessions(schedule_date, schedule_time, personal_user_id, class_type_id),
--    bookings(id, class_session_id, user_id, status), users(id,email,name), class_types(id,name).
--  - bookings.status uses 'confirmed' to mark active reservations and admin_cancel_booking_force will set 'cancelled'.

CREATE OR REPLACE FUNCTION public.auto_cancel_small_sessions_report()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  rec_session RECORD;
  rec_booking RECORD;
  cancelled_items jsonb := '[]'::jsonb;
  v_starts_at timestamptz;
BEGIN
  -- Iterate sessions that start within the next ~2 hours, only group sessions (no personal_user_id)
  FOR rec_session IN
  SELECT cs.id AS class_session_id,
       (cs.schedule_date + cs.schedule_time::interval) AT TIME ZONE 'Europe/Madrid' AS starts_at,
       cs.class_type_id
    FROM class_sessions cs
    WHERE cs.personal_user_id IS NULL
      -- Only consider sessions that currently have exactly one confirmed booking
      AND (
        SELECT COUNT(*)
        FROM bookings b
        WHERE b.class_session_id = cs.id
          AND UPPER(b.status) = 'CONFIRMED'
      ) = 1
      -- Interpret the stored date+time as Europe/Madrid local time, convert to timestamptz and compare to now()
      AND ((cs.schedule_date + cs.schedule_time::interval) AT TIME ZONE 'Europe/Madrid') BETWEEN now() AND now() + interval '2 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_starts_at := rec_session.starts_at;

    -- Find confirmed bookings for this session
    FOR rec_booking IN
      SELECT bk.id AS booking_id,
             bk.user_id,
             u.email,
             COALESCE(u.name, '') AS name,
             ct.name AS session_title
      FROM bookings bk
      JOIN users u ON u.id = bk.user_id
      LEFT JOIN class_types ct ON ct.id = rec_session.class_type_id
      WHERE bk.class_session_id = rec_session.class_session_id
        -- status may be stored in uppercase (e.g. 'CONFIRMED'), so compare case-insensitively
        AND UPPER(bk.status) = 'CONFIRMED'
  -- lock booking rows to avoid races with concurrent writers/cancellers
  FOR UPDATE OF bk
    LOOP
      -- Cancel via existing admin RPC. Continue on error but record a notice.
      BEGIN
        PERFORM public.admin_cancel_booking_force(rec_booking.booking_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'admin_cancel_booking_force failed for booking %: %', rec_booking.booking_id, SQLERRM;
        CONTINUE;
      END;

      -- Append cancelled item info for notifications
      cancelled_items := cancelled_items || jsonb_build_array(
        jsonb_build_object(
          'booking_id', rec_booking.booking_id,
          'user_id', rec_booking.user_id,
          'email', rec_booking.email,
          'name', rec_booking.name,
          'session_title', rec_booking.session_title,
          'starts_at', v_starts_at
        )
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('cancelled', cancelled_items);
END;
$$;


-- Notes:
-- - Run this migration in a staging environment first. The function will call your admin cancel RPC and therefore
--   perform destructive changes (bookings will be cancelled and packages refunded according to that RPC).
-- - If `admin_cancel_booking_force` has a different name or requires additional params, update the PERFORM call accordingly.
-- - This function returns JSON with a top-level key `cancelled` containing an array of objects; the Lambda expects this shape.
