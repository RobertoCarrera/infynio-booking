-- Rollback migration for multi class-type package mapping and new booking functions
-- Date: 2025-08-13
-- Purpose: Safely revert changes introduced by 2025-08-13-multi-class-package-mapping.sql
-- Strategy:
--  - Drop new functions and restore *_old originals back to their original names if present.
--  - Remove bookings.user_package_id column.
--  - Drop package_allowed_class_types table and related indexes.
--  - Note: Data lost in user_package_id cannot be fully reconstructed; refund logic will fallback as before.

begin;

-- 1) Restore functions from *_old if they exist
DO $$
BEGIN
  -- create_booking_with_validations
  IF to_regprocedure('public.create_booking_with_validations(integer, integer, timestamptz)') IS NOT NULL THEN
    EXECUTE 'drop function public.create_booking_with_validations(integer, integer, timestamptz)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_booking_with_validations_old') THEN
    EXECUTE 'alter function public.create_booking_with_validations_old(integer, integer, timestamptz) rename to create_booking_with_validations';
  END IF;

  -- cancel_booking_with_refund
  IF to_regprocedure('public.cancel_booking_with_refund(integer, integer)') IS NOT NULL THEN
    EXECUTE 'drop function public.cancel_booking_with_refund(integer, integer)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_booking_with_refund_old') THEN
    EXECUTE 'alter function public.cancel_booking_with_refund_old(integer, integer) rename to cancel_booking_with_refund';
  END IF;

  -- cancel_class
  IF to_regprocedure('public.cancel_class(integer, character varying)') IS NOT NULL THEN
    EXECUTE 'drop function public.cancel_class(integer, character varying)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_class_old') THEN
    EXECUTE 'alter function public.cancel_class_old(integer, character varying) rename to cancel_class';
  END IF;
END
$$;

-- 2) Drop indexes and column from bookings
DROP INDEX IF EXISTS idx_pact_package;
DROP INDEX IF EXISTS idx_pact_class_type;
DROP INDEX IF EXISTS idx_bookings_user_package;
ALTER TABLE IF EXISTS bookings
  DROP COLUMN IF EXISTS user_package_id;

-- 3) Drop mapping table
DROP TABLE IF EXISTS package_allowed_class_types;

commit;
