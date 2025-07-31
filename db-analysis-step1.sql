-- 🔍 ANÁLISIS SIMPLE DE BASE DE DATOS - EJECUTAR UNA POR UNA
-- Ejecuta cada sección por separado para ver todos los resultados

-- =============================================
-- 1. LISTAR TODAS LAS TABLAS
-- =============================================
-- Ejecuta esta consulta primero:

SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
