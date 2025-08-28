-- Align is_single_class flag with class_count = 1 to ensure single-class logic applies
BEGIN;

UPDATE public.packages
   SET is_single_class = TRUE,
       updated_at = now()
 WHERE is_single_class IS DISTINCT FROM TRUE
   AND class_count = 1;

COMMIT;
