# Sistema de Reservas de Clases - Calendario

## 🎯 Funcionalidades Implementadas

### ✅ Sistema de Calendar Completo
- **Visualización de clases**: Todas las sesiones se muestran en el calendario
- **Código de colores**: Verde para clases disponibles, rojo para clases completas
- **Información detallada**: Capacidad actual/máxima en cada evento
- **Modal de reserva**: Interface completa para reservar clases

### ✅ Gestión de Reservas  
- **Reserva de clases**: Los usuarios pueden reservar espacios disponibles
- **Validación de capacidad**: No permite reservar en clases completas
- **Verificación de bonos**: Usa el sistema existente de `user_packages`
- **Cancelación con límite**: 12 horas antes de la clase

### ✅ Integración con Sistema de Cartera
- **Consume bonos automáticamente**: Usa función `user_class()` 
- **Devuelve bonos al cancelar**: Usa función `cancel_class()`
- **Tipos de clase**: Respeta MAT-FUNCIONAL/REFORMER/etc.
- **Sistema de rollover**: Mantiene la lógica existente

## 🏗️ Arquitectura

### Frontend (Angular 17)
```
src/app/
├── components/calendar/
│   ├── calendar.component.ts        # Componente principal del calendario
│   ├── calendar.component.html      # Template con modal de reservas  
│   ├── calendar.component.css       # Estilos personalizados
│   └── fullcalendar-config.ts       # Configuración de FullCalendar
├── services/
│   └── class-sessions.service.ts    # Servicio para gestión de clases y reservas
└── models/
    └── ... (interfaces para TypeScript)
```

### Backend (Supabase + PostgreSQL)
```
database/
└── class_sessions_setup.sql         # Tablas, funciones y datos de ejemplo
```

## 📋 Tablas de Base de Datos

### `class_types`
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(255) (ej: "MAT-FUNCIONAL", "REFORMER")  
- description: TEXT
- duration_minutes: INTEGER
```

### `class_sessions`
```sql
- id: SERIAL PRIMARY KEY
- class_type_id: INTEGER (FK a class_types)
- capacity: INTEGER (espacios máximos)
- schedule_date: DATE
- schedule_time: TIME
```

### `bookings`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER (FK a users)
- class_session_id: INTEGER (FK a class_sessions)
- booking_time: TIMESTAMP
- cancellation_time: TIMESTAMP (12h antes de la clase)
- status: VARCHAR ('confirmed' | 'cancelled')
```

## ⚙️ Funciones SQL Implementadas

### `get_class_sessions()`
- **Propósito**: Obtiene todas las sesiones con información completa
- **Retorna**: Sesiones + tipos de clase + reservas confirmadas
- **Uso**: Alimenta el calendario con datos actualizados

### `user_class(p_user_id, p_class_type)`
- **Propósito**: Consume una clase del bono del usuario
- **Lógica**: Prefiere clases mensuales, luego rollover
- **Retorna**: TRUE si se pudo consumir, FALSE si no hay bonos

### `cancel_class(p_user_id, p_class_type)`
- **Propósito**: Devuelve una clase al bono del usuario
- **Uso**: Al cancelar reservas dentro del límite de tiempo
- **Lógica**: Incrementa clases disponibles

### `can_cancel_booking(booking_id)`
- **Propósito**: Verifica si una reserva se puede cancelar
- **Regla**: Máximo 12 horas antes de la clase
- **Retorna**: TRUE/FALSE

## 🚀 Flujo de Reserva

1. **Usuario ve el calendario**: Clases coloreadas según disponibilidad
2. **Hace clic en una clase**: Se abre modal con información detallada
3. **Confirma reserva**: Sistema verifica bonos disponibles  
4. **Consume bono**: Llama `user_class()` para descontar del paquete
5. **Crea booking**: Inserta en tabla `bookings` con límite de cancelación
6. **Actualiza calendario**: Refleja la nueva ocupación

## 🔄 Flujo de Cancelación

1. **Usuario solicita cancelar**: Desde sus reservas o calendario
2. **Verifica límite**: Llama `can_cancel_booking()` (12h antes)
3. **Si es válido**: Cambia status a 'cancelled' 
4. **Devuelve bono**: Llama `cancel_class()` para restituir al usuario
5. **Actualiza calendario**: Libera el espacio para otros usuarios

## 🎨 UI/UX Features

### Calendario Visual
- **Eventos colorados**: Verde (disponible) / Rojo (completo)
- **Información en tiempo real**: Espacios disponibles/total
- **Responsive**: Funciona en móvil y desktop

### Modal de Reserva
- **Información completa**: Tipo, duración, descripción, horario
- **Estado claro**: Disponible/Completo con iconos
- **Validaciones**: No permite reservar si no hay espacio o bonos
- **Loading states**: Feedback visual durante operaciones

## 📊 Datos de Ejemplo

El archivo SQL incluye:
- **4 tipos de clase**: MAT-FUNCIONAL, REFORMER, YOGA, HIIT
- **20+ sesiones**: Distribuidas en la próxima semana
- **Horarios realistas**: Mañana, tarde y noche
- **Capacidades variadas**: 8-15 espacios por clase

## 🔧 Configuración

### Prerrequisitos
1. Angular 17+ 
2. Supabase configurado
3. FullCalendar instalado
4. Sistema de cartera existente funcionando

### Instalación
1. Ejecutar `database/class_sessions_setup.sql` en Supabase
2. Verificar que el servicio `ClassSessionsService` esté importado
3. Asegurar que las rutas incluyan el calendario
4. Probar con `ng serve`

## 🔮 Próximas Mejoras Sugeridas

1. **Vista de reservas del usuario**: Panel personal con sus clases
2. **Notificaciones**: Recordatorios por email/push antes de clases  
3. **Lista de espera**: Sistema de cola cuando la clase está llena
4. **Filtros avanzados**: Por tipo de clase, instructor, horario
5. **Estadísticas**: Clases más populares, ocupación promedio
6. **Reservas recurrentes**: Permitir reservar clases semanales/mensuales

## 🐛 Testing

Para probar el sistema:
1. Crear usuarios con bonos en el sistema de cartera
2. Ejecutar el SQL de ejemplo para tener clases disponibles
3. Navegar al calendario y hacer clic en una clase
4. Verificar que se puede reservar y que consume el bono
5. Probar cancelación dentro y fuera del límite de 12h

---

✨ **¡El sistema está listo para usar!** El calendario muestra las clases, permite reservar usando el sistema de bonos existente, y maneja cancelaciones con las reglas de negocio correctas.
