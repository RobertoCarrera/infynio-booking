-- Comprehensive RLS cleanup and policy hardening
set search_path = public;

-- Ensure RLS is enabled on critical tables (idempotent)
alter table if exists public.bookings enable row level security;
alter table if exists public.waiting_list enable row level security;
alter table if exists public.class_sessions enable row level security;
alter table if exists public.class_types enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.user_packages enable row level security;
alter table if exists public.packages enable row level security;
alter table if exists public.payments enable row level security;

-- BOOKINGS: drop duplicates and unsafe policies, then create strict ones
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can do everything on bookings" ON public.bookings;
  DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
  DROP POLICY IF EXISTS "Users can manage their own bookings" ON public.bookings;
  DROP POLICY IF EXISTS "Can only cancel before cancellation_time" ON public.bookings;
  DROP POLICY IF EXISTS "Can only delete before cancellation_time" ON public.bookings;
  -- Also drop potentially existing hardened policies to allow idempotent recreation
  DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
  DROP POLICY IF EXISTS "Users can update own bookings before cutoff" ON public.bookings;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Admins: full control
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND COALESCE(u.role_id,0) = 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND COALESCE(u.role_id,0) = 1
    )
  );

-- Users: view own bookings
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Users: update own bookings (e.g., cancellations) only before cutoff
CREATE POLICY "Users can update own bookings before cutoff" ON public.bookings
  FOR UPDATE
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND now() < cancellation_time
  )
  WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND now() < cancellation_time
  );

-- No user DELETE or INSERT on bookings; use RPCs instead

-- USERS table: drop duplicate view-own policy and keep authenticated
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.users; -- duplicate
  DROP POLICY IF EXISTS "Users can view own profile" ON public.users; -- will recreate
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Keep existing admin/service_role/auth_admin policies intact

-- WAITING LIST: ensure admin policy exists (idempotent recreation to align)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage all waiting list" ON public.waiting_list;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Admins can manage all waiting list" ON public.waiting_list
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND COALESCE(u.role_id,0) = 1
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND COALESCE(u.role_id,0) = 1
    )
  );

-- CLASS SESSIONS and CLASS TYPES
-- Ensure authenticated users can select (idempotent reset)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view class sessions" ON public.class_sessions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Authenticated users can view class sessions" ON public.class_sessions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view class types" ON public.class_types;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Authenticated users can view class types" ON public.class_types
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- PACKAGES: leave existing policies (admin all, public select) as is
-- USER_PACKAGES: keep existing granular policies
-- PAYMENTS: keep admin-only policy
