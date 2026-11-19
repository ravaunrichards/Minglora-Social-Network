-- Creator Co-host roster positions and capacity bounds.
BEGIN;
ALTER TABLE public.live_cohost_sessions ALTER COLUMN max_participants SET DEFAULT 9;
ALTER TABLE public.live_cohost_sessions DROP CONSTRAINT IF EXISTS live_cohost_sessions_max_participants_check;
ALTER TABLE public.live_cohost_sessions ADD CONSTRAINT live_cohost_sessions_max_participants_check
  CHECK (max_participants >= 2 AND max_participants <= 10);
ALTER TABLE public.live_cohost_participants ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 1;
ALTER TABLE public.live_cohost_participants DROP CONSTRAINT IF EXISTS live_cohost_participants_position_check;
ALTER TABLE public.live_cohost_participants ADD CONSTRAINT live_cohost_participants_position_check
  CHECK ((role = 'host' AND position = 0) OR (role = 'cohost' AND position BETWEEN 1 AND 9));
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_participants_active_seat_idx
  ON public.live_cohost_participants(cohost_session_id,position)
  WHERE status IN ('invited','accepted','connected');
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_participants_one_active_session_per_user_idx
  ON public.live_cohost_participants(user_id)
  WHERE status IN ('invited','accepted','connected');
CREATE UNIQUE INDEX IF NOT EXISTS live_cohost_participants_one_host_per_session_idx
  ON public.live_cohost_participants(cohost_session_id) WHERE role = 'host';
CREATE INDEX IF NOT EXISTS live_cohost_participants_session_position_idx
  ON public.live_cohost_participants(cohost_session_id,position);
COMMIT;
