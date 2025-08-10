# Configuración del Calendario con Clases

## 🎯 Funcionalidades Implementadas

### ✅ Calendario de Clases
- **Horarios laborales**: 8:00-13:00 y 16:00-20:00
- **Franja de descanso unificada**: 13:00-16:00 (visualmente como una sola franja gris)
- **Slots de 15 minutos**: Permite clases a las :15, :30, :45
- **Carga automática de clases**: Desde la base de datos `class_sessions`

### ✅ Tipos de Clases
- **Clases predefinidas**: IDs 1-9 (Yoga, Pilates, Aeróbicos, etc.)
- **Clases personales**: ID 4 (reservables por los usuarios)
- **Colores diferenciados**: Cada tipo tiene su color específico

### ✅ Interacciones
- **Click en evento**: Muestra información de la clase
- **Click en horario libre**: Permite reservar clase personal
- **Validaciones**: No permite reservar en pasado o en horario de descanso

## 🚀 Configuración Inicial

### 1. Ejecutar Script SQL
Ejecuta el archivo `setup-class-types.sql` en tu base de datos Supabase:

```sql
-- Este script crea la tabla class_types y los datos iniciales
```

### 2. Verificar Datos de Ejemplo
Ya tienes datos de `class_sessions` desde septiembre a diciembre 2025.

### 3. Estructura de Tablas

#### class_types
- `id`: ID del tipo de clase
- `name`: Nombre de la clase
- `description`: Descripción
- `duration_minutes`: Duración en minutos
- `price`: Precio
- `color`: Color hexadecimal para el calendario

#### class_sessions
- `id`: ID de la sesión
- `class_type_id`: Referencia a `class_types`
- `capacity`: Capacidad máxima
- `schedule_date`: Fecha (YYYY-MM-DD)
- `schedule_time`: Hora (HH:MM:SS)

## 🎨 Archivos Modificados

### 1. `classes.service.ts`
- **Nuevo método**: `getCalendarEvents()` para cargar eventos del calendario
- **Interfaces**: `ClassSession` y `ClassType`
- **Formato FullCalendar**: Convierte datos de BD a formato de eventos

### 2. `calendar.component.ts`
- **Carga automática**: `loadEvents()` al inicializar
- **Manejo de clicks**: `handleEventClick()` y `handleDateSelect()`
- **Creación de clases**: `createPersonalClass()` para reservas

### 3. `fullcalendar-config.ts`
- **Slots de 15 min**: `slotDuration: '00:15:00'`
- **Etiquetas por hora**: `slotLabelInterval: '01:00:00'`

### 4. `styles.css`
- **Franja de descanso**: Adaptada para slots de 15 minutos
- **Ocultación precisa**: De 13:00 a 15:45 (12 slots)

## 🔧 Funcionalidades Futuras

### Próximas mejoras:
1. **Modal de reserva**: Reemplazar `alert()` con modal elegante
2. **Gestión de capacidad**: Mostrar plazas disponibles
3. **Filtros**: Por tipo de clase, instructor, etc.
4. **Notificaciones**: Confirmaciones y recordatorios
5. **Pagos**: Integración con sistema de pagos

## 🐛 Solución de Problemas

### Si las clases no aparecen:
1. Verificar que existe la tabla `class_types`
2. Ejecutar el script SQL de configuración
3. Verificar la conexión a Supabase
4. Revisar la consola del navegador para errores

### Si la franja de descanso no se ve bien:
1. Limpiar caché del navegador (Ctrl+F5)
2. Verificar que `slotDuration` sea '00:15:00'
3. Revisar que el CSS esté aplicado correctamente

## 📝 Notas Importantes

- **ID 4 reservado**: Para clases personales
- **Horarios fijos**: Las clases predefinidas tienen horarios específicos
- **Validación automática**: El sistema previene reservas inválidas
- **Responsive**: Funciona en móvil y escritorio

¡El calendario está listo para usar! 🎉
