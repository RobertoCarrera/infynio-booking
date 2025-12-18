DO $$
DECLARE
    r RECORD;
    v_new_package_id INTEGER;
    v_new_classes_remaining INTEGER;
    v_old_classes_remaining INTEGER;
    v_session_class_type_id INTEGER;
    v_session_date DATE;
    v_is_personal BOOLEAN;
    v_is_personal_flag BOOLEAN;
    v_ct_name TEXT;
BEGIN
    -- Loop through invalid bookings for future classes
    FOR r IN 
        SELECT 
            b.id AS booking_id,
            b.user_id,
            b.user_package_id AS old_package_id,
            b.class_session_id,
            cs.schedule_date,
            cs.class_type_id,
            u.email
        FROM 
            public.bookings b
        JOIN 
            public.class_sessions cs ON b.class_session_id = cs.id
        JOIN 
            public.user_packages up ON b.user_package_id = up.id
        JOIN 
            public.users u ON b.user_id = u.id
        WHERE 
            b.status = 'CONFIRMED'
            AND up.expires_at IS NOT NULL
            AND cs.schedule_date > up.expires_at
            AND cs.schedule_date >= CURRENT_DATE -- Only fix future/current bookings
    LOOP
        RAISE NOTICE 'Processing invalid booking ID % for user % on date %', r.booking_id, r.email, r.schedule_date;

        -- Get session details needed for package matching
        SELECT class_type_id, schedule_date INTO v_session_class_type_id, v_session_date
        FROM class_sessions WHERE id = r.class_session_id;

        -- Determine personalness (logic copied from create_booking_with_validations)
        SELECT ct.is_personal, ct.name INTO v_is_personal_flag, v_ct_name
        FROM class_types ct
        WHERE ct.id = v_session_class_type_id;

        IF v_is_personal_flag IS NOT NULL THEN
            v_is_personal := v_is_personal_flag;
        ELSE
            v_is_personal := (v_ct_name ILIKE '%personal%' OR v_ct_name ILIKE '%personalizada%' OR v_ct_name ILIKE '%personalizado%');
        END IF;

        -- Try to find a valid alternative package
        v_new_package_id := NULL;
        
        SELECT up.id INTO v_new_package_id
        FROM user_packages up
        JOIN packages pa ON pa.id = up.package_id
        WHERE up.user_id = r.user_id
          AND up.status = 'active'
          AND up.current_classes_remaining > 0
          AND pa.is_personal = v_is_personal
          AND (
            pa.class_type = v_session_class_type_id
            OR EXISTS (
              SELECT 1 FROM package_allowed_class_types pact
              WHERE pact.package_id = pa.id AND pact.class_type_id = v_session_class_type_id
            )
          )
          AND (up.expires_at IS NULL OR v_session_date <= up.expires_at)
        ORDER BY (up.expires_at IS NULL) ASC, up.expires_at ASC, up.purchase_date ASC
        LIMIT 1;

        IF v_new_package_id IS NOT NULL THEN
            RAISE NOTICE 'Found valid alternative package ID %', v_new_package_id;

            -- 1. Refund old package
            UPDATE user_packages
            SET current_classes_remaining = current_classes_remaining + 1
            WHERE id = r.old_package_id;

            -- 2. Deduct from new package
            UPDATE user_packages
            SET current_classes_remaining = current_classes_remaining - 1
            WHERE id = v_new_package_id
            RETURNING current_classes_remaining INTO v_new_classes_remaining;

            -- 3. Update status of new package if depleted
            IF v_new_classes_remaining <= 0 THEN
                UPDATE user_packages SET status = 'depleted' WHERE id = v_new_package_id;
            END IF;

            -- 4. Update booking to point to new package
            UPDATE bookings
            SET user_package_id = v_new_package_id
            WHERE id = r.booking_id;
            
        ELSE
            RAISE NOTICE 'No valid package found. Cancelling booking ID %', r.booking_id;

            -- 1. Refund old package (reverse the invalid deduction)
            UPDATE user_packages
            SET current_classes_remaining = current_classes_remaining + 1
            WHERE id = r.old_package_id;

            -- 2. Cancel booking
            UPDATE bookings
            SET status = 'CANCELLED',
                cancellation_time = NOW()
            WHERE id = r.booking_id;
        END IF;

    END LOOP;
END $$;
