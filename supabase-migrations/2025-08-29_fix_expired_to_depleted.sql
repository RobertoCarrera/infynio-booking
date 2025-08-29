-- Migration: Fix user_packages incorrectly marked as 'expired' when they reached 0 classes
-- Convert those rows to 'depleted' if their expires_at is still in the future (or not set).
-- Run this in staging first.

BEGIN;

-- Safety: only touch rows that are currently 'expired', have 0 remaining classes
-- and whose expires_at is either NULL or strictly in the future.
UPDATE public.user_packages
SET status = 'depleted', updated_at = now()
WHERE status = 'expired'
  AND coalesce(current_classes_remaining, 0) = 0
  AND (expires_at IS NULL OR expires_at > CURRENT_DATE);

COMMIT;

-- Notes:
-- * This makes depleted the canonical status for packages that ran out of classes
--   but are not yet past their expiration date.
-- * Packages that truly expired by date (expires_at <= CURRENT_DATE) should remain 'expired'.