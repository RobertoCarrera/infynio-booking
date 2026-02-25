-- Migration to drop the restrictive unique constraint on class_schedules
-- The constraint `class_schedules_class_type_id_day_of_week_start_time_key` prevents
-- us from creating a NEW version of a recurring schedule while keeping the OLD one (inactive or expired)
-- in the database. Since we use `valid_from`, `valid_until` and `is_active` to manage versions,
-- this unique constraint on just (type, day, time) is too strict.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'class_schedules_class_type_id_day_of_week_start_time_key'
    ) THEN
        ALTER TABLE public.class_schedules
        DROP CONSTRAINT class_schedules_class_type_id_day_of_week_start_time_key;
    END IF;

    -- Also check for explicitly named unique indexes just in case
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'class_schedules_class_type_id_day_of_week_start_time_key'
    ) THEN
        DROP INDEX public.class_schedules_class_type_id_day_of_week_start_time_key;
    END IF;
END$$;

COMMIT;
