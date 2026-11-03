BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'not_submitted';
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IN ('not_submitted','pending','needs_information','verified','rejected','suspended'));

CREATE TABLE IF NOT EXISTS public.profile_verification_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_category text NOT NULL CHECK (account_category IN ('person','creator','business','public_figure','brand')),
  public_display_name text NOT NULL CHECK (length(btrim(public_display_name)) BETWEEN 2 AND 120),
  official_website text,
  evidence_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary text NOT NULL CHECK (length(btrim(evidence_summary)) BETWEEN 30 AND 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','needs_information','verified','rejected','revoked')),
  review_priority text NOT NULL DEFAULT 'normal' CHECK (review_priority IN ('normal','high','urgent')),
  review_due_at timestamptz NOT NULL DEFAULT (now()+interval '4 hours'),
  auto_screening_status text NOT NULL DEFAULT 'needs_human_review'
    CHECK (auto_screening_status IN ('clear_for_human_review','flagged','needs_human_review')),
  auto_screening_score integer NOT NULL DEFAULT 0 CHECK (auto_screening_score BETWEEN 0 AND 100),
  auto_screening_flags jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(auto_screening_flags)='array'),
  decision_note text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (official_website IS NULL OR (official_website ~ '^https://[^[:space:]]+$' AND length(official_website)<=500)),
  CHECK (jsonb_array_length(evidence_links)<=8)
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_verification_one_open_application_idx
  ON public.profile_verification_applications(user_id)
  WHERE status IN ('pending','needs_information');
CREATE INDEX IF NOT EXISTS profile_verification_review_queue_idx
  ON public.profile_verification_applications(review_priority,review_due_at,submitted_at)
  WHERE status IN ('pending','needs_information');
CREATE INDEX IF NOT EXISTS profile_verification_applications_user_idx
  ON public.profile_verification_applications(user_id,submitted_at DESC);

ALTER TABLE public.profile_verification_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_verification_applications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.profile_verification_applications TO service_role;

CREATE TABLE IF NOT EXISTS public.profile_verification_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.profile_verification_applications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('submitted','automated_screening','needs_information','verified','rejected','revoked','resubmitted')),
  details text NOT NULL DEFAULT '',
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_verification_events_application_idx
  ON public.profile_verification_review_events(application_id,created_at DESC);
ALTER TABLE public.profile_verification_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_verification_review_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.profile_verification_review_events TO service_role;

CREATE TABLE IF NOT EXISTS public.profile_verification_review_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.profile_verification_applications(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('application_submitted','application_overdue')),
  priority text NOT NULL CHECK (priority IN ('normal','high','urgent')),
  due_at timestamptz NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_verification_alerts_unread_idx
  ON public.profile_verification_review_alerts(recipient_id,created_at DESC)
  WHERE read_at IS NULL;
ALTER TABLE public.profile_verification_review_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_verification_review_alerts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.profile_verification_review_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_profile_verification_review_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE staff_row record;
BEGIN
  IF TG_OP='INSERT' THEN
    FOR staff_row IN
      SELECT user_id FROM public.minglora_platform_staff
      WHERE active=true AND role IN ('owner','admin','moderator','reviewer')
    LOOP
      INSERT INTO public.profile_verification_review_alerts
        (recipient_id,application_id,event_type,priority,due_at,title,body)
      VALUES
        (staff_row.user_id,NEW.id,'application_submitted',NEW.review_priority,NEW.review_due_at,
         'Profile verification application',
         NEW.public_display_name||' submitted a profile verification request.');
      INSERT INTO public.notifications
        (recipient_id,actor_id,kind,entity_type,entity_id,payload)
      VALUES
        (staff_row.user_id,NEW.user_id,'profile_verification_review','profile_verification',NEW.id,
         jsonb_build_object('title','Profile verification application',
           'body',NEW.public_display_name||' submitted a profile verification request.',
           'priority',NEW.review_priority,'dueAt',NEW.review_due_at));
    END LOOP;
    INSERT INTO public.profile_verification_review_events
      (application_id,actor_id,event_type,details,event_metadata)
    VALUES(NEW.id,NEW.user_id,'submitted','Profile verification application submitted.',
      jsonb_build_object('category',NEW.account_category));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_profile_verification_review_alert() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS profile_verification_review_alert_trigger ON public.profile_verification_applications;
CREATE TRIGGER profile_verification_review_alert_trigger
AFTER INSERT ON public.profile_verification_applications
FOR EACH ROW EXECUTE FUNCTION public.enqueue_profile_verification_review_alert();

-- Creator Hub Creator Network is the confirmed Minglora platform-owner identity.
-- Its current blue badge is retained and the new canonical verification state
-- is recorded so the new UI reads the same source of truth.
UPDATE public.profiles
SET verification_status='verified',verification_badge='blue'
WHERE id='28e1df97-3fe1-488e-bb84-bdc353c58653';

INSERT INTO public.profile_verification_review_events
  (application_id,actor_id,event_type,details,event_metadata)
SELECT
  gen_random_uuid(),p.id,'verified',
  'Official Minglora platform-owner account verified by platform ownership record.',
  jsonb_build_object('source','minglora_platform_staff','badge','blue')
FROM public.profiles p
WHERE p.id='28e1df97-3fe1-488e-bb84-bdc353c58653'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_verification_review_events e
    WHERE e.actor_id=p.id AND e.event_type='verified'
      AND e.event_metadata->>'source'='minglora_platform_staff'
  );

COMMIT;