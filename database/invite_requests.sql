-- Table to record invite resend requests from users
create table if not exists public.invite_requests (
  email text primary key,
  last_requested_at timestamptz not null default now(),
  request_count int not null default 1
);

-- Index for sorting by time
create index if not exists invite_requests_last_requested_at_idx on public.invite_requests (last_requested_at desc);

-- RPC to increment request counter atomically, creating row if needed
create or replace function public.increment_invite_request(req_email text)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.invite_requests(email, last_requested_at, request_count)
  values (req_email, now(), 1)
  on conflict (email)
  do update set last_requested_at = excluded.last_requested_at,
                request_count = public.invite_requests.request_count + 1;
end;
$$;

-- RLS optional: table is only written via service role; enable RLS but no anon policies
alter table public.invite_requests enable row level security;
-- Admins (role_id = 1 in public.users) can read via PostgREST if desired; here we keep it function-only by default.
