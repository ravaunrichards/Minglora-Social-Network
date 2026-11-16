BEGIN;

-- Assign the official platform-owner role only to the exact, already
-- email-confirmed account requested by the repository owner.
DO $$
DECLARE v_owner_id uuid := '28e1df97-3fe1-488e-bb84-bdc353c58653';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id=v_owner_id
      AND lower(email)='larryjones2019ersky@gmail.com'
      AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verified Creator Hub owner account was not found; no privilege was granted';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.minglora_platform_staff (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','moderator','reviewer')),
  active boolean NOT NULL DEFAULT true,
  mfa_required boolean NOT NULL DEFAULT true,
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  granted_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.minglora_platform_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minglora_platform_staff FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.minglora_platform_staff TO service_role;

INSERT INTO public.minglora_platform_staff
  (user_id,role,active,mfa_required,permissions,granted_reason)
VALUES
  ('28e1df97-3fe1-488e-bb84-bdc353c58653','owner',true,true,
   ARRAY['platform.*','marketplace.*','moderation.*','verification.*','finance.read','finance.review','settings.manage']::text[],
   'Official Creator Hub Creator Network platform-owner account; exact verified account UUID')
ON CONFLICT (user_id) DO UPDATE SET
  role='owner',active=true,mfa_required=true,
  permissions=EXCLUDED.permissions,granted_reason=EXCLUDED.granted_reason,
  updated_at=now();

-- Auth app_metadata is server-managed; do not use user_metadata for privileges.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
  || jsonb_build_object('role','platform_owner','verification_badge','blue'),
    updated_at=now()
WHERE id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND lower(email)='larryjones2019ersky@gmail.com'
  AND email_confirmed_at IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_badge text NOT NULL DEFAULT 'none';
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verification_badge_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_badge_check
  CHECK (verification_badge IN ('none','blue'));
UPDATE public.profiles
SET verification_badge='blue'
WHERE id='28e1df97-3fe1-488e-bb84-bdc353c58653';

ALTER TABLE public.marketplace_seller_profiles
  ADD COLUMN IF NOT EXISTS review_priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz NOT NULL DEFAULT (now()+interval '4 hours'),
  ADD COLUMN IF NOT EXISTS auto_review_status text NOT NULL DEFAULT 'needs_human_review',
  ADD COLUMN IF NOT EXISTS auto_review_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_review_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.marketplace_seller_profiles
  DROP CONSTRAINT IF EXISTS marketplace_seller_review_priority_check,
  DROP CONSTRAINT IF EXISTS marketplace_seller_auto_review_status_check,
  DROP CONSTRAINT IF EXISTS marketplace_seller_auto_review_score_check;
ALTER TABLE public.marketplace_seller_profiles
  ADD CONSTRAINT marketplace_seller_review_priority_check
    CHECK (review_priority IN ('normal','high','urgent')),
  ADD CONSTRAINT marketplace_seller_auto_review_status_check
    CHECK (auto_review_status IN ('clear_for_human_review','needs_human_review','flagged')),
  ADD CONSTRAINT marketplace_seller_auto_review_score_check
    CHECK (auto_review_score BETWEEN 0 AND 100),
  ADD CONSTRAINT marketplace_seller_auto_review_flags_array_check
    CHECK (jsonb_typeof(auto_review_flags)='array');

UPDATE public.marketplace_seller_profiles
SET review_priority=CASE WHEN user_id='28e1df97-3fe1-488e-bb84-bdc353c58653' THEN 'urgent' ELSE 'normal' END,
    review_due_at=coalesce(review_due_at,created_at+interval '4 hours');

CREATE INDEX IF NOT EXISTS marketplace_seller_priority_due_idx
  ON public.marketplace_seller_profiles(review_priority,review_due_at,created_at)
  WHERE status='pending';

CREATE TABLE IF NOT EXISTS public.marketplace_business_identity_submissions (
  user_id uuid PRIMARY KEY REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  legal_business_name text NOT NULL CHECK (length(btrim(legal_business_name)) BETWEEN 2 AND 160),
  registration_type text NOT NULL CHECK (registration_type IN ('registered_company','sole_trader','partnership','other')),
  registration_number text,
  registered_address text NOT NULL CHECK (length(btrim(registered_address)) BETWEEN 5 AND 500),
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_information','verified','rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (registration_number IS NULL OR length(btrim(registration_number)) BETWEEN 3 AND 100),
  CHECK (contact_email=lower(btrim(contact_email)) AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_business_registration_unique_idx
  ON public.marketplace_business_identity_submissions(country_code,lower(registration_number))
  WHERE registration_number IS NOT NULL AND status IN ('pending','verified');
ALTER TABLE public.marketplace_business_identity_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_business_identity_submissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_business_identity_submissions TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_application_review_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_user_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('application_submitted','business_identity_submitted','application_overdue')),
  priority text NOT NULL CHECK (priority IN ('normal','high','urgent')),
  due_at timestamptz NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_review_alerts_recipient_unread_idx
  ON public.marketplace_application_review_alerts(recipient_id,created_at DESC)
  WHERE read_at IS NULL;
ALTER TABLE public.marketplace_application_review_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_application_review_alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_application_review_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_marketplace_application_review_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  staff_row record;
  event_name text;
  due_value timestamptz;
  priority_value text;
  title_value text;
  body_value text;
BEGIN
  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.status='pending' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    priority_value := CASE
      WHEN NEW.user_id='28e1df97-3fe1-488e-bb84-bdc353c58653' THEN 'urgent'
      WHEN NEW.seller_type='business' THEN 'high'
      ELSE 'normal'
    END;
    due_value := coalesce(NEW.review_due_at,now()+interval '4 hours');
    event_name := 'application_submitted';
    title_value := 'New Marketplace seller application';
    body_value := NEW.store_name||' is awaiting review. Target review time: four hours.';
    FOR staff_row IN
      SELECT user_id FROM public.minglora_platform_staff
      WHERE active=true AND role IN ('owner','admin','moderator','reviewer')
    LOOP
      INSERT INTO public.marketplace_application_review_alerts
        (recipient_id,application_user_id,event_type,priority,due_at,title,body)
      VALUES
        (staff_row.user_id,NEW.user_id,event_name,priority_value,due_value,title_value,body_value);
      INSERT INTO public.notifications
        (recipient_id,actor_id,kind,entity_type,entity_id,payload)
      VALUES
        (staff_row.user_id,NEW.user_id,'marketplace_application_review','marketplace_seller',NEW.user_id,
         jsonb_build_object('title',title_value,'body',body_value,'priority',priority_value,'dueAt',due_value));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_marketplace_application_review_alert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS marketplace_seller_application_review_alert ON public.marketplace_seller_profiles;
CREATE TRIGGER marketplace_seller_application_review_alert
AFTER INSERT OR UPDATE OF status ON public.marketplace_seller_profiles
FOR EACH ROW EXECUTE FUNCTION public.enqueue_marketplace_application_review_alert();

COMMIT;