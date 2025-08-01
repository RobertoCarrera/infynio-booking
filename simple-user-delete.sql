-- Versión simplificada para soft delete de usuarios
-- Ejecutar en Supabase SQL Editor

-- Función simplificada para soft delete de usuarios
CREATE OR REPLACE FUNCTION soft_delete_user_simple(user_id_param INTEGER)
RETURNS JSON AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Obtener email del usuario
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Marcar usuario como eliminado (solo cambiar role_id)
    UPDATE users 
    SET role_id = 99
    WHERE id = user_id_param;
    
    -- Desactivar todos los packages del usuario (solo cambiar status)
    UPDATE user_packages 
    SET status = 'inactive'
    WHERE user_id = user_id_param;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Usuario ' || user_email || ' desactivado correctamente del sistema.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
