BEGIN;
DROP FUNCTION IF EXISTS public.minglora_send_admin_promotional_gift(uuid,text,uuid,text);
CREATE FUNCTION public.minglora_send_admin_promotional_gift(
  p_sender_id uuid,
  p_gift_code text,
  p_broadcast_id uuid DEFAULT NULL::uuid,
  p_recipient_username text DEFAULT NULL::text,
  p_recipient_id uuid DEFAULT NULL::uuid
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Active LIVE broadcast was not found'; END IF;
    IF p_sender_id<>broadcast.host_id AND NOT EXISTS (
      SELECT 1 FROM public.live_participants lp
      WHERE lp.broadcast_id=broadcast.id AND lp.user_id=p_sender_id
        AND lp.status IN ('connected','accepted') AND lp.left_at IS NULL
    ) THEN RAISE EXCEPTION 'Join this LIVE before sending a gift' USING ERRCODE='42501'; END IF;
    IF p_recipient_id IS NULL OR p_recipient_id=broadcast.host_id THEN
      SELECT * INTO recipient FROM public.profiles WHERE id=broadcast.host_id;
    ELSE
      IF p_recipient_id=p_sender_id THEN RAISE EXCEPTION 'you cannot send a gift to yourself'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.live_participants lp
        WHERE lp.broadcast_id=broadcast.id AND lp.user_id=p_recipient_id
          AND lp.role IN ('guest','cohost') AND lp.status IN ('connected','accepted') AND lp.left_at IS NULL
      ) THEN RAISE EXCEPTION 'gift recipient is not a connected LIVE guest or co-host' USING ERRCODE='42501'; END IF;
      SELECT * INTO recipient FROM public.profiles WHERE id=p_recipient_id;
    END IF;
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
REVOKE ALL ON FUNCTION public.minglora_send_admin_promotional_gift(uuid,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_admin_promotional_gift(uuid,text,uuid,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';COMMIT;
