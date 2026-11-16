BEGIN;

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
  v_refund_total bigint;
BEGIN
  IF p_refund_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Refund and approving moderator references are required';
  END IF;
  SELECT * INTO v_refund FROM public.marketplace_refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace refund request was not found'; END IF;
  IF v_refund.status='succeeded' THEN
    RETURN jsonb_build_object('refundId',v_refund.id,'status','succeeded','idempotent',true);
  END IF;
  IF v_refund.status NOT IN ('requested','failed') THEN
    RAISE EXCEPTION 'This refund request is already being processed or is not eligible for approval';
  END IF;

  SELECT * INTO v_case FROM public.marketplace_cases WHERE id=v_refund.case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status NOT IN ('open','under_review','resolved_buyer') THEN
    RAISE EXCEPTION 'The refund case is not in an approvable state';
  END IF;

  SELECT * INTO v_seller_order FROM public.marketplace_seller_orders
  WHERE id=v_refund.seller_order_id AND order_id=v_refund.order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The seller order linked to the refund was not found'; END IF;

  SELECT * INTO v_tx
  FROM public.marketplace_seller_payment_transactions
  WHERE seller_order_id=v_seller_order.id AND seller_id=v_seller_order.seller_id
    AND provider='paypal' AND status='captured' AND disbursement_mode='DELAYED'
  ORDER BY captured_at DESC NULLS LAST,created_at DESC
  LIMIT 1 FOR SHARE;
  IF NOT FOUND OR nullif(v_tx.provider_capture_id,'') IS NULL THEN
    RAISE EXCEPTION 'The captured PayPal transaction is not available for refund';
  END IF;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_refund_total
  FROM public.marketplace_refunds
  WHERE seller_order_id=v_seller_order.id
    AND status IN ('requested','processing','succeeded');
  IF v_refund_total>v_tx.amount_minor THEN
    RAISE EXCEPTION 'Active and completed refund amounts exceed the original capture';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_payouts
    WHERE seller_order_id=v_seller_order.id AND status IN ('paid','processing')
  ) THEN
    RAISE EXCEPTION 'The seller payout has already been paid or is in progress; the refund needs manual financial review';
  END IF;

  SELECT * INTO v_account FROM public.marketplace_seller_paypal_accounts
  WHERE user_id=v_seller_order.seller_id;
  IF NOT FOUND OR v_account.onboarding_status<>'verified'
     OR NOT v_account.permissions_granted OR NOT v_account.consent_granted
     OR NOT v_account.payments_receivable OR NOT v_account.primary_email_confirmed
     OR nullif(v_account.paypal_account_email,'') IS NULL
     OR NOT (v_account.granted_features @> ARRAY['REFUND']::text[]) THEN
    RAISE EXCEPTION 'The seller PayPal account is not currently approved for marketplace refunds';
  END IF;

  -- Reapply the payout hold on initial approval and every safe retry.
  UPDATE public.marketplace_seller_orders
  SET payout_status='held',updated_at=now()
  WHERE id=v_seller_order.id AND payout_status<>'paid';
  UPDATE public.marketplace_payouts
  SET status='held',provider_disbursement_status='REFUND_REVIEW',
      response_snapshot=response_snapshot||jsonb_build_object('refundRequestId',v_refund.id),
      last_attempt_at=now()
  WHERE seller_order_id=v_seller_order.id AND status='queued';

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

COMMIT;
