BEGIN;

-- provider_fee_minor predates this migration and is consumed by the existing
-- earnings model. Keep it synchronized with processing_fee_minor while also
-- accounting for tax and the amount available for creator/platform shares.
ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_net_split_check,
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_fee_reconciled_check,
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_fee_mirror_check;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_earnings_ledger_fee_mirror_check'
      AND conrelid = 'public.subscription_earnings_ledger'::regclass
  ) THEN
    ALTER TABLE public.subscription_earnings_ledger
      ADD CONSTRAINT subscription_earnings_ledger_fee_mirror_check
      CHECK (provider_fee_minor = processing_fee_minor);
  END IF;

  ALTER TABLE public.subscription_earnings_ledger
    ADD CONSTRAINT subscription_earnings_ledger_fee_reconciled_check
    CHECK (
      NOT fee_reconciled
      OR (
        entry_type = 'payment'
        AND gross_minor = provider_fee_minor + tax_minor + net_minor
        AND fee_reconciled_at IS NOT NULL
      )
    );
END
$migration$;

COMMIT;