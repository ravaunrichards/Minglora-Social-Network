BEGIN;

CREATE TABLE public.live_cohost_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'inviting' CHECK (status IN ('inviting','active','ended','cancelled','failed')),
  mode text NOT NULL DEFAULT 'collaboration' CHECK (mode IN ('collaboration','match_solo','match_team')),
  layout text NOT NULL DEFAULT 'side_by_side' CHECK (layout IN ('side_by_side','grid','host_focus')),
  max_participants smallint NOT NULL DEFAULT 2 CHECK (max_participants BETWEEN 2 AND 8),
  room_ref text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE public.live_cohost_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohost_session_id uuid NOT NULL REFERENCES public.live_cohost_sessions(id) ON DELETE CASCADE,
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('host','cohost')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','connected','declined','cancelled','left','removed')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  position smallint NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 8),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  connected_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohost_session_id, user_id),
  UNIQUE (cohost_session_id, broadcast_id),
  CHECK (accepted_at IS NULL OR accepted_at >= invited_at),
  CHECK (connected_at IS NULL OR accepted_at IS NOT NULL),
  CHECK (left_at IS NULL OR left_at >= COALESCE(connected_at, accepted_at, invited_at))
);

CREATE INDEX live_cohost_sessions_created_by_idx ON public.live_cohost_sessions (created_by, created_at DESC);
CREATE INDEX live_cohost_sessions_status_idx ON public.live_cohost_sessions (status, updated_at DESC);
CREATE INDEX live_cohost_participants_session_position_idx ON public.live_cohost_participants (cohost_session_id, position);
CREATE INDEX live_cohost_participants_user_status_idx ON public.live_cohost_participants (user_id, status, created_at DESC);
CREATE INDEX live_cohost_participants_broadcast_status_idx ON public.live_cohost_participants (broadcast_id, status);

CREATE UNIQUE INDEX live_cohost_participants_one_host_per_session_idx
  ON public.live_cohost_participants (cohost_session_id) WHERE role = 'host';
CREATE UNIQUE INDEX live_cohost_participants_one_active_session_per_user_idx
  ON public.live_cohost_participants (user_id) WHERE status IN ('invited','accepted','connected');
CREATE UNIQUE INDEX live_cohost_participants_one_active_session_per_broadcast_idx
  ON public.live_cohost_participants (broadcast_id) WHERE status IN ('invited','accepted','connected');

CREATE OR REPLACE FUNCTION public.enforce_live_cohost_participant_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  session_creator uuid;
  session_status text;
  participant_limit integer;
  participant_count integer;
  broadcast_host uuid;
  broadcast_status text;
BEGIN
  SELECT created_by, status, max_participants
    INTO session_creator, session_status, participant_limit
  FROM public.live_cohost_sessions WHERE id = NEW.cohost_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Co-host session does not exist' USING ERRCODE = '23503';
  END IF;
  IF session_status NOT IN ('inviting','active') THEN
    RAISE EXCEPTION 'Co-host session is not accepting participants' USING ERRCODE = '23514';
  END IF;
  SELECT host_id, status INTO broadcast_host, broadcast_status
  FROM public.live_broadcasts WHERE id = NEW.broadcast_id;
  IF NOT FOUND OR broadcast_status <> 'live' THEN
    RAISE EXCEPTION 'Co-host participant must own an active LIVE broadcast' USING ERRCODE = '23514';
  END IF;
  IF broadcast_host <> NEW.user_id THEN
    RAISE EXCEPTION 'Co-host participant must own the linked LIVE broadcast' USING ERRCODE = '23514';
  END IF;
  IF NEW.role = 'host' THEN
    IF NEW.user_id <> session_creator OR NEW.status <> 'connected' THEN
      RAISE EXCEPTION 'The session creator must be its connected host' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.role = 'cohost' THEN
    IF NEW.invited_by IS DISTINCT FROM session_creator OR NEW.status <> 'invited' THEN
      RAISE EXCEPTION 'A co-host must be invited by the session creator' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO participant_count FROM public.live_cohost_participants
    WHERE cohost_session_id = NEW.cohost_session_id AND status IN ('invited','accepted','connected');
    IF participant_count >= participant_limit THEN
      RAISE EXCEPTION 'Co-host session participant capacity is full' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER live_cohost_participant_integrity
BEFORE INSERT OR UPDATE OF cohost_session_id, broadcast_id, user_id, role, invited_by
ON public.live_cohost_participants FOR EACH ROW
EXECUTE FUNCTION public.enforce_live_cohost_participant_integrity();

ALTER TABLE public.live_cohost_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_cohost_sessions FROM anon, authenticated;
REVOKE ALL ON public.live_cohost_participants FROM anon, authenticated;
GRANT SELECT ON public.live_cohost_sessions TO authenticated;
GRANT SELECT ON public.live_cohost_participants TO authenticated;
GRANT ALL ON public.live_cohost_sessions TO service_role;
GRANT ALL ON public.live_cohost_participants TO service_role;

CREATE POLICY minglora_live_cohost_sessions_read_member ON public.live_cohost_sessions
FOR SELECT TO authenticated USING (
  created_by = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.live_cohost_participants p
    WHERE p.cohost_session_id = live_cohost_sessions.id AND p.user_id = (SELECT auth.uid())
  )
);
CREATE POLICY minglora_live_cohost_participants_read_self ON public.live_cohost_participants
FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.live_cohost_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.live_cohost_participants REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='live_cohost_sessions') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_cohost_sessions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='live_cohost_participants') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_cohost_participants;
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.enforce_live_cohost_participant_integrity() FROM PUBLIC, anon, authenticated;
COMMIT;
