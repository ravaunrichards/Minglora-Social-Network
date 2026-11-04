-- Creator subscriptions: recurring PayPal receipts are split 50/50 and recorded once.
BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subscriber_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paypal_subscription_id text NOT NULL,
  paypal_sale_id text NOT NULL,
  entry_type text NOT NULL DEFAULT 'payment'
    CHECK (entry_type = ANY (ARRAY['payment'::text, 'refund'::text])),
  gross_minor bigint NOT NULL CHECK (gross_minor > 0),
  creator_minor bigint NOT NULL CHECK (creator_minor >= 0),
  platform_minor bigint NOT NULL CHECK (platform_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_earnings_ledger_sale_unique UNIQUE (paypal_sale_id),
  CONSTRAINT subscription_earnings_ledger_split_check
    CHECK (creator_minor + platform_minor = gross_minor)
);

ALTER TABLE public.subscription_earnings_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.subscription_earnings_ledger
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscription_earnings_ledger
  TO service_role;

CREATE INDEX IF NOT EXISTS subscription_earnings_ledger_creator_created_idx
  ON public.subscription_earnings_ledger (creator_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.minglora_record_subscription_payment(
  p_creator_id uuid,
  p_subscriber_id uuid,
  p_paypal_subscription_id text,
  p_paypal_sale_id text,
  p_gross_minor bigint,
  p_currency text DEFAULT 'USD'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  existing public.subscription_earnings_ledger%ROWTYPE;
  creator_amount bigint;
  platform_amount bigint;
  ledger_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_subscriber_id IS NULL OR p_creator_id = p_subscriber_id
     OR p_paypal_subscription_id IS NULL OR length(p_paypal_subscription_id) < 5
     OR length(p_paypal_subscription_id) > 160
     OR p_paypal_sale_id IS NULL OR length(p_paypal_sale_id) < 5
     OR length(p_paypal_sale_id) > 160
     OR p_gross_minor IS NULL OR p_gross_minor < 100
     OR upper(coalesce(p_currency,'')) <> 'USD' THEN
    RAISE EXCEPTION 'invalid creator subscription payment details';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator account was not found'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_subscriber_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscriber account was not found'; END IF;

  SELECT * INTO existing FROM public.subscription_earnings_ledger
    WHERE paypal_sale_id = p_paypal_sale_id FOR UPDATE;
  IF FOUND THEN
    IF existing.creator_id <> p_creator_id
       OR existing.subscriber_id IS DISTINCT FROM p_subscriber_id
       OR existing.paypal_subscription_id <> p_paypal_subscription_id
       OR existing.gross_minor <> p_gross_minor THEN
      RAISE EXCEPTION 'PayPal sale reference was already recorded with different details'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'alreadyRecorded',true,'ledgerId',existing.id,
      'grossMinor',existing.gross_minor,'creatorMinor',existing.creator_minor,
      'platformMinor',existing.platform_minor,'currency',existing.currency
    );
  END IF;

  creator_amount := floor(p_gross_minor / 2.0)::bigint;
  platform_amount := p_gross_minor - creator_amount;
  INSERT INTO public.subscription_earnings_ledger(
    creator_id,subscriber_id,paypal_subscription_id,paypal_sale_id,
    entry_type,gross_minor,creator_minor,platform_minor,currency
  ) VALUES (
    p_creator_id,p_subscriber_id,p_paypal_subscription_id,p_paypal_sale_id,
    'payment',p_gross_minor,creator_amount,platform_amount,'USD'
  ) RETURNING id INTO ledger_id;

  RETURN jsonb_build_object(
    'ok',true,'alreadyRecorded',false,'ledgerId',ledger_id,
    'grossMinor',p_gross_minor,'creatorMinor',creator_amount,
    'platformMinor',platform_amount,'currency','USD'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_record_subscription_payment(uuid,uuid,text,text,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_record_subscription_payment(uuid,uuid,text,text,bigint,text)
  TO service_role;

COMMIT;
