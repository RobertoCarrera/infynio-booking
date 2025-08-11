-- Optional indexes and small consistency tweaks
set search_path = public;

-- Helpful indexes for common lookups
create index if not exists idx_bookings_session_status on bookings(class_session_id, status);
create index if not exists idx_bookings_user_status on bookings(user_id, status);
create index if not exists idx_user_packages_user_status_date on user_packages(user_id, status, purchase_date);

-- Ensure updated_at exists on user_packages (if not already)
alter table if exists user_packages
	add column if not exists updated_at timestamptz default now();

-- Create/update helper function
create or replace function public.touch_updated_at_fn()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists user_packages_touch on user_packages;
create trigger user_packages_touch
before update on user_packages
for each row execute function public.touch_updated_at_fn();
