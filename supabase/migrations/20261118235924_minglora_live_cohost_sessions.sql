-- Creator-to-creator LIVE Co-host sessions. Multi-guest remains in live_participants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.live_cohost_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inviting' CHECK (status IN ('inviting','active','ended','cancelled','failed')),
  mode text NOT NULL DEFAULT 'collaboration' CHECK (mode IN ('collaboration','match_solo','match_team')),
  layout text NOT NULL DEFAULT 'side_by_side' CHECK (layout IN ('side_by_side','grid','host_focus')),
  max_participants smallint NOT NULL DEFAULT 4 CHECK (max_participants BETWEEN 2 AND 10),
  room_ref text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_cohost_sessions_id_broadcast_key UNIQUE (id,broadcast_id),
  CONSTRAINT live_cohost_sessions_check CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE TABLE IF NOT EXISTS public.live_cohost_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohost_session_id uuid NOT NULL,
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'cohost' CHECK (role IN ('host','cohost')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','connected','declined','cancelled','left','removed')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  connected_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_cohost_participants_cohost_session_id_user_id_key UNIQUE (cohost_session_id,user_id),
  CONSTRAINT live_cohost_participants_session_broadcast_fkey
    FOREIGN KEY (cohost_session_id,broadcast_id)
    REFERENCES public.live_cohost_sessions(id,broadcast_id) ON DELETE CASCADE,
  CONSTRAINT live_cohost_participants_check CHECK (accepted_at IS NULL OR accepted_at >= invited_at),
  CONSTRAINT live_cohost_participants_check1 CHECK (connected_at IS NULL OR accepted_at IS NOT NULL),
  CONSTRAINT live_cohost_participants_check2 CHECK (left_at IS NULL OR left_at >= COALESCE(connected_at,accepted_at,invited_at))
);
CREATE INDEX IF NOT EXISTS live_cohost_sessions_created_by_idx ON public.live_cohost_sessions(created_by,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_sessions_one_active_per_broadcast_idx
  ON public.live_cohost_sessions(broadcast_id) WHERE status IN ('inviting','active');
CREATE INDEX IF NOT EXISTS live_cohost_sessions_status_idx ON public.live_cohost_sessions(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS live_cohost_participants_broadcast_status_idx ON public.live_cohost_participants(broadcast_id,status);
CREATE INDEX IF NOT EXISTS live_cohost_participants_session_broadcast_idx ON public.live_cohost_participants(cohost_session_id,broadcast_id);
CREATE INDEX IF NOT EXISTS live_cohost_participants_user_status_idx ON public.live_cohost_participants(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS live_cohost_participants_invited_by_idx ON public.live_cohost_participants(invited_by) WHERE invited_by IS NOT NULL;
COMMIT;
