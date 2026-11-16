BEGIN;

CREATE OR REPLACE FUNCTION public.complete_marketplace_paypal_capture(
  p_buyer_id uuid,
  p_order_id uuid,
  p_attempt_id uuid,
  p_provider_order_id text,
  p_capture_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $paypal_capture$
DECLARE
  v_order public.marketplace_orders%ROWTYPE;
  v_attempt public.marketplace_payment_attempts%ROWTYPE;
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_capture jsonb;
  v_expected_count integer;
  v_processed_count integer:=0;
  v_capture_id text;
  v_seller_order_id uuid;
  v_amount bigint;
  v_platform_fee bigint;
  v_processor_fee bigint;
  v_seller_net bigint;
  v_event_id uuid;
  v_reservation public.marketplace_inventory_reservations%ROWTYPE;
  v_already_complete boolean:=false;
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

  IF v_attempt.status='captured' AND v_order.payment_status='captured' THEN
    RETURN jsonb_build_object('paid',true,'idempotent',true,'orderId',p_order_id);
  END IF;
  IF v_order.status<>'awaiting_payment' OR v_order.payment_status NOT IN ('pending','not_started','failed')
     OR v_attempt.status NOT IN ('created','approved') THEN
    RAISE EXCEPTION 'Marketplace order is not in a capturable state';
  END IF;

  SELECT count(*) INTO v_expected_count FROM public.marketplace_seller_orders WHERE order_id=p_order_id;
  IF v_expected_count<1 OR v_expected_count>10 OR jsonb_array_length(p_capture_rows)<>v_expected_count THEN
    RAISE EXCEPTION 'PayPal must capture every seller purchase unit before the order can be marked paid';
  END IF;

  FOR v_capture IN SELECT value FROM jsonb_array_elements(p_capture_rows)
  LOOP
    v_seller_order_id:=nullif(v_capture->>'sellerOrderId','')::uuid;
    v_capture_id:=nullif(v_capture->>'providerCaptureId','');
    v_amount:=nullif(v_capture->>'amountMinor','')::bigint;
    v_platform_fee:=nullif(v_capture->>'platformFeeMinor','')::bigint;
    v_processor_fee:=nullif(v_capture->>'processorFeeMinor','')::bigint;
    v_seller_net:=nullif(v_capture->>'sellerNetMinor','')::bigint;

    IF v_seller_order_id IS NULL OR v_capture_id IS NULL OR length(v_capture_id)>128
       OR v_amount IS NULL OR v_platform_fee IS NULL OR v_processor_fee IS NULL OR v_seller_net IS NULL
       OR coalesce(v_capture->>'status','')<>'captured' THEN
      RAISE EXCEPTION 'A seller purchase unit is missing its completed capture details';
    END IF;

    SELECT * INTO v_seller_order FROM public.marketplace_seller_orders
      WHERE id=v_seller_order_id AND order_id=p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PayPal returned an unknown seller order'; END IF;
    IF v_amount<>v_seller_order.gross_minor OR v_platform_fee<>v_seller_order.commission_minor
       OR v_processor_fee<0 OR v_seller_net<0
       OR v_seller_net<>(v_seller_order.gross_minor-v_seller_order.commission_minor-v_processor_fee)
       OR v_seller_net=0 THEN
      RAISE EXCEPTION 'PayPal capture amount, platform fee or seller net does not match the Minglora seller order ledger';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.marketplace_seller_payment_transactions
      WHERE provider='paypal' AND provider_capture_id=v_capture_id
        AND seller_order_id<>v_seller_order_id
    ) THEN RAISE EXCEPTION 'PayPal capture ID is already linked to another seller order'; END IF;

    INSERT INTO public.marketplace_seller_payment_transactions(
      payment_attempt_id,seller_order_id,seller_id,provider,provider_order_id,
      provider_reference_id,provider_capture_id,currency,amount_minor,
      platform_fee_minor,processor_fee_minor,seller_net_minor,status,
      disbursement_mode,provider_status,captured_at,updated_at
    ) VALUES (
      p_attempt_id,v_seller_order_id,v_seller_order.seller_id,'paypal',
      p_provider_order_id,v_seller_order_id::text,v_capture_id,v_order.currency,
      v_amount,v_platform_fee,v_processor_fee,v_seller_net,'captured','INSTANT',
      'COMPLETED',now(),now()
    )
    ON CONFLICT(payment_attempt_id,seller_order_id) DO UPDATE SET
      provider_capture_id=excluded.provider_capture_id,
      amount_minor=excluded.amount_minor,
      platform_fee_minor=excluded.platform_fee_minor,
      processor_fee_minor=excluded.processor_fee_minor,
      seller_net_minor=excluded.seller_net_minor,
      status='captured',provider_status='COMPLETED',
      captured_at=coalesce(public.marketplace_seller_payment_transactions.captured_at,now()),
      updated_at=now();

    UPDATE public.marketplace_seller_orders SET
      processor_fee_minor=v_processor_fee,
      seller_net_minor=v_seller_net,
      payout_status='paid',
      status=CASE WHEN status='awaiting_seller' THEN status ELSE 'awaiting_seller' END,
      updated_at=now()
    WHERE id=v_seller_order_id;

    INSERT INTO public.marketplace_payouts(
      seller_id,seller_order_id,seller_payment_transaction_id,provider,
      provider_payout_reference,currency,amount_minor,status,idempotency_key,
      initiated_at,completed_at
    )
    SELECT
      v_seller_order.seller_id,v_seller_order_id,t.id,'paypal',v_capture_id,
      v_order.currency,v_seller_net,'paid','paypal-capture-'||v_capture_id,now(),now()
    FROM public.marketplace_seller_payment_transactions t
    WHERE t.payment_attempt_id=p_attempt_id AND t.seller_order_id=v_seller_order_id
    ON CONFLICT(idempotency_key) DO NOTHING;

    v_processed_count:=v_processed_count+1;
  END LOOP;

  IF v_processed_count<>v_expected_count THEN RAISE EXCEPTION 'Not all seller captures were reconciled'; END IF;

  UPDATE public.marketplace_payment_attempts SET status='captured',provider_status='COMPLETED',
    captured_at=now(),updated_at=now()
  WHERE id=p_attempt_id;

  UPDATE public.marketplace_orders SET status='paid',payment_status='captured',updated_at=now()
    WHERE id=p_order_id;

  -- Commit the inventory reservations only after every seller capture succeeds.
  FOR v_reservation IN
    SELECT * FROM public.marketplace_inventory_reservations
    WHERE order_id=p_order_id AND status='reserved'
    ORDER BY listing_id FOR UPDATE
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

  INSERT INTO public.marketplace_order_events(
    order_id,actor_id,event_type,from_status,to_status,note,metadata
  ) VALUES (
    p_order_id,p_buyer_id,'paypal_payment_captured','awaiting_payment','paid',
    'PayPal confirmed every seller purchase unit as captured. Seller amounts and platform fees were reconciled.',
    jsonb_build_object('paymentAttemptId',p_attempt_id,'providerOrderId',p_provider_order_id,'sellerTransactions',v_processed_count)
  );

  RETURN jsonb_build_object('paid',true,'idempotent',false,'orderId',p_order_id,
    'paymentAttemptId',p_attempt_id,'sellerTransactions',v_processed_count);
END $paypal_capture$;
REVOKE ALL ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) TO service_role;

COMMENT ON FUNCTION public.complete_marketplace_paypal_capture(uuid,uuid,uuid,text,jsonb) IS
  'Marks an order paid only after every seller purchase unit has a completed PayPal capture and exact amount/fee reconciliation; then commits stock and records seller settlement.';

COMMIT;
