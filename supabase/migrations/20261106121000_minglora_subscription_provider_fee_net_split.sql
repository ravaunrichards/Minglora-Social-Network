BEGIN;
ALTER TABLE public.subscription_earnings_ledger
  ADD COLUMN IF NOT EXISTS provider_fee_minor integer NOT NULL DEFAULT 0;
ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_check;
ALTER TABLE public.subscription_earnings_ledger
  ADD CONSTRAINT subscription_earnings_ledger_net_split_check
  CHECK (
    provider_fee_minor >= 0
    AND creator_minor + platform_minor + provider_fee_minor = gross_minor
  );
COMMIT;