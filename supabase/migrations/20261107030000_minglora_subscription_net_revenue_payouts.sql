BEGIN;

ALTER TABLE public.subscription_earnings_ledger
  ADD COLUMN IF NOT EXISTS processing_fee_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_reconciled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_reconciled_at timestamptz;

-- Preserve historical ledger values. Historical PayPal fee details were not
-- stored, so they are explicitly marked unreconciled rather than guessed.
UPDATE public.subscription_earnings_ledger
SET net_minor = creator_minor + platform_minor,
    processing_fee_minor = 0,
    tax_minor = 0,
    fee_reconciled = false,
    fee_reconciled_at = NULL
WHERE net_minor = 0
   OR creator_minor + platform_minor <> net_minor;

ALTER TABLE public.subscription_earnings_ledger
  DROP CONSTRAINT IF EXISTS subscription_earnings_ledger_check;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_earnings_ledger_net_share_check'
      AND conrelid = 'public.subscription_earnings_ledger'::regclass
  ) THEN
    ALTER TABLE public.subscription_earnings_ledger
      ADD CONSTRAINT subscription_earnings_ledger_net_share_check
      CHECK (creator_minor + platform_minor = net_minor);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_earnings_ledger_fee_amounts_check'
      AND conrelid = 'public.subscription_earnings_ledger'::regclass
  ) THEN
    ALTER TABLE public.subscription_earnings_ledger
      ADD CONSTRAINT subscription_earnings_ledger_fee_amounts_check
      CHECK (
        processing_fee_minor >= 0
        AND tax_minor >= 0
        AND net_minor >= 0
        AND gross_minor >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_earnings_ledger_fee_reconciled_check'
      AND conrelid = 'public.subscription_earnings_ledger'::regclass
  ) THEN
    ALTER TABLE public.subscription_earnings_ledger
      ADD CONSTRAINT subscription_earnings_ledger_fee_reconciled_check
      CHECK (
        NOT fee_reconciled
        OR (
          entry_type = 'payment'
          AND gross_minor = processing_fee_minor + tax_minor + net_minor
          AND fee_reconciled_at IS NOT NULL
        )
      );
  END IF;
END
$migration$;

COMMIT;