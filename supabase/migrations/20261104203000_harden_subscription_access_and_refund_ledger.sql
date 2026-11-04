BEGIN;
ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_ledger_even_gross;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_ledger_event_unique
  ON public.subscription_earnings_ledger(payment_event_id) WHERE payment_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.minglora_has_active_subscription(
  p_creator_id uuid,
  p_subscriber_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.creator_subscriptions s
    JOIN public.subscription_creator_settings c ON c.creator_id = s.creator_id
    WHERE s.creator_id = p_creator_id
      AND s.subscriber_id = p_subscriber_id
      AND s.status IN ('active','past_due')
      AND c.application_status = 'approved'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
  );
$$;
REVOKE ALL ON FUNCTION public.minglora_has_active_subscription(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.minglora_has_active_subscription(uuid,uuid) FROM PUBLIC, anon, authenticated;
COMMIT;