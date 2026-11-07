BEGIN;

-- LIVE gifts can target any other connected person in the active room:
-- host, approved guest/co-host, or connected viewer. The app server also
-- verifies current LiveKit presence immediately before calling this RPC.
CREATE OR REPLACE FUNCTION public.minglora_send_live_gift(
  p_sender_id uuid,
  p_broadcast_id uuid,
  p_gift_code text,
  p_recipient_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  broadcast public.live_broadcasts%ROWTYPE;
  gift public.live_gift_catalog%ROWTYPE;
  recipient public.profiles%ROWTYPE;
  debit_result jsonb;
  gift_id uuid := gen_random_uuid();
  new_balance bigint;
  cash_used bigint;
  marketing_used bigint;
  promo_used bigint;
  eligible_gross bigint;
  recipient_amount numeric(20,2);
  source_label text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_broadcast_id IS NULL
     OR p_gift_code IS NULL OR p_gift_code !~ '^[a-z0-9_-]{1,60}$' THEN
    RAISE EXCEPTION 'invalid LIVE gift request' USING ERRCODE='22023';
  END IF;
  IF p_sender_id=p_recipient_id THEN
    RAISE EXCEPTION 'you cannot send a gift to yourself' USING ERRCODE='22023';
  END IF;

  SELECT * INTO broadcast
  FROM public.live_broadcasts
  WHERE id=p_broadcast_id AND status='live'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active LIVE broadcast not found' USING ERRCODE='P0002'; END IF;

  IF p_recipient_id<>broadcast.host_id AND NOT EXISTS (
    SELECT 1 FROM public.live_participants lp
    WHERE lp.broadcast_id=broadcast.id
      AND lp.user_id=p_recipient_id
      AND lp.role IN ('guest','cohost')
      AND lp.status='connected'
      AND lp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'gift recipient is not a connected participant in this LIVE' USING ERRCODE='42501';
  END IF;

  IF p_sender_id<>broadcast.host_id AND NOT EXISTS (
    SELECT 1 FROM public.live_participants lp
    WHERE lp.broadcast_id=broadcast.id
      AND lp.user_id=p_sender_id
      AND lp.status='connected'
      AND lp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'join this LIVE before sending a gift' USING ERRCODE='42501';
  END IF;

  SELECT * INTO recipient FROM public.profiles WHERE id=p_recipient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIVE gift recipient account was not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=p_recipient_id)
       OR (b.blocker_id=p_recipient_id AND b.blocked_id=p_sender_id)
  ) THEN
    RAISE EXCEPTION 'gift unavailable for this relationship' USING ERRCODE='42501';
  END IF;

  SELECT * INTO gift FROM public.live_gift_catalog
  WHERE code=p_gift_code AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift is unavailable' USING ERRCODE='P0002'; END IF;

  debit_result := public.minglora_debit_wallet_sources(
    p_sender_id,gift.coin_price,'live_gift_sent',gift_id,'Sent LIVE gift: '||gift.name
  );
  new_balance := (debit_result->>'balanceAfter')::bigint;
  cash_used := (debit_result->>'cashCoins')::bigint;
  marketing_used := (debit_result->>'marketingCoins')::bigint;
  promo_used := (debit_result->>'promoCoins')::bigint;
  eligible_gross := cash_used+marketing_used;
  recipient_amount := eligible_gross::numeric/2;
  source_label := CASE
    WHEN cash_used>0 AND marketing_used=0 AND promo_used=0 THEN 'cash'
    WHEN marketing_used>0 AND cash_used=0 AND promo_used=0 THEN 'marketing'
    WHEN cash_used+marketing_used=0 THEN 'promo'
    ELSE 'mixed' END;

  INSERT INTO public.live_gift_transactions(
    id,broadcast_id,sender_id,receiver_id,gift_code,coin_amount,gross_minor,
    creator_share_minor,platform_share_minor,cash_backed_coins,marketing_backed_coins,
    promo_coins,funding_source
  ) VALUES (
    gift_id,broadcast.id,p_sender_id,p_recipient_id,gift.code,gift.coin_price,
    eligible_gross,recipient_amount,eligible_gross-recipient_amount,
    cash_used,marketing_used,promo_used,source_label
  );

  IF eligible_gross>0 THEN
    INSERT INTO public.creator_earnings_ledger(
      creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor
    ) VALUES (
      p_recipient_id,gift_id,eligible_gross,recipient_amount,eligible_gross-recipient_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',gift_id,'giftCode',gift.code,
    'giftName',gift.name,'emoji',gift.emoji,'coinAmount',gift.coin_price,
    'senderId',p_sender_id,'receiverId',p_recipient_id,
    'recipientUsername',recipient.username,'remainingCoins',new_balance,
    'grossMinor',eligible_gross,'creatorShareMinor',recipient_amount,
    'platformShareMinor',eligible_gross-recipient_amount,
    'cashBackedCoins',cash_used,'marketingBackedCoins',marketing_used,
    'promoCoins',promo_used,'fundingSource',source_label,'currency','USD'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text,uuid)
  TO service_role;

COMMIT;
