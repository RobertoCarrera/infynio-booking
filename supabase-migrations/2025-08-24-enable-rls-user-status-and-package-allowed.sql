-- Enable RLS and define policies for tables flagged by linter
-- Tables: public.user_status_events, public.package_allowed_class_types
-- Notes:
--  - user_status_events is an audit log: immutable (no update/delete via RLS),
--    admins can read all, users can read their own. Inserts are typically done
--    via SECURITY DEFINER admin functions; we also allow admin inserts directly.
--  - package_allowed_class_types is public metadata: readable by everyone;
--    only admins may insert/update/delete.

begin;

-- 1) user_status_events
alter table if exists public.user_status_events enable row level security;

-- Drop existing policies if they exist to avoid duplicates on re-run
drop policy if exists "Admins can view all user_status_events" on public.user_status_events;
drop policy if exists "Users can view own user_status_events" on public.user_status_events;
drop policy if exists "Admins can insert user_status_events" on public.user_status_events;

-- Allow admins to view all audit events
create policy "Admins can view all user_status_events"
on public.user_status_events
for select
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
);

-- Allow users to view their own audit trail
create policy "Users can view own user_status_events"
on public.user_status_events
for select
using (
  user_id = (
    select id from public.users where auth_user_id = auth.uid()
  )
);

-- Allow admins to insert (logs are normally written via SECURITY DEFINER)
create policy "Admins can insert user_status_events"
on public.user_status_events
for insert
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
);

-- Intentionally no UPDATE/DELETE policies to keep audit rows immutable

-- 2) package_allowed_class_types
alter table if exists public.package_allowed_class_types enable row level security;

-- Drop existing policies if they exist
drop policy if exists "package_allowed_class_types are viewable by everyone" on public.package_allowed_class_types;
drop policy if exists "Only admin can insert package_allowed_class_types" on public.package_allowed_class_types;
drop policy if exists "Only admin can update package_allowed_class_types" on public.package_allowed_class_types;
drop policy if exists "Only admin can delete package_allowed_class_types" on public.package_allowed_class_types;

-- Readable by everyone (anon/authenticated); RLS still applies to writes
create policy "package_allowed_class_types are viewable by everyone"
on public.package_allowed_class_types
for select
using (true);

-- Only admins may INSERT/UPDATE/DELETE
create policy "Only admin can insert package_allowed_class_types"
on public.package_allowed_class_types
for insert
with check (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
);

create policy "Only admin can update package_allowed_class_types"
on public.package_allowed_class_types
for update
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
);

create policy "Only admin can delete package_allowed_class_types"
on public.package_allowed_class_types
for delete
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.role_id = 1
  )
);

commit;
