-- Create audit table for package claims
-- package_claim_logs table creation removed: logging table deprecated and dropped by later migration.
-- If you need to restore it, recreate with the original schema or use the archive backup.

-- Safe delete RPC: deletes booking(s) linked to a session and then the session in a transaction
-- Create or replace the safe_delete_session function (idempotent via CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.safe_delete_session(p_session_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INT;
BEGIN
  -- Only remove bookings that are already cancelled to avoid removing unrefunded bookings.
  DELETE FROM bookings WHERE class_session_id = p_session_id AND upper(status) = 'CANCELLED';

  -- Check if any bookings still reference the session
  SELECT COUNT(*) INTO v_remaining FROM bookings WHERE class_session_id = p_session_id;
  IF v_remaining > 0 THEN
    RAISE NOTICE 'safe_delete_session: % bookings still reference session %; aborting deletion', v_remaining, p_session_id;
    RETURN FALSE;
  END IF;

  -- Safe to delete the session now that no bookings reference it
  DELETE FROM class_sessions WHERE id = p_session_id;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- bubble up the error for easier debugging in SQL editor
  RAISE NOTICE 'safe_delete_session failed: %', SQLERRM;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_delete_session(INTEGER) TO authenticated;
