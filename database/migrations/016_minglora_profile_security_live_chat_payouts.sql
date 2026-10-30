BEGIN;

-- Keep contact and editable About values private from direct public-table reads.
-- Minglora serves privacy-filtered profile details through its authenticated API.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon, authenticated;
REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, bio, location, visibility,
  avatar_url, cover_url, avatar_asset_id, cover_asset_id,
  created_at, updated_at, about_visibility
) ON TABLE public.profiles TO anon, authenticated;
GRANT UPDATE (
  username, display_name, bio, location, visibility,
  avatar_url, cover_url, avatar_asset_id, cover_asset_id,
  contact_phone, country, county, parish, city, gender,
  relationship_status, about_visibility
) ON TABLE public.profiles TO authenticated;

-- Creator payout destinations are private and are only accessed by the trusted
-- runtime gateway. They are never exposed through public profile reads.
CREATE TABLE IF NOT EXISTS public.creator_payout_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  paypal_email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_payout_accounts_email_check
    CHECK (paypal_email = lower(btrim(paypal_email))
      AND paypal_email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')
);
ALTER TABLE public.creator_payout_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.creator_payout_accounts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.creator_payout_accounts TO service_role;

-- LIVE chat is append-only in the application API and accessible only through
-- the authenticated Minglora runtime gateway.
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_chat_messages_broadcast_created_idx
  ON public.live_chat_messages(broadcast_id, created_at DESC);
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.live_chat_messages
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.live_chat_messages TO service_role;

-- The trusted gateway calls this function after verifying the app session.
-- Available creator earnings are reduced by all reserved, processing and
-- paid payouts so the same earnings cannot be withdrawn twice.
CREATE OR REPLACE FUNCTION public.minglora_request_creator_payout(
  p_creator_id uuid,
  p_amount_minor bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  available_minor bigint;
  reserved_minor bigint;
  payout_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_amount_minor < 100 THEN
    RAISE EXCEPTION 'minimum payout is USD 1.00';
  END IF;

  SELECT coalesce(sum(e.creator_share_minor),0)
    INTO available_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id AND e.status='available';

  SELECT coalesce(sum(p.amount_minor),0)
    INTO reserved_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id=p_creator_id
      AND p.status IN ('requested','processing','paid');

  IF p_amount_minor > available_minor-reserved_minor THEN
    RAISE EXCEPTION 'payout exceeds available creator earnings';
  END IF;

  INSERT INTO public.creator_payouts(creator_id,amount_minor,currency,status)
    VALUES(p_creator_id,p_amount_minor,'USD','requested')
    RETURNING id INTO payout_id;
  RETURN payout_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_request_creator_payout(uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_request_creator_payout(uuid,bigint)
  TO service_role;

-- Correct the gift-debit error and preserve the agreed 50/50 split.
CREATE OR REPLACE FUNCTION public.minglora_send_live_gift(
  p_sender_id uuid,
  p_broadcast_id uuid,
  p_gift_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  broadcast public.live_broadcasts%ROWTYPE;
  gift public.live_gift_catalog%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  gift_id uuid;
  gross bigint;
  creator_amount bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO broadcast FROM public.live_broadcasts
    WHERE id=p_broadcast_id AND status='live' FOR SHARE;
  IF NOT FOUND OR broadcast.host_id=p_sender_id THEN
    RAISE EXCEPTION 'active live broadcast not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks AS b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=broadcast.host_id)
       OR (b.blocker_id=broadcast.host_id AND b.blocked_id=p_sender_id)
  ) THEN
    RAISE EXCEPTION 'gift unavailable for this relationship';
  END IF;

  SELECT * INTO gift FROM public.live_gift_catalog
    WHERE code=p_gift_code AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift is unavailable'; END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_sender_id)
    ON CONFLICT DO NOTHING;
  SELECT balance_coins INTO current_balance FROM public.coin_wallets
    WHERE user_id=p_sender_id FOR UPDATE;
  IF current_balance < gift.coin_price THEN
    RAISE EXCEPTION 'not enough Minglora Coins';
  END IF;

  new_balance := current_balance-gift.coin_price;
  UPDATE public.coin_wallets
    SET balance_coins=new_balance,updated_at=now()
    WHERE user_id=p_sender_id;
  INSERT INTO public.coin_ledger(
    user_id,delta_coins,balance_after,entry_type,description
  ) VALUES (
    p_sender_id,-gift.coin_price,new_balance,'live_gift_sent',
    'Sent LIVE gift: '||gift.name
  );

  gross := gift.coin_price; -- 1 Minglora Coin = USD 0.01
  creator_amount := gross/2;
  INSERT INTO public.live_gift_transactions(
    broadcast_id,sender_id,receiver_id,gift_code,coin_amount,gross_minor,
    creator_share_minor,platform_share_minor
  ) VALUES (
    broadcast.id,p_sender_id,broadcast.host_id,gift.code,gift.coin_price,gross,
    creator_amount,gross-creator_amount
  ) RETURNING id INTO gift_id;

  INSERT INTO public.creator_earnings_ledger(
    creator_id,gift_transaction_id,gross_minor,creator_share_minor,
    platform_share_minor
  ) VALUES (
    broadcast.host_id,gift_id,gross,creator_amount,gross-creator_amount
  );

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',gift_id,'giftCode',gift.code,
    'giftName',gift.name,'emoji',gift.emoji,'coinAmount',gift.coin_price,
    'remainingCoins',new_balance,'grossMinor',gross,
    'creatorShareMinor',creator_amount,
    'platformShareMinor',gross-creator_amount,'currency','USD'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text)
  TO service_role;

COMMIT;
