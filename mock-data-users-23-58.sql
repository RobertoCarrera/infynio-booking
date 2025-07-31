-- 🎯 SCRIPT DE DATOS DE PRUEBA PARA MARS STUDIO
-- Este script crea datos realistas para los usuarios 23 y 58
-- Incluye: paquetes, reservas, listas de espera y sesiones de clases

-- =============================================
-- 1. VERIFICAR/CREAR TIPOS DE CLASES
-- =============================================
INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'Barre', 'Entrenamiento combinando ballet, pilates y yoga', 50
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'Barre');

INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'Mat', 'Pilates en colchoneta, fortalecimiento del core', 55
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'Mat');

INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'Reformer', 'Pilates con máquina reformer, ejercicios de resistencia', 50
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'Reformer');

INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'Personalizada', 'Sesión individual personalizada', 60
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'Personalizada');

INSERT INTO class_types (name, description, duration_minutes) 
SELECT 'Funcional', 'Entrenamiento funcional de fuerza y cardio', 45
WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = 'Funcional');

-- =============================================
-- 2. CREAR PAQUETES DE CLASES DISPONIBLES
-- =============================================
INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Barre', (SELECT name FROM class_types WHERE name = 'Barre'), 5, 70.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Barre');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 10 Barre', (SELECT name FROM class_types WHERE name = 'Barre'), 10, 130.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 10 Barre');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Mat', (SELECT name FROM class_types WHERE name = 'Mat'), 5, 85.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Mat');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 10 Mat', (SELECT name FROM class_types WHERE name = 'Mat'), 10, 160.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 10 Mat');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Reformer', (SELECT name FROM class_types WHERE name = 'Reformer'), 5, 115.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Reformer');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 8 Reformer', (SELECT name FROM class_types WHERE name = 'Reformer'), 8, 180.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 8 Reformer');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 5 Funcional', (SELECT name FROM class_types WHERE name = 'Funcional'), 5, 95.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 5 Funcional');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 10 Funcional', (SELECT name FROM class_types WHERE name = 'Funcional'), 10, 180.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 10 Funcional');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Sesión Individual', (SELECT name FROM class_types WHERE name = 'Personalizada'), 1, 45.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Sesión Individual');

INSERT INTO packages (name, class_type, class_count, price) 
SELECT 'Bono 3 Personalizadas', (SELECT name FROM class_types WHERE name = 'Personalizada'), 3, 125.00
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Bono 3 Personalizadas');

-- =============================================
-- 3. ASIGNAR PAQUETES AL USUARIO 23 (Usuario Activo)
-- =============================================
INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 23, (SELECT id FROM packages WHERE name = 'Bono 10 Barre'), '2025-01-15', '2025-04-15', 7, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 10 Barre'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 23, (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'), '2025-01-20', '2025-04-20', 5, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 8 Reformer'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 23, (SELECT id FROM packages WHERE name = 'Bono 5 Mat'), '2025-01-25', '2025-03-25', 3, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Mat'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 23, (SELECT id FROM packages WHERE name = 'Bono 10 Funcional'), '2025-01-10', '2025-04-10', 8, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 10 Funcional'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 23, (SELECT id FROM packages WHERE name = 'Sesión Individual'), '2025-01-05', '2025-02-05', 0, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 23 AND package_id = (SELECT id FROM packages WHERE name = 'Sesión Individual'));

-- =============================================
-- 4. ASIGNAR PAQUETES AL USUARIO 58 (Usuario Moderado)
-- =============================================
INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 58, (SELECT id FROM packages WHERE name = 'Bono 5 Barre'), '2025-01-22', '2025-03-22', 2, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Barre'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 58, (SELECT id FROM packages WHERE name = 'Bono 5 Reformer'), '2025-01-18', '2025-03-18', 1, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Reformer'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 58, (SELECT id FROM packages WHERE name = 'Bono 5 Funcional'), '2025-01-12', '2025-03-12', 4, true
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Funcional'));

INSERT INTO user_packages (user_id, package_id, purchase_date, expiry_date, remaining_classes, is_active) 
SELECT 58, (SELECT id FROM packages WHERE name = 'Bono 5 Mat'), '2024-12-01', '2025-01-30', 2, false
WHERE NOT EXISTS (SELECT 1 FROM user_packages WHERE user_id = 58 AND package_id = (SELECT id FROM packages WHERE name = 'Bono 5 Mat'));

-- =============================================
-- 5. CREAR SESIONES DE CLASES FUTURAS (Próximas 2 semanas)
-- =============================================
INSERT INTO class_sessions (class_type_id, schedule_date, schedule_time, capacity, instructor_id) VALUES 
-- Lunes próximo
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-04', '09:00:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-04', '10:15:00', 10, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-04', '18:00:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-04', '19:30:00', 15, 3),

-- Martes
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-05', '08:30:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-05', '09:45:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-05', '18:30:00', 10, 1),
((SELECT id FROM class_types WHERE name = 'Personalizada'), '2025-08-05', '20:00:00', 1, 2),

-- Miércoles
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-06', '09:00:00', 15, 3),
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-06', '10:30:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-06', '18:00:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-06', '19:15:00', 10, 1),

-- Jueves
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-07', '08:00:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-07', '09:30:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-07', '18:45:00', 15, 3),
((SELECT id FROM class_types WHERE name = 'Personalizada'), '2025-08-07', '20:30:00', 1, 3),

-- Viernes
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-08', '09:00:00', 10, 1),
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-08', '10:30:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-08', '17:30:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-08', '19:00:00', 15, 3),

-- Sábado
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-09', '10:00:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-09', '11:30:00', 10, 1),
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-09', '17:00:00', 15, 3),

-- Segunda semana (11-15 Agosto)
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-11', '09:00:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-11', '10:15:00', 10, 1),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-11', '18:00:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-11', '19:30:00', 15, 3),

((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-12', '09:45:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Barre'), '2025-08-12', '18:30:00', 12, 1),
((SELECT id FROM class_types WHERE name = 'Mat'), '2025-08-12', '20:00:00', 10, 1),

((SELECT id FROM class_types WHERE name = 'Funcional'), '2025-08-13', '09:00:00', 15, 3),
((SELECT id FROM class_types WHERE name = 'Reformer'), '2025-08-13', '18:00:00', 6, 2),
((SELECT id FROM class_types WHERE name = 'Personalizada'), '2025-08-13', '19:30:00', 1, 2);

-- =============================================
-- 6. CREAR RESERVAS EXISTENTES PARA USUARIOS 23 Y 58
-- =============================================

-- Reservas del Usuario 23 (más activo)
INSERT INTO bookings (user_id, class_session_id, booking_date) VALUES 
-- Reservas confirmadas para esta semana
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '09:00:00' LIMIT 1), '2025-07-28'),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '09:45:00' LIMIT 1), '2025-07-29'),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '10:30:00' LIMIT 1), '2025-07-29'),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '10:30:00' LIMIT 1), '2025-07-30'),

-- Reservas para la siguiente semana
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-11' AND schedule_time = '09:00:00' LIMIT 1), '2025-07-30'),
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-12' AND schedule_time = '09:45:00' LIMIT 1), '2025-07-30');

-- Reservas del Usuario 58 (moderadamente activo)
INSERT INTO bookings (user_id, class_session_id, booking_date) VALUES 
-- Reservas confirmadas
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '08:30:00' LIMIT 1), '2025-07-29'),
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-07' AND schedule_time = '18:45:00' LIMIT 1), '2025-07-30'),
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-09' AND schedule_time = '17:00:00' LIMIT 1), '2025-07-30');

-- =============================================
-- 7. CREAR RESERVAS DE OTROS USUARIOS PARA LLENAR CLASES
-- =============================================

-- Simular otros usuarios reservando para hacer algunas clases completas
-- (Asumiendo que hay usuarios con IDs 1-20)
INSERT INTO bookings (user_id, class_session_id, booking_date) VALUES 
-- Llenar clase de Reformer del Lunes (capacidad 6)
(1, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28'),
(2, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28'),
(3, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28'),
(4, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-28'),
(5, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-04' AND schedule_time = '18:00:00' LIMIT 1), '2025-07-29'),

-- Llenar clase de Personalizada del Martes (capacidad 1)
(6, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-29'),

-- Llenar parcialmente clase de Mat del Miércoles (capacidad 10)
(7, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29'),
(8, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29'),
(9, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-29'),
(10, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30'),
(11, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30'),
(12, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30'),
(13, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30'),
(14, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-06' AND schedule_time = '19:15:00' LIMIT 1), '2025-07-30'),

-- Llenar clase de Reformer del Viernes completamente (capacidad 6)
(15, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30'),
(16, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30'),
(17, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30'),
(18, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30'),
(19, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30'),
(20, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30');

-- =============================================
-- 8. CREAR ENTRADAS EN LISTA DE ESPERA
-- =============================================

-- Usuario 23 en lista de espera para clase completa de Reformer del Viernes
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, status) VALUES 
(23, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 14:30:00', 'waiting');

-- Usuario 58 en lista de espera para clase completa de Personalizada del Martes
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, status) VALUES 
(58, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-30 16:45:00', 'waiting');

-- Otros usuarios en lista de espera para crear situaciones realistas
INSERT INTO waiting_list (user_id, class_session_id, join_date_time, status) VALUES 
(21, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 10:15:00', 'waiting'),
(22, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-08' AND schedule_time = '17:30:00' LIMIT 1), '2025-07-30 12:20:00', 'waiting'),
(24, (SELECT id FROM class_sessions WHERE schedule_date = '2025-08-05' AND schedule_time = '20:00:00' LIMIT 1), '2025-07-30 09:30:00', 'waiting');

-- =============================================
-- 🎯 RESUMEN DE DATOS CREADOS
-- =============================================

-- USUARIO 23 (Usuario Super Activo):
-- ✅ 4 paquetes activos: Barre (7 clases), Reformer (5 clases), Mat (3 clases), Funcional (8 clases)
-- ✅ 1 paquete agotado: Personalizada (0 clases)
-- ✅ 6 reservas confirmadas (esta semana y siguiente)
-- ✅ 1 entrada en lista de espera (Reformer Viernes - posición 2)

-- USUARIO 58 (Usuario Moderadamente Activo):
-- ✅ 3 paquetes activos: Barre (2 clases), Reformer (1 clase), Funcional (4 clases)  
-- ✅ 1 paquete expirado: Mat (2 clases pero inactivo)
-- ✅ 3 reservas confirmadas
-- ✅ 1 entrada en lista de espera (Personalizada Martes - posición 2)

-- CLASES DISPONIBLES:
-- ✅ 30+ sesiones programadas para las próximas 2 semanas
-- ✅ Diferentes tipos: Barre, Mat, Reformer, Funcional, Personalizada
-- ✅ Diferentes niveles de ocupación (vacías, parcialmente llenas, completas)
-- ✅ Clases con lista de espera activa

-- ✨ ¡DATOS PERFECTOS PARA TESTING! ✨

SELECT 'Datos de prueba creados exitosamente! 🎉' as mensaje;
