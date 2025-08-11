# Supabase: migraciones y configuración

Este proyecto incluye SQL listo para reforzar atomicidad, seguridad y rendimiento. Aquí tienes los pasos para aplicarlo y configurar CORS en la Edge Function `get-class-sessions`.

## 1) Aplicar migraciones SQL

Archivos:
- `supabase-migrations/2025-08-11-secure-bookings-and-sessions.sql`
- `supabase-migrations/2025-08-11-optional-indexes-and-compat.sql`
- `supabase-migrations/2025-08-11-security-hardening-auth-and-indexes.sql`
- `supabase-migrations/2025-08-11-admin-delete-user.sql`
- `supabase-migrations/2025-08-11-user-deactivation.sql`

Opciones para ejecutar:

- Via Supabase Studio (SQL Editor): copia/pega cada archivo y ejecútalo en el esquema `public`.
- Via CLI (local):
  1. Asegúrate de tener el CLI (`npm i -D supabase`).
  2. Exporta las credenciales del proyecto (SUPABASE_ACCESS_TOKEN si usas `db remote commit`).
  3. Ejecuta cada script con tu método preferido (por ejemplo, pegándolo en el SQL editor).

Orden recomendado:
1. `2025-08-11-secure-bookings-and-sessions.sql`
2. `2025-08-11-optional-indexes-and-compat.sql`
3. `2025-08-11-security-hardening-auth-and-indexes.sql`
4. `2025-08-11-admin-delete-user.sql`
5. `2025-08-11-user-deactivation.sql`

Qué incluyen:
- Trigger para normalizar `bookings.status` en mayúsculas.
- RPCs:
  - `create_booking_with_validations` (RETURNS TABLE success, booking_id, message)
  - `cancel_booking_with_refund` (JSON) con cutoff de 12h (usa `cancellation_time`)
  - `update_session_time` (JSON) que recalcula `cancellation_time` de bookings.
  - Wrappers de compatibilidad (`create_booking_with_validations_json`, `create_booking_from_package`, `cancel_booking_safe`).
- Índices útiles e `updated_at` + trigger en `user_packages`.
 - Endurecimiento extra (archivo 3):
   - Comprobaciones de identidad con `auth.uid()` (solo admin puede mover sesiones; usuario o admin puede crear/cancelar sus reservas).
   - Índices extra: único parcial anti-duplicados en `bookings` y por fecha en `class_sessions`.
   - Trigger para impedir bajar `capacity` por debajo de confirmados.
   - Eliminación segura de usuario (archivo 4):
     - `admin_delete_user(p_auth_user_id uuid)` como SECURITY DEFINER que borra bookings y user_packages del usuario y luego su fila en `users`.
   - Desactivación/React. de usuarios (archivo 5):
     - Columnas nuevas en `users`: `is_active`, `deactivated_at`, `reactivated_at`, `last_deactivation_reason`, `last_reactivation_reason`.
     - Tabla `user_status_events` para auditoría.
     - RPCs: `admin_deactivate_user(p_user_id bigint, p_reason text)`, `admin_reactivate_user(p_user_id bigint, p_reason text)`.

Post-verificación rápida:
- Prueba `select * from create_booking_with_validations(123, 456, now());`
- Prueba `select * from cancel_booking_with_refund(789, 123);`
- Prueba `select * from update_session_time(456, current_date, '10:00'::time);`
 - Si usas tokens de un usuario no admin, `update_session_time` debe devolver error de permisos.
 - Prueba `select admin_delete_user('AUTH_UUID_DEL_USUARIO');` debe devolver success=true y contadores de filas borradas.
 - Prueba desactivación/reactivación:
   - `select * from admin_deactivate_user(123, 'baja temporal');`
   - `select * from admin_reactivate_user(123, 'regreso');`

## 2) Configurar CORS en Edge Function

Archivo: `supabase/functions/get-class-sessions/index.ts`

Variables de entorno recomendadas en el proyecto Supabase (Edge Functions):
- `ALLOW_ALL_ORIGINS=false`
- `ALLOWED_ORIGINS=https://tudominio.com,https://staging.tudominio.com,http://localhost:4200`

Con `ALLOW_ALL_ORIGINS=false`, sólo los orígenes listados en `ALLOWED_ORIGINS` podrán hacer GET. Si prefieres abrir todo (no recomendado en prod): `ALLOW_ALL_ORIGINS=true`.

Además, actualiza/crea también:
- `supabase/functions/invite-user/index.ts` (POST) – usa Service Role y comprueba rol admin via tabla `users`.
- `supabase/functions/delete-user/index.ts` (POST) – usa Service Role y comprueba rol admin.

Variables adicionales opcionales:
- `INVITE_REDIRECT_TO=https://tudominio.com/reset-password` (prioridad sobre el `origin`).

## 3) Notas de frontend

- El servicio `ClassSessionsService` ya utiliza las RPCs anteriores.
- El calendario del admin refresca sólo el evento afectado al moverlo/añadir/eliminar asistentes.
- Quedan eliminadas recargas completas innecesarias del calendario.

## 4) Troubleshooting

- Si una RPC no existe, el front hace fallback puntual; aplica las migraciones para evitarlo.
- Si se bloquea cancelar por cutoff: revisa `bookings.cancellation_time`.
- Si no ves cambios tras mover evento: verifica que `update_session_time` existe y que el front llama sólo fecha/hora.

## 5) Verificación rápida de Edge Functions

Asumiendo que ya hiciste deploy de las Edge Functions y configuraste `ALLOW_ALL_ORIGINS=false` y `ALLOWED_ORIGINS`:

1) get-class-sessions (GET)
  - Con un token de usuario válido, haz GET a `get-class-sessions?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` desde un origen permitido.
  - Esperado: `{ success: true, data: [...], count: n }`.
  - Prueba rango inválido (> 400 días): debe responder `400 Invalid date range`.
  - Prueba desde un origen NO permitido: debe responder `403 Origin not allowed`.

2) invite-user (POST)
  - Envía `{ "email": "nuevo@dominio.com" }` con Authorization: Bearer <token de admin> desde un origen permitido.
  - Esperado: `200` con `message: "Invitación enviada..."`.
  - Si se repite en poco tiempo: `429` con `error: RATE_LIMIT_EXCEEDED`.
  - Si el usuario ya existe/invitado: `200` con `status: "already_exists"`.
  - Si no eres admin: `403 Admin role required`.
  - Si falta `Authorization` o token inválido: `401`.

3) delete-user (POST)
  - Envía `{ "auth_user_id": "uuid-del-usuario" }` con Authorization: Bearer <token de admin> desde un origen permitido.
  - Esperado: `200 { message: "User <uuid> deleted" }`.
  - Si no eres admin: `403 Admin role required`.
  - Si falta `auth_user_id`: `400`.
  - Errores de borrado deben retornar `400` con detalle.
