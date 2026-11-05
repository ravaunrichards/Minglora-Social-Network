-- Give legacy/Main Promotional Coins equal gift value and earnings.
-- If Coins already have a reserved marketing backing, that backing is consumed.
-- If not, an eligible gift may cash-back those promo Coins from free verified
-- reserve funds (1 Coin = USD 0.01). Unbacked gifts never create cash earnings.
BEGIN;
CREATE OR REPLACE FUNCTION public.minglora_debit_wallet_sources(p_user_id uuid, p_amount_coins bigint, p_entry_type text, p_reference_id uuid, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wallet public.coin_wallets%ROWTYPE;
  remaining bigint;
  cash_used bigint;
  marketing_used bigint;
  promo_used bigint;
  new_balance bigint;
  bonus_budget public.minglora_marketing_budget%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_amount_coins IS NULL OR p_amount_coins <= 0
     OR p_reference_id IS NULL
     OR p_entry_type NOT IN ('live_gift_sent','social_gift_sent','live_reward_escrow') THEN
    RAISE EXCEPTION 'invalid Coin debit' USING ERRCODE='22023';
  END IF;

  -- Lock the cash reserve before the member wallet so bonus and gift operations
  -- use one consistent budget -> wallet lock order.
  IF p_entry_type IN ('live_gift_sent','social_gift_sent') THEN
    INSERT INTO public.minglora_marketing_budget(id)
    VALUES(true) ON CONFLICT(id) DO NOTHING;
    SELECT * INTO bonus_budget
    FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  END IF;

  SELECT * INTO wallet FROM public.coin_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR wallet.balance_coins < p_amount_coins THEN
    RAISE EXCEPTION 'not enough Minglora Coins' USING ERRCODE='22003';
  END IF;

  remaining := p_amount_coins;
  cash_used := least(wallet.cash_balance_coins,remaining);
  remaining := remaining-cash_used;
  marketing_used := least(wallet.marketing_balance_coins,remaining);
  remaining := remaining-marketing_used;
  promo_used := least(wallet.promo_balance_coins,remaining);
  remaining := remaining-promo_used;
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Coin source balances do not match the total wallet balance' USING ERRCODE='23514';
  END IF;
  IF p_entry_type IN ('live_gift_sent','social_gift_sent')
     AND bonus_budget.funded_minor-bonus_budget.reserved_minor-bonus_budget.spent_minor < promo_used THEN
    RAISE EXCEPTION 'Promotional bonus gifts require available verified USD backing in the Minglora bonus reserve'
      USING ERRCODE='22003';
  END IF;

  new_balance := wallet.balance_coins-p_amount_coins;
  UPDATE public.coin_wallets
  SET balance_coins=new_balance,
      cash_balance_coins=cash_balance_coins-cash_used,
      marketing_balance_coins=marketing_balance_coins-marketing_used,
      promo_balance_coins=promo_balance_coins-promo_used,
      updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.coin_ledger(
    user_id,delta_coins,balance_after,entry_type,reference_id,description,
    cash_delta_coins,marketing_delta_coins,promo_delta_coins
  ) VALUES (
    p_user_id,-p_amount_coins,new_balance,p_entry_type,p_reference_id,left(coalesce(p_description,''),240),
    -cash_used,-marketing_used,-promo_used
  );

  -- Marketing Coins spend their prior grant reservation. Promo Coins receive
  -- the same creator-share treatment when actual available USD backs them at
  -- gift time (1 Coin = USD 0.01).
  IF p_entry_type IN ('live_gift_sent','social_gift_sent')
     AND (marketing_used > 0 OR promo_used > 0) THEN
    UPDATE public.minglora_marketing_budget
    SET reserved_minor=reserved_minor-marketing_used,
        spent_minor=spent_minor+marketing_used+promo_used,
        updated_at=now()
    WHERE id=true
      AND reserved_minor >= marketing_used
      AND funded_minor-reserved_minor-spent_minor >= promo_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coin gift is not fully backed by verified Minglora reserve funds' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.minglora_marketing_budget_ledger(
      event_type,request_id,reference_id,reserved_delta_minor,spent_delta_minor,note,actor_user_id
    ) VALUES (
      'gift_spend',gen_random_uuid(),p_reference_id,-marketing_used,
      marketing_used+promo_used,
      left(coalesce(p_description,'Cash-backed Minglora gift'),240),p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'balanceAfter',new_balance,
    'cashCoins',cash_used,'marketingCoins',marketing_used,'promoCoins',promo_used,
    'eligibleGrossMinor',cash_used+marketing_used+CASE WHEN p_entry_type IN ('live_gift_sent','social_gift_sent') THEN promo_used ELSE 0 END
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.minglora_send_live_gift(p_sender_id uuid, p_broadcast_id uuid, p_gift_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  broadcast public.live_broadcasts%ROWTYPE;
  gift public.live_gift_catalog%ROWTYPE;
  gift_id uuid := gen_random_uuid();
  debit_result jsonb;
  new_balance bigint;
  cash_used bigint;
  marketing_used bigint;
  promo_used bigint;
  eligible_gross bigint;
  creator_amount numeric(20,2);
  source_label text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO broadcast FROM public.live_broadcasts
    WHERE id=p_broadcast_id AND status='live' FOR SHARE;
  IF NOT FOUND OR broadcast.host_id=p_sender_id THEN RAISE EXCEPTION 'active live broadcast not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=broadcast.host_id)
       OR (b.blocker_id=broadcast.host_id AND b.blocked_id=p_sender_id)
  ) THEN RAISE EXCEPTION 'gift unavailable for this relationship'; END IF;

  SELECT * INTO gift FROM public.live_gift_catalog WHERE code=p_gift_code AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift is unavailable'; END IF;

  debit_result := public.minglora_debit_wallet_sources(
    p_sender_id,gift.coin_price,'live_gift_sent',gift_id,'Sent LIVE gift: '||gift.name
  );
  new_balance := (debit_result->>'balanceAfter')::bigint;
  cash_used := (debit_result->>'cashCoins')::bigint;
  marketing_used := (debit_result->>'marketingCoins')::bigint;
  promo_used := (debit_result->>'promoCoins')::bigint;
  eligible_gross := cash_used+marketing_used+promo_used;
  creator_amount := eligible_gross::numeric/2;
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
    gift_id,broadcast.id,p_sender_id,broadcast.host_id,gift.code,gift.coin_price,
    eligible_gross,creator_amount,eligible_gross-creator_amount,
    cash_used,marketing_used,promo_used,source_label
  );

  IF eligible_gross>0 THEN
    INSERT INTO public.creator_earnings_ledger(
      creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor,funding_source
    ) VALUES (
      broadcast.host_id,gift_id,eligible_gross,creator_amount,eligible_gross-creator_amount,source_label
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',gift_id,'giftCode',gift.code,
    'giftName',gift.name,'emoji',gift.emoji,'coinAmount',gift.coin_price,
    'remainingCoins',new_balance,'grossMinor',eligible_gross,
    'creatorShareMinor',creator_amount,'platformShareMinor',eligible_gross-creator_amount,
    'cashBackedCoins',cash_used,'marketingBackedCoins',marketing_used,'promoCoins',promo_used,
    'fundingSource',source_label,'currency','USD'
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.minglora_send_social_gift(p_sender_id uuid, p_recipient_username text, p_gift_code text, p_context_type text DEFAULT 'user'::text, p_context_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_username text;
  recipient public.profiles%ROWTYPE;
  gift public.live_gift_catalog%ROWTYPE;
  post_owner uuid;
  video_owner uuid;
  photo_owner uuid;
  content_audience text;
  transaction_id uuid := gen_random_uuid();
  debit_result jsonb;
  new_balance bigint;
  cash_used bigint;
  marketing_used bigint;
  promo_used bigint;
  eligible_gross bigint;
  creator_amount numeric(20,2);
  source_label text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  normalized_username := lower(regexp_replace(btrim(coalesce(p_recipient_username,'')), '^@', ''));
  IF normalized_username !~ '^[a-z0-9_]{3,30}$'
     OR p_sender_id IS NULL
     OR coalesce(p_gift_code,'') !~ '^[a-z0-9_-]{1,60}$'
     OR coalesce(p_context_type,'user') NOT IN ('user','post','video','photo') THEN
    RAISE EXCEPTION 'invalid social gift request' USING ERRCODE='22023';
  END IF;

  SELECT * INTO recipient FROM public.profiles
  WHERE lower(username)=normalized_username LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Minglora member not found' USING ERRCODE='P0002'; END IF;
  IF recipient.id=p_sender_id THEN RAISE EXCEPTION 'you cannot send a gift to yourself' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=recipient.id)
       OR (b.blocker_id=recipient.id AND b.blocked_id=p_sender_id)
  ) THEN RAISE EXCEPTION 'gifting is unavailable for this relationship' USING ERRCODE='42501'; END IF;

  IF p_context_type='user' THEN
    IF p_context_id IS NOT NULL THEN RAISE EXCEPTION 'direct gifts do not take a content reference' USING ERRCODE='22023'; END IF;
  ELSIF p_context_type='post' THEN
    IF p_context_id IS NULL THEN RAISE EXCEPTION 'post reference is required' USING ERRCODE='22023'; END IF;
    SELECT author_id,audience INTO post_owner,content_audience
    FROM public.posts WHERE id=p_context_id AND status='published';
    IF NOT FOUND OR post_owner<>recipient.id THEN RAISE EXCEPTION 'post is unavailable for gifting' USING ERRCODE='P0002'; END IF;
    IF NOT (
      content_audience='public'
      OR (content_audience='followers' AND EXISTS (
        SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id
      ))
      OR (content_audience='friends'
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id)
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=recipient.id AND f.followed_id=p_sender_id))
    ) THEN RAISE EXCEPTION 'post is not visible to this sender' USING ERRCODE='42501'; END IF;
  ELSIF p_context_type='video' THEN
    IF p_context_id IS NULL THEN RAISE EXCEPTION 'video reference is required' USING ERRCODE='22023'; END IF;
    SELECT creator_id,audience INTO video_owner,content_audience
    FROM public.short_videos WHERE id=p_context_id AND status='ready';
    IF NOT FOUND OR video_owner<>recipient.id THEN RAISE EXCEPTION 'video is unavailable for gifting' USING ERRCODE='P0002'; END IF;
    IF NOT (
      content_audience='public'
      OR (content_audience='followers' AND EXISTS (
        SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id
      ))
      OR (content_audience='friends'
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id)
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=recipient.id AND f.followed_id=p_sender_id))
    ) THEN RAISE EXCEPTION 'video is not visible to this sender' USING ERRCODE='42501'; END IF;
  ELSIF p_context_type='photo' THEN
    IF p_context_id IS NULL THEN RAISE EXCEPTION 'photo album reference is required' USING ERRCODE='22023'; END IF;
    SELECT owner_id,audience INTO photo_owner,content_audience
    FROM public.photo_albums WHERE id=p_context_id AND status='active';
    IF NOT FOUND OR photo_owner<>recipient.id THEN RAISE EXCEPTION 'photo album is unavailable for gifting' USING ERRCODE='P0002'; END IF;
    IF NOT (
      content_audience='public'
      OR (content_audience='followers' AND EXISTS (
        SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id
      ))
      OR (content_audience='friends'
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_sender_id AND f.followed_id=recipient.id)
        AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=recipient.id AND f.followed_id=p_sender_id))
    ) THEN RAISE EXCEPTION 'photo album is not visible to this sender' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT * INTO gift FROM public.live_gift_catalog WHERE code=p_gift_code AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift is unavailable' USING ERRCODE='P0002'; END IF;

  debit_result := public.minglora_debit_wallet_sources(
    p_sender_id,gift.coin_price,'social_gift_sent',transaction_id,
    'Sent '||p_context_type||' gift to @'||normalized_username||': '||gift.name
  );
  new_balance := (debit_result->>'balanceAfter')::bigint;
  cash_used := (debit_result->>'cashCoins')::bigint;
  marketing_used := (debit_result->>'marketingCoins')::bigint;
  promo_used := (debit_result->>'promoCoins')::bigint;
  eligible_gross := cash_used+marketing_used+promo_used;
  creator_amount := eligible_gross::numeric/2;
  source_label := CASE
    WHEN cash_used>0 AND marketing_used=0 AND promo_used=0 THEN 'cash'
    WHEN marketing_used>0 AND cash_used=0 AND promo_used=0 THEN 'marketing'
    WHEN cash_used+marketing_used=0 THEN 'promo'
    ELSE 'mixed' END;

  INSERT INTO public.live_gift_transactions(
    id,broadcast_id,sender_id,receiver_id,gift_code,coin_amount,gross_minor,
    creator_share_minor,platform_share_minor,context_type,context_id,recipient_username,
    cash_backed_coins,marketing_backed_coins,promo_coins,funding_source
  ) VALUES (
    transaction_id,NULL,p_sender_id,recipient.id,gift.code,gift.coin_price,
    eligible_gross,creator_amount,eligible_gross-creator_amount,p_context_type,p_context_id,normalized_username,
    cash_used,marketing_used,promo_used,source_label
  );

  IF eligible_gross>0 THEN
    INSERT INTO public.creator_earnings_ledger(
      creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor,funding_source
    ) VALUES (
      recipient.id,transaction_id,eligible_gross,creator_amount,eligible_gross-creator_amount,source_label
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',transaction_id,'giftCode',gift.code,'giftName',gift.name,
    'emoji',gift.emoji,'coinAmount',gift.coin_price,'senderId',p_sender_id,'receiverId',recipient.id,
    'recipientUsername',normalized_username,'contextType',p_context_type,'contextId',p_context_id,
    'remainingCoins',new_balance,'grossMinor',eligible_gross,'creatorShareMinor',creator_amount,
    'platformShareMinor',eligible_gross-creator_amount,'cashBackedCoins',cash_used,
    'marketingBackedCoins',marketing_used,'promoCoins',promo_used,'fundingSource',source_label,'currency','USD'
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) TO service_role;
COMMIT;
