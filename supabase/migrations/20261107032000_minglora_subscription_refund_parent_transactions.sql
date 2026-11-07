BEGIN;
ALTER TABLE public.subscription_earnings_ledger
  ADD COLUMN IF NOT EXISTS parent_provider_transaction_id text;

CREATE INDEX IF NOT EXISTS subscription_earnings_ledger_parent_transaction_idx
  ON public.subscription_earnings_ledger(parent_provider_transaction_id)
  WHERE parent_provider_transaction_id IS NOT NULL;

COMMIT;