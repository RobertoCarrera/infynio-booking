-- Script para agregar updated_at a la tabla users si no existe
-- Ejecutar en Supabase SQL Editor

-- Agregar columna updated_at a users si no existe
DO $$
BEGIN
    -- Verificar si la columna updated_at existe en users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'updated_at'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Columna updated_at agregada a la tabla users';
    ELSE
        RAISE NOTICE 'La columna updated_at ya existe en la tabla users';
    END IF;
END $$;

-- Crear trigger para users si no existe
DO $$
BEGIN
    -- Verificar si el trigger existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_users_updated_at'
        AND event_object_table = 'users'
    ) THEN
        CREATE TRIGGER update_users_updated_at 
            BEFORE UPDATE ON public.users
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Trigger update_users_updated_at creado';
    ELSE
        RAISE NOTICE 'El trigger update_users_updated_at ya existe';
    END IF;
END $$;
