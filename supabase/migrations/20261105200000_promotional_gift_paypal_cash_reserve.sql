-- Real-money backing for Minglora Admin Promotional Gift Wallet gifts.
-- Promotional gift tokens remain separate from Main Coins; a gift only creates
-- USD earnings after an actual PayPal funding capture has been confirmed.
BEGIN;

ALTER TABLE public.live_gift_transactions
  ADD COLUMN IF NOT EXISTS admin_promotional_coins bigint NOT NULL DEFAULT 0;
ALTER TABLE public.live_gift_transactions
  DROP CONSTRAINT IF EXISTS live_gift_transactions_funding_source_check;
ALTER TABLE public.live_gift_transactions
  ADD CONSTRAINT live_gift_transactions_funding_source_check
  CHECK (
    funding_source IN ('cash','marketing','promo','mixed','admin_promotional')
    AND cash_backed_coins >= 0
    AND marketing_backed_coins >= 0
    AND promo_coins >= 0
    AND admin_promotional_coins >= 0
    AND coin_amount = cash_backed_coins + marketing_backed_coins
      + promo_coins + admin_promotional_coins
  );

ALTER TABLE public.creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'cash';
ALTER TABLE public.creator_earnings_ledger
  DROP CONSTRAINT IF EXISTS creator_earnings_ledger_funding_source_check;
ALTER TABLE public.creator_earnings_ledger
  ADD CONSTRAINT creator_earnings_ledger_funding_source_check
  CHECK (funding_source IN ('cash','marketing','promo','mixed','admin_promotional'));

CREATE TABLE IF NOT EXISTS public.minglora_promotional_gift_fund (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  funded_minor bigint NOT NULL DEFAULT 0 CHECK (funded_minor >= 0),
  spent_minor bigint NOT NULL DEFAULT 0 CHECK (spent_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (spent_minor <= funded_minor)
);
INSERT INTO public.minglora_promotional_gift_fund(id)
VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minglora_promotional_gift_fund_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('funding','gift_spend','reversal','adjustment')),
  reference_id uuid,
  paypal_order_id text,
  paypal_capture_id text,
  funded_delta_minor bigint NOT NULL DEFAULT 0,
  spent_delta_minor bigint NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (funded_delta_minor <> 0 OR spent_delta_minor <> 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS minglora_promo_gift_capture_uq
  ON public.minglora_promotional_gift_fund_ledger(paypal_capture_id)
  WHERE paypal_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS minglora_promo_gift_order_uq
  ON public.minglora_promotional_gift_fund_ledger(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS minglora_promo_gift_fund_ledger_created_idx
  ON public.minglora_promotional_gift_fund_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS public.minglora_promotional_gift_funding_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id),
  paypal_order_id text NOT NULL UNIQUE,
  paypal_capture_id text UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 100),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','captured','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz
);
CREATE INDEX IF NOT EXISTS minglora_promo_gift_funding_orders_admin_idx
  ON public.minglora_promotional_gift_funding_orders(admin_user_id,created_at DESC);

ALTER TABLE public.minglora_promotional_gift_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_promotional_gift_fund_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_promotional_gift_funding_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minglora_promotional_gift_fund,
  public.minglora_promotional_gift_fund_ledger,
  public.minglora_promotional_gift_funding_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.minglora_promotional_gift_fund,
  public.minglora_promotional_gift_fund_ledger,
  public.minglora_promotional_gift_funding_orders TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_create_promotional_gift_funding_order(
  p_admin_user_id uuid,
  p_admin_email text,
  p_paypal_order_id text,
  p_amount_minor bigint,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  existing public.minglora_promotional_gift_funding_orders%ROWTYPE;
  created public.minglora_promotional_gift_funding_orders%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can fund the promotional gift reserve'
      USING ERRCODE='42501';
  END IF;
  IF p_paypal_order_id IS NULL OR length(p_paypal_order_id) NOT BETWEEN 5 AND 160
     OR p_amount_minor IS NULL OR p_amount_minor < 100 OR p_amount_minor > 50000000
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a valid PayPal funding order and USD amount between $1.00 and $500,000.00'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing
  FROM public.minglora_promotional_gift_funding_orders
  WHERE request_id=p_request_id OR paypal_order_id=p_paypal_order_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.admin_user_id<>p_admin_user_id
       OR existing.paypal_order_id<>p_paypal_order_id
       OR existing.amount_minor<>p_amount_minor THEN
      RAISE EXCEPTION 'PayPal funding order reference was already used with different details'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('ok',true,'alreadyCreated',true,'order',to_jsonb(existing));
  END IF;

  INSERT INTO public.minglora_promotional_gift_funding_orders(
    request_id,admin_user_id,paypal_order_id,amount_minor
  ) VALUES (
    p_request_id,p_admin_user_id,p_paypal_order_id,p_amount_minor
  ) RETURNING * INTO created;

  RETURN jsonb_build_object('ok',true,'alreadyCreated',false,'order',to_jsonb(created));
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_get_promotional_gift_funding_order(
  p_admin_user_id uuid,
  p_admin_email text,
  p_paypal_order_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  found_order public.minglora_promotional_gift_funding_orders%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can view promotional gift funding'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO found_order
  FROM public.minglora_promotional_gift_funding_orders
  WHERE admin_user_id=p_admin_user_id AND paypal_order_id=p_paypal_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotional gift funding order was not found'; END IF;
  RETURN to_jsonb(found_order);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_settle_promotional_gift_funding_order(
  p_admin_user_id uuid,
  p_admin_email text,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_amount_minor bigint,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  funding_order public.minglora_promotional_gift_funding_orders%ROWTYPE;
  fund public.minglora_promotional_gift_fund%ROWTYPE;
  ledger_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can settle promotional gift funding'
      USING ERRCODE='42501';
  END IF;
  IF p_paypal_order_id IS NULL OR length(p_paypal_order_id) NOT BETWEEN 5 AND 160
     OR p_paypal_capture_id IS NULL OR length(p_paypal_capture_id) NOT BETWEEN 5 AND 160
     OR p_amount_minor IS NULL OR p_amount_minor < 100 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid verified PayPal funding capture' USING ERRCODE='22023';
  END IF;

  SELECT * INTO funding_order
  FROM public.minglora_promotional_gift_funding_orders
  WHERE admin_user_id=p_admin_user_id AND paypal_order_id=p_paypal_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotional gift funding order was not found'; END IF;

  IF funding_order.status='captured' THEN
    IF funding_order.paypal_capture_id<>p_paypal_capture_id
       OR funding_order.amount_minor<>p_amount_minor THEN
      RAISE EXCEPTION 'Funding order was already settled with different PayPal details'
        USING ERRCODE='23505';
    END IF;
    SELECT * INTO fund FROM public.minglora_promotional_gift_fund WHERE id=true;
    RETURN jsonb_build_object('ok',true,'alreadySettled',true,
      'orderId',funding_order.id,'fundedMinor',fund.funded_minor,
      'spentMinor',fund.spent_minor,'availableMinor',fund.funded_minor-fund.spent_minor);
  END IF;

  IF funding_order.status<>'created' OR funding_order.amount_minor<>p_amount_minor THEN
    RAISE EXCEPTION 'PayPal capture does not match the original funding order';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.minglora_promotional_gift_fund_ledger
    WHERE paypal_capture_id=p_paypal_capture_id
  ) THEN
    RAISE EXCEPTION 'PayPal capture has already funded this or another reserve'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.minglora_promotional_gift_fund(id)
  VALUES(true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO fund FROM public.minglora_promotional_gift_fund WHERE id=true FOR UPDATE;
  IF fund.funded_minor > 9223372036854775807-p_amount_minor THEN
    RAISE EXCEPTION 'Promotional gift reserve reached the database maximum';
  END IF;

  UPDATE public.minglora_promotional_gift_fund
  SET funded_minor=funded_minor+p_amount_minor,updated_at=now()
  WHERE id=true
  RETURNING * INTO fund;

  INSERT INTO public.minglora_promotional_gift_fund_ledger(
    request_id,event_type,paypal_order_id,paypal_capture_id,
    funded_delta_minor,note,actor_user_id
  ) VALUES (
    p_request_id,'funding',p_paypal_order_id,p_paypal_capture_id,
    p_amount_minor,'Verified PayPal funding capture for promotional gifts',p_admin_user_id
  ) RETURNING id INTO ledger_id;

  UPDATE public.minglora_promotional_gift_funding_orders
  SET paypal_capture_id=p_paypal_capture_id,status='captured',captured_at=now()
  WHERE id=funding_order.id;

  RETURN jsonb_build_object('ok',true,'alreadySettled',false,
    'fundingLedgerId',ledger_id,'orderId',funding_order.id,
    'fundedMinor',fund.funded_minor,'spentMinor',fund.spent_minor,
    'availableMinor',fund.funded_minor-fund.spent_minor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_get_promotional_gift_fund(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  wallet public.admin_promotional_gift_wallets%ROWTYPE;
  fund public.minglora_promotional_gift_fund%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'Minglora member account was not found';
  END IF;
  SELECT * INTO wallet FROM public.admin_promotional_gift_wallets WHERE user_id=p_user_id;
  SELECT * INTO fund FROM public.minglora_promotional_gift_fund WHERE id=true;
  RETURN jsonb_build_object(
    'promotionalCoins',coalesce(wallet.available_coins,0),
    'lifetimeAllocatedCoins',coalesce(wallet.lifetime_allocated_coins,0),
    'lifetimeSpentCoins',coalesce(wallet.lifetime_spent_coins,0),
    'fundedMinor',coalesce(fund.funded_minor,0),
    'spentMinor',coalesce(fund.spent_minor,0),
    'availableMinor',greatest(0,coalesce(fund.funded_minor,0)-coalesce(fund.spent_minor,0)),
    'coinPerCent',1,'currency','USD'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_get_admin_promotional_gift_fund(
  p_admin_user_id uuid,
  p_admin_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  fund public.minglora_promotional_gift_fund%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can view the promotional gift reserve'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO fund FROM public.minglora_promotional_gift_fund WHERE id=true;
  RETURN jsonb_build_object(
    'fundedMinor',coalesce(fund.funded_minor,0),
    'spentMinor',coalesce(fund.spent_minor,0),
    'availableMinor',greatest(0,coalesce(fund.funded_minor,0)-coalesce(fund.spent_minor,0)),
    'currency','USD','coinPerCent',1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_send_admin_promotional_gift(
  p_sender_id uuid,
  p_gift_code text,
  p_broadcast_id uuid DEFAULT NULL::uuid,
  p_recipient_username text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  sender_wallet public.admin_promotional_gift_wallets%ROWTYPE;
  broadcast public.live_broadcasts%ROWTYPE;
  recipient public.profiles%ROWTYPE;
  gift public.live_gift_catalog%ROWTYPE;
  fund public.minglora_promotional_gift_fund%ROWTYPE;
  gift_id uuid := gen_random_uuid();
  ledger_request_id uuid := gen_random_uuid();
  normalized_username text;
  creator_amount numeric(20,2);
  new_balance bigint;
  context_label text;
  context_reference uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_sender_id IS NULL OR coalesce(p_gift_code,'') !~ '^[a-z0-9_-]{1,60}$' THEN
    RAISE EXCEPTION 'Invalid promotional gift request' USING ERRCODE='22023';
  END IF;

  IF p_broadcast_id IS NOT NULL THEN
    SELECT * INTO broadcast FROM public.live_broadcasts
    WHERE id=p_broadcast_id AND status='live' FOR SHARE;
    IF NOT FOUND OR broadcast.host_id=p_sender_id THEN
      RAISE EXCEPTION 'Active LIVE gift recipient was not found';
    END IF;
    SELECT * INTO recipient FROM public.profiles WHERE id=broadcast.host_id;
    context_label:='live';
    context_reference:=broadcast.id;
  ELSE
    normalized_username:=lower(regexp_replace(btrim(coalesce(p_recipient_username,'')), '^@', ''));
    IF normalized_username !~ '^[a-z0-9_]{3,30}$' THEN
      RAISE EXCEPTION 'Enter a valid Minglora recipient username' USING ERRCODE='22023';
    END IF;
    SELECT * INTO recipient FROM public.profiles WHERE lower(username)=normalized_username LIMIT 1;
    IF NOT FOUND OR recipient.id=p_sender_id THEN
      RAISE EXCEPTION 'Minglora gift recipient was not found or is not eligible';
    END IF;
    context_label:='user';
    context_reference:=NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=recipient.id)
       OR (b.blocker_id=recipient.id AND b.blocked_id=p_sender_id)
  ) THEN RAISE EXCEPTION 'Gifting is unavailable for this relationship' USING ERRCODE='42501'; END IF;

  SELECT * INTO gift FROM public.live_gift_catalog WHERE code=p_gift_code AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift is unavailable' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.admin_promotional_gift_wallets(user_id)
  VALUES(p_sender_id) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO sender_wallet FROM public.admin_promotional_gift_wallets
  WHERE user_id=p_sender_id FOR UPDATE;
  IF sender_wallet.available_coins<gift.coin_price THEN
    RAISE EXCEPTION 'Not enough Admin Promotional Gift Coins' USING ERRCODE='22003';
  END IF;

  SELECT * INTO fund FROM public.minglora_promotional_gift_fund
  WHERE id=true FOR UPDATE;
  IF NOT FOUND OR fund.funded_minor-fund.spent_minor<gift.coin_price THEN
    RAISE EXCEPTION 'Minglora promotional gift cash reserve is not funded enough for this gift';
  END IF;

  new_balance:=sender_wallet.available_coins-gift.coin_price;
  UPDATE public.admin_promotional_gift_wallets
  SET available_coins=new_balance,
      lifetime_spent_coins=lifetime_spent_coins+gift.coin_price,
      updated_at=now()
  WHERE user_id=p_sender_id;

  INSERT INTO public.admin_promotional_gift_wallet_ledger(
    request_id,user_id,actor_user_id,delta_coins,balance_after,event_type,reference_id,note
  ) VALUES (
    ledger_request_id,p_sender_id,p_sender_id,-gift.coin_price,new_balance,
    'spend',gift_id,'Sent cash-backed Admin Promotional Gift: '||gift.name
  );

  UPDATE public.minglora_promotional_gift_fund
  SET spent_minor=spent_minor+gift.coin_price,updated_at=now()
  WHERE id=true;

  INSERT INTO public.minglora_promotional_gift_fund_ledger(
    request_id,event_type,reference_id,spent_delta_minor,note,actor_user_id
  ) VALUES (
    gen_random_uuid(),'gift_spend',gift_id,gift.coin_price,
    'Promotional gift cash reserve consumed for '||gift.name,p_sender_id
  );

  creator_amount:=gift.coin_price::numeric/2;
  INSERT INTO public.live_gift_transactions(
    id,broadcast_id,sender_id,receiver_id,gift_code,coin_amount,gross_minor,
    creator_share_minor,platform_share_minor,context_type,context_id,recipient_username,
    cash_backed_coins,marketing_backed_coins,promo_coins,admin_promotional_coins,funding_source
  ) VALUES (
    gift_id,p_broadcast_id,p_sender_id,recipient.id,gift.code,gift.coin_price,
    gift.coin_price,creator_amount,gift.coin_price-creator_amount,context_label,context_reference,
    lower(coalesce(recipient.username,'')),0,0,0,gift.coin_price,'admin_promotional'
  );

  INSERT INTO public.creator_earnings_ledger(
    creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor,
    funding_source
  ) VALUES (
    recipient.id,gift_id,gift.coin_price,creator_amount,gift.coin_price-creator_amount,
    'admin_promotional'
  );

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',gift_id,'giftCode',gift.code,'giftName',gift.name,
    'emoji',gift.emoji,'coinAmount',gift.coin_price,'senderId',p_sender_id,
    'receiverId',recipient.id,'recipientUsername',recipient.username,
    'remainingPromotionalCoins',new_balance,'grossMinor',gift.coin_price,
    'creatorShareMinor',creator_amount,'platformShareMinor',gift.coin_price-creator_amount,
    'adminPromotionalCoins',gift.coin_price,'fundingSource','admin_promotional',
    'currency','USD'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_create_promotional_gift_funding_order(uuid,text,text,bigint,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_create_promotional_gift_funding_order(uuid,text,text,bigint,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_promotional_gift_funding_order(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_promotional_gift_funding_order(uuid,text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_settle_promotional_gift_funding_order(uuid,text,text,text,bigint,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_settle_promotional_gift_funding_order(uuid,text,text,text,bigint,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_promotional_gift_fund(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_promotional_gift_fund(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_admin_promotional_gift_fund(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_admin_promotional_gift_fund(uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_send_admin_promotional_gift(uuid,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_admin_promotional_gift(uuid,text,uuid,text)
  TO service_role;

COMMIT;
