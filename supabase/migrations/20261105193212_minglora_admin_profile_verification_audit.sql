BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_profile_verification_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status text NOT NULL CHECK (previous_status IN ('not_submitted','pending','needs_information','verified','rejected','suspended')),
  new_status text NOT NULL CHECK (new_status IN ('not_submitted','pending','needs_information','verified','rejected','suspended')),
  previous_badge text NOT NULL CHECK (previous_badge IN ('none','blue')),
  new_badge text NOT NULL CHECK (new_badge IN ('none','blue')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 5 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS minglora_profile_verification_admin_audit_target_idx
  ON public.minglora_profile_verification_admin_audit(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS minglora_profile_verification_admin_audit_actor_idx
  ON public.minglora_profile_verification_admin_audit(actor_user_id, created_at DESC);

ALTER TABLE public.minglora_profile_verification_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minglora_profile_verification_admin_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.minglora_profile_verification_admin_audit TO service_role;

COMMIT;