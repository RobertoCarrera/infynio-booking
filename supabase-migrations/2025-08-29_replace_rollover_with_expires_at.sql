-- Migration: Replace remaining references to next_rollover_reset_date / rollover_classes_remaining
-- This migration updates trigger and function definitions to rely on expires_at only
-- and removes references to the dropped rollover columns from DB functions.

BEGIN;

-- 1) Trigger: apply expiry logic on user_packages
CREATE OR REPLACE FUNCTION public.tg_user_packages_apply_expiry_logic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_is_single boolean;
  v_base_date timestamptz;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    SELECT is_single_class INTO v_is_single FROM packages WHERE id = NEW.package_id;
  ELSE
    v_is_single := NULL;
  END IF;

  IF v_is_single IS TRUE THEN
    -- For single-class packages: do not set a monthly expiry; keep admin-defined expires_at
    -- Leave NEW.expires_at untouched when provided; do not reference next_rollover_reset_date
    NULL;
  ELSIF v_is_single IS FALSE THEN
    -- For monthly packages: ensure expires_at exists and defaults to end-of-month
    IF NEW.expires_at IS NULL THEN
      v_base_date := COALESCE(NEW.activation_date, NEW.purchase_date, now())::timestamptz;
      NEW.expires_at := (date_trunc('month', v_base_date) + interval '1 month -1 day')::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- 2) Replace create_booking_with_validations to use expires_at only
CREATE OR REPLACE FUNCTION public.create_booking_with_validations(
  p_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamp with time zone DEFAULT now()
)
RETURNS TABLE(success boolean, booking_id integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_current_bookings int;
  v_user_package_id int;
  v_classes_remaining int;
  v_new_status text;
  v_booking_id int;
  v_is_personal boolean;
  v_is_personal_flag boolean; -- nullable flag from class_types
  v_ct_name text; -- class type name for heuristic fallback
BEGIN
  SELECT id, class_type_id, capacity, schedule_date, schedule_time
    INTO v_session
  FROM class_sessions
  WHERE id = p_class_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::int, 'Sesión no encontrada'::text;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_current_bookings
  FROM bookings
  WHERE class_session_id = p_class_session_id AND status = 'CONFIRMED';

  IF v_current_bookings >= COALESCE(v_session.capacity, 0) THEN
    RETURN QUERY SELECT false, NULL::int, 'La clase está completa'::text;
    RETURN;
  END IF;

  -- Determine personalness from class_types if available; otherwise use a name heuristic
  SELECT ct.is_personal, ct.name INTO v_is_personal_flag, v_ct_name
  FROM class_types ct
  WHERE ct.id = v_session.class_type_id;

  IF v_is_personal_flag IS NOT NULL THEN
    v_is_personal := v_is_personal_flag;
  ELSE
    v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
  END IF;

  -- Candidate packages: rely on expires_at only (single and monthly semantics encoded below)
  WITH candidates AS (
    SELECT
      up.id,
      up.current_classes_remaining,
      up.expires_at,
      up.purchase_date,
      pa.class_type,
      pa.is_personal,
      pa.is_single_class,
      EXISTS (
        SELECT 1 FROM package_allowed_class_types pact
        WHERE pact.package_id = pa.id AND pact.class_type_id = v_session.class_type_id
      ) AS has_mapping
    FROM user_packages up
    JOIN packages pa ON pa.id = up.package_id
    WHERE up.user_id = p_user_id
      AND up.status = 'active'
      AND up.current_classes_remaining > 0
      AND pa.is_personal = v_is_personal
  ), filtered AS (
    SELECT c.*
    FROM candidates c
    WHERE (
      c.class_type = v_session.class_type_id
      OR c.has_mapping
    )
    AND (
      -- Single-class: valid if not expired by expires_at (or no expiry set)
      (c.is_single_class AND (c.expires_at IS NULL OR v_session.schedule_date <= c.expires_at))
      -- Monthly: valid if its expires_at falls in the same month/year as the session
      OR (NOT c.is_single_class
            AND c.expires_at IS NOT NULL
            AND date_part('year', c.expires_at) = date_part('year', v_session.schedule_date)
            AND date_part('month', c.expires_at) = date_part('month', v_session.schedule_date)
            AND (c.expires_at IS NULL OR v_session.schedule_date <= c.expires_at)
        )
    )
    ORDER BY c.purchase_date ASC
    LIMIT 1
  )
  SELECT id, current_classes_remaining INTO v_user_package_id, v_classes_remaining FROM filtered;

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::int, 'No tienes un bono válido para este mes y tipo de clase'::text;
    RETURN;
  END IF;

  INSERT INTO bookings (
    user_id,
    class_session_id,
    booking_date_time,
    status,
    is_from_package,
    cancellation_time,
    payment_id,
    user_package_id
  ) VALUES (
    p_user_id,
    p_class_session_id,
    COALESCE(p_booking_date_time, now()),
    'CONFIRMED',
    TRUE,
    NULL,
    NULL,
    v_user_package_id
  ) RETURNING id INTO v_booking_id;

  v_classes_remaining := v_classes_remaining - 1;
  v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

  UPDATE user_packages
  SET current_classes_remaining = v_classes_remaining,
      status = v_new_status
  WHERE id = v_user_package_id;

  RETURN QUERY SELECT true, v_booking_id, 'Reserva creada correctamente'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::int, ('Error: ' || SQLERRM)::text;
END;
$function$;

-- 3) Replace admin_assign_package_to_user to avoid inserting rollover_classes_remaining
CREATE OR REPLACE FUNCTION public.admin_assign_package_to_user(
  p_user_id integer,
  p_package_id integer,
  p_purchase_date timestamp with time zone DEFAULT now(),
  p_activation_date timestamp with time zone DEFAULT now(),
  p_current_classes_remaining integer DEFAULT NULL::integer,
  p_monthly_classes_limit integer DEFAULT NULL::integer,
  p_expires_at date DEFAULT NULL::date
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoker uuid := auth.uid();
  v_role int;
  v_pkg_class_count int;
  v_user_package_id int;
  v_classes int;
BEGIN
  IF v_invoker IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role_id INTO v_role FROM users WHERE auth_user_id = v_invoker;
  IF v_role IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT class_count INTO v_pkg_class_count FROM packages WHERE id = p_package_id;
  IF v_pkg_class_count IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Package not found');
  END IF;

  v_classes := COALESCE(p_current_classes_remaining, v_pkg_class_count);

  INSERT INTO user_packages (
    user_id, package_id, purchase_date, activation_date,
    current_classes_remaining, monthly_classes_limit, status,
    classes_used_this_month, expires_at
  ) VALUES (
    p_user_id, p_package_id, p_purchase_date, p_activation_date,
    v_classes, p_monthly_classes_limit, 'active',
    0, p_expires_at
  ) RETURNING id INTO v_user_package_id;

  RETURN json_build_object('success', true, 'user_package_id', v_user_package_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$function$;

COMMIT;

-- Notes:
-- * Run this migration in staging first. It replaces definitions only; it does not alter table columns.
-- * After applying, re-run any other migrations that drop the old columns if not already executed.
