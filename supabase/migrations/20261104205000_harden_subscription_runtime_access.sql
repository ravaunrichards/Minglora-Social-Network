BEGIN;

-- All subscription tables are accessed through Minglora's authenticated server
-- runtime. Keep this content-access registry closed to direct client SQL/API access.
DROP POLICY IF EXISTS subscription_content_read ON public.subscription_content_access;
DROP POLICY IF EXISTS subscription_content_access_read ON public.subscription_content_access;
DROP POLICY IF EXISTS subscription_content_manage ON public.subscription_content_access;
DROP POLICY IF EXISTS subscription_content_access_creator_manage ON public.subscription_content_access;
DROP FUNCTION IF EXISTS public.minglora_has_active_subscription(uuid,uuid);

-- Trigger runs with the caller's role. service_role may approve/review; an ordinary
-- member can only update non-approval preferences on their own creator settings row.
CREATE OR REPLACE FUNCTION public.minglora_guard_creator_subscription_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $guard$
BEGIN
 IF current_user <> 'service_role' THEN
   IF TG_OP = 'INSERT' THEN
     NEW.application_status := 'not_applied';
     NEW.subscriptions_enabled := false;
     NEW.approved_by := NULL;
     NEW.approved_at := NULL;
     NEW.rejection_reason := NULL;
   ELSE
     NEW.application_status := OLD.application_status;
     NEW.approved_by := OLD.approved_by;
     NEW.approved_at := OLD.approved_at;
     NEW.rejection_reason := OLD.rejection_reason;
     IF OLD.application_status <> 'approved' THEN
       NEW.subscriptions_enabled := false;
     END IF;
   END IF;
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.minglora_guard_creator_subscription_settings() FROM PUBLIC, anon, authenticated;

COMMIT;
