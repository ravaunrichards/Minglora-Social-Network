BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_refunds_one_active_per_seller_order_uq
  ON public.marketplace_refunds(seller_order_id)
  WHERE status IN ('requested','processing');

CREATE OR REPLACE FUNCTION private.sync_marketplace_payout_after_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_seller_order public.marketplace_seller_orders%ROWTYPE;
  v_tx public.marketplace_seller_payment_transactions%ROWTYPE;
  v_total_refunded bigint;
  v_seller_refunded bigint;
  v_remaining_seller_net bigint;
  v_payout_marker text;
BEGIN
  IF NEW.status NOT IN ('succeeded','failed') OR NEW.status=OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_seller_order
  FROM public.marketplace_seller_orders
  WHERE id=NEW.seller_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller order for refund payout adjustment was not found';
  END IF;

  SELECT * INTO v_tx
  FROM public.marketplace_seller_payment_transactions
  WHERE seller_order_id=v_seller_order.id
    AND seller_id=v_seller_order.seller_id
    AND provider='paypal'
    AND status='captured'
    AND disbursement_mode='DELAYED'
  ORDER BY captured_at DESC NULLS LAST,created_at DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND OR v_tx.amount_minor<=0 THEN
    RAISE EXCEPTION 'Captured seller transaction for refund payout adjustment was not found';
  END IF;

  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_total_refunded
  FROM public.marketplace_refunds
  WHERE seller_order_id=v_seller_order.id AND status='succeeded';

  v_seller_refunded:=floor(v_total_refunded::numeric*v_tx.seller_net_minor/v_tx.amount_minor)::bigint;
  v_remaining_seller_net:=greatest(0,v_tx.seller_net_minor-v_seller_refunded);
  v_payout_marker:=NEW.id::text;

  IF NEW.status='succeeded' THEN
    IF v_remaining_seller_net=0 THEN
      UPDATE public.marketplace_payouts
      SET status='cancelled',
          provider_disbursement_status='REFUND_FULLY_SETTLED',
          response_snapshot=response_snapshot||jsonb_build_object('refundLedgerFinalized',v_payout_marker),
          last_attempt_at=now()
      WHERE seller_order_id=v_seller_order.id
        AND status='held'
        AND response_snapshot ? 'refundRequestId';
      UPDATE public.marketplace_seller_orders
      SET payout_status='not_eligible',updated_at=now()
      WHERE id=v_seller_order.id;
    ELSE
      UPDATE public.marketplace_payouts
      SET amount_minor=v_remaining_seller_net,
          status='queued',
          provider_disbursement_status='REFUND_PARTIAL_REBALANCED',
          response_snapshot=response_snapshot||jsonb_build_object(
            'refundLedgerFinalized',v_payout_marker,
            'remainingSellerNetMinor',v_remaining_seller_net
          ),
          last_attempt_at=now()
      WHERE seller_order_id=v_seller_order.id
        AND status='held'
        AND response_snapshot ? 'refundRequestId';
      UPDATE public.marketplace_seller_orders
      SET payout_status='eligible',updated_at=now()
      WHERE id=v_seller_order.id;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.marketplace_refunds r
      WHERE r.seller_order_id=v_seller_order.id
        AND r.id<>NEW.id
        AND r.status IN ('requested','processing')
    ) THEN
      UPDATE public.marketplace_payouts
      SET amount_minor=v_remaining_seller_net,
          status='queued',
          provider_disbursement_status='REFUND_FAILED_RELEASED',
          response_snapshot=response_snapshot||jsonb_build_object(
            'refundLedgerReleased',v_payout_marker,
            'remainingSellerNetMinor',v_remaining_seller_net
          ),
          last_attempt_at=now()
      WHERE seller_order_id=v_seller_order.id
        AND status='held'
        AND response_snapshot ? 'refundRequestId';
      UPDATE public.marketplace_seller_orders
      SET payout_status=CASE WHEN v_remaining_seller_net>0 THEN 'eligible' ELSE 'not_eligible' END,
          updated_at=now()
      WHERE id=v_seller_order.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_marketplace_payout_after_refund() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS marketplace_refund_rebalances_seller_payout ON public.marketplace_refunds;
CREATE TRIGGER marketplace_refund_rebalances_seller_payout
AFTER UPDATE OF status ON public.marketplace_refunds
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('succeeded','failed'))
EXECUTE FUNCTION private.sync_marketplace_payout_after_refund();

COMMIT;
