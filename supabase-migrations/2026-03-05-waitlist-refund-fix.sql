-- Fix refund trigger to handle status updates

CREATE OR REPLACE FUNCTION public.process_waitlist_refund()
RETURNS TRIGGER AS $$
BEGIN
    -- Refund if user_package_id is present AND (we are deleting OR we are cancelling)
    IF OLD.user_package_id IS NOT NULL THEN
        IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status = 'waiting') THEN
            UPDATE user_packages
            SET 
                current_classes_remaining = current_classes_remaining + 1,
                status = 'active'
            WHERE id = OLD.user_package_id;
            
            -- If updating, we might want to clear the user_package_id from the record so we don't refund again?
            -- Or just leave it? If we leave it, a subsequent DELETE might trigger refund AGAIN.
            -- So we must clear it.
            IF TG_OP = 'UPDATE' THEN
                NEW.user_package_id = NULL;
            END IF;
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_waitlist_refund ON public.waiting_list;

CREATE TRIGGER trg_waitlist_refund
BEFORE DELETE OR UPDATE ON public.waiting_list
FOR EACH ROW
EXECUTE FUNCTION public.process_waitlist_refund();
