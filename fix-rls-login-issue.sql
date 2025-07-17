-- ==================================================
-- SOLUCIÓN AL PROBLEMA DE RLS EN LOGIN (UUID CORREGIDO)
-- ==================================================

-- 1. Habilitar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas existentes para empezar limpio
DROP POLICY IF EXISTS "Allow auth admin to manage users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- 3. Verificar el tipo de datos de auth_user_id (confirmado: UUID)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public' 
AND column_name = 'auth_user_id';

-- 4. Política para que supabase_auth_admin pueda gestionar usuarios (para triggers)
CREATE POLICY "Allow auth admin to manage users" 
ON public.users 
FOR ALL 
TO supabase_auth_admin 
USING (true) 
WITH CHECK (true);

-- 5. Política para que usuarios autenticados puedan ver su propio perfil
-- Mantener ambos como UUID (sin conversión)
CREATE POLICY "Users can view own profile" 
ON public.users 
FOR SELECT 
TO authenticated
USING (auth_user_id = auth.uid());

-- 6. Política para que usuarios autenticados puedan actualizar su propio perfil  
CREATE POLICY "Users can update own profile" 
ON public.users 
FOR UPDATE 
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- 7. Política para que admins puedan gestionar todos los usuarios
-- Mantener UUID sin conversión
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

-- 8. Verificar que las políticas se crearon correctamente
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;