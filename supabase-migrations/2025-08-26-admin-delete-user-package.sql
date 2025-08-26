-- SECURITY DEFINER RPC to allow admins to hard-delete a user_package row.
-- Deletes the user_packages row; bookings.user_package_id FK is ON DELETE SET NULL so booking history remains.
CREATE OR REPLACE FUNCTION public.admin_delete_user_package(p_user_package_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM user_packages WHERE id = p_user_package_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN json_build_object('success', false, 'error', 'user_package no encontrado');
  END IF;

  -- Primero, eliminar las reservas asociadas a este user_package para liberar plazas
  DELETE FROM bookings WHERE user_package_id = p_user_package_id;

  -- Luego borrar el user_package físicamente
  DELETE FROM user_packages WHERE id = p_user_package_id;

  RETURN json_build_object('success', true, 'message', 'user_package y reservas asociadas eliminadas');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
