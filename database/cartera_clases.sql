-- Crear tabla cartera_clases
CREATE TABLE IF NOT EXISTS cartera_clases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bono_type TEXT NOT NULL CHECK (bono_type IN ('MAT-FUNCIONAL', 'REFORMER')),
    bono_subtype TEXT NOT NULL CHECK (bono_subtype IN ('CLASE-NORMAL', 'CLASE-PERSONALIZADA')),
    clases_disponibles INTEGER NOT NULL DEFAULT 0 CHECK (clases_disponibles >= 0),
    clases_totales INTEGER NOT NULL CHECK (clases_totales > 0),
    fecha_compra TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    fecha_expiracion TIMESTAMP WITH TIME ZONE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_cartera_clases_user_id ON cartera_clases(user_id);
CREATE INDEX IF NOT EXISTS idx_cartera_clases_activo ON cartera_clases(activo);
CREATE INDEX IF NOT EXISTS idx_cartera_clases_user_activo ON cartera_clases(user_id, activo);
CREATE INDEX IF NOT EXISTS idx_cartera_clases_tipo ON cartera_clases(bono_type, bono_subtype);

-- Agregar trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cartera_clases_updated_at 
    BEFORE UPDATE ON cartera_clases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar Row Level Security (RLS)
ALTER TABLE cartera_clases ENABLE ROW LEVEL SECURITY;

-- Crear políticas de seguridad
-- Los usuarios solo pueden ver su propia cartera
CREATE POLICY "Users can view their own cartera" ON cartera_clases
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Los administradores pueden ver toda la cartera
CREATE POLICY "Admins can view all cartera" ON cartera_clases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Solo los administradores pueden insertar en cartera
CREATE POLICY "Only admins can insert cartera" ON cartera_clases
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Solo los administradores pueden actualizar cartera
CREATE POLICY "Only admins can update cartera" ON cartera_clases
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Solo los administradores pueden eliminar (desactivar) cartera
CREATE POLICY "Only admins can delete cartera" ON cartera_clases
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Comentarios para documentación
COMMENT ON TABLE cartera_clases IS 'Tabla que almacena los bonos de clases de los usuarios';
COMMENT ON COLUMN cartera_clases.user_id IS 'ID del usuario propietario del bono';
COMMENT ON COLUMN cartera_clases.bono_type IS 'Tipo de clase: MAT-FUNCIONAL o REFORMER';
COMMENT ON COLUMN cartera_clases.bono_subtype IS 'Subtipo: CLASE-NORMAL o CLASE-PERSONALIZADA';
COMMENT ON COLUMN cartera_clases.clases_disponibles IS 'Número de clases disponibles en el bono';
COMMENT ON COLUMN cartera_clases.clases_totales IS 'Número total de clases que tenía el bono originalmente';
COMMENT ON COLUMN cartera_clases.fecha_compra IS 'Fecha en que se adquirió el bono';
COMMENT ON COLUMN cartera_clases.fecha_expiracion IS 'Fecha de expiración del bono (opcional)';
COMMENT ON COLUMN cartera_clases.activo IS 'Indica si el bono está activo';

-- Datos de ejemplo para pruebas (opcional - comentado por defecto)
/*
-- Insertar algunos bonos de ejemplo para el primer usuario
INSERT INTO cartera_clases (user_id, bono_type, bono_subtype, clases_disponibles, clases_totales, fecha_compra) VALUES
(1, 'MAT-FUNCIONAL', 'CLASE-NORMAL', 8, 8, NOW() - INTERVAL '1 day'),
(1, 'REFORMER', 'CLASE-NORMAL', 3, 4, NOW() - INTERVAL '2 weeks'),
(1, 'MAT-FUNCIONAL', 'CLASE-PERSONALIZADA', 1, 1, NOW() - INTERVAL '1 month');
*/
