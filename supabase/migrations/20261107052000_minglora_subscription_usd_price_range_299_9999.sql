BEGIN;

-- Minglora creator Subscription monthly price range, aligned to the
-- published TikTok Subscription price range. Keep cents flexible.
ALTER TABLE public.subscription_tiers
  DROP CONSTRAINT IF EXISTS subscription_tiers_even_price,
  DROP CONSTRAINT IF EXISTS subscription_tiers_price_minor_check;

ALTER TABLE public.subscription_tiers
  ADD CONSTRAINT subscription_tiers_price_minor_check
  CHECK (price_minor BETWEEN 299 AND 9999);

COMMENT ON COLUMN public.subscription_tiers.price_minor IS
  'Monthly USD subscription price in minor units; allowed range is $2.99 to $99.99.';

COMMIT;