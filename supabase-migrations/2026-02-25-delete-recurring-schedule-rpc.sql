-- Function to DELETE recurring class sessions
-- Mode: 'single' (this event only), 'future' (this and following)
-- Logic similar to update_recurring_schedule but for deletion.

CREATE OR REPLACE FUNCTION public.delete_recurring_schedule(
    p_session_id INTEGER,
    p_mode TEXT -- 'single' or 'future'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_target_day_of_week INTEGER;
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

    -- CASE 1: Single event delete
    IF p_mode = 'single' THEN
        -- Delete bookings first
        DELETE FROM bookings WHERE class_session_id = p_session_id;
        DELETE FROM class_sessions WHERE id = p_session_id;
        
        RETURN json_build_object('success', true, 'message', 'Deleted single session');
    END IF;

    -- CASE 2: Future events delete (DELETE ALL FUTURE ON SAME DAY-OF-WEEK)
    IF p_mode = 'future' THEN
        v_target_day_of_week := EXTRACT(DOW FROM v_session.schedule_date);

        -- Delete sessions (assuming CASCADE ON DELETE for bookings, 
        -- but if not, we must delete bookings first. Let's do it to be safe.)
        
        -- We will use a CTE to identify IDs to delete to keep logic consistent
        WITH sessions_to_delete AS (
            SELECT id FROM class_sessions
            WHERE 
                schedule_date >= v_session.schedule_date
                AND EXTRACT(DOW FROM schedule_date) = v_target_day_of_week
                AND (
                    -- 1. Strongest Link: Same schedule_id
                    (v_session.schedule_id IS NOT NULL AND schedule_id = v_session.schedule_id)
                    OR 
                    -- 2. Legacy/Detached Link matches
                    (
                        class_type_id = v_session.class_type_id 
                        AND (
                            schedule_time = v_session.schedule_time
                            OR
                            (v_session.schedule_id IS NOT NULL AND schedule_time = (SELECT start_time FROM class_schedules WHERE id = v_session.schedule_id))
                        )
                    )
                )
        )
        DELETE FROM bookings WHERE class_session_id IN (SELECT id FROM sessions_to_delete);

        -- Now delete the sessions themselves
        WITH sessions_to_delete AS (
             SELECT id FROM class_sessions
            WHERE 
                schedule_date >= v_session.schedule_date
                AND EXTRACT(DOW FROM schedule_date) = v_target_day_of_week
                AND (
                    (v_session.schedule_id IS NOT NULL AND schedule_id = v_session.schedule_id)
                    OR 
                    (
                        class_type_id = v_session.class_type_id 
                        AND (
                            schedule_time = v_session.schedule_time
                            OR
                            (v_session.schedule_id IS NOT NULL AND schedule_time = (SELECT start_time FROM class_schedules WHERE id = v_session.schedule_id))
                        )
                    )
                )
        )
        DELETE FROM class_sessions WHERE id IN (SELECT id FROM sessions_to_delete);

        GET DIAGNOSTICS v_affected_count = ROW_COUNT;

        -- Expire the schedule if it exists
        -- Logic: If we deleted "future", effectively the schedule ends YESTERDAY.
        -- But wait, if v_session.schedule_id matches, we expire THAT schedule.
        IF v_session.schedule_id IS NOT NULL THEN
             UPDATE class_schedules
             SET valid_until = (v_session.schedule_date - INTERVAL '1 day')::DATE,
                 is_active = FALSE
             WHERE id = v_session.schedule_id;
        END IF;

        RETURN json_build_object(
            'success', true, 
            'message', 'Deleted ' || v_affected_count || ' sessions and expired schedule'
        );
    END IF;
    
    RETURN json_build_object('success', false, 'error', 'Unreachable');
END;
$$;
