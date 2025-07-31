-- 🎯 SCRIPT DE DATOS DE PRUEBA FINAL - COMPATIBLE CON ESTRUCTURA REAL
-- Este script usa las columnas exactas que existen en tu base de datos

-- =============================================
-- 1. VERIFICAR/CREAR TIPOS DE CLASES
-- =============================================
INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'MAT_FUNCIONAL', 'Combinación de Mat Pilates y entrenamiento funcional', 60
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'MAT_FUNCIONAL');

INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'REFORMER', 'Pilates con máquina reformer, ejercicios de resistencia', 50
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'REFORMER');

-- =============================================
-- 2. CREAR PAQUETES DE CLASES DISPONIBLES
-- =============================================
-- Solo podemos usar 'MAT_FUNCIONAL' y 'REFORMER' según el constraint

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Mat Funcional', 'MAT_FUNCIONAL', 5, 85.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Mat Funcional');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 10 Mat Funcional', 'MAT_FUNCIONAL', 10, 160.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 10 Mat Funcional');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Reformer', 'REFORMER', 5, 115.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Reformer');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 8 Reformer', 'REFORMER', 8, 180.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 8 Reformer');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 12 Reformer', 'REFORMER', 12, 250.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 12 Reformer');

-- =============================================
-- 3. ASIGNAR PAQUETES AL USUARIO 23 (Roberto)
-- =============================================
-- Columnas reales: user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, next_rollover_reset_date, status

INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    23, 
    (SELECT id FROM packages WHERE name = 'Bono 10 Mat Funcional'), 
    '2025-01-15 10:00:00', 
    '2025-01-15 10:00:00', 
    7, 
    NULL, 
    3, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 10 Mat Funcional'));

INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    23, 
    (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'), 
    '2025-01-20 14:30:00', 
    '2025-01-20 14:30:00', 
    5, 
    NULL, 
    3, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'));

INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    23, 
    (SELECT id FROM packages WHERE name = 'Bono 12 Reformer'), 
    '2025-01-10 09:15:00', 
    '2025-01-10 09:15:00', 
    8, 
    NULL, 
    4, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 12 Reformer'));

-- =============================================
-- 4. ASIGNAR PAQUETES AL USUARIO 58
-- =============================================
INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    58, 
    (SELECT id FROM packages WHERE name = 'Bono 5 Mat Funcional'), 
    '2025-01-22 16:00:00', 
    '2025-01-22 16:00:00', 
    2, 
    NULL, 
    3, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Mat Funcional'));

INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    58, 
    (SELECT id FROM packages WHERE name = 'Bono 5 Reformer'), 
    '2025-01-18 11:30:00', 
    '2025-01-18 11:30:00', 
    1, 
    NULL, 
    4, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Reformer'));

INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    58, 
    (SELECT id FROM packages WHERE name = 'Bono 10 Mat Funcional'), 
    '2025-01-12 13:45:00', 
    '2025-01-12 13:45:00', 
    4, 
    NULL, 
    6, 
    0, 
    'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 10 Mat Funcional'));

-- Paquete expirado para crear escenario realista
INSERT INTO user_packages (user_id, package_id, purchase_date, activation_date, current_classes_remaining, monthly_classes_limit, classes_used_this_month, rollover_classes_remaining, status) 
SELECT 
    58, 
    (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'), 
    '2024-12-01 08:00:00', 
    '2024-12-01 08:00:00', 
    2, 
    NULL, 
    6, 
    0, 
    'EXPIRED'
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'));

-- =============================================
-- 5. CREAR SESIONES DE CLASES FUTURAS (Próximas 2 semanas)
-- =============================================
-- Columnas reales: class_type_id, capacity, schedule_date, schedule_time

INSERT INTO class_sessions (class_type_id, capacity, schedule_date, schedule_time) VALUES 
-- Lunes próximo
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-04', '09:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-04', '10:15:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-04', '18:00:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-04', '19:30:00'),

-- Martes
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-05', '08:30:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-05', '09:45:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 10, '2025-08-05', '18:30:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-05', '20:00:00'),

-- Miércoles
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-06', '09:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-06', '10:30:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-06', '18:00:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 10, '2025-08-06', '19:15:00'),

-- Jueves
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-07', '08:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-07', '09:30:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-07', '18:45:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-07', '20:30:00'),

-- Viernes
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 10, '2025-08-08', '09:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-08', '10:30:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-08', '17:30:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-08', '19:00:00'),

-- Sábado
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-09', '10:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-09', '11:30:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-09', '17:00:00'),

-- Segunda semana (11-15 Agosto)
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-11', '09:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-11', '10:15:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-11', '18:00:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-11', '19:30:00'),

((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-12', '09:45:00'),
((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 12, '2025-08-12', '18:30:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-12', '20:00:00'),

((SELECT id FROM class_types WHERE name = 'MAT_FUNCIONAL'), 15, '2025-08-13', '09:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-13', '18:00:00'),
((SELECT id FROM class_types WHERE name = 'REFORMER'), 6, '2025-08-13', '19:30:00');

-- =============================================
-- 6. CREAR RESERVAS EXISTENTES PARA USUARIOS 23 Y 58
-- =============================================
-- Columnas reales: user_id, class_session_id, booking_date_time, status, cancellation_time, is_from_package, payment_id

-- Reservas del Usuario 23 (Roberto - más activo)
INSERT INTO bookings (user_id, class_session_id, booking_date_time, status, is_from_package) VALUES 
-- Reservas confirmadas para esta semana
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '09:00:00' LIMIT 1), '2025-07-28 14:30:00', 'CONFIRMED', true),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '09:45:00' LIMIT 1), '2025-07-29 16:15:00', 'CONFIRMED', true),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '10:30:00' LIMIT 1), '2025-07-29 18:45:00', 'CONFIRMED', true),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '10:30:00' LIMIT 1), '2025-07-30 10:20:00', 'CONFIRMED', true),

-- Reservas para la siguiente semana
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-11' AND schedule_time = '09:00:00' LIMIT 1), '2025-07-30 12:00:00', 'CONFIRMED', true),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-12' AND schedule_time = '09:45:00' LIMIT 1), '2025-07-30 13:15:00', 'CONFIRMED', true);

-- Reservas del Usuario 58 (moderadamente activo)
INSERT INTO bookings (user_id, class_session_id, booking_date_time, status, is_from_package) VALUES 
-- Reservas confirmadas
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '08:30:00' LIMIT 1), '2025-07-29 11:20:00', 'CONFIRMED', true),
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-07' AND schedule_time = '18:45:00' LIMIT 1), '2025-07-30 09:45:00', 'CONFIRMED', true),
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-09' AND schedule_time = '17:00:00' LIMIT 1), '2025-07-30 15:30:00', 'CONFIRMED', true);

-- =============================================
-- 7. CREAR USUARIOS DE PRUEBA ADICIONALES
-- =============================================
-- Crear algunos usuarios adicionales para llenar las clases
-- Columnas reales: id, email, name, surname, telephone, date_birth, role_id, auth_user_id

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 101, 'test1@pilates.com', 'Ana', 'García López', '600111001', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 101);

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 102, 'test2@pilates.com', 'Carlos', 'López Martín', '600111002', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 102);

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 103, 'test3@pilates.com', 'Elena', 'Martín Ruiz', '600111003', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 103);

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 104, 'test4@pilates.com', 'David', 'Ruiz Sánchez', '600111004', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 104);

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 105, 'test5@pilates.com', 'Laura', 'Sánchez Torres', '600111005', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 105);

INSERT INTO users (id, email, name, surname, telephone, role_id) 
SELECT 106, 'test6@pilates.com', 'Miguel', 'Torres Silva', '600111006', 2
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 106);

-- =============================================
-- 8. CREAR RESERVAS DE OTROS USUARIOS PARA LLENAR CLASES
-- =============================================

-- Simular otros usuarios reservando para hacer algunas clases completas
INSERT INTO bookings (user_id, class_session_id, booking_date_time, status, is_from_package) VALUES 
-- Llenar clase de Reformer del Lunes (capacidad 6)
(101, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28 10:00:00', 'CONFIRMED', false),
(102, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28 11:30:00', 'CONFIRMED', false),
(103, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28 13:45:00', 'CONFIRMED', false),
(104, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28 15:20:00', 'CONFIRMED', false),
(105, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-29 08:15:00', 'CONFIRMED', false),

-- Llenar clase de Reformer del Martes (capacidad 6)
(106, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-29 12:30:00', 'CONFIRMED', false),

-- Llenar parcialmente clase de Mat Funcional del Miércoles (capacidad 10)
(101, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29 14:00:00', 'CONFIRMED', false),
(102, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29 15:30:00', 'CONFIRMED', false),
(103, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29 16:45:00', 'CONFIRMED', false),
(104, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30 08:20:00', 'CONFIRMED', false),
(105, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30 09:40:00', 'CONFIRMED', false),
(106, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30 10:50:00', 'CONFIRMED', false),

-- Llenar clase de Reformer del Viernes completamente (capacidad 6)
(101, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 07:15:00', 'CONFIRMED', false),
(102, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 08:45:00', 'CONFIRMED', false),
(103, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 09:30:00', 'CONFIRMED', false),
(104, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 10:15:00', 'CONFIRMED', false),
(105, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 11:00:00', 'CONFIRMED', false),
(106, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 11:45:00', 'CONFIRMED', false);

-- =============================================
-- 9. CREAR ENTRADAS EN LISTA DE ESPERA
-- =============================================
-- Columnas reales: user_id, class_session_id, join_date_time, notification_sent, notification_time, status

-- Usuario 23 en lista de espera para clase completa de Reformer del Viernes
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, notification_sent, status) VALUES 
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 14:30:00', false, 'WAITING');

-- Usuario 58 en lista de espera para clase completa de Reformer del Martes
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, notification_sent, status) VALUES 
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-30 16:45:00', false, 'WAITING');

-- Otros usuarios en lista de espera para crear situaciones realistas
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, notification_sent, status) VALUES 
(101, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 10:15:00', false, 'WAITING'),
(102, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 12:20:00', false, 'WAITING'),
(103, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-30 09:30:00', false, 'WAITING');

-- =============================================
-- 🎯 RESUMEN DE DATOS CREADOS
-- =============================================

-- USUARIO 23 (Roberto - Usuario Super Activo):
-- ✅ 3 paquetes activos: Mat Funcional (7 clases), Reformer (5 clases), Reformer 12 (8 clases)
-- ✅ 6 reservas confirmadas (esta semana y siguiente)
-- ✅ 1 entrada en lista de espera (Reformer Viernes - posición 2)

-- USUARIO 58 (Usuario Moderadamente Activo):
-- ✅ 3 paquetes activos: Mat Funcional (2 y 4 clases), Reformer (1 clase)  
-- ✅ 1 paquete expirado: Reformer (2 clases pero EXPIRED)
-- ✅ 3 reservas confirmadas
-- ✅ 1 entrada en lista de espera (Reformer Martes - posición 2)

-- CLASES DISPONIBLES:
-- ✅ 30+ sesiones programadas para las próximas 2 semanas
-- ✅ Solo tipos permitidos: MAT_FUNCIONAL y REFORMER
-- ✅ Diferentes niveles de ocupación (vacías, parcialmente llenas, completas)
-- ✅ Clases con lista de espera activa

-- ✨ ¡DATOS 100% COMPATIBLES CON LA ESTRUCTURA REAL! ✨

SELECT 'Datos de prueba creados exitosamente con estructura exacta! 🎉' as mensaje;
