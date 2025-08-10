# Edge Functions para Supabase

## Funciones Implementadas

### `get-class-sessions`

**Propósito**: Obtener sesiones de clase con información completa del tipo de clase, con toda la lógica de procesamiento en el backend.

**Endpoint**: `/functions/v1/get-class-sessions`

**Parámetros de consulta opcionales**:
- `start_date`: Fecha de inicio (formato: YYYY-MM-DD)
- `end_date`: Fecha de fin (formato: YYYY-MM-DD)

**Ejemplo de uso**:
```
GET /functions/v1/get-class-sessions
GET /functions/v1/get-class-sessions?start_date=2025-07-21&end_date=2025-07-27
```

**Respuesta**:
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "class_type_id": "1",
      "capacity": 15,
      "schedule_date": "2025-07-21",
      "schedule_time": "09:00:00",
      "class_type_name": "Yoga Principiantes",
      "class_type_description": "Clase de yoga para personas que empiezan",
      "duration_minutes": 60,
      "start_datetime": "2025-07-21T09:00:00",
      "end_datetime": "2025-07-21T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

## Características de las Edge Functions

1. **Lógica en Backend**: Toda la lógica de JOIN, cálculos de fechas y transformación de datos se hace en el servidor
2. **Optimización**: Los datos llegan al frontend ya procesados y listos para usar
3. **Seguridad**: Usa el contexto de autenticación del usuario logueado
4. **CORS**: Configurado para permitir llamadas desde el frontend
5. **Manejo de Errores**: Control completo de errores y respuestas estructuradas

## Cómo Desplegar

1. **Instalar Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Autenticarse**:
   ```bash
   supabase auth login
   ```

3. **Desplegar función**:
   ```bash
   supabase functions deploy get-class-sessions
   ```

4. **Verificar despliegue**:
   ```bash
   supabase functions list
   ```

## Variables de Entorno

Las Edge Functions automáticamente tienen acceso a:
- `SUPABASE_URL`: URL del proyecto
- `SUPABASE_ANON_KEY`: Clave anónima del proyecto

## Frontend Simplificado

El frontend ahora solo:
1. Hace llamadas HTTP GET a las Edge Functions
2. Recibe datos pre-procesados
3. Renderiza directamente sin lógica compleja

**Antes** (lógica en frontend):
```typescript
// JOIN complicado con transformaciones
const sessions = await supabase
  .from('class_sessions')
  .select('*, class_types(*)')
  .then(data => transform(data)) // Lógica compleja
```

**Ahora** (Edge Function):
```typescript
// Llamada simple
const sessions = await http.get('/functions/v1/get-class-sessions')
// Datos ya listos para usar
```

## Beneficios

1. **Rendimiento**: Menos procesamiento en el cliente
2. **Mantenimiento**: Lógica centralizada en el backend
3. **Escalabilidad**: Edge Functions se ejecutan globalmente
4. **Seguridad**: Validaciones y autenticación en el servidor
5. **Consistencia**: Misma lógica para web, móvil, etc.

## Testing Local

```bash
# Ejecutar Edge Functions localmente
supabase functions serve get-class-sessions

# Probar endpoint
curl -X GET 'http://localhost:54321/functions/v1/get-class-sessions' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```
