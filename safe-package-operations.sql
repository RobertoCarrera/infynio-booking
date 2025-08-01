-- Solución temporal: Crear funciones RPC para operaciones seguras
-- Ejecutar en Supabase SQL Editor

-- 1. Función para modificar user_package de forma segura
CREATE OR REPLACE FUNCTION modify_user_package(
    package_id_param INTEGER,
    current_classes_remaining_param INTEGER DEFAULT NULL,
    monthly_classes_limit_param INTEGER DEFAULT NULL,
    classes_used_this_month_param INTEGER DEFAULT NULL,
    rollover_classes_remaining_param INTEGER DEFAULT NULL,
    next_rollover_reset_date_param TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    status_param VARCHAR(20) DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result_record RECORD;
BEGIN
    UPDATE user_packages 
    SET 
        current_classes_remaining = COALESCE(current_classes_remaining_param, current_classes_remaining),
        monthly_classes_limit = COALESCE(monthly_classes_limit_param, monthly_classes_limit),
        classes_used_this_month = COALESCE(classes_used_this_month_param, classes_used_this_month),
        rollover_classes_remaining = COALESCE(rollover_classes_remaining_param, rollover_classes_remaining),
        next_rollover_reset_date = COALESCE(next_rollover_reset_date_param, next_rollover_reset_date),
        status = COALESCE(status_param, status),
        updated_at = NOW()
    WHERE id = package_id_param
    RETURNING *
    INTO result_record;
    
    IF FOUND THEN
        RETURN row_to_json(result_record);
    ELSE
        RETURN json_build_object('error', 'Package not found');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función para desactivar user_package de forma segura
CREATE OR REPLACE FUNCTION deactivate_user_package(package_id_param INTEGER)
RETURNS JSON AS $$
BEGIN
    UPDATE user_packages 
    SET 
        status = 'inactive',
        updated_at = NOW()
    WHERE id = package_id_param;
    
    IF FOUND THEN
        RETURN json_build_object('success', true, 'message', 'Package deactivated successfully');
    ELSE
        RETURN json_build_object('success', false, 'error', 'Package not found');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función para soft delete de usuarios (CORREGIDA - sin updated_at)
CREATE OR REPLACE FUNCTION soft_delete_user(user_id_param INTEGER)
RETURNS JSON AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Obtener email del usuario
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Marcar usuario como eliminado (sin updated_at)
    UPDATE users 
    SET role_id = 99
    WHERE id = user_id_param;
    
    -- Desactivar todos los packages del usuario (con updated_at si existe)
    UPDATE user_packages 
    SET 
        status = 'inactive',
        updated_at = CASE 
            WHEN EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'user_packages' 
                AND column_name = 'updated_at'
            ) THEN NOW()
            ELSE updated_at
        END
    WHERE user_id = user_id_param;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Usuario ' || user_email || ' desactivado correctamente del sistema.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
