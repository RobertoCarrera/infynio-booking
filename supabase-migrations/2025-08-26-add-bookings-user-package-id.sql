-- Add nullable user_package_id to bookings so we can track which user_package a booking consumed.
-- Idempotent migration.

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS user_package_id integer;

-- Add FK if the column exists and FK not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'bookings_user_package_fk'
      AND t.relname = 'bookings'
  ) THEN
    ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_user_package_fk FOREIGN KEY (user_package_id) REFERENCES public.user_packages(id) ON DELETE SET NULL;
  END IF;
END$$;
