BEGIN;

-- Serialize retries for the same buyer/idempotency key. The underlying order
-- function already returns the previous order for the same quote; this
-- transaction-scoped advisory lock prevents two simultaneous requests from
-- racing through its initial lookup and creating a unique-index conflict.
CREATE OR REPLACE FUNCTION public.create_marketplace_order_idempotent(
  p_buyer_id uuid,
  p_quote_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $idempotent$
BEGIN
  IF p_buyer_id IS NULL OR p_quote_id IS NULL OR
     length(coalesce(p_idempotency_key,''))<8 OR length(p_idempotency_key)>128 THEN
    RAISE EXCEPTION 'Invalid order request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_buyer_id::text),
    pg_catalog.hashtext(p_idempotency_key)
  );
  RETURN public.create_marketplace_order_from_quote(p_buyer_id,p_quote_id,p_idempotency_key);
END $idempotent$;
REVOKE ALL ON FUNCTION public.create_marketplace_order_idempotent(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_idempotent(uuid,uuid,text) TO service_role;

-- The lower-level release function is retained for controlled internal use.
-- Public API and scheduled cleanup must use this guard, which checks the
-- locked order/payment state before changing reservations.
CREATE OR REPLACE FUNCTION public.release_marketplace_unpaid_order_inventory(
  p_order_id uuid,
  p_reason text DEFAULT 'reservation_released'
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $safe_release$
DECLARE
  v_order public.marketplace_orders%ROWTYPE;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Order ID is required'; END IF;
  SELECT * INTO v_order FROM public.marketplace_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status<>'awaiting_payment'
     OR v_order.payment_status NOT IN ('not_started','pending','failed') THEN
    RETURN 0;
  END IF;
  RETURN public.release_marketplace_order_inventory(p_order_id,p_reason);
END $safe_release$;
REVOKE ALL ON FUNCTION public.release_marketplace_unpaid_order_inventory(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_marketplace_unpaid_order_inventory(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_marketplace_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $expire$
DECLARE
  v_order_id uuid;
  v_count integer:=0;
  v_released integer;
BEGIN
  FOR v_order_id IN
    SELECT order_id FROM public.marketplace_inventory_reservations
    WHERE status='reserved' AND expires_at<=now()
    GROUP BY order_id ORDER BY order_id
  LOOP
    v_released:=public.release_marketplace_unpaid_order_inventory(v_order_id,'inventory_reservation_expired');
    v_count:=v_count+v_released;
  END LOOP;
  RETURN v_count;
END $expire$;
REVOKE ALL ON FUNCTION public.expire_marketplace_inventory_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_marketplace_inventory_reservations() TO service_role;

COMMENT ON FUNCTION public.create_marketplace_order_idempotent(uuid,uuid,text) IS
  'Serializes same-buyer checkout retries around the idempotency key and returns one seller-split order.';
COMMENT ON FUNCTION public.release_marketplace_unpaid_order_inventory(uuid,text) IS
  'Releases stock only for orders that are still awaiting payment without a captured payment.';

COMMIT;
