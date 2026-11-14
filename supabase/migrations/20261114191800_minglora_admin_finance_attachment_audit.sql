BEGIN;

ALTER TABLE public.minglora_admin_finance_audit_events
  DROP CONSTRAINT IF EXISTS minglora_admin_finance_audit_events_action_check;

ALTER TABLE public.minglora_admin_finance_audit_events
  ADD CONSTRAINT minglora_admin_finance_audit_events_action_check
  CHECK (action = ANY (ARRAY[
    'created'::text,
    'updated'::text,
    'attachment_downloaded'::text
  ]));

COMMIT;
