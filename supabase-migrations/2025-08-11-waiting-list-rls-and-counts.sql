-- Fix counts visibility under RLS and waiting_list RLS violations
-- Run in Supabase SQL editor or as a migration
set search_path = public;

-- 1) Elevated counts function so all users see correct confirmed/capacity even with RLS
create or replace function public.get_sessions_with_booking_counts(
  p_start_date date default null,
  p_end_date date default null
) returns table(
  id integer,
  class_type_id integer,
  capacity integer,
  schedule_date date,
  schedule_time time,
  confirmed_bookings_count integer,
  available_spots integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select 
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    coalesce(b.confirmed_count, 0)::int as confirmed_bookings_count,
    (cs.capacity - coalesce(b.confirmed_count, 0))::int as available_spots
  from class_sessions cs
  left join (
    select class_session_id, count(*) as confirmed_count
    from bookings
    where upper(status) = 'CONFIRMED'
    group by class_session_id
  ) b on cs.id = b.class_session_id
  where (p_start_date is null or cs.schedule_date >= p_start_date)
    and (p_end_date is null or cs.schedule_date <= p_end_date)
  order by cs.schedule_date, cs.schedule_time;
end;
$$;

-- 1b) Grant execute to authenticated/anon as needed
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_sessions_with_booking_counts(date, date) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2) Waiting list: unique index to prevent duplicates while waiting
create unique index if not exists waiting_list_unique_waiting
  on public.waiting_list(user_id, class_session_id)
  where upper(coalesce(status,'WAITING')) = 'WAITING';

-- 3) Waiting list RLS policies
alter table public.waiting_list enable row level security;

-- Drop old user policies if exist (idempotent). Keep existing admin policy.
DO $$ BEGIN
  DROP POLICY IF EXISTS "Waiting list: users can view own" ON public.waiting_list;
  DROP POLICY IF EXISTS "Waiting list: users can insert own" ON public.waiting_list;
  DROP POLICY IF EXISTS "Waiting list: users can update own" ON public.waiting_list;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- SELECT: users see own rows (admins already covered by your existing admin policy)
create policy "Waiting list: users can view own" on public.waiting_list
  for select
  using (
    user_id = (select users.id from users where users.auth_user_id = auth.uid())
  );

-- INSERT: users can insert for themselves only
create policy "Waiting list: users can insert own" on public.waiting_list
  for insert
  with check (
    user_id = (select users.id from users where users.auth_user_id = auth.uid())
  );

-- UPDATE: users can update their own row (e.g., cancel)
create policy "Waiting list: users can update own" on public.waiting_list
  for update
  using (
    user_id = (select users.id from users where users.auth_user_id = auth.uid())
  )
  with check (
    user_id = (select users.id from users where users.auth_user_id = auth.uid())
  );

-- 4) Optional RPCs to join/cancel waiting list under controlled rules
create or replace function public.join_waiting_list(
  p_user_id int,
  p_class_session_id int
) returns table(id int, user_id int, class_session_id int, join_date_time timestamptz, status text, notification_sent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_is_admin boolean; begin
  -- Ensure caller is same user unless admin
  select auth.uid() into v_uid;
  select exists (
    select 1 from users u where u.auth_user_id = v_uid and coalesce(u.role_id,0) = 1
  ) into v_is_admin;
  if not v_is_admin then
    if not exists (select 1 from users u where u.id = p_user_id and u.auth_user_id = v_uid) then
      raise exception 'No autorizado';
    end if;
  end if;
  return query
  insert into waiting_list(user_id, class_session_id, join_date_time, status, notification_sent)
  values(p_user_id, p_class_session_id, now(), 'waiting', false)
  on conflict (user_id, class_session_id) where upper(coalesce(status,'WAITING')) = 'WAITING'
  do update set join_date_time = excluded.join_date_time
  returning id, user_id, class_session_id, join_date_time, status, notification_sent;
end; $$;

create or replace function public.cancel_waiting_list(
  p_user_id int,
  p_class_session_id int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid; v_is_admin boolean; begin
  select auth.uid() into v_uid;
  select exists (
    select 1 from users u where u.auth_user_id = v_uid and coalesce(u.role_id,0) = 1
  ) into v_is_admin;
  if not v_is_admin then
    if not exists (select 1 from users u where u.id = p_user_id and u.auth_user_id = v_uid) then
      raise exception 'No autorizado';
    end if;
  end if;
  update waiting_list
  set status = 'cancelled'
  where user_id = p_user_id and class_session_id = p_class_session_id and upper(status) = 'WAITING';
end; $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.join_waiting_list(int, int) TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.cancel_waiting_list(int, int) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5) Helpers to fetch waiting list count and user position (bypass RLS via SECURITY DEFINER)
create or replace function public.get_waiting_list_count(
  p_class_session_id int
) returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int from waiting_list
  where class_session_id = p_class_session_id and upper(coalesce(status,'WAITING')) = 'WAITING';
$$;

create or replace function public.get_waiting_list_position(
  p_user_id int,
  p_class_session_id int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_pos int; begin
  with ordered as (
    select user_id,
           row_number() over (order by join_date_time asc, id asc) as rn
    from waiting_list
    where class_session_id = p_class_session_id and upper(coalesce(status,'WAITING')) = 'WAITING'
  )
  select rn into v_pos from ordered where user_id = p_user_id;
  return coalesce(v_pos, -1);
end; $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_waiting_list_count(int) TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.get_waiting_list_position(int, int) TO anon, authenticated, service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
