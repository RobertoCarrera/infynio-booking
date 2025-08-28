-- Enforce admin-defined expiry for single-class packages and fix booking selection
-- 1) BEFORE INSERT/UPDATE trigger on user_packages: clear next_rollover_reset_date for single-class packages
-- 2) Update create_booking_with_validations to use expires_at for singles and monthly window for monthly packages

BEGIN;

-- 1) Trigger function to apply expiry logic on user_packages
CREATE OR REPLACE FUNCTION public.tg_user_packages_apply_expiry_logic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_is_single boolean;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    SELECT is_single_class INTO v_is_single FROM packages WHERE id = NEW.package_id;
  ELSE
    v_is_single := NULL;
  END IF;

  IF v_is_single IS TRUE THEN
    -- For single-class packages: do not drive expiry by month; keep admin-defined expires_at
    NEW.next_rollover_reset_date := NULL;
    -- Do NOT override NEW.expires_at
  ELSIF v_is_single IS FALSE THEN
    -- For monthly packages: ensure next_rollover_reset_date exists if not provided
    IF NEW.next_rollover_reset_date IS NULL THEN
      NEW.next_rollover_reset_date := (
        date_trunc('month', COALESCE(NEW.activation_date, NEW.purchase_date, now())::timestamptz)
        + interval '1 month -1 day'
      )::date;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Drop existing trigger if any, then create it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='user_packages' AND t.tgname='tr_user_packages_apply_expiry_logic'
  ) THEN
    DROP TRIGGER tr_user_packages_apply_expiry_logic ON public.user_packages;
  END IF;
END $$;

CREATE TRIGGER tr_user_packages_apply_expiry_logic
BEFORE INSERT OR UPDATE ON public.user_packages
FOR EACH ROW EXECUTE FUNCTION public.tg_user_packages_apply_expiry_logic();

-- 2) Update normal booking creation to respect single vs monthly package windows
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

  WITH candidates AS (
    SELECT
      up.id,
      up.current_classes_remaining,
      up.next_rollover_reset_date,
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
      -- Monthly: valid for the month of the session
    OR (NOT c.is_single_class
          AND c.next_rollover_reset_date IS NOT NULL
          AND date_part('year', c.next_rollover_reset_date) = date_part('year', v_session.schedule_date)
          AND date_part('month', c.next_rollover_reset_date) = date_part('month', v_session.schedule_date)
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
  v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'expired' ELSE 'active' END;

  UPDATE user_packages
  SET current_classes_remaining = v_classes_remaining,
      status = v_new_status
  WHERE id = v_user_package_id;

  RETURN QUERY SELECT true, v_booking_id, 'Reserva creada correctamente'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::int, ('Error: ' || SQLERRM)::text;
END;
$function$;

COMMIT;
