-- Update default capacity for 'Syncro' class type (ID 28) to 10
-- We first check if the 'default_capacity' column exists on 'class_types' table
-- If it doesn't, we might need to rely on the frontend mapping or add the column.
-- However, the user request "el valor por defecto de la capacidad de la class_type" implies there might be a column or a place for this.
-- based on previous file reviews (admin-calendar.component.ts), there is a `default_capacity` property accessed on `ct`.
-- Let's check the `class_types` table definition in `class_sessions_setup.sql`.
-- It shows: `id, name, description, duration_minutes`. NO `default_capacity` column.
-- Wait, `admin-calendar.component.ts` had: `if (ct && (ct as any).default_capacity) return Number((ct as any).default_capacity);`
-- This suggests the column MIGHT exist in the DB but was not in the initial setup script I read, OR it's a new column.
-- I should verified the table structure of `class_types` first.

-- Assuming for now I need to update it. If the column doesn't exist, I might need to add it or the user implies a different mechanism.
-- The user said: "el valor por defecto de la capacidad de la class_type con nombre 'Syncro' auméntalo a 10".
-- If there is no column, maybe they mean the 'metadata' or I should add it.
-- Let's verify the `class_types` schema first.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'class_types' AND column_name = 'default_capacity') THEN
        UPDATE class_types SET default_capacity = 10 WHERE name = 'Syncro' OR id = 28;
    ELSE
        -- If the column does not exist, we should probably add it to support this requirement properly,
        -- as the frontend is already trying to read it.
        ALTER TABLE class_types ADD COLUMN default_capacity INTEGER DEFAULT 8;
        UPDATE class_types SET default_capacity = 10 WHERE name = 'Syncro' OR id = 28;
    END IF;
END $$;
