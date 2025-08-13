-- Backfill mapping for Mat (2) and Funcional (9) so legacy packages work for both
-- Date: 2025-08-14

begin;

insert into package_allowed_class_types (package_id, class_type_id)
select p.id, s.ct
from packages p
cross join (select 2 as ct union all select 9) s
where p.class_type in (2,9)
  and not exists (
    select 1 from package_allowed_class_types x
    where x.package_id = p.id and x.class_type_id = s.ct
  );

commit;
