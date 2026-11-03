BEGIN;

ALTER TABLE public.marketplace_refunds
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_refunds_pending_seller_order_idx
  ON public.marketplace_refunds(seller_order_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.request_marketplace_refund(
  p_buyer_id uuid,
  p_seller_order_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_order public.marketplace_orders%ROWTYPE;
  v_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_existing public.marketplace_refunds%ROWTYPE;
  v_case_id uuid;
  v_refund_id uuid;
  v_requested bigint;
  v_remaining bigint;
BEGIN
  IF p_buyer_id IS NULL OR p_seller_order_id IS NULL OR p_amount_minor IS NULL
     OR p_amount_minor<=0 OR length(btrim(coalesce(p_reason,'')))<10
     OR length(p_reason)>1000 OR length(coalesce(p_idempotency_key,''))<8
     OR length(p_idempotency_key)>128 THEN
    RAISE EXCEPTION 'Provide a valid seller order, refund amount, reason and idempotency key';
  END IF;

  SELECT * INTO v_existing
  FROM public.marketplace_refunds
  WHERE idempotency_key=p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.requested_by<>p_buyer_id OR v_existing.seller_order_id<>p_seller_order_id
       OR v_existing.amount_minor<>p_amount_minor THEN
      RAISE EXCEPTION 'This refund idempotency key is already in use for a different request';
    END IF;
    RETURN jsonb_build_object(
      'refundId',v_existing.id,'caseId',v_existing.case_id,
      'status',v_existing.status,'idempotent',true,
      'amountMinor',v_existing.amount_minor,'currency',v_existing.currency
    );
  END IF;

  SELECT * INTO v_seller_order
  FROM public.marketplace_seller_orders
  WHERE id=p_seller_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace seller order was not found'; END IF;

  SELECT * INTO v_order
  FROM public.marketplace_orders
  WHERE id=v_seller_order.order_id AND buyer_id=p_buyer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the buyer who paid for this order can request a refund'; END IF;

  SELECT * INTO v_tx
  FROM public.marketplace_seller_payment_transactions
  WHERE seller_order_id=v_seller_order.id
    AND seller_id=v_seller_order.seller_id
    AND provider='paypal'
    AND status='captured'
    AND disbursement_mode='DELAYED'
    AND nullif(provider_capture_id,'') IS NOT NULL
  ORDER BY captured_at DESC NULLS LAST,created_at DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A verified delayed-disbursement PayPal capture is required before a refund can be requested';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_payouts p
    WHERE p.seller_order_id=v_seller_order.id
      AND p.status IN ('paid','processing')
  ) THEN
    RAISE EXCEPTION 'This seller order has already been paid or has an active payout. A marketplace moderator must resolve the payout before refunding it';
  END IF;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_requested
  FROM public.marketplace_refunds
  WHERE seller_order_id=v_seller_order.id
    AND status IN ('requested','processing','succeeded');
  v_remaining:=v_tx.amount_minor-v_requested;
  IF p_amount_minor>v_remaining OR v_remaining<=0 THEN
    RAISE EXCEPTION 'The requested refund exceeds the remaining captured, unrefunded amount';
  END IF;

  INSERT INTO public.marketplace_cases(
    seller_order_id,opened_by,category,status,requested_refund_minor,resolution
  ) VALUES (
    v_seller_order.id,p_buyer_id,'refund_request','open',p_amount_minor,'Refund request awaiting marketplace review.'
  ) RETURNING id INTO v_case_id;

  INSERT INTO public.marketplace_refunds(
    order_id,seller_order_id,case_id,provider,idempotency_key,amount_minor,currency,
    status,reason,requested_by,created_at,updated_at
  ) VALUES (
    v_order.id,v_seller_order.id,v_case_id,'paypal',p_idempotency_key,p_amount_minor,v_order.currency,
    'requested',btrim(p_reason),p_buyer_id,now(),now()
  ) RETURNING id INTO v_refund_id;

  UPDATE public.marketplace_seller_orders
  SET payout_status='held',updated_at=now()
  WHERE id=v_seller_order.id;

  UPDATE public.marketplace_payouts
  SET status='held',provider_disbursement_status='REFUND_REVIEW',
      response_snapshot=response_snapshot||jsonb_build_object('refundRequestId',v_refund_id),
      last_attempt_at=now()
  WHERE seller_order_id=v_seller_order.id AND status='queued';

  RETURN jsonb_build_object(
    'refundId',v_refund_id,'caseId',v_case_id,'status','requested',
    'amountMinor',p_amount_minor,'currency',v_order.currency,'remainingBeforeRefundMinor',v_remaining
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_marketplace_refund(uuid,uuid,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_marketplace_refund(uuid,uuid,bigint,text,text) TO service_role;


CREATE OR REPLACE FUNCTION public.claim_marketplace_refund(
  p_refund_id uuid,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_refund public.marketplace_refunds%ROWTYPE;
  v_case public.marketplace_cases%ROWTYPE;
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_account public.marketplace_seller_paypal_accounts%ROWTYPE;
BEGIN
  IF p_refund_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Refund and approving moderator references are required';
  END IF;
  SELECT * INTO v_refund FROM public.marketplace_refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace refund request was not found'; END IF;
  IF v_refund.status='succeeded' THEN
    RETURN jsonb_build_object('refundId',v_refund.id,'status','succeeded','idempotent',true);
  END IF;
  IF v_refund.status NOT IN ('requested','failed','processing') THEN
    RAISE EXCEPTION 'This refund request is not eligible for provider processing';
  END IF;

  SELECT * INTO v_case FROM public.marketplace_cases WHERE id=v_refund.case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status NOT IN ('open','under_review','resolved_buyer') THEN
    RAISE EXCEPTION 'The refund case is not in an approvable state';
  END IF;
  SELECT * INTO v_seller_order FROM public.marketplace_seller_orders
  WHERE id=v_refund.seller_order_id AND order_id=v_refund.order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The seller order linked to the refund was not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_payouts
    WHERE seller_order_id=v_seller_order.id AND status IN ('paid','processing')
  ) THEN
    RAISE EXCEPTION 'The seller payout has already been paid or is in progress; the refund needs manual financial review';
  END IF;

  SELECT * INTO v_tx
  FROM public.marketplace_seller_payment_transactions
  WHERE seller_order_id=v_seller_order.id AND seller_id=v_seller_order.seller_id
    AND provider='paypal' AND status='captured' AND disbursement_mode='DELAYED'
  ORDER BY captured_at DESC NULLS LAST,created_at DESC
  LIMIT 1 FOR SHARE;
  IF NOT FOUND OR nullif(v_tx.provider_capture_id,'') IS NULL THEN
    RAISE EXCEPTION 'The captured PayPal transaction is not available for refund';
  END IF;

  SELECT * INTO v_account
  FROM public.marketplace_seller_paypal_accounts
  WHERE user_id=v_seller_order.seller_id;
  IF NOT FOUND OR v_account.onboarding_status<>'verified'
     OR NOT v_account.permissions_granted OR NOT v_account.consent_granted
     OR NOT v_account.payments_receivable OR NOT v_account.primary_email_confirmed
     OR nullif(v_account.paypal_account_email,'') IS NULL
     OR NOT (v_account.granted_features @> ARRAY['REFUND']::text[]) THEN
    RAISE EXCEPTION 'The seller PayPal account is not currently approved for marketplace refunds';
  END IF;

  UPDATE public.marketplace_refunds
  SET status='processing',approved_by=p_actor_id,approved_at=coalesce(approved_at,now()),
      provider_status='REFUND_SUBMISSION_PENDING',failure_code='',updated_at=now()
  WHERE id=p_refund_id;
  UPDATE public.marketplace_cases
  SET status='resolved_buyer',resolution='Refund approved by an authorized Minglora marketplace moderator.',updated_at=now()
  WHERE id=v_case.id;

  RETURN jsonb_build_object(
    'refundId',v_refund.id,'orderId',v_refund.order_id,'sellerOrderId',v_seller_order.id,
    'sellerId',v_seller_order.seller_id,'captureId',v_tx.provider_capture_id,
    'sellerEmail',v_account.paypal_account_email,'amountMinor',v_refund.amount_minor,
    'currency',v_refund.currency,'idempotencyKey',v_refund.idempotency_key,
    'status','processing'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_marketplace_refund(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_refund(uuid,uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.finalize_marketplace_refund(
  p_refund_id uuid,
  p_provider_refund_reference text,
  p_provider_status text,
  p_amount_minor bigint,
  p_currency text,
  p_response_snapshot jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_refund public.marketplace_refunds%ROWTYPE;
  v_order public.marketplace_orders%ROWTYPE;
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_seller_share bigint;
  v_commission_share bigint;
  v_fee_expense_share bigint;
  v_remaining bigint;
  v_refunded_order bigint;
  v_refunded_seller bigint;
  v_seller_payable uuid;
  v_commission_revenue uuid;
  v_processing_expense uuid;
  v_processor_clearing uuid;
  v_journal_id uuid;
  v_status text:=upper(coalesce(p_provider_status,''));
BEGIN
  IF p_refund_id IS NULL OR nullif(p_provider_status,'') IS NULL THEN
    RAISE EXCEPTION 'Refund reference and provider status are required';
  END IF;
  SELECT * INTO v_refund FROM public.marketplace_refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace refund request was not found'; END IF;
  IF v_refund.status='succeeded' THEN
    RETURN jsonb_build_object('refundId',v_refund.id,'status','succeeded','idempotent',true);
  END IF;
  IF v_refund.status<>'processing' THEN
    RAISE EXCEPTION 'Marketplace refund is not in provider-processing state';
  END IF;

  IF v_status IN ('PENDING','REFUNDPENDING') THEN
    UPDATE public.marketplace_refunds
    SET provider_refund_reference=coalesce(nullif(p_provider_refund_reference,''),provider_refund_reference),
        provider_status=v_status,provider_response_snapshot=coalesce(p_response_snapshot,'{}'::jsonb),
        updated_at=now()
    WHERE id=p_refund_id;
    RETURN jsonb_build_object('refundId',v_refund.id,'status','processing','providerStatus',v_status);
  END IF;

  IF v_status NOT IN ('COMPLETED','REFUNDED','SUCCESS') THEN
    UPDATE public.marketplace_refunds
    SET status='failed',failure_code=coalesce(nullif(v_status,''),'PROVIDER_REFUND_FAILED'),
        provider_status=v_status,provider_response_snapshot=coalesce(p_response_snapshot,'{}'::jsonb),
        updated_at=now()
    WHERE id=p_refund_id;
    UPDATE public.marketplace_cases
    SET status='under_review',resolution='PayPal did not confirm the refund. The case requires another review.',updated_at=now()
    WHERE id=v_refund.case_id;
    UPDATE public.marketplace_seller_orders
    SET payout_status='eligible',updated_at=now()
    WHERE id=v_refund.seller_order_id AND payout_status='held'
      AND NOT EXISTS (
        SELECT 1 FROM public.marketplace_refunds r
        WHERE r.seller_order_id=v_refund.seller_order_id
          AND r.id<>p_refund_id AND r.status IN ('requested','processing')
      );
    UPDATE public.marketplace_payouts
    SET status='queued',provider_disbursement_status='REFUND_FAILED',
        last_attempt_at=now()
    WHERE seller_order_id=v_refund.seller_order_id AND status='held'
      AND response_snapshot->>'refundRequestId'=v_refund.id::text;
    RETURN jsonb_build_object('refundId',v_refund.id,'status','failed','providerStatus',v_status);
  END IF;

  IF nullif(p_provider_refund_reference,'') IS NULL
     OR p_amount_minor<>v_refund.amount_minor
     OR upper(coalesce(p_currency,''))<>upper(v_refund.currency) THEN
    RAISE EXCEPTION 'PayPal refund reference, amount or currency did not match the approved refund';
  END IF;

  SELECT * INTO v_order FROM public.marketplace_orders WHERE id=v_refund.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace order was not found'; END IF;
  SELECT * INTO v_seller_order FROM public.marketplace_seller_orders
  WHERE id=v_refund.seller_order_id AND order_id=v_order.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace seller order was not found'; END IF;
  SELECT * INTO v_tx FROM public.marketplace_seller_payment_transactions
  WHERE seller_order_id=v_seller_order.id AND seller_id=v_seller_order.seller_id
    AND provider='paypal' AND status='captured' AND disbursement_mode='DELAYED'
  ORDER BY captured_at DESC NULLS LAST,created_at DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR v_tx.amount_minor<>v_seller_order.gross_minor THEN
    RAISE EXCEPTION 'The original captured seller transaction does not match the seller order';
  END IF;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_refunded_seller
  FROM public.marketplace_refunds
  WHERE seller_order_id=v_seller_order.id AND status='succeeded';
  IF v_refunded_seller+v_refund.amount_minor>v_tx.amount_minor THEN
    RAISE EXCEPTION 'Confirmed refunds exceed the original seller capture';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_journals
    WHERE source_type='refund'
      AND source_reference='paypal:marketplace-refund:'||v_refund.id::text
  ) THEN
    RAISE EXCEPTION 'This Marketplace refund already has a financial journal';
  END IF;

  v_seller_share:=floor(v_refund.amount_minor::numeric*v_tx.seller_net_minor/v_tx.amount_minor)::bigint;
  v_commission_share:=floor(v_refund.amount_minor::numeric*v_tx.platform_fee_minor/v_tx.amount_minor)::bigint;
  v_fee_expense_share:=v_refund.amount_minor-v_seller_share-v_commission_share;
  IF v_seller_share<0 OR v_commission_share<0 OR v_fee_expense_share<0 THEN
    RAISE EXCEPTION 'Refund allocation calculation produced an invalid ledger amount';
  END IF;

  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (v_seller_order.seller_id,'seller_payable',v_refund.currency)
  ON CONFLICT (owner_user_id,account_code,currency) DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'marketplace_commission_revenue',v_refund.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'payment_processing_expense',v_refund.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;
  INSERT INTO public.marketplace_ledger_accounts(owner_user_id,account_code,currency)
  VALUES (NULL,'processor_clearing',v_refund.currency)
  ON CONFLICT (account_code,currency) WHERE owner_user_id IS NULL DO NOTHING;

  SELECT id INTO STRICT v_seller_payable FROM public.marketplace_ledger_accounts
  WHERE owner_user_id=v_seller_order.seller_id AND account_code='seller_payable' AND currency=v_refund.currency;
  SELECT id INTO STRICT v_commission_revenue FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='marketplace_commission_revenue' AND currency=v_refund.currency;
  SELECT id INTO STRICT v_processing_expense FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='payment_processing_expense' AND currency=v_refund.currency;
  SELECT id INTO STRICT v_processor_clearing FROM public.marketplace_ledger_accounts
  WHERE owner_user_id IS NULL AND account_code='processor_clearing' AND currency=v_refund.currency;

  INSERT INTO public.marketplace_journals(order_id,source_type,source_reference,currency,description)
  VALUES (
    v_refund.order_id,'refund','paypal:marketplace-refund:'||v_refund.id::text,
    v_refund.currency,'PayPal-confirmed buyer refund; seller payable and platform commission are reversed and retained processing fees are expensed.'
  ) RETURNING id INTO v_journal_id;

  IF v_seller_share>0 THEN
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES (v_journal_id,v_seller_payable,'debit',v_seller_share);
  END IF;
  IF v_commission_share>0 THEN
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES (v_journal_id,v_commission_revenue,'debit',v_commission_share);
  END IF;
  IF v_fee_expense_share>0 THEN
    INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
    VALUES (v_journal_id,v_processing_expense,'debit',v_fee_expense_share);
  END IF;
  INSERT INTO public.marketplace_ledger_entries(journal_id,account_id,direction,amount_minor)
  VALUES (v_journal_id,v_processor_clearing,'credit',v_refund.amount_minor);

  UPDATE public.marketplace_refunds
  SET status='succeeded',provider_refund_reference=p_provider_refund_reference,
      provider_status=v_status,provider_response_snapshot=coalesce(p_response_snapshot,'{}'::jsonb),
      completed_at=now(),updated_at=now()
  WHERE id=p_refund_id;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_refunded_seller
  FROM public.marketplace_refunds WHERE seller_order_id=v_seller_order.id AND status='succeeded';
  UPDATE public.marketplace_seller_orders
  SET refunded_minor=v_refunded_seller,
      payout_status=CASE WHEN v_refunded_seller>=v_tx.amount_minor THEN 'not_eligible' ELSE 'eligible' END,
      updated_at=now()
  WHERE id=v_seller_order.id;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_refunded_order
  FROM public.marketplace_refunds WHERE order_id=v_order.id AND status='succeeded';
  UPDATE public.marketplace_orders
  SET refunded_minor=v_refunded_order,
      payment_status=CASE WHEN v_refunded_order>=v_order.captured_minor THEN 'refunded' ELSE 'partially_refunded' END,
      status=CASE WHEN v_refunded_order>=v_order.captured_minor THEN 'refunded' ELSE 'partially_refunded' END,
      updated_at=now()
  WHERE id=v_order.id;

  UPDATE public.marketplace_cases
  SET status='resolved_buyer',resolution='PayPal confirmed the approved refund and Minglora posted its financial reversal.',updated_at=now()
  WHERE id=v_refund.case_id;

  RETURN jsonb_build_object(
    'refundId',v_refund.id,'status','succeeded',
    'amountMinor',v_refund.amount_minor,'currency',v_refund.currency,
    'sellerOrderRefundedMinor',v_refunded_seller,'orderRefundedMinor',v_refunded_order,
    'journalId',v_journal_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_marketplace_refund(uuid,text,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_marketplace_refund(uuid,text,text,bigint,text,jsonb) TO service_role;

COMMIT;
