BEGIN;

-- Minglora adopts one creator-forward Subscription schedule:
-- 70% creator / 30% platform from net settled receipts, after actual
-- provider processing fees. A moderator-verified monthly bonus adds
-- 20 percentage points, allowing up to 90% creator / 10% platform.
-- Historical ledger rows retain their originally recorded 50/50 or 70/30 split.

ALTER TABLE public.creator_subscriptions
  DROP CONSTRAINT IF EXISTS creator_subscriptions_platform_share_bps_check,
  DROP CONSTRAINT IF EXISTS creator_subscriptions_creator_share_bps_check,
  DROP CONSTRAINT IF EXISTS creator_subscriptions_revenue_split_check;

UPDATE public.creator_subscriptions
SET creator_share_bps = 7000,
    platform_share_bps = 3000,
    updated_at = now()
WHERE creator_share_bps = 5000
  AND platform_share_bps = 5000;

ALTER TABLE public.creator_subscriptions
  ALTER COLUMN creator_share_bps SET DEFAULT 7000,
  ALTER COLUMN platform_share_bps SET DEFAULT 3000,
  ADD CONSTRAINT creator_subscriptions_platform_share_bps_check
    CHECK (platform_share_bps IN (1000,3000,5000)),
  ADD CONSTRAINT creator_subscriptions_creator_share_bps_check
    CHECK (creator_share_bps IN (5000,7000,9000)),
  ADD CONSTRAINT creator_subscriptions_revenue_split_check
    CHECK (creator_share_bps + platform_share_bps = 10000);

ALTER TABLE public.subscription_earnings_ledger
  ALTER COLUMN creator_share_bps SET DEFAULT 7000,
  ALTER COLUMN platform_share_bps SET DEFAULT 3000;

ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_share_check;

ALTER TABLE public.subscription_earnings_ledger
  ADD CONSTRAINT subscription_earnings_ledger_share_check
    CHECK (
      creator_share_bps IN (5000,7000,9000)
      AND platform_share_bps IN (1000,3000,5000)
      AND performance_bonus_bps IN (0,2000)
      AND creator_share_bps + platform_share_bps = 10000
      AND (
        creator_share_bps = 5000 + performance_bonus_bps
        OR creator_share_bps = 7000 + performance_bonus_bps
      )
    );

COMMENT ON COLUMN public.creator_subscriptions.creator_share_bps IS
  'Subscription creator share of net settled receipt: 7000 base, up to 9000 with approved monthly performance bonus; older rows remain supported.';
COMMENT ON COLUMN public.subscription_earnings_ledger.provider_fee_minor IS
  'Actual payment provider processing fee in minor currency units, deducted before calculating creator and platform shares.';

COMMIT;