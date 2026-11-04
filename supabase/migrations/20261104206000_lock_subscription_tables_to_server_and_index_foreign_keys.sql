BEGIN;

-- Subscription records, billing events and financial ledgers are server-only.
-- The Render API authenticates members and calls the private Edge runtime; clients
-- must not have direct table grants or permissive client policies.
DROP POLICY IF EXISTS subscription_creator_settings_read ON public.subscription_creator_settings;
DROP POLICY IF EXISTS subscription_creator_settings_insert ON public.subscription_creator_settings;
DROP POLICY IF EXISTS subscription_creator_settings_update ON public.subscription_creator_settings;
DROP POLICY IF EXISTS subscription_tiers_read ON public.subscription_tiers;
DROP POLICY IF EXISTS subscription_tiers_insert ON public.subscription_tiers;
DROP POLICY IF EXISTS subscription_tiers_update ON public.subscription_tiers;
DROP POLICY IF EXISTS creator_subscriptions_read ON public.creator_subscriptions;
DROP POLICY IF EXISTS subscription_ledger_read ON public.subscription_earnings_ledger;

REVOKE ALL ON public.subscription_creator_settings, public.subscription_tiers,
  public.creator_subscriptions, public.subscription_payment_events,
  public.subscription_earnings_ledger, public.subscription_content_access
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.subscription_creator_settings, public.subscription_tiers,
  public.creator_subscriptions, public.subscription_payment_events,
  public.subscription_earnings_ledger, public.subscription_content_access
  TO service_role;

-- Cover foreign keys used by the runtime, moderation and ledger lookups.
CREATE INDEX IF NOT EXISTS creator_subscriptions_subscriber_id_idx
  ON public.creator_subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS creator_subscriptions_tier_creator_idx
  ON public.creator_subscriptions(tier_id, creator_id);
CREATE INDEX IF NOT EXISTS subscription_tiers_creator_id_idx
  ON public.subscription_tiers(creator_id);
CREATE INDEX IF NOT EXISTS subscription_creator_settings_approved_by_idx
  ON public.subscription_creator_settings(approved_by);
CREATE INDEX IF NOT EXISTS subscription_content_access_creator_id_idx
  ON public.subscription_content_access(creator_id);
CREATE INDEX IF NOT EXISTS subscription_payment_events_subscription_id_idx
  ON public.subscription_payment_events(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_earnings_ledger_subscriber_id_idx
  ON public.subscription_earnings_ledger(subscriber_id);
CREATE INDEX IF NOT EXISTS subscription_earnings_ledger_subscription_id_idx
  ON public.subscription_earnings_ledger(subscription_id);

COMMIT;
