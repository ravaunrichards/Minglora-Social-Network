BEGIN;
CREATE OR REPLACE FUNCTION public.minglora_guard_creator_subscription_settings()
RETURNS trigger LANGUAGE plpgsql AS $guard$
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
DROP TRIGGER IF EXISTS minglora_guard_creator_subscription_settings ON public.subscription_creator_settings;
CREATE TRIGGER minglora_guard_creator_subscription_settings
 BEFORE INSERT OR UPDATE ON public.subscription_creator_settings
 FOR EACH ROW EXECUTE FUNCTION public.minglora_guard_creator_subscription_settings();

DROP POLICY IF EXISTS subscription_tiers_insert ON public.subscription_tiers;
CREATE POLICY subscription_tiers_insert ON public.subscription_tiers FOR INSERT TO authenticated
 WITH CHECK (creator_id=auth.uid() AND EXISTS (
   SELECT 1 FROM public.subscription_creator_settings c
   WHERE c.creator_id=auth.uid() AND c.application_status='approved' AND c.subscriptions_enabled
 ));
DROP POLICY IF EXISTS subscription_tiers_update ON public.subscription_tiers;
CREATE POLICY subscription_tiers_update ON public.subscription_tiers FOR UPDATE TO authenticated
 USING (creator_id=auth.uid() AND EXISTS (
   SELECT 1 FROM public.subscription_creator_settings c
   WHERE c.creator_id=auth.uid() AND c.application_status='approved' AND c.subscriptions_enabled
 ))
 WITH CHECK (creator_id=auth.uid() AND EXISTS (
   SELECT 1 FROM public.subscription_creator_settings c
   WHERE c.creator_id=auth.uid() AND c.application_status='approved' AND c.subscriptions_enabled
 ));
COMMIT;
REVOKE ALL ON FUNCTION public.minglora_guard_creator_subscription_settings() FROM PUBLIC, anon, authenticated;
