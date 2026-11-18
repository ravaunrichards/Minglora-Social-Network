-- Independent creator-to-creator LIVE co-host sessions.
-- Co-host collaborations never reuse live_participants or the Multi-guest stage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.live_cohost_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  host_broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  room_ref text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended','cancelled')),
  layout text NOT NULL DEFAULT 'two'
    CHECK (layout IN ('two','three','four')),
  max_participants integer NOT NULL DEFAULT 4
    CHECK (max_participants = 4),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_one_active_session_per_host_broadcast
  ON public.live_cohost_sessions (host_broadcast_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS live_cohost_sessions_status_started_idx
  ON public.live_cohost_sessions (status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.live_cohost_participants (
  session_id uuid NOT NULL REFERENCES public.live_cohost_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'cohost'
    CHECK (role IN ('host','cohost')),
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','requested','accepted','connected','left','removed','rejected')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz,
  accepted_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id),
  UNIQUE (session_id, broadcast_id),
  CHECK (role <> 'host' OR status IN ('accepted','connected','left','removed'))
);

CREATE INDEX IF NOT EXISTS live_cohost_participants_session_status_idx
  ON public.live_cohost_participants (session_id, status, created_at);
CREATE INDEX IF NOT EXISTS live_cohost_participants_broadcast_idx
  ON public.live_cohost_participants (broadcast_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_one_active_collaboration_per_creator
  ON public.live_cohost_participants (user_id)
  WHERE status IN ('invited','requested','accepted','connected');

CREATE TABLE IF NOT EXISTS public.live_cohost_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_cohost_sessions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('solo','team')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_one_active_match_per_session
  ON public.live_cohost_matches (session_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS live_cohost_matches_session_created_idx
  ON public.live_cohost_matches (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_cohost_match_participants (
  match_id uuid NOT NULL REFERENCES public.live_cohost_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team text CHECK (team IN ('a','b') OR team IS NULL),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_cohost_match_participants_user_idx
  ON public.live_cohost_match_participants (user_id, match_id);

ALTER TABLE public.live_cohost_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_cohost_match_participants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.live_cohost_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.live_cohost_participants FROM anon, authenticated;
REVOKE ALL ON TABLE public.live_cohost_matches FROM anon, authenticated;
REVOKE ALL ON TABLE public.live_cohost_match_participants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_cohost_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_cohost_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_cohost_matches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_cohost_match_participants TO service_role;

COMMIT;