-- Minglora global PayPal order/capture de-duplication and immutability.
-- Applied to Supabase project gzycobgbasnqqhnympkr on 2026-11-05.
BEGIN;

CREATE TABLE public.minglora_paypal_payment_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_order_id text NOT NULL UNIQUE CHECK (length(paypal_order_id) BETWEEN 5 AND 160),
  paypal_capture_id text UNIQUE CHECK (paypal_capture_id IS NULL OR length(paypal_capture_id) BETWEEN 5 AND 160),
  purpose text NOT NULL CHECK (purpose IN ('coin_purchase','marketing_funding','promotional_gift_funding')),
  reference_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','captured','failed','cancelled','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purpose, reference_id),
  CHECK ((status IN ('captured','refunded')) = (paypal_capture_id IS NOT NULL))
);

ALTER TABLE public.minglora_paypal_payment_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minglora_paypal_payment_registry FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.minglora_sync_paypal_payment_registry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_purpose text;
  v_reference_id uuid;
  v_actor_user_id uuid;
  v_rows integer;
BEGIN
  IF TG_TABLE_NAME = 'coin_purchase_orders' THEN
    v_purpose := 'coin_purchase';
    v_reference_id := NEW.id;
    v_actor_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'minglora_marketing_funding_orders' THEN
    v_purpose := 'marketing_funding';
    v_reference_id := NEW.id;
    v_actor_user_id := NEW.admin_user_id;
  ELSIF TG_TABLE_NAME = 'minglora_promotional_gift_funding_orders' THEN
    v_purpose := 'promotional_gift_funding';
    v_reference_id := NEW.id;
    v_actor_user_id := NEW.admin_user_id;
  ELSE
    RAISE EXCEPTION 'Unsupported Minglora PayPal funding source table' USING ERRCODE = '22023';
  END IF;

  IF NEW.paypal_order_id IS NULL
     OR length(NEW.paypal_order_id) NOT BETWEEN 5 AND 160
     OR NEW.amount_minor IS NULL OR NEW.amount_minor <= 0
     OR NEW.currency IS DISTINCT FROM 'USD'
     OR NEW.status NOT IN ('created','captured','failed','cancelled','refunded')
     OR (NEW.status IN ('captured','refunded') AND NEW.paypal_capture_id IS NULL)
     OR (NEW.status IN ('created','failed','cancelled') AND NEW.paypal_capture_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid PayPal order or settlement state for Minglora funding' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.paypal_order_id IS DISTINCT FROM NEW.paypal_order_id
    OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
    OR OLD.currency IS DISTINCT FROM NEW.currency
    OR (OLD.paypal_capture_id IS NOT NULL AND OLD.paypal_capture_id IS DISTINCT FROM NEW.paypal_capture_id)
  ) THEN
    RAISE EXCEPTION 'Minglora PayPal order, amount, currency and capture reference are immutable'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.minglora_paypal_payment_registry(
    paypal_order_id,paypal_capture_id,purpose,reference_id,actor_user_id,amount_minor,currency,status
  ) VALUES (
    NEW.paypal_order_id,NEW.paypal_capture_id,v_purpose,v_reference_id,v_actor_user_id,
    NEW.amount_minor,NEW.currency,NEW.status
  )
  ON CONFLICT (purpose,reference_id) DO UPDATE
    SET paypal_capture_id = EXCLUDED.paypal_capture_id, status = EXCLUDED.status, updated_at = now()
    WHERE public.minglora_paypal_payment_registry.paypal_order_id = EXCLUDED.paypal_order_id
      AND public.minglora_paypal_payment_registry.actor_user_id = EXCLUDED.actor_user_id
      AND public.minglora_paypal_payment_registry.amount_minor = EXCLUDED.amount_minor
      AND public.minglora_paypal_payment_registry.currency = EXCLUDED.currency
      AND (public.minglora_paypal_payment_registry.paypal_capture_id IS NULL
        OR public.minglora_paypal_payment_registry.paypal_capture_id IS NOT DISTINCT FROM EXCLUDED.paypal_capture_id)
      AND (public.minglora_paypal_payment_registry.status <> 'captured'
        OR EXCLUDED.status IN ('captured','refunded'));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'PayPal order registry conflict: order details or settlement state changed' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_sync_paypal_payment_registry() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.minglora_paypal_payment_registry(
  paypal_order_id,paypal_capture_id,purpose,reference_id,actor_user_id,amount_minor,currency,status,created_at,updated_at
)
SELECT paypal_order_id,paypal_capture_id,'coin_purchase',id,user_id,amount_minor,currency,status,created_at,coalesce(captured_at,created_at)
FROM public.coin_purchase_orders
UNION ALL
SELECT paypal_order_id,paypal_capture_id,'marketing_funding',id,admin_user_id,amount_minor,currency,status,created_at,coalesce(captured_at,created_at)
FROM public.minglora_marketing_funding_orders
UNION ALL
SELECT paypal_order_id,paypal_capture_id,'promotional_gift_funding',id,admin_user_id,amount_minor,currency,status,created_at,coalesce(captured_at,created_at)
FROM public.minglora_promotional_gift_funding_orders;

CREATE TRIGGER coin_purchase_orders_paypal_registry
AFTER INSERT OR UPDATE OF paypal_order_id,paypal_capture_id,amount_minor,currency,status
ON public.coin_purchase_orders FOR EACH ROW
EXECUTE FUNCTION public.minglora_sync_paypal_payment_registry();

CREATE TRIGGER marketing_funding_orders_paypal_registry
AFTER INSERT OR UPDATE OF paypal_order_id,paypal_capture_id,amount_minor,currency,status
ON public.minglora_marketing_funding_orders FOR EACH ROW
EXECUTE FUNCTION public.minglora_sync_paypal_payment_registry();

CREATE TRIGGER promotional_gift_funding_orders_paypal_registry
AFTER INSERT OR UPDATE OF paypal_order_id,paypal_capture_id,amount_minor,currency,status
ON public.minglora_promotional_gift_funding_orders FOR EACH ROW
EXECUTE FUNCTION public.minglora_sync_paypal_payment_registry();

ALTER TABLE public.creator_earnings_ledger VALIDATE CONSTRAINT creator_earnings_ledger_funding_source_check;
ALTER TABLE public.live_gift_transactions VALIDATE CONSTRAINT live_gift_transactions_cash_backing_gross_check;

COMMIT;
