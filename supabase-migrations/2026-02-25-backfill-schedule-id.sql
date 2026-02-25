-- Migration to backfill schedule_id for existing class_sessions
-- This groups sessions into schedules based on their current time slots.
-- Sessions with the SAME (class_type_id, day_of_week, schedule_time) will be grouped into one schedule.
-- Outlier sessions (different times) will get their OWN schedule.
-- This is a safe baseline. To "merge" outliers back, the user must edit them to match the main schedule time,
-- or we would need a more complex "fuzzy" grouping.

BEGIN;

-- 1. Ensure schedule_id column exists (it should, but just in case)
ALTER TABLE public.class_sessions
ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES public.class_schedules(id);

-- 2. Create schedules for existing sessions that don't have one
-- We group by (class_type_id, day_of_week, schedule_time) to find unique recurring patterns.
-- We take the MIN(schedule_date) as the valid_from.
INSERT INTO public.class_schedules (
    class_type_id,
    day_of_week,
    start_time,
    end_time,
    max_capacity,
    valid_from,
    is_active
)
SELECT
    cs.class_type_id,
    EXTRACT(DOW FROM cs.schedule_date) as day_of_week,
    cs.schedule_time as start_time,
    -- Calculate end_time based on class duration
    (cs.schedule_time + (ct.duration_minutes || ' minutes')::INTERVAL)::TIME as end_time,
    MAX(cs.capacity) as max_capacity, -- Use current capacity
    MIN(cs.schedule_date) as valid_from,
    TRUE as is_active -- Mark as active for now
FROM public.class_sessions cs
JOIN public.class_types ct ON cs.class_type_id = ct.id
WHERE cs.schedule_id IS NULL
GROUP BY 
    cs.class_type_id, 
    EXTRACT(DOW FROM cs.schedule_date), 
    cs.schedule_time, 
    ct.duration_minutes
ON CONFLICT DO NOTHING; -- Avoid duplicates if running multiple times (though IDs will differ)

-- 3. Link sessions to the newly created schedules
-- We match on (class_type_id, day_of_week, start_time)
UPDATE public.class_sessions cs
SET schedule_id = s.id
FROM public.class_schedules s
WHERE cs.schedule_id IS NULL
  AND s.class_type_id = cs.class_type_id
  AND s.day_of_week = EXTRACT(DOW FROM cs.schedule_date)
  AND s.start_time = cs.schedule_time;

COMMIT;
