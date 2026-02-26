-- Function to update recurring class sessions
-- Mode: 'single' (this event only), 'future' (this and following)

CREATE OR REPLACE FUNCTION public.update_recurring_schedule(
    p_session_id INTEGER,
    p_new_capacity INTEGER,
    p_new_start_time TIME WITHOUT TIME ZONE,
    p_new_class_type_id INTEGER,
    p_mode TEXT -- 'single' or 'future'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_target_day_of_week INTEGER;
    v_new_schedule_id INTEGER;
    v_new_end_time TIME;
    v_default_duration INTEGER;
    v_affected_count INTEGER := 0;
BEGIN
    -- Get session details
    SELECT * INTO v_session FROM class_sessions WHERE id = p_session_id;
    
    IF v_session IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Session not found');
    END IF;

    -- Validate mode
    IF p_mode NOT IN ('single', 'future') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid mode');
    END IF;

    -- CASE 1: Single event update
    IF p_mode = 'single' THEN
        -- When updating a single event, we just change the values.
        -- We keep the schedule_id (if any) because it's distinctiveness is marked by the date override.
        -- Optionally, we could set schedule_id = NULL to "detach" it completely, but keeping it
        -- allows "Reseting to original" features in future.
        UPDATE class_sessions
        SET 
            capacity = p_new_capacity,
            schedule_time = p_new_start_time,
            class_type_id = p_new_class_type_id
        WHERE id = p_session_id;
        
        RETURN json_build_object('success', true, 'message', 'Updated single session');
    END IF;

    -- CASE 2: Future events update (OVERWRITE ALL FUTURE ON SAME DAY-OF-WEEK)
    -- As per user request: "Si modifico la primera marcando 'esta y las siguientes', se deben cambiar todas"
    -- This implies we should find ALL future sessions that share the same characteristics (Day of Week + Time + Type)
    -- OR that share the same historical lineage (schedule_id chain).
    -- But since schedule_id chain might be broken by previous disjoint edits, we fallback to a broader match:
    -- Match all future sessions on the same Day of Week that seem to belong to the "series".
    -- Logic: 
    -- 1. Identify "Series" by Day of Week. (Assuming we are not shifting days).
    -- 2. Create a NEW schedule for valid_from = current_date.
    -- 3. Update ALL future sessions on that Day of Week that match the OLD time/type OR have the OLD schedule_id.
    
    IF p_mode = 'future' THEN
        v_target_day_of_week := EXTRACT(DOW FROM v_session.schedule_date);
        
        -- Get duration for new schedule
        SELECT duration_minutes INTO v_default_duration FROM class_types WHERE id = p_new_class_type_id;
        v_new_end_time := p_new_start_time + (v_default_duration || ' minutes')::INTERVAL;

        -- 1. Create NEW schedule
        INSERT INTO class_schedules (
            class_type_id, day_of_week, start_time, end_time, max_capacity, is_active, valid_from
        )
        VALUES (
            p_new_class_type_id,
            v_target_day_of_week,
            p_new_start_time,
            v_new_end_time,
            p_new_capacity,
            TRUE,
            v_session.schedule_date
        )
        RETURNING id INTO v_new_schedule_id;

        -- 2. Update future sessions regardless of their current deviated state
        -- Strategy: Update any session on the same DOW, >= date, that was linked to the OLD schedule
        -- OR (if they were detached) shares the same original start time/type.
        -- To be safe and meet "Overwrite Everything" expectation:
        -- We define the scope as: Any session on this DayOfWeek, after this Date, 
        -- that EITHER:
        --    a) Has the same schedule_id as the current session (if not null)
        --    b) Has the same class_type_id AND start_time (if manual detached)
        -- This covers the "detached" cases mentioned by user.
        
        -- If update involves finding ALL sessions of a series, even those that diverted:
        -- We need a reliable way to find the "siblings".
        -- If schedule_id exists, it's reliable.
        -- If NOT, we are stuck with time/type matching.
        
        UPDATE class_sessions
        SET 
            capacity = p_new_capacity,
            schedule_time = p_new_start_time,
            class_type_id = p_new_class_type_id,
            schedule_id = v_new_schedule_id
        WHERE 
            schedule_date >= v_session.schedule_date
            AND EXTRACT(DOW FROM schedule_date) = v_target_day_of_week
            AND (
                -- 1. Strongest Link: Same schedule_id
                (v_session.schedule_id IS NOT NULL AND schedule_id = v_session.schedule_id)
                OR 
                -- 2. Legacy/Detached Link: Same Class Type AND
                --    (Same Time as current session OR Same Time as original schedule)
                (
                    class_type_id = v_session.class_type_id 
                    AND (
                        schedule_time = v_session.schedule_time
                        OR
                        (v_session.schedule_id IS NOT NULL AND schedule_time = (SELECT start_time FROM class_schedules WHERE id = v_session.schedule_id))
                    )
                )
            );
            
        -- 3. Expire the old schedule(s)
        -- If the session had a schedule_id, expire it.
        IF v_session.schedule_id IS NOT NULL THEN
             UPDATE class_schedules
             SET valid_until = (v_session.schedule_date - INTERVAL '1 day')::DATE,
                 is_active = FALSE
             WHERE id = v_session.schedule_id;
        END IF;

        GET DIAGNOSTICS v_affected_count = ROW_COUNT;

        RETURN json_build_object(
            'success', true, 
            'message', 'Updated ' || v_affected_count || ' sessions and unified sequence',
            'new_schedule_id', v_new_schedule_id
        );
    END IF;
    
    RETURN json_build_object('success', false, 'error', 'Unreachable');
END;
$$;
