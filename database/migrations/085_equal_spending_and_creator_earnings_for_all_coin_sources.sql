-- All Minglora Coin sources have identical spending value and creator earnings.
-- Admin/owner-issued credits are free Main Wallet promotional-source Coins.
-- Every Coin spent on a LIVE or social gift counts toward the same USD gross
-- and 50/50 creator/platform split. Funding source remains audit metadata only.
BEGIN;
CREATE OR REPLACE FUNCTION public.minglora_admin_credit_member_coins(p_admin_user_id uuid, p_admin_email text, p_member_user_id uuid, p_amount_coins bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.admin_coin_credits%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  credit_id uuid;
  verified_email text;
  member_username text;
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
  credit_result jsonb;
  creator_hub_admin_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_admin_user_id IS DISTINCT FROM creator_hub_admin_id
     OR lower(btrim(coalesce(p_admin_email,''))) <> 'creatorhubcreatornetwork@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub administrative account only' USING ERRCODE='42501';
  END IF;
  SELECT lower(u.email) INTO verified_email
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.minglora_platform_staff s ON s.user_id=u.id
  WHERE u.id=p_admin_user_id AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND p.verification_status='verified' AND p.verification_badge='blue'
    AND s.role='owner' AND s.active=true AND 'platform:admin'=ANY(s.permissions)
  FOR SHARE OF u,p,s;
  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative account or owner authorization is not active' USING ERRCODE='42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id=creator_hub_admin_id THEN
    RAISE EXCEPTION 'Choose another Minglora member; owner Coins use owner issuance' USING ERRCODE='22023';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins<=0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE='22023';
  END IF;

  SELECT profile.username INTO member_username
  FROM public.profiles profile JOIN auth.users u ON u.id=profile.id
  WHERE profile.id=p_member_user_id FOR SHARE OF u,profile;
  IF member_username IS NULL THEN RAISE EXCEPTION 'Minglora member account was not found' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_member_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO current_balance FROM public.coin_wallets WHERE user_id=p_member_user_id FOR UPDATE;
  SELECT * INTO existing FROM public.admin_coin_credits WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.admin_user_id<>p_admin_user_id OR existing.member_user_id<>p_member_user_id
       OR existing.amount_coins<>p_amount_coins THEN
      RAISE EXCEPTION 'credit request reference was already used with different details' USING ERRCODE='23505';
    END IF;
RETURN jsonb_build_object('ok',true,'alreadyCredited',true,'creditId',existing.id,
      'memberUserId',existing.member_user_id,'memberUsername',member_username,
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource','promo');
  END IF;

  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Member Coin balance reached the database maximum; use a smaller credit amount' USING ERRCODE='22003';
  END IF;

  INSERT INTO public.admin_coin_credits(admin_user_id,member_user_id,request_id,amount_coins,note)
    VALUES(p_admin_user_id,p_member_user_id,p_request_id,p_amount_coins,cleaned_note)
    RETURNING id INTO credit_id;

  credit_result := public.minglora_credit_wallet_sources(
    p_member_user_id,0,0,p_amount_coins,'admin_credit',credit_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub admin bonus Coins'
      ELSE 'Creator Hub admin bonus Coins: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  RETURN jsonb_build_object('ok',true,'alreadyCredited',false,'creditId',credit_id,
    'memberUserId',p_member_user_id,'memberUsername',member_username,
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,'fundingSource','marketing_cash_backed');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.minglora_issue_verified_owner_coins(p_owner_user_id uuid, p_owner_email text, p_amount_coins bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.owner_coin_issuances%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  issuance_id uuid;
  verified_email text;
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
  credit_result jsonb;
  creator_hub_admin_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_owner_user_id IS DISTINCT FROM creator_hub_admin_id
     OR lower(btrim(coalesce(p_owner_email,''))) <> 'creatorhubcreatornetwork@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub administrative account only' USING ERRCODE='42501';
  END IF;
  SELECT lower(u.email) INTO verified_email
  FROM auth.users u
  JOIN public.profiles profile ON profile.id=u.id
  JOIN public.minglora_platform_staff staff ON staff.user_id=u.id
  WHERE u.id=p_owner_user_id AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND profile.verification_status='verified' AND profile.verification_badge='blue'
    AND staff.role='owner' AND staff.active=true AND 'platform:admin'=ANY(staff.permissions)
  FOR SHARE OF u,profile,staff;
  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative account or owner authorization is not active' USING ERRCODE='42501';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins<=0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_owner_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO current_balance FROM public.coin_wallets WHERE user_id=p_owner_user_id FOR UPDATE;
  SELECT * INTO existing FROM public.owner_coin_issuances WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.owner_user_id<>p_owner_user_id OR existing.amount_coins<>p_amount_coins THEN
      RAISE EXCEPTION 'issuance request reference was already used with different details' USING ERRCODE='23505';
    END IF;
RETURN jsonb_build_object('ok',true,'alreadyIssued',true,'issuanceId',existing.id,
      'recipientUserId',p_owner_user_id,'recipientEmail','creatorhubcreatornetwork@gmail.com',
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource','promo');
  END IF;

  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount' USING ERRCODE='22003';
  END IF;

  INSERT INTO public.owner_coin_issuances(owner_user_id,request_id,amount_coins,note)
    VALUES(p_owner_user_id,p_request_id,p_amount_coins,cleaned_note)
    RETURNING id INTO issuance_id;

  credit_result := public.minglora_credit_wallet_sources(
    p_owner_user_id,0,0,p_amount_coins,'owner_issuance',issuance_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub cash-backed owner bonus Coins'
      ELSE 'Creator Hub cash-backed owner bonus Coins: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  RETURN jsonb_build_object('ok',true,'alreadyIssued',false,'issuanceId',issuance_id,
    'recipientUserId',p_owner_user_id,'recipientEmail','creatorhubcreatornetwork@gmail.com',
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,'fundingSource','marketing_cash_backed');
END;
$function$
;
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
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_amount_coins IS NULL OR p_amount_coins <= 0
     OR p_reference_id IS NULL
     OR p_entry_type NOT IN ('live_gift_sent','social_gift_sent','live_reward_escrow') THEN
    RAISE EXCEPTION 'invalid Coin debit' USING ERRCODE='22023';
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

  -- Marketing-funded grants release their reservation only when spent.
  -- Promo-source bonus Coins remain fully spendable as regular Minglora Coins.
  IF marketing_used > 0 AND p_entry_type IN ('live_gift_sent','social_gift_sent') THEN
    UPDATE public.minglora_marketing_budget
    SET reserved_minor=reserved_minor-marketing_used,
        spent_minor=spent_minor+marketing_used,
        updated_at=now()
    WHERE id=true AND reserved_minor >= marketing_used;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'marketing Coin backing is not fully reserved' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.minglora_marketing_budget_ledger(
      event_type,request_id,reference_id,reserved_delta_minor,spent_delta_minor,note,actor_user_id
    ) VALUES (
      'gift_spend',gen_random_uuid(),p_reference_id,-marketing_used,marketing_used,
      left(coalesce(p_description,'Marketing-backed gift'),240),p_user_id
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

REVOKE ALL ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) TO service_role;
COMMIT;
