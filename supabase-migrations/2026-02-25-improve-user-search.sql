-- Migration: Update user search to be more flexible (contains instead of starts-with)
-- Also ensures case-insensitive and accent-insensitive search if possible, or at least handles trimming.

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
  WITH search_term AS (
    SELECT 
      CASE 
        WHEN p_text IS NULL OR length(trim(p_text)) = 0 THEN NULL 
        ELSE '%' || lower(trim(p_text)) || '%' 
      END AS term
  )
  SELECT u.id,
         u.name,
         u.surname,
         u.email,
         u.telephone,
         u.auth_user_id,
         (trim(u.name)||' '||trim(u.surname)) AS full_name
  FROM public.users u, search_term
  WHERE u.auth_user_id IS NOT NULL
    -- Ensure onboarding fields are present
    AND coalesce(trim(u.name),'') <> ''
    AND coalesce(trim(u.surname),'') <> ''
    AND coalesce(trim(u.telephone),'') <> ''
    AND (
      search_term.term IS NULL OR (
        lower(u.email) LIKE search_term.term OR
        lower(u.name) LIKE search_term.term OR
        lower(u.surname) LIKE search_term.term OR
        -- Also search against full name concatenation with unaccent if possible, but keeping it simple for now
        lower(trim(u.name) || ' ' || trim(u.surname)) LIKE search_term.term
      )
    )
  ORDER BY lower(u.surname), lower(u.name)
  LIMIT p_limit OFFSET p_offset;
$$;
