BEGIN;

ALTER TABLE public.marketplace_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS marketplace_webhook_stale_processing_idx
  ON public.marketplace_webhook_events(processing_started_at)
  WHERE processing_status='processing';

COMMENT ON COLUMN public.marketplace_webhook_events.processing_started_at IS
  'Timestamp when a worker claimed this verified provider event. Processing records older than the retry lease can be safely reclaimed.';
COMMENT ON COLUMN public.marketplace_webhook_events.attempt_count IS
  'Number of verified attempts to process this provider event.';
COMMENT ON COLUMN public.marketplace_webhook_events.last_error IS
  'Last bounded processing failure for operational review; never contains secrets or credentials.';

COMMIT;