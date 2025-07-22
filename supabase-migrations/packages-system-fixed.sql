-- Script SQL corregido para el sistema de paquetes
-- Ejecutar en el SQL Editor de Supabase

-- Eliminar tablas si existen (solo para desarrollo, comentar en producción)
-- DROP TABLE IF EXISTS user_packages CASCADE;
-- DROP TABLE IF EXISTS packages CASCADE;

-- 1. Crear tabla de paquetes disponibles
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    class_type VARCHAR(20) NOT NULL CHECK (class_type IN ('MAT_FUNCIONAL', 'REFORMER')),
    class_count INTEGER NOT NULL CHECK (class_count > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    is_single_class BOOLEAN DEFAULT FALSE,
    is_personal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear tabla de paquetes de usuarios
CREATE TABLE IF NOT EXISTS user_packages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE, -- Puede ser NULL para paquetes admin
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    activation_date TIMESTAMP WITH TIME ZONE,
    current_classes_remaining INTEGER NOT NULL DEFAULT 0,
    monthly_classes_limit INTEGER NOT NULL DEFAULT 0,
    classes_used_this_month INTEGER NOT NULL DEFAULT 0,
    rollover_classes_remaining INTEGER NOT NULL DEFAULT 0,
    next_rollover_reset_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Insertar paquetes base (sin duplicar si ya existen)
INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '4 CLASES AL MES', 'MAT_FUNCIONAL', 4, 60.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '4 CLASES AL MES' AND class_type = 'MAT_FUNCIONAL');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '8 CLASES AL MES', 'MAT_FUNCIONAL', 8, 105.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '8 CLASES AL MES' AND class_type = 'MAT_FUNCIONAL');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '12 CLASES AL MES', 'MAT_FUNCIONAL', 12, 135.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '12 CLASES AL MES' AND class_type = 'MAT_FUNCIONAL');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT 'CLASE SUELTA', 'MAT_FUNCIONAL', 1, 18.00, TRUE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'CLASE SUELTA' AND class_type = 'MAT_FUNCIONAL');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT 'CLASE PERSONALIZADA', 'MAT_FUNCIONAL', 1, 35.00, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'CLASE PERSONALIZADA' AND class_type = 'MAT_FUNCIONAL');

-- Paquetes REFORMER
INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '4 CLASES AL MES', 'REFORMER', 4, 80.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '4 CLASES AL MES' AND class_type = 'REFORMER');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '8 CLASES AL MES', 'REFORMER', 8, 130.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '8 CLASES AL MES' AND class_type = 'REFORMER');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT '12 CLASES AL MES', 'REFORMER', 12, 160.00, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = '12 CLASES AL MES' AND class_type = 'REFORMER');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT 'CLASE SUELTA', 'REFORMER', 1, 25.00, TRUE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'CLASE SUELTA' AND class_type = 'REFORMER');

INSERT INTO packages (name, class_type, class_count, price, is_single_class, is_personal) 
SELECT 'CLASE PERSONALIZADA', 'REFORMER', 1, 50.00, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'CLASE PERSONALIZADA' AND class_type = 'REFORMER');

-- 4. Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_user_packages_user_id ON user_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_user_packages_status ON user_packages(status);
CREATE INDEX IF NOT EXISTS idx_user_packages_package_id ON user_packages(package_id);
CREATE INDEX IF NOT EXISTS idx_packages_class_type ON packages(class_type);

-- 5. Crear función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. Crear triggers para actualizar updated_at
DROP TRIGGER IF EXISTS update_packages_updated_at ON packages;
CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_packages_updated_at ON user_packages;
CREATE TRIGGER update_user_packages_updated_at BEFORE UPDATE ON user_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Habilitar RLS (Row Level Security)
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_packages ENABLE ROW LEVEL SECURITY;

-- 8. Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Packages are viewable by everyone" ON packages;
DROP POLICY IF EXISTS "Only admin can modify packages" ON packages;
DROP POLICY IF EXISTS "Users can view own packages" ON user_packages;
DROP POLICY IF EXISTS "Users can insert own packages" ON user_packages;
DROP POLICY IF EXISTS "Users can update own packages" ON user_packages;
DROP POLICY IF EXISTS "Only admin can delete user packages" ON user_packages;

-- 9. Crear políticas de seguridad corregidas

-- Política para packages: todos pueden leer, solo admin puede modificar
CREATE POLICY "Packages are viewable by everyone" ON packages
    FOR SELECT USING (true);

CREATE POLICY "Only admin can modify packages" ON packages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() AND role = 'admin'
        )
    );

-- Política para user_packages: usuarios solo pueden ver sus propios paquetes
CREATE POLICY "Users can view own packages" ON user_packages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = user_packages.user_id AND auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own packages" ON user_packages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = user_packages.user_id AND auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own packages" ON user_packages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = user_packages.user_id AND auth_user_id = auth.uid()
        )
    );

-- Solo admin puede eliminar paquetes de usuarios
CREATE POLICY "Only admin can delete user packages" ON user_packages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() AND role = 'admin'
        )
    );

-- 10. Función para gestionar rollover mensual (se ejecutaría con un cron job)
CREATE OR REPLACE FUNCTION process_monthly_rollover()
RETURNS void AS $$
BEGIN
    -- Mover clases no usadas a rollover y resetear el contador mensual
    UPDATE user_packages 
    SET 
        rollover_classes_remaining = rollover_classes_remaining + (monthly_classes_limit - classes_used_this_month),
        classes_used_this_month = 0,
        next_rollover_reset_date = DATE_TRUNC('month', NOW() + INTERVAL '1 month')
    WHERE 
        status = 'active' 
        AND next_rollover_reset_date <= NOW()
        AND package_id IS NOT NULL 
        AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND NOT is_single_class);
        
    -- Expirar clases sueltas que han pasado su fecha
    UPDATE user_packages 
    SET status = 'expired'
    WHERE 
        status = 'active' 
        AND next_rollover_reset_date <= NOW()
        AND package_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM packages WHERE id = user_packages.package_id AND is_single_class);
END;
$$ LANGUAGE plpgsql;

-- 11. Función para usar una clase
CREATE OR REPLACE FUNCTION use_class(
    p_user_id INTEGER,
    p_class_type VARCHAR(20)
)
RETURNS boolean AS $$
DECLARE
    v_package_id INTEGER;
    v_monthly_available INTEGER;
    v_rollover_available INTEGER;
BEGIN
    -- Buscar un paquete activo del tipo especificado con clases disponibles
    SELECT up.id, 
           (up.monthly_classes_limit - up.classes_used_this_month),
           up.rollover_classes_remaining
    INTO v_package_id, v_monthly_available, v_rollover_available
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL) -- Admin packages don't have class_type restriction
      AND up.status = 'active'
      AND (
          (up.monthly_classes_limit - up.classes_used_this_month) > 0 
          OR up.rollover_classes_remaining > 0
      )
    ORDER BY up.created_at DESC
    LIMIT 1;
    
    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay clases disponibles
    END IF;
    
    -- Usar primero las clases del mes actual, luego las de rollover
    IF v_monthly_available > 0 THEN
        UPDATE user_packages 
        SET 
            classes_used_this_month = classes_used_this_month + 1,
            current_classes_remaining = current_classes_remaining - 1
        WHERE id = v_package_id;
    ELSE
        UPDATE user_packages 
        SET 
            rollover_classes_remaining = rollover_classes_remaining - 1,
            current_classes_remaining = current_classes_remaining - 1
        WHERE id = v_package_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 12. Función para cancelar una clase (devolver la clase)
CREATE OR REPLACE FUNCTION cancel_class(
    p_user_id INTEGER,
    p_class_type VARCHAR(20)
)
RETURNS boolean AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    -- Buscar el paquete más reciente del tipo especificado
    SELECT up.id
    INTO v_package_id
    FROM user_packages up
    LEFT JOIN packages p ON up.package_id = p.id
    WHERE up.user_id = p_user_id 
      AND (p.class_type = p_class_type OR up.package_id IS NULL) -- Admin packages don't have class_type restriction
      AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1;
    
    IF v_package_id IS NULL THEN
        RETURN FALSE; -- No hay paquetes del tipo especificado
    END IF;
    
    -- Devolver la clase (preferir devolver a las clases del mes actual)
    UPDATE user_packages 
    SET 
        classes_used_this_month = GREATEST(0, classes_used_this_month - 1),
        current_classes_remaining = current_classes_remaining + 1
    WHERE id = v_package_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 13. Comentarios de documentación
COMMENT ON TABLE packages IS 'Paquetes de clases disponibles para compra';
COMMENT ON TABLE user_packages IS 'Paquetes comprados por los usuarios con tracking de uso';
COMMENT ON FUNCTION use_class IS 'Función para descontar una clase del paquete del usuario';
COMMENT ON FUNCTION cancel_class IS 'Función para devolver una clase cancelada al paquete del usuario';
COMMENT ON FUNCTION process_monthly_rollover IS 'Función para procesar el rollover mensual de clases no utilizadas';

-- 14. Insertar datos de prueba (opcional - ejecutar solo una vez)
-- Ejemplo: dar 8 clases de MAT FUNCIONAL al primer usuario
/*
INSERT INTO user_packages (
    user_id, 
    package_id, 
    purchase_date,
    activation_date,
    current_classes_remaining,
    monthly_classes_limit,
    classes_used_this_month,
    rollover_classes_remaining,
    next_rollover_reset_date,
    status
) 
SELECT 
    1, -- ID del primer usuario (ajustar según sea necesario)
    p.id,
    NOW(),
    NOW(),
    8,
    8,
    0,
    0,
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    'active'
FROM packages p 
WHERE p.name = '8 CLASES AL MES' AND p.class_type = 'MAT_FUNCIONAL'
AND NOT EXISTS (
    SELECT 1 FROM user_packages up 
    WHERE up.user_id = 1 AND up.package_id = p.id
);
*/
