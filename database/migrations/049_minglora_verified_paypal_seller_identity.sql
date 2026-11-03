BEGIN;

ALTER TABLE public.marketplace_seller_paypal_accounts
  ADD COLUMN IF NOT EXISTS paypal_account_email text;

ALTER TABLE public.marketplace_seller_paypal_accounts
  DROP CONSTRAINT IF EXISTS marketplace_seller_paypal_account_email_check;
ALTER TABLE public.marketplace_seller_paypal_accounts
  ADD CONSTRAINT marketplace_seller_paypal_account_email_check
  CHECK (
    paypal_account_email IS NULL
    OR (
      length(paypal_account_email) <= 254
      AND paypal_account_email = lower(btrim(paypal_account_email))
      AND paypal_account_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  );

COMMENT ON COLUMN public.marketplace_seller_paypal_accounts.paypal_account_email IS
  'Primary PayPal email retrieved from the authenticated PayPal merchant-integrations API after the seller returns from Partner Referrals onboarding. Never populate from browser callback input. It can be used in the PayPal-Auth-Assertion header for delayed disbursement.';

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
  SELECT * INTO v_seller FROM public.marketplace_seller_profiles WHERE user_id=p_seller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller profile is not available'; END IF;
  SELECT * INTO v_account FROM public.marketplace_seller_paypal_accounts WHERE user_id=p_seller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller PayPal account is not available'; END IF;
  IF v_seller.status<>'approved' OR v_seller.identity_status<>'verified'
     OR v_seller.payout_status<>'verified'
     OR v_account.onboarding_status<>'verified'
     OR NOT v_account.payments_receivable
     OR nullif(v_account.paypal_account_email,'') IS NULL
     OR NOT (v_account.granted_features @> ARRAY['DELAY_FUNDS_DISBURSEMENT','PARTNER_FEE']::text[]) THEN
    RAISE EXCEPTION 'Seller PayPal account is not approved for delayed disbursement';
  END IF;

  UPDATE public.marketplace_payouts
  SET status='processing',
      attempt_count=attempt_count+CASE WHEN status='queued' THEN 1 ELSE 0 END,
      last_attempt_at=coalesce(last_attempt_at,now())
  WHERE id=p_payout_id
  RETURNING * INTO v_payout;

  RETURN jsonb_build_object(
    'payoutId',v_payout.id,
    'sellerId',p_seller_id,
    'sellerOrderId',v_order.id,
    'providerCaptureId',v_tx.provider_capture_id,
    'merchantId',v_account.merchant_id,
    'sellerEmail',v_account.paypal_account_email,
    'currency',v_payout.currency,
    'amountMinor',v_payout.amount_minor,
    'status',v_payout.status,
    'requestId','MINGLORA-REF-PAYOUT-'||v_payout.id::text
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_marketplace_payout(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_payout(uuid,uuid) TO service_role;

COMMIT;
