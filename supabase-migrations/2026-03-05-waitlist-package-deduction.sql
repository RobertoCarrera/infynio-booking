-- Migration to add user_package_id to waiting_list and update join logic

-- 1. Add user_package_id column to waiting_list
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waiting_list' AND column_name = 'user_package_id') THEN
        ALTER TABLE public.waiting_list ADD COLUMN user_package_id INTEGER REFERENCES public.user_packages(id);
    END IF;
END $$;

-- 2. Update join_waiting_list_v2 to handle package deduction
CREATE OR REPLACE FUNCTION public.join_waiting_list_v2(
    p_user_id INTEGER, 
    p_class_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_current_auth_uid UUID;
    v_target_auth_uid UUID;
    v_result JSONB;
    v_session RECORD;
    v_capacity INTEGER;
    v_user_package_id INTEGER;
    v_classes_remaining INTEGER;
    v_is_personal BOOLEAN;
    v_is_personal_flag BOOLEAN;
    v_ct_name TEXT;
    v_new_status TEXT;
BEGIN
    -- 1. Security Check
    v_current_auth_uid := auth.uid();
    
    SELECT auth_user_id INTO v_target_auth_uid
    FROM public.users
    WHERE id = p_user_id;

    IF v_target_auth_uid IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Allow if self or admin
    IF v_current_auth_uid != v_target_auth_uid AND 
       NOT EXISTS (
           SELECT 1 
           FROM public.users u
           JOIN public.role r ON u.role_id = r.id
           WHERE u.auth_user_id = v_current_auth_uid 
           AND r.name = 'admin'
       ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only add yourself to the waiting list';
    END IF;

    -- 2. Check if already booked or waiting
    IF EXISTS (
        SELECT 1 FROM bookings 
        WHERE user_id = p_user_id 
          AND class_session_id = p_class_session_id 
          AND status = 'CONFIRMED'
    ) THEN
        RAISE EXCEPTION 'User is already booked for this session';
    END IF;

    -- 3. Get Session Info
    SELECT cs.id, cs.class_type_id, cs.schedule_date, cs.capacity, ct.name as class_type_name, ct.is_personal
    INTO v_session
    FROM class_sessions cs
    JOIN class_types ct ON cs.class_type_id = ct.id
    WHERE cs.id = p_class_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    -- Determine personalness (same logic as create_booking)
    v_is_personal := v_session.is_personal;
    v_ct_name := v_session.class_type_name;
    
    IF v_is_personal IS NULL THEN
         v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
    END IF;

    -- 4. Find valid package
    SELECT up.id, up.current_classes_remaining
    INTO v_user_package_id, v_classes_remaining
    FROM user_packages up
    JOIN packages pa ON pa.id = up.package_id
    WHERE up.user_id = p_user_id
      AND up.status = 'active'
      AND up.current_classes_remaining > 0
      AND pa.is_personal = v_is_personal
      AND (up.expires_at IS NULL OR v_session.schedule_date <= up.expires_at)
      AND (
        pa.class_type = v_session.class_type_id
        OR EXISTS (
          SELECT 1 FROM package_allowed_class_types pact
          WHERE pact.package_id = pa.id AND pact.class_type_id = v_session.class_type_id
        )
        OR (pa.class_type IN (2, 9) AND v_session.class_type_id = 28) -- Syncro special rule
      )
    ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_user_package_id IS NULL THEN
        RAISE EXCEPTION 'User has no valid package for this waitlist';
    END IF;

    -- 5. Deduct Credit
    v_classes_remaining := v_classes_remaining - 1;
    v_new_status := CASE WHEN v_classes_remaining <= 0 THEN 'depleted' ELSE 'active' END;

    UPDATE user_packages
    SET 
        current_classes_remaining = v_classes_remaining,
        classes_used_this_month = COALESCE(classes_used_this_month, 0) + 1,
        status = v_new_status
    WHERE id = v_user_package_id;

    -- 6. Insert into Waitlist
    INSERT INTO public.waiting_list (user_id, class_session_id, status, join_date_time, notification_sent, user_package_id)
    VALUES (p_user_id, p_class_session_id, 'waiting', NOW(), FALSE, v_user_package_id)
    ON CONFLICT (user_id, class_session_id)
    DO UPDATE SET 
        status = 'waiting', 
        join_date_time = NOW(),
        notification_sent = FALSE,
        user_package_id = EXCLUDED.user_package_id
    RETURNING to_jsonb(waiting_list.*) INTO v_result;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_waiting_list_v2(INTEGER, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_waiting_list_v2(INTEGER, BIGINT) TO service_role;

-- 3. Trigger/Function to refund credit on delete/expire
CREATE OR REPLACE FUNCTION public.process_waitlist_refund()
RETURNS TRIGGER AS $$
BEGIN
    -- Only refund if there was a package used and we are DELETING or updating status to cancelled/expired
    -- But NOT if we are promoting to booking (which implies we handle transition carefully outside)
    -- Actually, simpler: ALWAYS refund when removing from waitlist. 
    -- If we promote, we refund then book immediately.
    
    IF OLD.user_package_id IS NOT NULL THEN
        UPDATE user_packages
        SET 
            current_classes_remaining = current_classes_remaining + 1,
            status = 'active' -- Re-activate if it was depleted
        WHERE id = OLD.user_package_id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for delete
DROP TRIGGER IF EXISTS trg_waitlist_refund ON public.waiting_list;
CREATE TRIGGER trg_waitlist_refund
BEFORE DELETE ON public.waiting_list
FOR EACH ROW
EXECUTE FUNCTION public.process_waitlist_refund();

-- Update function to handle status modifications (optional, but good practice if we use soft deletes)
-- We usually DELETE from waitlist when booking or cancelling explicitly.

