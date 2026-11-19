-- Co-host creator join requests and independent Solo/Team match records.
-- This migration never changes the Multi-guest live_participants workflow.
BEGIN;
-- Every co-host creator has a separate personal LIVE broadcast.
-- broadcast_id remains the parent's broadcast to satisfy the session composite FK.
ALTER TABLE public.live_cohost_participants
  ADD COLUMN IF NOT EXISTS creator_broadcast_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.live_cohost_participants
    WHERE creator_broadcast_id IS NULL AND role <> 'host'
  ) THEN
    RAISE EXCEPTION 'Cannot safely infer creator_broadcast_id for existing co-host members';
  END IF;
END $$;

UPDATE public.live_cohost_participants
SET creator_broadcast_id = broadcast_id
WHERE creator_broadcast_id IS NULL;

ALTER TABLE public.live_cohost_participants
  ALTER COLUMN creator_broadcast_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_cohost_participants_creator_broadcast_fkey'
      AND conrelid = 'public.live_cohost_participants'::regclass
  ) THEN
    ALTER TABLE public.live_cohost_participants
      ADD CONSTRAINT live_cohost_participants_creator_broadcast_fkey
      FOREIGN KEY (creator_broadcast_id)
      REFERENCES public.live_broadcasts(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS live_cohost_participants_creator_broadcast_status_idx
  ON public.live_cohost_participants(creator_broadcast_id,status);

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
