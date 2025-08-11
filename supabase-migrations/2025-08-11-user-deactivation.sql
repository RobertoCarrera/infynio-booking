-- User deactivation/reactivation support
-- Adds is_active flags and an audit table, plus admin-only RPCs requiring a reason

-- 1) Schema changes: flags on users
alter table public.users
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists reactivated_at timestamptz,
  add column if not exists last_deactivation_reason text,
  add column if not exists last_reactivation_reason text;

create index if not exists idx_users_is_active on public.users(is_active) where is_active = false;

-- 2) Audit table for status changes
create table if not exists public.user_status_events (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  action text not null check (action in ('DEACTIVATE','REACTIVATE')),
  reason text not null,
  actor_auth_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_status_events_user on public.user_status_events(user_id);
create index if not exists idx_user_status_events_created on public.user_status_events(created_at desc);

-- 3) RPCs to change status with reason, admin-only via auth.uid() check
create or replace function public.admin_deactivate_user(p_user_id bigint, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoker uuid := auth.uid();
  v_role int;
  v_current boolean;
begin
  if v_invoker is null then
    raise exception 'Not authenticated';
  end if;

  select role_id into v_role from users where auth_user_id = v_invoker;
  if v_role is distinct from 1 then
    raise exception 'Admin role required';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Reason is required';
  end if;

  select is_active into v_current from users where id = p_user_id;
  if v_current is null then
    return json_build_object('success', false, 'message', 'User not found');
  end if;
  if v_current = false then
    return json_build_object('success', false, 'message', 'User already deactivated');
  end if;

  update users
     set is_active = false,
         deactivated_at = now(),
         last_deactivation_reason = p_reason
   where id = p_user_id;

  insert into user_status_events(user_id, action, reason, actor_auth_user_id)
  values (p_user_id, 'DEACTIVATE', p_reason, v_invoker);

  return json_build_object('success', true, 'message', 'User deactivated');
exception
  when others then
    return json_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.admin_reactivate_user(p_user_id bigint, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoker uuid := auth.uid();
  v_role int;
  v_current boolean;
begin
  if v_invoker is null then
    raise exception 'Not authenticated';
  end if;

  select role_id into v_role from users where auth_user_id = v_invoker;
  if v_role is distinct from 1 then
    raise exception 'Admin role required';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Reason is required';
  end if;

  select is_active into v_current from users where id = p_user_id;
  if v_current is null then
    return json_build_object('success', false, 'message', 'User not found');
  end if;
  if v_current = true then
    return json_build_object('success', false, 'message', 'User already active');
  end if;

  update users
     set is_active = true,
         reactivated_at = now(),
         last_reactivation_reason = p_reason
   where id = p_user_id;

  insert into user_status_events(user_id, action, reason, actor_auth_user_id)
  values (p_user_id, 'REACTIVATE', p_reason, v_invoker);

  return json_build_object('success', true, 'message', 'User reactivated');
exception
  when others then
    return json_build_object('success', false, 'message', SQLERRM);
end;
$$;

grant execute on function public.admin_deactivate_user(bigint, text) to authenticated;
grant execute on function public.admin_reactivate_user(bigint, text) to authenticated;
