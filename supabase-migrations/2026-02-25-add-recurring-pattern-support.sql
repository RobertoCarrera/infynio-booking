-- 1. Create class_schedules table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.class_schedules (
    id SERIAL PRIMARY KEY,
    class_type_id INTEGER NOT NULL REFERENCES public.class_types(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 10 CHECK (max_capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint to avoid overlapping schedules on the same day (optional, simplified here)
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    
    -- Unique index to avoid exact duplicates
    UNIQUE(class_type_id, day_of_week, start_time)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_class_schedules_day_time ON public.class_schedules(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_class_schedules_class_type ON public.class_schedules(class_type_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_active ON public.class_schedules(is_active);

-- Function to update updated_at automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on class_schedules
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_class_schedules_updated_at') THEN
        CREATE TRIGGER update_class_schedules_updated_at
            BEFORE UPDATE ON public.class_schedules
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END$$;

-- 2. Add new columns for recurring pattern support
-- Add schedule_id to class_sessions
ALTER TABLE public.class_sessions
ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES public.class_schedules(id);

-- Add valid_from and valid_until to class_schedules to clear handling of valid time ranges
ALTER TABLE public.class_schedules
ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS valid_until DATE;

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_class_sessions_schedule_id ON public.class_sessions(schedule_id);

-- 3. Backfill schedule_id based on matching characteristics
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Only backfill if there are active schedules
    FOR r IN SELECT * FROM public.class_schedules WHERE is_active = true LOOP
        UPDATE public.class_sessions
        SET schedule_id = r.id
        WHERE schedule_id IS NULL
          AND class_type_id = r.class_type_id
          AND EXTRACT(DOW FROM schedule_date) = r.day_of_week
          AND schedule_time = r.start_time;
    END LOOP;
END$$;
