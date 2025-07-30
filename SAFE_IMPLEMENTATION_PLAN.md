# 🛡️ Plan de Implementación Segura - Sistema de Reservas

## ⚠️ IMPORTANTE: Pasos para implementar SIN RIESGO

### Paso 1: Verificar tu estructura actual
```sql
-- Ejecuta PRIMERO este script para entender tu estructura:
-- database/verify_existing_structure.sql
```
Esto te mostrará:
- Estructura exacta de tus tablas
- Datos existentes
- Funciones que ya tienes

### Paso 2: Hacer backup (CRÍTICO)
```sql
-- Antes de cualquier cambio, hacer backup de estas tablas:
pg_dump --table=bookings your_database > bookings_backup.sql
pg_dump --table=class_sessions your_database > class_sessions_backup.sql  
pg_dump --table=class_types your_database > class_types_backup.sql
```

### Paso 3: Ejecutar funciones seguras
```sql
-- Solo después del backup, ejecutar:
-- database/safe_booking_functions.sql
```
Este script:
- ✅ NO modifica tablas existentes
- ✅ Solo agrega funciones nuevas
- ✅ Se adapta a tu estructura actual
- ✅ Puede revertirse fácilmente

## 🔍 Diferencias principales con tu estructura

### Tu tabla `bookings` tiene:
```sql
booking_date_time    -- (nosotros usábamos booking_time)
is_from_package      -- (nuevo: distingue reservas de packages vs pagos)
payment_id           -- (nuevo: para reservas de pago directo)
```

### Nuestro código actualizado:
- ✅ Usa `booking_date_time` en lugar de `booking_time`
- ✅ Respeta el campo `is_from_package` 
- ✅ Maneja `payment_id` para reservas de pago
- ✅ Se adapta a tus estados de reserva existentes

## 🔧 Funciones que se crearán

### 1. `create_booking_from_package()`
- Crea reservas desde bonos/packages
- Maneja automáticamente `is_from_package = true`
- Calcula `cancellation_time` (12h antes)
- Revierte automáticamente si falla

### 2. `cancel_booking_safe()`
- Cancela reservas de forma segura
- Solo devuelve bonos si `is_from_package = true`
- Verifica límites de tiempo
- Maneja errores automáticamente

### 3. `get_class_sessions()` (adaptada)
- Lee tu estructura existente
- Filtra por estados válidos
- Incluye información completa

## 🧪 Cómo probar sin riesgo

### 1. Primero en desarrollo:
```bash
# Usa una base de datos de prueba/desarrollo
ng serve --configuration development
```

### 2. Verificar funcionalidad:
- Crear reserva desde calendario
- Verificar que descuenta del bono correcto
- Probar cancelación dentro y fuera del límite
- Verificar que las clases se actualizan en tiempo real

### 3. Monitorear logs:
```sql
-- Verificar que las reservas se crean correctamente:
SELECT * FROM bookings WHERE booking_date_time > NOW() - INTERVAL '1 hour';

-- Verificar que los bonos se consumen:
SELECT * FROM user_packages WHERE classes_used_this_month > 0;
```

## 🚨 Plan de Rollback

Si algo sale mal:
```sql
-- 1. Restaurar desde backup:
psql your_database < bookings_backup.sql

-- 2. Eliminar funciones nuevas:
DROP FUNCTION IF EXISTS create_booking_from_package(INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS cancel_booking_safe(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_class_sessions();
DROP FUNCTION IF EXISTS can_cancel_booking(INTEGER);
DROP FUNCTION IF EXISTS cancel_class(INTEGER, TEXT);
DROP FUNCTION IF EXISTS user_class(INTEGER, TEXT);
```

## ✅ Validación final

Antes de lanzar a producción, verificar:
- [ ] Backup realizado
- [ ] Funciones ejecutadas sin errores
- [ ] Reservas se crean correctamente
- [ ] Bonos se consumen del package correcto
- [ ] Cancelaciones funcionan
- [ ] No hay errores en logs de Supabase

## 📞 Contacto de emergencia

Si necesitas ayuda durante la implementación:
1. No ejecutes más SQL
2. Documenta exactamente qué paso causó el problema
3. Ten a mano los backups para restaurar
4. Revisa los logs de Supabase para errores específicos

---

🎯 **La clave es ir paso a paso y verificar cada etapa antes de continuar.**
