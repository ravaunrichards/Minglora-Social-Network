BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_seller_paypal_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  tracking_id text NOT NULL UNIQUE,
  partner_referral_id text,
  merchant_id text UNIQUE,
  onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started','started','pending','verified','restricted','rejected')),
  account_type text NOT NULL DEFAULT 'unknown'
    CHECK (account_type IN ('unknown','business','personal')),
  permissions_granted boolean NOT NULL DEFAULT false,
  consent_granted boolean NOT NULL DEFAULT false,
  primary_email_confirmed boolean NOT NULL DEFAULT false,
  payments_receivable boolean NOT NULL DEFAULT false,
  requested_features text[] NOT NULL DEFAULT ARRAY[]::text[],
  granted_features text[] NOT NULL DEFAULT ARRAY[]::text[],
  products text[] NOT NULL DEFAULT ARRAY[]::text[],
  callback_nonce_hash text,
  status_reason text NOT NULL DEFAULT '',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_seller_paypal_status_idx
  ON public.marketplace_seller_paypal_accounts(onboarding_status,payments_receivable,primary_email_confirmed);
ALTER TABLE public.marketplace_seller_paypal_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_seller_paypal_accounts FROM anon,authenticated;
GRANT ALL ON public.marketplace_seller_paypal_accounts TO service_role;

ALTER TABLE public.marketplace_payment_attempts
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS provider_approval_url text,
  ADD COLUMN IF NOT EXISTS attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_attempt_request_id_uq
  ON public.marketplace_payment_attempts(provider,provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payment_attempt_provider_order_uq
  ON public.marketplace_payment_attempts(provider,provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_payment_attempt_order_created_idx
  ON public.marketplace_payment_attempts(order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_seller_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id uuid NOT NULL REFERENCES public.marketplace_payment_attempts(id) ON DELETE RESTRICT,
  seller_order_id uuid NOT NULL REFERENCES public.marketplace_seller_orders(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES public.marketplace_seller_profiles(user_id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('paypal','other')),
  provider_order_id text NOT NULL,
  provider_reference_id text NOT NULL,
  provider_capture_id text,
  currency char(3) NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  platform_fee_minor bigint NOT NULL DEFAULT 0 CHECK (platform_fee_minor>=0),
  processor_fee_minor bigint NOT NULL DEFAULT 0 CHECK (processor_fee_minor>=0),
  seller_net_minor bigint NOT NULL CHECK (seller_net_minor>=0),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','approved','captured','failed','refunded','partially_refunded','disputed')),
  disbursement_mode text NOT NULL DEFAULT 'INSTANT'
    CHECK (disbursement_mode IN ('INSTANT','DELAYED')),
  provider_status text NOT NULL DEFAULT '',
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_attempt_id,seller_order_id),
  UNIQUE(provider,provider_reference_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_seller_payment_capture_uq
  ON public.marketplace_seller_payment_transactions(provider,provider_capture_id)
  WHERE provider_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_seller_payment_seller_idx
  ON public.marketplace_seller_payment_transactions(seller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_seller_payment_order_idx
  ON public.marketplace_seller_payment_transactions(seller_order_id,status);
ALTER TABLE public.marketplace_seller_payment_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_seller_payment_transactions FROM anon,authenticated;
GRANT ALL ON public.marketplace_seller_payment_transactions TO service_role;

ALTER TABLE public.marketplace_payouts
  ADD COLUMN IF NOT EXISTS seller_payment_transaction_id uuid
    REFERENCES public.marketplace_seller_payment_transactions(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_payout_transaction_once_uq
  ON public.marketplace_payouts(seller_payment_transaction_id)
  WHERE seller_payment_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_paypal_payout_reference_uq
  ON public.marketplace_payouts(provider,provider_payout_reference)
  WHERE provider_payout_reference IS NOT NULL;

-- This table already exists for idempotent webhook receipt. Ensure its
-- provider and event reference can be used as a stable delivery key.
CREATE INDEX IF NOT EXISTS marketplace_webhook_processing_idx
  ON public.marketplace_webhook_events(provider,processing_status,received_at);

COMMENT ON TABLE public.marketplace_seller_paypal_accounts IS
  'Private PayPal multiparty seller onboarding state. A browser redirect is never sufficient to mark a seller verified; the server checks merchant-integrations.';
COMMENT ON TABLE public.marketplace_seller_payment_transactions IS
  'One PayPal purchase-unit transaction per Minglora seller sub-order. Captures are reconciled independently to handle partial multi-seller captures.';
COMMENT ON COLUMN public.marketplace_payment_attempts.provider_approval_url IS
  'Short-lived PayPal approval link. Do not expose to unauthenticated users or log it.';

COMMIT;
