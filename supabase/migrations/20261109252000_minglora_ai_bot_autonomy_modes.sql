-- Expand bot operating-level configuration while retaining the legacy human_approval value.
-- This is additive for installations that already applied the original AI bot foundation.
BEGIN;

ALTER TABLE public.minglora_ai_bots
  DROP CONSTRAINT IF EXISTS minglora_ai_bots_autonomy_mode_check;

ALTER TABLE public.minglora_ai_bots
  ADD CONSTRAINT minglora_ai_bots_autonomy_mode_check
  CHECK (autonomy_mode IN (
    'administrator_controlled',
    'human_approval',
    'supervisor_controlled',
    'hybrid',
    'autonomous_within_limits',
    'restricted_observation'
  ));

COMMENT ON COLUMN public.minglora_ai_bots.autonomy_mode IS
  'Configured AI operating level. Worker dispatch remains separately gated by task approvals, allowlisted capabilities, runtime availability and budget.';

COMMIT;
