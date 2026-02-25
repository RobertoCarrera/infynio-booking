-- Fix for ambiguous column reference in join_waiting_list function
-- The error was: column reference "user_id" is ambiguous within the function
-- This migration redefines the function with unambiguous parameter names

-- Drop conflicting functions to ensure clean state
DROP FUNCTION IF EXISTS public.join_waiting_list(uuid, bigint);
DROP FUNCTION IF EXISTS public.join_waiting_list(integer, bigint);
DROP FUNCTION IF EXISTS public.join_waiting_list(uuid, integer);
DROP FUNCTION IF EXISTS public.join_waiting_list(uuid, uuid); -- Case with wrong types
DROP FUNCTION IF EXISTS public.join_waiting_list(p_user_id uuid, p_class_session_id bigint);

-- Also drop v2 if exists to allow clean recreate
DROP FUNCTION IF EXISTS public.join_waiting_list_v2(p_user_id uuid, p_class_session_id bigint);
DROP FUNCTION IF EXISTS public.join_waiting_list_v2(p_user_id integer, p_class_session_id bigint);

CREATE OR REPLACE FUNCTION public.join_waiting_list_v2(p_user_id INTEGER, p_class_session_id BIGINT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_entry_exists boolean;
    v_result json;
BEGIN
    -- Check if already exists to avoid duplicates (though constraint should handle it)
    SELECT EXISTS (
        SELECT 1 
        FROM public.waiting_list 
        WHERE user_id = p_user_id 
        AND class_session_id = p_class_session_id
    ) INTO v_entry_exists;

    IF v_entry_exists THEN
        -- Return existing entry
        SELECT row_to_json(w) INTO v_result
        FROM public.waiting_list w
        WHERE user_id = p_user_id 
        AND class_session_id = p_class_session_id;
        
        RETURN v_result;
    END IF;

    -- Insert new entry
    INSERT INTO public.waiting_list (
        user_id, 
        class_session_id, 
        join_date_time, 
        status
    )
    VALUES (
        p_user_id, 
        p_class_session_id, 
        NOW(), 
        'waiting'
    )
    RETURNING row_to_json(waiting_list.*) INTO v_result;

    RETURN v_result;
END;
$function$;
