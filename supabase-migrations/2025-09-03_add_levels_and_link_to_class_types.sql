-- Levels system: generic and future-proof
-- 1) Create levels table
create table if not exists public.levels (
  id serial primary key,
  name text not null,
  slug text generated always as (replace(lower(trim(name)), ' ', '-')) stored,
  color text default '#6b7280',
  is_active boolean default true
);

-- 2) Map which class types support which levels
create table if not exists public.class_type_levels (
  class_type_id int not null references public.class_types(id) on delete cascade,
  level_id int not null references public.levels(id) on delete cascade,
  primary key (class_type_id, level_id)
);

-- 3) Add level_id to class_sessions (nullable)
alter table if exists public.class_sessions
  add column if not exists level_id int null references public.levels(id);

-- 4) Seed default levels if not present
insert into public.levels (name, color)
select * from (values
  ('Inicial', '#3b82f6'),
  ('Intermedio', '#f59e0b'),
  ('Avanzado', '#8b5cf6')
) as v(name, color)
where not exists (
  select 1 from public.levels l where l.name in ('Inicial','Intermedio','Avanzado')
);

-- 5) Link Mat to all levels (assuming class_types.name = 'Mat')
insert into public.class_type_levels (class_type_id, level_id)
select ct.id, l.id
from public.class_types ct
join public.levels l on l.name in ('Inicial','Intermedio','Avanzado')
where lower(ct.name) like '%mat%'
  and not exists (
    select 1 from public.class_type_levels x where x.class_type_id = ct.id and x.level_id = l.id
  );
