# Calendario de Clases - Implementación con Edge Functions

## Arquitectura

La implementación sigue una arquitectura **backend-first** donde toda la lógica está en Edge Functions de Supabase y el frontend solo consume datos pre-procesados.

### 🚀 **Edge Functions (Backend)**

#### `get-class-sessions`
- **Ubicación**: `supabase-functions/get-class-sessions/index.ts`
- **Función**: Obtiene class_sessions con JOIN a class_types
- **Procesamiento**: Calcula start/end datetime, formatea datos
- **Filtrado**: Opcional por rango de fechas
- **Seguridad**: Usa contexto de autenticación del usuario

### 🎨 **Frontend (Simplificado)**

#### Servicio (`classes.service.ts`)
- Llamadas HTTP simples a Edge Functions
- Sin lógica de negocio
- Datos pre-procesados listos para usar

#### Componente (`calendar.component.ts`)
- Renderizado directo de eventos
- Colores y estilos por tipo de clase
- Interacciones de usuario (click, hover)

## Funcionalidades Implementadas

### ✅ **Visualización de Sesiones**
- Eventos con nombre del tipo de clase
- Duración correcta (calculada en backend)
- Colores distintivos por tipo
- Información completa en tooltips/clicks

### ✅ **Optimización de Carga**
- Carga por rango de fechas visible
- Datos pre-procesados desde Edge Function
- Sin JOINs complejos en frontend

### ✅ **Experiencia de Usuario**
- Click en eventos muestra detalles
- Hover para información rápida
- Responsive design
- Carga automática al cambiar fechas

## Archivos Principales

### Backend (Edge Functions)
```
supabase-functions/
├── get-class-sessions/
│   └── index.ts          # Lógica de obtención y procesamiento
└── README.md            # Documentación de Edge Functions
```

### Frontend (Angular)
```
src/app/
├── services/
│   └── classes.service.ts    # Llamadas HTTP a Edge Functions
├── components/calendar/
│   ├── calendar.component.ts # Renderizado y UX
│   ├── calendar.component.css # Estilos de eventos
│   └── fullcalendar-config.ts # Configuración optimizada
```

### Datos
```
setup-class-types.sql         # Tipos de clase
setup-class-sessions-sample.sql # Sesiones de ejemplo
```

## Implementación Edge Function

### Características:
- **CORS** configurado para frontend
- **Autenticación** automática con Supabase
- **Transformación** de datos lista para calendario
- **Filtrado** opcional por fechas
- **Manejo de errores** estructurado

### Respuesta de Edge Function:
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "class_type_name": "Yoga Principiantes",
      "start_datetime": "2025-07-21T09:00:00",
      "end_datetime": "2025-07-21T10:00:00.000Z",
      "duration_minutes": 60,
      "capacity": 15,
      "class_type_description": "Clase de yoga..."
    }
  ],
  "count": 1
}
```

## Cómo Probar

### 1. **Desplegar Edge Function**
```bash
supabase functions deploy get-class-sessions
```

### 2. **Ejecutar datos de prueba**
```sql
-- En tu base de datos Supabase
\i setup-class-types.sql
\i setup-class-sessions-sample.sql
```

### 3. **Verificar funcionamiento**
- Navegar a `/calendario`
- Los eventos deberían aparecer automáticamente
- Click en eventos para ver detalles

## Ventajas de esta Arquitectura

### 🎯 **Performance**
- Datos pre-procesados en servidor
- Menos carga en cliente
- Respuestas optimizadas

### 🔒 **Seguridad**
- Lógica sensible en backend
- Validaciones centralizadas
- Contexto de autenticación seguro

### 🛠 **Mantenimiento**
- Lógica centralizada
- Fácil debugging
- Consistencia entre plataformas

### 📱 **Escalabilidad**
- Edge Functions globales
- Auto-scaling
- Reutilizable para móvil/web

## Colores por Tipo de Clase

- **Yoga**: Verde (#4CAF50)
- **Pilates**: Azul (#2196F3)
- **Spinning**: Naranja (#FF9800)
- **Zumba**: Rosa (#E91E63)
- **CrossFit**: Morado (#9C27B0)
- **Aqua**: Cian (#00BCD4)
- **Otros**: Gris (#607D8B)

## Testing Edge Function

```bash
# Local
supabase functions serve get-class-sessions

# Probar endpoint
curl -X GET 'http://localhost:54321/functions/v1/get-class-sessions' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# Con filtros de fecha
curl -X GET 'http://localhost:54321/functions/v1/get-class-sessions?start_date=2025-07-21&end_date=2025-07-27' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

## Próximos Pasos

1. **Más Edge Functions**: Crear, actualizar, eliminar sesiones
2. **Reservas**: Edge Function para gestión de bookings
3. **Notificaciones**: Sistema de alertas en backend
4. **Cache**: Implementar cache en Edge Functions
5. **Analytics**: Tracking de uso en backend
