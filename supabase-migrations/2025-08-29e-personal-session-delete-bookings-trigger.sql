-- Ensure personal-session deletions remove their bookings to avoid FK errors
-- This is conditional: only sessions with personal_user_id set will auto-delete bookings.
BEGIN;

-- Trigger function: delete bookings for personal sessions before the session is deleted
CREATE OR REPLACE FUNCTION public.tr_delete_personal_session_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove any bookings that reference the session being deleted
  DELETE FROM bookings WHERE class_session_id = OLD.id;
  RETURN OLD;
END;
$$;

-- Create the trigger only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_delete_personal_session_bookings'
  ) THEN
    CREATE TRIGGER tr_delete_personal_session_bookings
      BEFORE DELETE ON public.class_sessions
      FOR EACH ROW
      WHEN (OLD.personal_user_id IS NOT NULL)
      EXECUTE FUNCTION public.tr_delete_personal_session_bookings();
  END IF;
END$$;

COMMIT;

-- Grant execute if you want RPCs to call it (not strictly necessary for triggers)
-- GRANT EXECUTE ON FUNCTION public.tr_delete_personal_session_bookings() TO authenticated;
