-- Migration: Composite lower() index + onboarded user search RPC
-- 1. Composite index for common prefix searches. For more advanced substring search consider pg_trgm (extension) + GIN.
CREATE INDEX IF NOT EXISTS users_lower_email_name_surname_idx
  ON public.users (lower(email), lower(name), lower(surname));

-- 2. RPC to search onboarded users with pagination. SECURITY DEFINER to allow authenticated role.
CREATE OR REPLACE FUNCTION public.search_onboarded_users(
  p_text   text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id integer,
  name text,
  surname text,
  email text,
  telephone text,
  auth_user_id uuid,
  full_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id,
         u.name,
         u.surname,
         u.email,
         u.telephone,
         u.auth_user_id,
         (trim(u.name)||' '||trim(u.surname)) AS full_name
  FROM public.users u
  WHERE u.auth_user_id IS NOT NULL
    AND coalesce(trim(u.name),'') <> ''
    AND coalesce(trim(u.surname),'') <> ''
    AND coalesce(trim(u.telephone),'') <> ''
    AND (
      p_text IS NULL OR length(trim(p_text)) = 0 OR (
        lower(u.email) LIKE lower(p_text) || '%' OR
        lower(u.name) LIKE lower(p_text) || '%' OR
        lower(u.surname) LIKE lower(p_text) || '%' OR
        lower(u.name || ' ' || u.surname) LIKE lower(p_text) || '%'
      )
    )
  ORDER BY lower(u.surname), lower(u.name)
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.search_onboarded_users(text, integer, integer) TO authenticated;

-- End migration.
