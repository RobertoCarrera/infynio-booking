-- ==================================================
-- SCRIPT COMPLETO PARA CONFIGURAR USUARIOS Y SEGURIDAD
-- Ejecutar en Supabase Dashboard > SQL Editor
-- VERSIÓN FINAL CON RLS Y TIPOS UUID CORREGIDOS
-- ==================================================

-- 1. Crear/actualizar la función trigger para auto-crear usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, role_id)
  VALUES (new.id, new.email, 2); -- role_id = 2 para usuarios normales
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear el trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Dar permisos necesarios para que el trigger funcione
GRANT INSERT, SELECT, UPDATE, DELETE ON public.users TO supabase_auth_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;

-- 4. HABILITAR Row Level Security (RLS) para seguridad
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Eliminar políticas anteriores si existen (limpieza completa)
DROP POLICY IF EXISTS "Allow auth admin to manage users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- 6. Crear políticas de seguridad específicas (UUID CORREGIDO)

-- Política para que supabase_auth_admin pueda gestionar usuarios (necesario para el trigger)
CREATE POLICY "Allow auth admin to manage users" 
ON public.users 
FOR ALL 
TO supabase_auth_admin 
USING (true) 
WITH CHECK (true);

-- Política para que usuarios autenticados puedan ver su propio perfil
-- UUID = UUID (sin conversión de tipos)
CREATE POLICY "Users can view own profile" 
ON public.users 
FOR SELECT 
TO authenticated
USING (auth_user_id = auth.uid());

-- Política para que usuarios autenticados puedan actualizar su propio perfil
-- UUID = UUID (sin conversión de tipos)
CREATE POLICY "Users can update own profile" 
ON public.users 
FOR UPDATE 
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- Política para que usuarios con role_id = 1 (admins) puedan gestionar todos los usuarios
-- Subconsulta simplificada para evitar recursión
CREATE POLICY "Admins can manage all users" 
ON public.users 
FOR ALL 
TO authenticated
USING (
  -- Verificar si el usuario actual es admin
  (
    SELECT role_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  ) = 1
);

-- 7. Verificar que la estructura de la tabla users es correcta
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 8. Verificar permisos
SELECT grantee, privilege_type 
FROM information_schema.table_privileges 
WHERE table_name = 'users' AND table_schema = 'public';

-- 9. Verificar políticas creadas
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- 10. Verificar que RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users' AND schemaname = 'public';

-- ==================================================
-- CONFIGURACIÓN RECOMENDADA EN SUPABASE DASHBOARD:
-- ==================================================
-- Authentication > Settings:
-- ✅ Enable signup: ACTIVADO (permite invitaciones admin)
-- ✅ Enable email confirmations: ACTIVADO (usuarios confirman email)
-- ✅ Enable phone confirmations: Según necesites
-- 🔐 Email templates: Personalizar si quieres
-- ==================================================

-- ==================================================
-- PRUEBAS DE FUNCIONAMIENTO (OPCIONAL):
-- ==================================================
-- Para probar que las políticas funcionan:
-- 1. Haz login como usuario normal y ejecuta:
--    SELECT * FROM users; (debería ver solo su perfil)
-- 2. Haz login como admin y ejecuta:
--    SELECT * FROM users; (debería ver todos los usuarios)
-- ==================================================
