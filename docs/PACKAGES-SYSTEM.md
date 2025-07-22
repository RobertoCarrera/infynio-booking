# Sistema de Cartera de Paquetes - Mars Studio

Este documento explica cómo implementar el sistema de cartera de paquetes para el estudio de Pilates con gestión administrativa.

## 🏗️ Estructura del Sistema

### 📊 Base de Datos (Supabase)

1. **Tabla `packages`**: Define los paquetes disponibles
2. **Tabla `user_packages`**: Gestiona los paquetes asignados por administradores
3. **Funciones SQL**: Para usar y cancelar clases automáticamente

### 🔧 Servicios Angular

1. **PackagesService**: Gestión completa de paquetes y clases + métodos de administración
2. **BookingsService**: Integrado para descontar/devolver clases automáticamente
3. **CarteraInfoComponent**: Muestra información de la cartera del usuario

### 🎨 Componentes

1. **CarteraInfoComponent**: Widget elegante en el menú superior derecha
2. **AdminUserPackagesComponent**: Interfaz para que admins gestionen clases de usuarios

## 📋 Pasos de Implementación

### 1. Configurar Base de Datos

⚠️ **IMPORTANTE**: Ejecuta el archivo corregido para evitar errores:

```sql
-- Ejecutar: supabase-migrations/packages-system-fixed.sql
```

### 2. Datos de Prueba (Opcional)

Para insertar datos de prueba, descomenta y ajusta el final del archivo SQL:

```sql
-- Ajustar el user_id en la sección de datos de prueba
```

### 3. Verificar Compilación

```bash
npm run build
```

### 4. Probar el Sistema

1. **Iniciar sesión** como administrador
2. **Ir a Admin > Gestión de Clases**
3. **Asignar clases** a usuarios con los botones +/-
4. **Ver cartera** - Los usuarios verán sus clases en "Mi Cartera"
5. **Reservar clases** - Se descontarán automáticamente
6. **Cancelar reservas** - Se devolverán automáticamente

## 🎯 Funcionalidades Implementadas

### ✅ Sistema de Administración
- **Interfaz intuitiva** para gestionar clases de usuarios
- **Botones +/-** para añadir/quitar clases individuales
- **Botones rápidos** para añadir 4, 8 o 12 clases de una vez
- **Búsqueda de usuarios** por email o nombre
- **Vista en tiempo real** de las clases disponibles

### ✅ Cartera de Usuario
- Muestra clases disponibles por tipo (MAT FUNCIONAL / REFORMER)
- Diferencia entre clases del mes actual y acumuladas
- Actualización en tiempo real

### ✅ Integración Automática
- Uso automático de clases al reservar
- Validación de clases disponibles antes de reservar
- Devolución de clases al cancelar reservas

## 🔒 Seguridad Implementada

- **Row Level Security (RLS)** habilitado
- **Políticas de acceso** por usuario y administrador
- **Validación de permisos** en todas las operaciones

## 💾 Estructura de Datos

### Packages
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(100) - Nombre del paquete
- class_type: VARCHAR(20) - 'MAT_FUNCIONAL' | 'REFORMER'
- class_count: INTEGER - Número de clases
- price: DECIMAL(10,2) - Precio en euros (solo referencia)
- is_single_class: BOOLEAN - Si es clase suelta
- is_personal: BOOLEAN - Si es clase personalizada
```

### User Packages
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER - ID del usuario
- package_id: INTEGER - ID del paquete (puede ser NULL para paquetes admin)
- current_classes_remaining: INTEGER - Clases totales disponibles
- monthly_classes_limit: INTEGER - Límite mensual
- classes_used_this_month: INTEGER - Clases usadas este mes
- rollover_classes_remaining: INTEGER - Clases acumuladas
- status: VARCHAR(20) - 'active' | 'expired' | 'suspended'
```

## �‍💼 Interfaz de Administración

### Navegación
- **Admin > Usuarios**: Lista de usuarios
- **Admin > Gestión de Clases**: Asignar/quitar clases
- **Admin > Invitar Usuario**: Invitar nuevos usuarios

### Controles por Usuario
- **Visualización clara** de clases disponibles por tipo
- **Controles individuales**: +1/-1 clase
- **Acciones rápidas**: +4, +8, +12 clases
- **Búsqueda en tiempo real** por nombre o email

## 🚀 Flujo de Trabajo

1. **Admin asigna clases** → Usuario las ve en su cartera
2. **Usuario reserva clase** → Se descuenta automáticamente
3. **Usuario cancela reserva** → Se devuelve automáticamente
4. **Fin de mes** → Clases no usadas pasan a "acumuladas"

## 🐛 Troubleshooting

### Error: "relation 'profiles' does not exist"
✅ **Solucionado** - Usar `packages-system-fixed.sql` en lugar del archivo original

### Error: "No hay clases disponibles"
- Verificar que el admin haya asignado clases al usuario
- Comprobar que las clases no hayan expirado

### Error: Compilación TypeScript
- Verificar que todos los imports estén correctos
- Comprobar que los tipos coincidan (User vs UserWithPackages)

## 📞 Cambios Realizados

### Correcciones
- ✅ Eliminado sistema de compra (no necesario)
- ✅ Corregido error de tabla `profiles` → `users`
- ✅ Creada interfaz de administración completa
- ✅ Ajustado modelo de datos para administración

### Funcionalidades Eliminadas
- ❌ Componente de tienda de paquetes
- ❌ Sistema de pago
- ❌ Compra automática de paquetes

### Nuevas Funcionalidades
- ✅ Gestión administrativa de clases
- ✅ Interfaz intuitiva con +/- 
- ✅ Acciones rápidas para asignar múltiples clases
- ✅ Búsqueda y filtrado de usuarios
