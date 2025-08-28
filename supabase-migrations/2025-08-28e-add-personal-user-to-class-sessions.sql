-- Añadir personal_user_id a class_sessions para soportar sesiones personalizadas
BEGIN;

ALTER TABLE IF EXISTS public.class_sessions
  ADD COLUMN IF NOT EXISTS personal_user_id INTEGER NULL;

-- FK hacia users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'class_sessions' AND kcu.column_name = 'personal_user_id'
  ) THEN
    ALTER TABLE public.class_sessions
      ADD CONSTRAINT class_sessions_personal_user_fk FOREIGN KEY (personal_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END$$;

-- Índice para búsquedas por personal_user_id
CREATE INDEX IF NOT EXISTS idx_class_sessions_personal_user_id ON public.class_sessions(personal_user_id);

COMMIT;
