-- Fix the update_updated_at_column function to be more robust
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update updated_at if the column exists in the table
    IF TG_TABLE_NAME = 'packages' THEN
        NEW.updated_at = NOW();
    ELSIF TG_TABLE_NAME = 'user_packages' THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
DROP TRIGGER IF EXISTS update_user_packages_updated_at ON user_packages;

-- Recreate triggers
CREATE TRIGGER update_packages_updated_at 
    BEFORE UPDATE ON packages
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_packages_updated_at 
    BEFORE UPDATE ON user_packages
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
