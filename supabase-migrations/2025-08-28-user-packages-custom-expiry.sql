-- Custom expiry per user package: allow admin-defined expiration per bono
-- Adds user_packages.expires_at, backfills from next_rollover_reset_date if present,
-- updates admin_create_booking_for_user to respect expiry, and provides admin RPCs
-- to assign a package with a chosen expiry and to update expiry later.

BEGIN;

-- 1) Schema change: expires_at on user_packages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_packages' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.user_packages ADD COLUMN expires_at date;
  END IF;
END $$;

-- Optional index for queries using expiry
CREATE INDEX IF NOT EXISTS user_packages_expires_at_idx ON public.user_packages (expires_at);

-- Optional check: expiry can be NULL or >= activation/purchase date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_packages_expires_at_check'
  ) THEN
    ALTER TABLE public.user_packages
      ADD CONSTRAINT user_packages_expires_at_check
      CHECK (
        expires_at IS NULL
        OR (activation_date IS NULL AND expires_at >= purchase_date::date)
        OR (activation_date IS NOT NULL AND expires_at >= activation_date::date)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_packages' AND column_name = 'next_rollover_reset_date'
  ) THEN
    UPDATE public.user_packages
       SET expires_at = next_rollover_reset_date
     WHERE expires_at IS NULL AND next_rollover_reset_date IS NOT NULL;
  END IF;
END;
$$;

-- 3) RPC: Admin assigns package to user with explicit expiry
CREATE OR REPLACE FUNCTION public.admin_assign_package_to_user(
  p_user_id integer,
  p_package_id integer,
  p_purchase_date timestamp with time zone DEFAULT now(),
  p_activation_date timestamp with time zone DEFAULT now(),
  p_current_classes_remaining integer DEFAULT NULL,
  p_monthly_classes_limit integer DEFAULT NULL,
  p_expires_at date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
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
    classes_used_this_month, rollover_classes_remaining, expires_at
  ) VALUES (
    p_user_id, p_package_id, p_purchase_date, p_activation_date,
    v_classes, p_monthly_classes_limit, 'active',
    0, 0, p_expires_at
  ) RETURNING id INTO v_user_package_id;

  RETURN json_build_object('success', true, 'user_package_id', v_user_package_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$fn$;

-- 4) RPC: Admin updates expiry on an existing user_package
CREATE OR REPLACE FUNCTION public.admin_set_user_package_expiry(
  p_user_package_id integer,
  p_expires_at date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_invoker uuid := auth.uid();
  v_role int;
BEGIN
  IF v_invoker IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT role_id INTO v_role FROM users WHERE auth_user_id = v_invoker;
  IF v_role IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE user_packages
     SET expires_at = p_expires_at,
         updated_at = now()
   WHERE id = p_user_package_id;

  RETURN json_build_object('success', true, 'message', 'Expiry updated');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$fn$;

-- 5) Update booking creation to respect expiry
CREATE OR REPLACE FUNCTION public.admin_create_booking_for_user(
  p_target_user_id integer,
  p_class_session_id integer,
  p_booking_date_time timestamp with time zone DEFAULT now()
)
RETURNS TABLE(success boolean, booking_id integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity INTEGER;
  v_current_bookings INTEGER;
  v_user_package_id INTEGER;
  v_booking_id INTEGER;
  v_classes_remaining INTEGER;
  v_classes_used INTEGER;
  v_new_status TEXT;
  v_expires_at date;
  v_session_date date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE user_id = p_target_user_id 
      AND class_session_id = p_class_session_id 
      AND status = 'CONFIRMED'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario ya está inscrito en esta clase'::TEXT;
    RETURN;
  END IF;

  SELECT capacity INTO v_capacity FROM class_sessions WHERE id = p_class_session_id;
  SELECT COUNT(*) INTO v_current_bookings FROM bookings WHERE class_session_id = p_class_session_id AND status = 'CONFIRMED';
  IF v_current_bookings >= v_capacity THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'La clase está completa'::TEXT;
    RETURN;
  END IF;

  -- Look up the session date for consistent expiry checks
  SELECT schedule_date INTO v_session_date FROM class_sessions WHERE id = p_class_session_id;

  -- Select candidate package locking it to avoid concurrent claims. Prefer packages with nearest expires_at.
  SELECT up.id, up.current_classes_remaining, up.classes_used_this_month, up.expires_at
    INTO v_user_package_id, v_classes_remaining, v_classes_used, v_expires_at
  FROM user_packages up
  WHERE up.user_id = p_target_user_id
    AND up.status = 'active'
    AND up.current_classes_remaining > 0
    AND (up.expires_at IS NULL OR COALESCE(v_session_date, now()::date) <= up.expires_at)
  ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- We lock the chosen user_package above and will decrement it after inserting the booking
  -- to avoid double-decrement that could trigger nonnegative constraint violations.

  IF v_user_package_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Usuario no tiene bonos disponibles'::TEXT;
    RETURN;
  END IF;

  BEGIN
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
      p_target_user_id,
      p_class_session_id,
      p_booking_date_time,
      'CONFIRMED',
      TRUE,
      NULL,
      NULL,
      v_user_package_id
    ) RETURNING id INTO v_booking_id;

    v_classes_remaining := v_classes_remaining - 1;
    v_classes_used := v_classes_used + 1;
  -- Determine new status:
  -- 1) If the package has already passed its expiry date for this session, mark as 'expired'.
  -- 2) Else if classes have been depleted (<= 0) but not yet expired, mark as 'depleted'.
  -- 3) Otherwise keep as 'active'.
  v_new_status := CASE
    WHEN v_expires_at IS NOT NULL AND COALESCE(v_session_date, now()::date) > v_expires_at THEN 'expired'
    WHEN v_classes_remaining <= 0 THEN 'depleted'
    ELSE 'active'
  END;

    UPDATE user_packages
    SET 
      current_classes_remaining = v_classes_remaining,
      classes_used_this_month = v_classes_used,
      status = v_new_status,
      updated_at = now()
    WHERE id = v_user_package_id;

    RETURN QUERY SELECT TRUE, v_booking_id, 'Reserva creada correctamente (admin)'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, ('Error: ' || SQLERRM)::TEXT;
  END;
END;
$function$;

COMMIT;
