-- Ensure user_packages next_rollover_reset_date equals the last day of the activation month
-- 1) Helper function: compute last day of month for a timestamp/date
create or replace function public.last_day_of_month(p_ts timestamp without time zone)
returns date
language sql immutable strict
as $$
  select (date_trunc('month', p_ts) + interval '1 month' - interval '1 day')::date
$$;

-- Overload for timestamptz to support calls like last_day_of_month(now())
create or replace function public.last_day_of_month(p_ts timestamp with time zone)
returns date
language sql immutable strict
as $$
  select (date_trunc('month', p_ts::timestamp) + interval '1 month' - interval '1 day')::date
$$;

-- 2) Trigger function to set next_rollover_reset_date on INSERT/UPDATE
create or replace function public.user_packages_set_eom_expiration()
returns trigger
language plpgsql
as $$
begin
  -- Determine activation timestamp; fallback to purchase_date; finally use now()
  if NEW.activation_date is not null then
    NEW.next_rollover_reset_date := public.last_day_of_month(NEW.activation_date);
  elsif NEW.purchase_date is not null then
    NEW.next_rollover_reset_date := public.last_day_of_month(NEW.purchase_date);
  else
    NEW.next_rollover_reset_date := public.last_day_of_month(now());
  end if;
  return NEW;
end;
$$;

-- 3) Create trigger (idempotent)
drop trigger if exists user_packages_eom_expiration_trg on public.user_packages;
create trigger user_packages_eom_expiration_trg
before insert or update of activation_date, purchase_date on public.user_packages
for each row execute function public.user_packages_set_eom_expiration();

-- 4) Backfill existing rows to align expiration with activation month end
update public.user_packages up
   set next_rollover_reset_date = case
     when up.activation_date is not null then public.last_day_of_month(up.activation_date)
     when up.purchase_date is not null then public.last_day_of_month(up.purchase_date)
     else public.last_day_of_month(now())
   end
 where up.next_rollover_reset_date is null
    or up.next_rollover_reset_date <> case
      when up.activation_date is not null then public.last_day_of_month(up.activation_date)
      when up.purchase_date is not null then public.last_day_of_month(up.purchase_date)
      else public.last_day_of_month(now()) end;

-- 5) Optional: check constraint to ensure in-sync (non-strict, allow null during insert then trigger sets value)
alter table public.user_packages
  drop constraint if exists user_packages_next_rollover_eom_chk;
alter table public.user_packages
  add constraint user_packages_next_rollover_eom_chk
  check (
    next_rollover_reset_date is null
    or (
      case when activation_date is not null then public.last_day_of_month(activation_date)
           when purchase_date is not null then public.last_day_of_month(purchase_date)
           else public.last_day_of_month(now()) end
      ) = next_rollover_reset_date
  );

-- Grants for helper function (safe to expose)
grant execute on function public.last_day_of_month(timestamp without time zone) to anon, authenticated, service_role;
grant execute on function public.last_day_of_month(timestamp with time zone) to anon, authenticated, service_role;
