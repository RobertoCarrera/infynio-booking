-- Create audit table for package claims
BEGIN;

CREATE TABLE IF NOT EXISTS package_claim_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_package_id INTEGER,
  class_type_id INTEGER,
  session_id INTEGER,
  booking_id INTEGER,
  outcome TEXT,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Optional FK constraints
-- Add FK only if it doesn't exist to make migration idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'package_claim_logs' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_package_id'
  ) THEN
    ALTER TABLE package_claim_logs
      ADD CONSTRAINT fk_pcl_user_packages FOREIGN KEY (user_package_id) REFERENCES user_packages(id) ON DELETE SET NULL;
  END IF;
END$$;

COMMIT;

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
