-- Script para insertar datos de prueba del sistema de paquetes
-- Ejecutar después de la migración principal

-- Primero, obtener el ID de un usuario existente (reemplazar con un ID real)
-- SELECT id FROM users LIMIT 1;

-- Insertar paquetes de prueba para el primer usuario (ajustar user_id según corresponda)
-- IMPORTANTE: Reemplazar el user_id por el ID real de un usuario existente

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
) VALUES 
-- Paquete de 8 clases MAT FUNCIONAL (package_id = 2)
(1, 2, NOW(), NOW(), 8, 8, 0, 0, DATE_TRUNC('month', NOW() + INTERVAL '1 month'), 'active'),

-- Paquete de 4 clases REFORMER (package_id = 6)
(1, 6, NOW(), NOW(), 4, 4, 0, 0, DATE_TRUNC('month', NOW() + INTERVAL '1 month'), 'active');

-- Para verificar que los paquetes se insertaron correctamente:
-- SELECT 
--     up.*,
--     p.name as package_name,
--     p.class_type,
--     u.email as user_email
-- FROM user_packages up
-- JOIN packages p ON up.package_id = p.id
-- JOIN users u ON up.user_id = u.id
-- WHERE up.status = 'active';
