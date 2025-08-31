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

  -- Antes esta función borraba el row de user_packages; eso causa pérdida de historial.
  -- Ahora la función aplicará una acción segura: restar 1 clase (no bajar de 0),
  -- marcar como 'expired' si queda a 0 y registrar la acción en package_claim_logs.

  -- Obtener el estado actual para auditar
  PERFORM 1 FROM user_packages WHERE id = p_user_package_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_package no encontrado');
  END IF;

  -- If there are active bookings using this user_package, refuse to decrement/delete
  -- If there are any bookings (confirmed or cancelled) referencing this user_package, refuse to delete
  IF EXISTS (SELECT 1 FROM bookings WHERE user_package_id = p_user_package_id) THEN
    RETURN json_build_object('success', false, 'error', 'No se puede eliminar el bono: existen bookings asociados (usa reconciliación o cancela las reservas primero)');
  END IF;

  -- No bookings reference this package: perform hard delete
  DELETE FROM user_packages WHERE id = p_user_package_id;

  -- Registrar la acción para auditoría (opcional)
  BEGIN
    -- Logging removed per cleanup decision; place audit insertion here if needed
    NULL;
  EXCEPTION WHEN OTHERS THEN
    -- ignore logging failures
    NULL;
  END;

  RETURN json_build_object('success', true, 'message', 'Bono eliminado correctamente');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
