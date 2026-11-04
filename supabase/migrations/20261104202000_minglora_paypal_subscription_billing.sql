BEGIN;
ALTER TABLE public.subscription_creator_settings
  ADD COLUMN IF NOT EXISTS application_note text NOT NULL DEFAULT '';
ALTER TABLE public.subscription_creator_settings
  DROP CONSTRAINT IF EXISTS subscription_creator_settings_application_note_len;
ALTER TABLE public.subscription_creator_settings
  ADD CONSTRAINT subscription_creator_settings_application_note_len CHECK (length(application_note) <= 1200);

ALTER TABLE public.subscription_tiers
  ADD COLUMN IF NOT EXISTS paypal_product_id text,
  ADD COLUMN IF NOT EXISTS paypal_plan_id text;
ALTER TABLE public.subscription_tiers
  DROP CONSTRAINT IF EXISTS subscription_tiers_even_price;
ALTER TABLE public.subscription_tiers
  ADD CONSTRAINT subscription_tiers_even_price CHECK (price_minor % 2 = 0);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_tiers_paypal_plan_unique
  ON public.subscription_tiers(paypal_plan_id) WHERE paypal_plan_id IS NOT NULL;

ALTER TABLE public.subscription_earnings_ledger
  ADD COLUMN IF NOT EXISTS provider_transaction_id text;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_ledger_provider_transaction_unique
  ON public.subscription_earnings_ledger(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL AND entry_type='payment';

ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_ledger_even_gross;
ALTER TABLE public.subscription_earnings_ledger
  ADD CONSTRAINT subscription_ledger_even_gross CHECK (gross_minor % 2 = 0);

CREATE OR REPLACE FUNCTION public.minglora_has_active_subscription(
  p_creator_id uuid,
  p_subscriber_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.creator_subscriptions s
    JOIN public.subscription_creator_settings c ON c.creator_id = s.creator_id
    WHERE s.creator_id = p_creator_id
      AND s.subscriber_id = p_subscriber_id
      AND s.status IN ('active','past_due')
      AND c.application_status = 'approved'
      AND c.subscriptions_enabled = true
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
  );
$$;
REVOKE ALL ON FUNCTION public.minglora_has_active_subscription(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minglora_has_active_subscription(uuid,uuid) TO authenticated;
COMMIT;