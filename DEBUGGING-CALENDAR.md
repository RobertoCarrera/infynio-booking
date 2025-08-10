# Troubleshooting - Calendario de Clases

## Debugging Implementado

He agregado logging extensivo para identificar dónde está el problema. Cuando navegues a `/calendario`, verás en la consola del navegador:

### 🔍 **Logs de Debugging**

1. **Inicialización del Componente**:
   ```
   🚀 [CalendarComponent] Component initialized
   ```

2. **Verificación de Configuración**:
   ```
   🔧 [CalendarComponent] Environment check: {
     supabaseUrl: "https://...",
     hasSupabaseKey: true,
     keyPrefix: "eyJhbGciOi..."
   }
   ```

3. **Test de Base de Datos**:
   ```
   🧪 [CalendarComponent] Testing database connection...
   ✅ [CalendarComponent] Database test successful: [...]
   ```

4. **Test de Edge Function**:
   ```
   🧪 [CalendarComponent] Testing Edge Function...
   ❌ [CalendarComponent] Edge Function test failed: Error 404
   ```

5. **Llamadas al Servicio**:
   ```
   🔍 [ClassesService] Calling getClassSessionsWithTypes()
   🌐 [ClassesService] Making HTTP request to: https://...
   ```

6. **Respuestas HTTP**:
   ```
   ✅ [ClassesService] HTTP Response received: {...}
   🎉 [ClassesService] Success! Data count: 5
   ```

## Posibles Problemas y Soluciones

### 1. **Edge Function No Desplegada**
**Síntomas**: Error 404 en la llamada HTTP
```
❌ [ClassesService] Edge Function test failed: Error 404
💡 Edge Function might not be deployed
```

**Solución**:
```bash
# Desplegar la Edge Function
supabase functions deploy get-class-sessions

# Verificar que se desplegó
supabase functions list
```

### 2. **Problemas de Autenticación**
**Síntomas**: Error 401 en la llamada HTTP
```
🚨 [ClassesService] HTTP Error: 401
🔐 Authentication error - check API keys
```

**Solución**:
- Verificar que las claves en `environment.ts` son correctas
- Verificar que RLS (Row Level Security) permite acceso anónimo si es necesario

### 3. **No Hay Datos en las Tablas**
**Síntomas**: Respuesta exitosa pero sin datos
```
✅ [ClassesService] Success! Data count: 0
⚠️ [CalendarComponent] No sessions received from service
```

**Solución**:
```sql
-- Verificar datos en las tablas
SELECT COUNT(*) FROM class_sessions;
SELECT COUNT(*) FROM class_types;

-- Ejecutar scripts de datos de prueba si están vacías
\i setup-class-types.sql
\i setup-class-sessions-sample.sql
```

### 4. **Problemas de CORS**
**Síntomas**: Error de red sin detalles específicos
```
🚨 [ClassesService] HTTP Error: 0
🌐 Network error - check if Edge Function is deployed
```

**Solución**:
- Verificar que la Edge Function tiene headers CORS correctos
- Revisar la configuración de Supabase

### 5. **Datos Malformados**
**Síntomas**: Los datos llegan pero no se convierten a eventos
```
📊 [CalendarComponent] Sessions count: 5
⚠️ [CalendarComponent] Session missing datetime data: {...}
🎭 [CalendarComponent] Events count: 0
```

**Solución**:
- Revisar que los datos de `class_sessions` tienen `schedule_date` y `schedule_time`
- Verificar que la Edge Function está calculando correctamente los datetime

## Pasos de Debugging

### 1. **Abrir Consola del Navegador**
- F12 → Console tab
- Navegar a `/calendario`
- Observar los logs

### 2. **Verificar Configuración**
Buscar en los logs:
```
🔧 [CalendarComponent] Environment check
```

### 3. **Verificar Conexión a Base de Datos**
Buscar:
```
✅ [CalendarComponent] Database test successful
```

### 4. **Verificar Edge Function**
Buscar:
```
✅ [CalendarComponent] Edge Function test successful
```

### 5. **Verificar Datos**
Buscar:
```
🎉 [ClassesService] Success! Data count: X
```

### 6. **Verificar Conversión a Eventos**
Buscar:
```
🎭 [CalendarComponent] Events count: X
```

## Comandos de Verificación

### En Supabase Dashboard:
```sql
-- Verificar que existen datos
SELECT cs.*, ct.name 
FROM class_sessions cs 
LEFT JOIN class_types ct ON cs.class_type_id = ct.id 
LIMIT 5;

-- Verificar que las relaciones funcionan
SELECT 
  cs.id,
  cs.schedule_date,
  cs.schedule_time,
  ct.name as class_type_name,
  ct.duration_minutes
FROM class_sessions cs
JOIN class_types ct ON cs.class_type_id = ct.id
ORDER BY cs.schedule_date, cs.schedule_time;
```

### En Terminal:
```bash
# Verificar Edge Functions
supabase functions list

# Ver logs de Edge Function
supabase functions logs get-class-sessions

# Probar Edge Function manualmente
curl -X GET 'YOUR_SUPABASE_URL/functions/v1/get-class-sessions' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'apikey: YOUR_ANON_KEY'
```

## Testing Manual

Si quieres probar la Edge Function manualmente:

```bash
# Con fechas específicas
curl -X GET 'https://nlybxhgbukgqldtoekry.supabase.co/functions/v1/get-class-sessions?start_date=2025-07-21&end_date=2025-07-27' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

El resultado debería ser algo como:
```json
{
  "success": true,
  "data": [...],
  "count": X
}
```
