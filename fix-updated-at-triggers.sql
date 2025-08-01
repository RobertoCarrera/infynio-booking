-- Migración para arreglar los triggers de updated_at
-- Ejecutar en Supabase SQL Editor

-- 1. Crear una función más robusta para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo actualizar updated_at si la columna existe en la tabla
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = TG_TABLE_NAME 
        AND column_name = 'updated_at'
    ) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Recrear triggers de manera segura
DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
DROP TRIGGER IF EXISTS update_user_packages_updated_at ON user_packages;

-- 3. Crear triggers solo si las tablas existen
DO $$
BEGIN
    -- Trigger para packages
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'packages') THEN
        CREATE TRIGGER update_packages_updated_at 
            BEFORE UPDATE ON packages
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Trigger para user_packages
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_packages') THEN
        CREATE TRIGGER update_user_packages_updated_at 
            BEFORE UPDATE ON user_packages
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 4. Verificar que la columna updated_at existe en user_packages
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_packages' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE user_packages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;
