BEGIN;

-- Make audio-only and video+audio broadcasts first-class session types.
ALTER TABLE public.live_broadcasts
  ADD COLUMN IF NOT EXISTS broadcast_type text NOT NULL DEFAULT 'video_audio';

DO $$
BEGIN
  ALTER TABLE public.live_broadcasts
    ADD CONSTRAINT live_broadcasts_broadcast_type_check
    CHECK (broadcast_type IN ('video_audio','audio_only'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS live_broadcasts_type_active_idx
  ON public.live_broadcasts (broadcast_type, status, started_at DESC);

COMMENT ON COLUMN public.live_broadcasts.broadcast_type IS
  'video_audio publishes camera and microphone; audio_only is microphone-only.';

COMMIT;
