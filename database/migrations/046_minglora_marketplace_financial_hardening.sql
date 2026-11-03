BEGIN;

-- Minglora Marketplace financial hardening. Forward-only: migrations 029-038
-- are already installed and must not be replayed.
ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS captured_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE public.marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_status_check,
  DROP CONSTRAINT IF EXISTS marketplace_orders_payment_status_check;
ALTER TABLE public.marketplace_orders
  ADD CONSTRAINT marketplace_orders_status_check
    CHECK (status = ANY (ARRAY[
      'awaiting_payment','paid','partially_paid','processing','partially_fulfilled',
      'fulfilled','completed','cancelled','disputed','partially_refunded','refunded'
    ])),
  ADD CONSTRAINT marketplace_orders_payment_status_check
    CHECK (payment_status = ANY (ARRAY[
      'not_started','pending','authorized','captured','partially_captured',
      'failed','partially_refunded','refunded','disputed'
    ])),
  ADD CONSTRAINT marketplace_orders_captured_minor_check
    CHECK (captured_minor >= 0 AND captured_minor <= total_minor);

ALTER TABLE public.marketplace_payment_attempts
  DROP CONSTRAINT IF EXISTS marketplace_payment_attempts_status_check;
ALTER TABLE public.marketplace_payment_attempts
  ADD CONSTRAINT marketplace_payment_attempts_status_check
    CHECK (status = ANY (ARRAY[
      'created','approved','captured','partially_captured','failed','voided',
      'partially_refunded','refunded'
    ])),
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'paypal',
  ADD CONSTRAINT marketplace_payment_attempts_payment_method_check
    CHECK (payment_method = ANY (ARRAY['paypal','card','paypal_wallet','alternative']));

ALTER TABLE public.marketplace_payouts
  ADD COLUMN IF NOT EXISTS provider_disbursement_id text,
  ADD COLUMN IF NOT EXISTS provider_disbursement_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_payout_batch_id text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.marketplace_payouts
  DROP CONSTRAINT IF EXISTS marketplace_payouts_disbursement_confirmation_check;
ALTER TABLE public.marketplace_payouts
  ADD CONSTRAINT marketplace_payouts_disbursement_confirmation_check
    CHECK (status <> 'paid' OR (
      nullif(provider_disbursement_id,'') IS NOT NULL
      AND provider_disbursement_status = ANY (ARRAY['SUCCESS','SUCCEEDED','COMPLETED'])
    ));

CREATE TABLE IF NOT EXISTS public.marketplace_financial_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('paypal','other')),
  run_type text NOT NULL CHECK (run_type IN ('scheduled','manual','webhook_recovery')),
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','completed','completed_with_exceptions','failed')),
  currency char(3),
  provider_report_reference text NOT NULL DEFAULT '',
  internal_capture_minor bigint NOT NULL DEFAULT 0 CHECK (internal_capture_minor >= 0),
  internal_payout_minor bigint NOT NULL DEFAULT 0 CHECK (internal_payout_minor >= 0),
  provider_capture_minor bigint CHECK (provider_capture_minor IS NULL OR provider_capture_minor >= 0),
  provider_payout_minor bigint CHECK (provider_payout_minor IS NULL OR provider_payout_minor >= 0),
  variance_minor bigint,
  exception_count integer NOT NULL DEFAULT 0 CHECK (exception_count >= 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS marketplace_financial_reconciliation_runs_created_idx
  ON public.marketplace_financial_reconciliation_runs(provider,started_at DESC);
ALTER TABLE public.marketplace_financial_reconciliation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_financial_reconciliation_runs FROM anon,authenticated;
GRANT ALL ON public.marketplace_financial_reconciliation_runs TO service_role;

-- Keep immutable journal headers and entries, and validate a complete balanced
-- journal at transaction commit rather than relying only on the caller's math.
CREATE OR REPLACE FUNCTION private.validate_marketplace_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_journal_id uuid;
  v_currency char(3);
  v_entry_count integer;
  v_debits numeric;
  v_credits numeric;
  v_wrong_currency integer;
BEGIN
  IF TG_TABLE_NAME = 'marketplace_journals' THEN
    v_journal_id := NEW.id;
  ELSE
    v_journal_id := NEW.journal_id;
  END IF;

  SELECT j.currency INTO v_currency
  FROM public.marketplace_journals AS j
  WHERE j.id = v_journal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace ledger journal % does not exist', v_journal_id;
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(e.amount_minor) FILTER (WHERE e.direction = 'debit'), 0),
    coalesce(sum(e.amount_minor) FILTER (WHERE e.direction = 'credit'), 0),
    count(*) FILTER (WHERE a.currency <> v_currency)::integer
  INTO v_entry_count, v_debits, v_credits, v_wrong_currency
  FROM public.marketplace_ledger_entries AS e
  JOIN public.marketplace_ledger_accounts AS a ON a.id = e.account_id
  WHERE e.journal_id = v_journal_id;

  IF v_entry_count < 2 THEN
    RAISE EXCEPTION 'Marketplace journal % must contain at least two entries', v_journal_id;
  END IF;
  IF v_wrong_currency <> 0 THEN
    RAISE EXCEPTION 'Marketplace journal % contains an account in a different currency', v_journal_id;
  END IF;
  IF v_debits <> v_credits THEN
    RAISE EXCEPTION 'Marketplace journal % is unbalanced: debits %, credits %',
      v_journal_id, v_debits, v_credits;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS marketplace_journal_balance_on_header ON public.marketplace_journals;
CREATE CONSTRAINT TRIGGER marketplace_journal_balance_on_header
AFTER INSERT ON public.marketplace_journals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.validate_marketplace_journal_balance();

DROP TRIGGER IF EXISTS marketplace_journal_balance_on_entry ON public.marketplace_ledger_entries;
CREATE CONSTRAINT TRIGGER marketplace_journal_balance_on_entry
AFTER INSERT ON public.marketplace_ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.validate_marketplace_journal_balance();

CREATE OR REPLACE FUNCTION private.prevent_marketplace_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Marketplace journal headers are immutable; post a reversing journal instead';
END;
$function$;
DROP TRIGGER IF EXISTS marketplace_journals_immutable ON public.marketplace_journals;
CREATE TRIGGER marketplace_journals_immutable
BEFORE UPDATE OR DELETE ON public.marketplace_journals
FOR EACH ROW EXECUTE FUNCTION private.prevent_marketplace_journal_mutation();

-- A capture creates seller payable and platform revenue, not a payout.
-- Processing fees are separately cleared because PayPal deducts them from
-- seller proceeds. A second journal records that deduction explicitly.
CREATE OR REPLACE FUNCTION private.post_marketplace_capture_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_platform_clearing uuid;
  v_platform_fee_payable uuid;
  v_platform_commission uuid;
  v_seller_payable uuid;
  v_journal_id uuid;
  v_fee_journal_id uuid;
  v_capture_ref text;
BEGIN
  IF NEW.status <> 'captured' OR nullif(NEW.provider_capture_id,'') IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'captured'
     AND OLD.provider_capture_id = NEW.provider_capture_id THEN
    RETURN NEW;
  END IF;
  IF NEW.amount_minor <> NEW.platform_fee_minor + NEW.processor_fee_minor + NEW.seller_net_minor
     OR NEW.seller_net_minor <= 0 THEN
    RAISE EXCEPTION 'Captured seller transaction does not balance to its gross amount';
  END IF;

  v_capture_ref := NEW.provider || ':capture:' || NEW.provider_capture_id;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_journals AS j
    WHERE j.source_type = 'payment_capture' AND j.source_reference = v_capture_ref
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'processor_clearing',NEW.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'processor_fee_payable',NEW.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'marketplace_commission_revenue',NEW.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NEW.seller_id,'seller_payable',NEW.currency)
  ON CONFLICT (owner_user_id,account_code,currency) DO NOTHING;

  SELECT id INTO STRICT v_platform_clearing
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='processor_clearing' AND currency=NEW.currency;
  SELECT id INTO STRICT v_platform_fee_payable
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='processor_fee_payable' AND currency=NEW.currency;
  SELECT id INTO STRICT v_platform_commission
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='marketplace_commission_revenue' AND currency=NEW.currency;
  SELECT id INTO STRICT v_seller_payable
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id=NEW.seller_id AND account_code='seller_payable' AND currency=NEW.currency;

  INSERT INTO public.marketplace_journals(order_id,source_type,source_reference,currency,description)
  VALUES (
    (SELECT so.order_id FROM public.marketplace_seller_orders AS so WHERE so.id=NEW.seller_order_id),
    'payment_capture',v_capture_ref,NEW.currency,
    'PayPal captured seller order; gross proceeds allocated to seller payable, processor fee and marketplace commission.'
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
  VALUES
    (v_journal_id,v_platform_clearing,'debit',NEW.amount_minor),
    (v_journal_id,v_seller_payable,'credit',NEW.seller_net_minor);
  IF NEW.platform_fee_minor > 0 THEN
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES (v_journal_id,v_platform_commission,'credit',NEW.platform_fee_minor);
  END IF;
  IF NEW.processor_fee_minor > 0 THEN
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES (v_journal_id,v_platform_fee_payable,'credit',NEW.processor_fee_minor);

    INSERT INTO public.marketplace_journals(order_id,source_type,source_reference,currency,description)
    VALUES (
      (SELECT so.order_id FROM public.marketplace_seller_orders AS so WHERE so.id=NEW.seller_order_id),
      'adjustment','paypal:processor-fee:'||NEW.provider_capture_id,NEW.currency,
      'PayPal processor fee deducted from the captured seller proceeds.'
    )
    RETURNING id INTO v_fee_journal_id;
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES
      (v_fee_journal_id,v_platform_fee_payable,'debit',NEW.processor_fee_minor),
      (v_fee_journal_id,v_platform_clearing,'credit',NEW.processor_fee_minor);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS marketplace_capture_posts_ledger ON public.marketplace_seller_payment_transactions;
CREATE TRIGGER marketplace_capture_posts_ledger
AFTER INSERT OR UPDATE OF status,provider_capture_id
ON public.marketplace_seller_payment_transactions
FOR EACH ROW EXECUTE FUNCTION private.post_marketplace_capture_ledger();

-- Capture must never be mistaken for seller disbursement. Legacy 036 inserts
-- "paid" on capture; this guard turns that premature state into a payable queue.
CREATE OR REPLACE FUNCTION private.guard_marketplace_payout_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status='paid' AND (
    nullif(NEW.provider_disbursement_id,'') IS NULL
    OR NEW.provider_disbursement_status <> ALL (ARRAY['SUCCESS','SUCCEEDED','COMPLETED'])
  ) THEN
    NEW.status := 'queued';
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS marketplace_payout_requires_provider_confirmation ON public.marketplace_payouts;
CREATE TRIGGER marketplace_payout_requires_provider_confirmation
BEFORE INSERT OR UPDATE OF status,provider_disbursement_id,provider_disbursement_status
ON public.marketplace_payouts
FOR EACH ROW EXECUTE FUNCTION private.guard_marketplace_payout_status();

CREATE OR REPLACE FUNCTION private.guard_marketplace_seller_payout_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.payout_status='paid' AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_payouts AS p
    WHERE p.seller_order_id=NEW.id AND p.status='paid'
  ) THEN
    NEW.payout_status := 'eligible';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS marketplace_seller_order_requires_paid_payout ON public.marketplace_seller_orders;
CREATE TRIGGER marketplace_seller_order_requires_paid_payout
BEFORE UPDATE OF payout_status ON public.marketplace_seller_orders
FOR EACH ROW EXECUTE FUNCTION private.guard_marketplace_seller_payout_status();

CREATE OR REPLACE FUNCTION private.post_marketplace_payout_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_seller_payable uuid;
  v_platform_clearing uuid;
  v_order_id uuid;
  v_journal_id uuid;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;
  IF nullif(NEW.provider_disbursement_id,'') IS NULL
     OR NEW.provider_disbursement_status <> ALL (ARRAY['SUCCESS','SUCCEEDED','COMPLETED']) THEN
    RAISE EXCEPTION 'A seller payout cannot be posted before PayPal confirms disbursement';
  END IF;

  SELECT so.order_id INTO STRICT v_order_id
  FROM public.marketplace_seller_orders AS so
  WHERE so.id=NEW.seller_order_id AND so.seller_id=NEW.seller_id;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NEW.seller_id,'seller_payable',NEW.currency)
  ON CONFLICT (owner_user_id,account_code,currency) DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'processor_clearing',NEW.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  SELECT id INTO STRICT v_seller_payable
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id=NEW.seller_id AND account_code='seller_payable' AND currency=NEW.currency;
  SELECT id INTO STRICT v_platform_clearing
  FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='processor_clearing' AND currency=NEW.currency;

  INSERT INTO public.marketplace_journals(order_id,source_type,source_reference,currency,description)
  VALUES (
    v_order_id,'payout','paypal:marketplace-payout:'||NEW.id::text,NEW.currency,
    'PayPal confirmed the delayed seller disbursement.'
  )
  RETURNING id INTO v_journal_id;
  INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
  VALUES
    (v_journal_id,v_seller_payable,'debit',NEW.amount_minor),
    (v_journal_id,v_platform_clearing,'credit',NEW.amount_minor);

  UPDATE public.marketplace_seller_orders
  SET payout_status='paid',updated_at=now()
  WHERE id=NEW.seller_order_id AND seller_id=NEW.seller_id;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS marketplace_paid_payout_posts_ledger ON public.marketplace_payouts;
CREATE TRIGGER marketplace_paid_payout_posts_ledger
AFTER UPDATE OF status ON public.marketplace_payouts
FOR EACH ROW
WHEN (NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION private.post_marketplace_payout_ledger();

-- A payout can be claimed only after seller fulfilment is complete and the
-- PayPal seller account has the delayed-disbursement capability.
CREATE OR REPLACE FUNCTION public.claim_marketplace_payout(
  p_payout_id uuid,
  p_seller_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_payout public.marketplace_payouts%ROWTYPE;
  v_order public.marketplace_seller_orders%ROWTYPE;
  v_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_account public.marketplace_seller_paypal_accounts%ROWTYPE;
  v_seller public.marketplace_seller_profiles%ROWTYPE;
BEGIN
  IF p_payout_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'Seller and payout references are required';
  END IF;
  SELECT * INTO v_payout FROM public.marketplace_payouts
  WHERE id=p_payout_id AND seller_id=p_seller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller payout was not found'; END IF;
  IF v_payout.status='paid' THEN
    RETURN jsonb_build_object('status','paid','idempotent',true,'payoutId',v_payout.id);
  END IF;
  IF v_payout.status NOT IN ('queued','processing') THEN
    RAISE EXCEPTION 'This payout is not eligible for disbursement';
  END IF;
  SELECT * INTO v_order FROM public.marketplace_seller_orders
  WHERE id=v_payout.seller_order_id AND seller_id=p_seller_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('delivered','completed')
     OR v_order.payout_status NOT IN ('eligible','queued','failed') THEN
    RAISE EXCEPTION 'Seller order must be delivered or completed before payout';
  END IF;
  SELECT * INTO v_tx FROM public.marketplace_seller_payment_transactions
  WHERE id=v_payout.seller_payment_transaction_id
    AND seller_order_id=v_order.id
    AND seller_id=p_seller_id
    AND status='captured'
    AND disbursement_mode='DELAYED'
  FOR SHARE;
  IF NOT FOUND OR nullif(v_tx.provider_capture_id,'') IS NULL THEN
    RAISE EXCEPTION 'The delayed PayPal capture reference is missing';
  END IF;
  SELECT * INTO v_seller FROM public.marketplace_seller_profiles
  WHERE user_id=p_seller_id;
  SELECT * INTO v_account FROM public.marketplace_seller_paypal_accounts
  WHERE user_id=p_seller_id;
  IF NOT FOUND OR v_seller.status<>'approved' OR v_seller.identity_status<>'verified'
     OR v_seller.payout_status<>'verified'
     OR v_account.onboarding_status<>'verified'
     OR NOT v_account.payments_receivable
     OR NOT (v_account.granted_features @> ARRAY['DELAY_FUNDS_DISBURSEMENT']::text[]) THEN
    RAISE EXCEPTION 'Seller PayPal account is not approved for delayed disbursement';
  END IF;

  UPDATE public.marketplace_payouts
  SET status='processing',
      attempt_count=attempt_count+CASE WHEN status='queued' THEN 1 ELSE 0 END,
      last_attempt_at=coalesce(last_attempt_at,now())
  WHERE id=payout_id
  RETURNING * INTO v_payout;
  RETURN jsonb_build_object(
    'payoutId',v_payout.id,
    'sellerId',p_seller_id,
    'sellerOrderId',v_order.id,
    'providerCaptureId',v_tx.provider_capture_id,
    'merchantId',v_account.merchant_id,
    'currency',v_payout.currency,
    'amountMinor',v_payout.amount_minor,
    'status',v_payout.status,
    'requestId','MINGLORA-REF-PAYOUT-'||v_payout.id::text
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_marketplace_payout(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_payout(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_marketplace_payout(
  p_payout_id uuid,
  p_provider_disbursement_id text,
  p_provider_status text,
  p_response_snapshot jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_payout public.marketplace_payouts%ROWTYPE;
  v_status text := upper(coalesce(p_provider_status,''));
BEGIN
  IF p_payout_id IS NULL OR nullif(p_provider_disbursement_id,'') IS NULL
     OR length(p_provider_disbursement_id)>160
     OR v_status NOT IN ('SUCCESS','SUCCEEDED','COMPLETED') THEN
    RAISE EXCEPTION 'A successful PayPal disbursement reference is required';
  END IF;
  SELECT * INTO v_payout FROM public.marketplace_payouts
  WHERE id=p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace payout not found'; END IF;
  IF v_payout.status='paid' THEN
    IF v_payout.provider_disbursement_id<>p_provider_disbursement_id THEN
      RAISE EXCEPTION 'This payout has already been confirmed with a different provider reference';
    END IF;
    RETURN jsonb_build_object('paid',true,'idempotent',true,'payoutId',p_payout_id);
  END IF;
  IF v_payout.status<>'processing' THEN
    RAISE EXCEPTION 'Payout must be in processing state before provider confirmation';
  END IF;

  UPDATE public.marketplace_payouts
  SET status='paid',
      provider_disbursement_id=p_provider_disbursement_id,
      provider_disbursement_status=v_status,
      response_snapshot=coalesce(p_response_snapshot,'{}'::jsonb),
      reconciled_at=now(),
      completed_at=now()
  WHERE id=p_payout_id;
  RETURN jsonb_build_object('paid',true,'idempotent',false,'payoutId',p_payout_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_marketplace_payout(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_marketplace_payout(uuid,text,text,jsonb) TO service_role;

-- Replace the original all-or-nothing reconciler with a per-seller partial
-- capture reconciler. Each captured purchase unit is journaled independently;
-- declined units release only their own reservations and never become payable.
CREATE OR REPLACE FUNCTION public.complete_marketplace_paypal_capture(
  p_buyer_id uuid,
  p_order_id uuid,
  p_attempt_id uuid,
  p_provider_order_id text,
  p_capture_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_order public.marketplace_orders%ROWTYPE;
  v_attempt public.marketplace_payment_attempts%ROWTYPE;
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_existing_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_reservation public.marketplace_inventory_reservations%ROWTYPE;
  v_capture jsonb;
  v_expected_count integer;
  v_processed_count integer := 0;
  v_captured_count integer := 0;
  v_captured_total bigint := 0;
  v_seller_order_id uuid;
  v_capture_id text;
  v_status text;
  v_provider_status text;
  v_amount bigint;
  v_platform_fee bigint;
  v_processor_fee bigint;
  v_seller_net bigint;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_buyer_id IS NULL OR p_order_id IS NULL OR p_attempt_id IS NULL
     OR nullif(p_provider_order_id,'') IS NULL
     OR jsonb_typeof(p_capture_rows)<>'array' THEN
    RAISE EXCEPTION 'Invalid PayPal capture reconciliation request';
  END IF;
  SELECT * INTO v_order FROM public.marketplace_orders
  WHERE id=p_order_id AND buyer_id=p_buyer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace order not found'; END IF;
  SELECT * INTO v_attempt FROM public.marketplace_payment_attempts
  WHERE id=p_attempt_id AND order_id=p_order_id AND provider='paypal' FOR UPDATE;
  IF NOT FOUND OR v_attempt.provider_order_id<>p_provider_order_id THEN
    RAISE EXCEPTION 'PayPal payment attempt does not match this order';
  END IF;

  IF v_attempt.status IN ('captured','partially_captured','failed') THEN
    RETURN jsonb_build_object(
      'paid',v_attempt.status='captured',
      'partiallyPaid',v_attempt.status='partially_captured',
      'idempotent',true,'orderId',p_order_id,
      'capturedMinor',v_order.captured_minor,
      'paymentStatus',v_order.payment_status
    );
  END IF;
  IF v_order.status<>'awaiting_payment'
     OR v_order.payment_status NOT IN ('pending','not_started','failed')
     OR v_attempt.status NOT IN ('created','approved') THEN
    RAISE EXCEPTION 'Marketplace order is not in a capturable state';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.marketplace_seller_orders WHERE order_id=p_order_id;
  IF v_expected_count<1 OR v_expected_count>10
     OR jsonb_array_length(p_capture_rows)<>v_expected_count THEN
    RAISE EXCEPTION 'PayPal must return one capture result for every seller order';
  END IF;

  FOR v_capture IN SELECT value FROM jsonb_array_elements(p_capture_rows)
  LOOP
    v_seller_order_id := nullif(v_capture->>'sellerOrderId','')::uuid;
    v_status := lower(coalesce(v_capture->>'status',''));
    v_provider_status := upper(coalesce(v_capture->>'providerStatus',''));
    v_capture_id := nullif(v_capture->>'providerCaptureId','');
    IF v_seller_order_id IS NULL OR v_seller_order_id=ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'PayPal returned a missing or duplicate seller order reference';
    END IF;
    v_seen_ids := array_append(v_seen_ids,v_seller_order_id);
    SELECT * INTO v_seller_order FROM public.marketplace_seller_orders
    WHERE id=v_seller_order_id AND order_id=p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PayPal returned an unknown seller order'; END IF;

    SELECT * INTO v_existing_tx FROM public.marketplace_seller_payment_transactions
    WHERE payment_attempt_id=p_attempt_id AND seller_order_id=v_seller_order_id FOR UPDATE;

    IF v_status='captured' THEN
      v_amount := nullif(v_capture->>'amountMinor','')::bigint;
      v_platform_fee := nullif(v_capture->>'platformFeeMinor','')::bigint;
      v_processor_fee := nullif(v_capture->>'processorFeeMinor','')::bigint;
      v_seller_net := nullif(v_capture->>'sellerNetMinor','')::bigint;
      IF v_capture_id IS NULL OR length(v_capture_id)>128 OR v_provider_status<>'COMPLETED'
         OR v_amount IS NULL OR v_platform_fee IS NULL OR v_processor_fee IS NULL OR v_seller_net IS NULL THEN
        RAISE EXCEPTION 'A completed seller capture is missing verified financial details';
      END IF;
      IF v_amount<>v_seller_order.gross_minor
         OR v_platform_fee<>v_seller_order.commission_minor
         OR v_processor_fee<0 OR v_seller_net<=0
         OR v_seller_net<>(v_seller_order.gross_minor-v_seller_order.commission_minor-v_processor_fee) THEN
        RAISE EXCEPTION 'PayPal capture amount, platform fee or seller net does not match the seller order ledger';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.marketplace_seller_payment_transactions
        WHERE provider='paypal' AND provider_capture_id=v_capture_id
          AND seller_order_id<>v_seller_order_id
      ) THEN RAISE EXCEPTION 'PayPal capture ID is already linked to another seller order'; END IF;
      IF FOUND AND v_existing_tx.status='captured' THEN
        IF v_existing_tx.provider_capture_id<>v_capture_id
           OR v_existing_tx.amount_minor<>v_amount
           OR v_existing_tx.seller_net_minor<>v_seller_net THEN
          RAISE EXCEPTION 'An existing seller capture conflicts with PayPal reconciliation';
        END IF;
      ELSE
        INSERT INTO public.marketplace_seller_payment_transactions(
          payment_attempt_id,seller_order_id,seller_id,provider,provider_order_id,
          provider_reference_id,provider_capture_id,currency,amount_minor,
          platform_fee_minor,processor_fee_minor,seller_net_minor,status,
          disbursement_mode,provider_status,captured_at,updated_at
        ) VALUES (
          p_attempt_id,v_seller_order_id,v_seller_order.seller_id,'paypal',
          p_provider_order_id,v_seller_order_id::text,v_capture_id,v_order.currency,
          v_amount,v_platform_fee,v_processor_fee,v_seller_net,'captured','DELAYED',
          v_provider_status,now(),now()
        )
        ON CONFLICT(payment_attempt_id,seller_order_id) DO UPDATE SET
          provider_capture_id=excluded.provider_capture_id,
          amount_minor=excluded.amount_minor,
          platform_fee_minor=excluded.platform_fee_minor,
          processor_fee_minor=excluded.processor_fee_minor,
          seller_net_minor=excluded.seller_net_minor,
          status='captured',disbursement_mode='DELAYED',
          provider_status=excluded.provider_status,
          captured_at=coalesce(public.marketplace_seller_payment_transactions.captured_at,now()),
          updated_at=now();
      END IF;

      INSERT INTO public.marketplace_payouts(
        seller_id,seller_order_id,seller_payment_transaction_id,provider,
        provider_payout_reference,currency,amount_minor,status,idempotency_key,
        initiated_at
      )
      SELECT
        v_seller_order.seller_id,v_seller_order_id,t.id,'paypal',v_capture_id,
        v_order.currency,v_seller_net,'queued','paypal-reference-payout-'||v_capture_id,now()
      FROM public.marketplace_seller_payment_transactions AS t
      WHERE t.payment_attempt_id=p_attempt_id AND t.seller_order_id=v_seller_order_id
      ON CONFLICT(idempotency_key) DO NOTHING;

      UPDATE public.marketplace_seller_orders
      SET processor_fee_minor=v_processor_fee,
          seller_net_minor=v_seller_net,
          payout_status='eligible',
          payout_eligible_at=coalesce(payout_eligible_at,now()),
          updated_at=now()
      WHERE id=v_seller_order_id;
      FOR v_reservation IN
        SELECT r.* FROM public.marketplace_inventory_reservations AS r
        JOIN public.marketplace_order_items AS oi
          ON oi.seller_order_id=v_seller_order_id AND oi.listing_id=r.listing_id
        WHERE r.order_id=p_order_id AND r.status='reserved'
        ORDER BY r.listing_id FOR UPDATE OF r
      LOOP
        UPDATE public.marketplace_listings
        SET quantity=greatest(0,quantity-v_reservation.quantity),
            reserved_quantity=greatest(0,reserved_quantity-v_reservation.quantity),
            updated_at=now()
        WHERE id=v_reservation.listing_id;
        UPDATE public.marketplace_inventory_reservations
        SET status='committed',updated_at=now()
        WHERE id=v_reservation.id;
      END LOOP;
      v_captured_count := v_captured_count+1;
      v_captured_total := v_captured_total+v_amount;

    ELSIF v_status='declined' AND v_provider_status='DECLINED' AND v_capture_id IS NULL THEN
      IF v_existing_tx.id IS NULL THEN
        INSERT INTO public.marketplace_seller_payment_transactions(
          payment_attempt_id,seller_order_id,seller_id,provider,provider_order_id,
          provider_reference_id,currency,amount_minor,platform_fee_minor,
          processor_fee_minor,seller_net_minor,status,disbursement_mode,
          provider_status,updated_at
        ) VALUES (
          p_attempt_id,v_seller_order_id,v_seller_order.seller_id,'paypal',
          p_provider_order_id,v_seller_order_id::text,v_order.currency,
          v_seller_order.gross_minor,0,0,0,'failed','DELAYED',
          v_provider_status,now()
        );
      ELSIF v_existing_tx.status<>'failed' THEN
        RAISE EXCEPTION 'A previously captured seller transaction cannot be overwritten as declined';
      END IF;
      UPDATE public.marketplace_seller_orders
      SET status='cancelled',payout_status='not_eligible',updated_at=now()
      WHERE id=v_seller_order_id;
      FOR v_reservation IN
        SELECT r.* FROM public.marketplace_inventory_reservations AS r
        JOIN public.marketplace_order_items AS oi
          ON oi.seller_order_id=v_seller_order_id AND oi.listing_id=r.listing_id
        WHERE r.order_id=p_order_id AND r.status='reserved'
        ORDER BY r.listing_id FOR UPDATE OF r
      LOOP
        UPDATE public.marketplace_listings
        SET reserved_quantity=greatest(0,reserved_quantity-v_reservation.quantity),
            updated_at=now()
        WHERE id=v_reservation.listing_id;
        UPDATE public.marketplace_inventory_reservations
        SET status='released',updated_at=now()
        WHERE id=v_reservation.id;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'PayPal seller unit must be COMPLETED or DECLINED; unknown state received';
    END IF;
    v_processed_count := v_processed_count+1;
  END LOOP;

  IF v_processed_count<>v_expected_count THEN
    RAISE EXCEPTION 'Not all seller purchase units were reconciled';
  END IF;

  IF v_captured_count=v_expected_count THEN
    UPDATE public.marketplace_payment_attempts SET status='captured',
      provider_status='COMPLETED',captured_at=now(),updated_at=now()
    WHERE id=p_attempt_id;
    UPDATE public.marketplace_orders SET status='paid',payment_status='captured',
      captured_minor=v_captured_total,updated_at=now()
    WHERE id=p_order_id;
  ELSIF v_captured_count=0 THEN
    UPDATE public.marketplace_payment_attempts SET status='failed',
      provider_status='DECLINED',updated_at=now()
    WHERE id=p_attempt_id;
    UPDATE public.marketplace_orders SET status='cancelled',payment_status='failed',
      captured_minor=0,updated_at=now()
    WHERE id=p_order_id;
  ELSE
    UPDATE public.marketplace_payment_attempts SET status='partially_captured',
      provider_status='PARTIALLY_COMPLETED',captured_at=now(),updated_at=now()
    WHERE id=p_attempt_id;
    UPDATE public.marketplace_orders SET status='partially_paid',
      payment_status='partially_captured',captured_minor=v_captured_total,updated_at=now()
    WHERE id=p_order_id;
  END IF;

  INSERT INTO public.marketplace_order_events(
    order_id,actor_id,event_type,from_status,to_status,note,metadata
  ) VALUES (
    p_order_id,p_buyer_id,'paypal_capture_reconciled','awaiting_payment',
    CASE WHEN v_captured_count=v_expected_count THEN 'paid'
         WHEN v_captured_count=0 THEN 'cancelled'
         ELSE 'partially_paid' END,
    'Seller purchase units were reconciled independently; only completed captures create seller payables.',
    jsonb_build_object(
      'paymentAttemptId',p_attempt_id,
      'providerOrderId',p_provider_order_id,
      'sellerUnits',v_processed_count,
      'capturedSellerUnits',v_captured_count,
      'capturedMinor',v_captured_total
    )
  );
  RETURN jsonb_build_object(
    'paid',v_captured_count=v_expected_count,
    'partiallyPaid',v_captured_count>0 AND v_captured_count<v_expected_count,
    'idempotent',false,'orderId',p_order_id,
    'paymentAttemptId',p_attempt_id,
    'sellerTransactions',v_processed_count,
    'capturedSellerUnits',v_captured_count,
    'capturedMinor',v_captured_total
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) TO service_role;

-- Read-only internal snapshot for the reconciliation worker and administrator.
CREATE OR REPLACE FUNCTION public.marketplace_financial_reconciliation_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'capturedGrossMinor',coalesce(sum(t.amount_minor) FILTER (WHERE t.status='captured'),0),
    'platformFeesMinor',coalesce(sum(t.platform_fee_minor) FILTER (WHERE t.status='captured'),0),
    'processorFeesMinor',coalesce(sum(t.processor_fee_minor) FILTER (WHERE t.status='captured'),0),
    'sellerNetCapturedMinor',coalesce(sum(t.seller_net_minor) FILTER (WHERE t.status='captured'),0),
    'capturedTransactions',count(*) FILTER (WHERE t.status='captured'),
    'failedSellerUnits',count(*) FILTER (WHERE t.status='failed'),
    'queuedPayouts',count(*) FILTER (WHERE p.status='queued'),
    'processingPayouts',count(*) FILTER (WHERE p.status='processing'),
    'paidPayouts',count(*) FILTER (WHERE p.status='paid'),
    'heldPayouts',count(*) FILTER (WHERE p.status='held'),
    'queuedPayoutMinor',coalesce(sum(p.amount_minor) FILTER (WHERE p.status IN ('queued','processing','held')),0),
    'paidPayoutMinor',coalesce(sum(p.amount_minor) FILTER (WHERE p.status='paid'),0)
  ) INTO v_result
  FROM public.marketplace_seller_payment_transactions AS t
  FULL OUTER JOIN public.marketplace_payouts AS p
    ON p.seller_payment_transaction_id=t.id;

  RETURN v_result || jsonb_build_object(
    'unbalancedJournals',(
      SELECT count(*) FROM (
        SELECT j.id
        FROM public.marketplace_journals AS j
        LEFT JOIN public.marketplace_ledger_entries AS e ON e.journal_id=j.id
        LEFT JOIN public.marketplace_ledger_accounts AS a ON a.id=e.account_id
        GROUP BY j.id,j.currency
        HAVING count(e.id)<2
          OR coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='debit'),0)
             <> coalesce(sum(e.amount_minor) FILTER (WHERE e.direction='credit'),0)
          OR count(*) FILTER (WHERE a.currency<>j.currency)>0
      ) AS invalid
    ),
    'captureJournalsMissing',(
      SELECT count(*) FROM public.marketplace_seller_payment_transactions AS t
      WHERE t.status='captured'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals AS j
          WHERE j.source_type='payment_capture'
            AND j.source_reference=t.provider||':capture:'||t.provider_capture_id
        )
    ),
    'payoutJournalsMissing',(
      SELECT count(*) FROM public.marketplace_payouts AS p
      WHERE p.status='paid'
        AND NOT EXISTS (
          SELECT 1 FROM public.marketplace_journals AS j
          WHERE j.source_type='payout'
            AND j.source_reference='paypal:marketplace-payout:'||p.id::text
        )
    ),
    'unconfirmedPaidPayouts',(
      SELECT count(*) FROM public.marketplace_payouts AS p
      WHERE p.status='paid' AND (
        nullif(p.provider_disbursement_id,'') IS NULL
        OR p.provider_disbursement_status NOT IN ('SUCCESS','SUCCEEDED','COMPLETED')
      )
    ),
    'checkedAt',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.marketplace_financial_reconciliation_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_financial_reconciliation_snapshot() TO service_role;

COMMENT ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) IS
  'Reconciles each PayPal seller purchase unit independently; partial capture never marks declined seller units paid or eligible for seller payout.';
COMMENT ON FUNCTION public.claim_marketplace_payout(uuid,uuid) IS
  'Claims a delayed-disbursement payout only after order delivery/completion and verified seller payout eligibility.';
COMMENT ON FUNCTION public.confirm_marketplace_payout(uuid,text,text,jsonb) IS
  'Marks a marketplace seller payout paid only after the authenticated PayPal API confirms a successful referenced disbursement.';
COMMENT ON FUNCTION public.marketplace_financial_reconciliation_snapshot() IS
  'Returns a read-only financial integrity snapshot for internal reconciliation; it does not claim an external bank or PayPal statement balance.';

COMMIT;
