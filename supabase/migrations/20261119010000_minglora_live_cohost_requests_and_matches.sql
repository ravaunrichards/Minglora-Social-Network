-- Co-host creator join requests and independent Solo/Team match records.
-- This migration never changes the Multi-guest live_participants workflow.
BEGIN;
ALTER TABLE public.live_cohost_participants
  DROP CONSTRAINT IF EXISTS live_cohost_participants_status_check;
ALTER TABLE public.live_cohost_participants
  ADD CONSTRAINT live_cohost_participants_status_check
  CHECK (status IN ('invited','requested','accepted','connected','declined','cancelled','left','removed'));
DROP INDEX IF EXISTS public.live_cohost_participants_active_seat_idx;
CREATE UNIQUE INDEX live_cohost_participants_active_seat_idx
  ON public.live_cohost_participants(cohost_session_id,position)
  WHERE status IN ('invited','requested','accepted','connected');
DROP INDEX IF EXISTS public.live_cohost_participants_one_active_session_per_user_idx;
CREATE UNIQUE INDEX live_cohost_participants_one_active_session_per_user_idx
  ON public.live_cohost_participants(user_id)
  WHERE status IN ('invited','requested','accepted','connected');
CREATE TABLE IF NOT EXISTS public.live_cohost_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_cohost_sessions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('solo','team')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_cohost_matches_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_one_active_match_per_session
  ON public.live_cohost_matches(session_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS live_cohost_matches_session_created_idx
  ON public.live_cohost_matches(session_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.live_cohost_match_participants (
  match_id uuid NOT NULL REFERENCES public.live_cohost_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team text CHECK (team IN ('a','b') OR team IS NULL),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id,user_id)
);
CREATE INDEX IF NOT EXISTS live_cohost_match_participants_user_idx
  ON public.live_cohost_match_participants(user_id,match_id);
ALTER TABLE public.live_cohost_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_match_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_cohost_matches FROM anon,authenticated;
REVOKE ALL ON TABLE public.live_cohost_match_participants FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.live_cohost_matches TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.live_cohost_match_participants TO service_role;
COMMIT;
