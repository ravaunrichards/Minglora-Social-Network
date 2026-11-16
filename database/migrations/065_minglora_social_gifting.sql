
-- Add username, post, short-video and photo-album gifting on top of the LIVE gift ledger.
-- The trusted runtime invokes minglora_send_social_gift using its server-only service role.
BEGIN;

ALTER TABLE public.live_gift_transactions
  ALTER COLUMN broadcast_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS context_type text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS context_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_username text;

ALTER TABLE public.live_gift_transactions
  DROP CONSTRAINT IF EXISTS live_gift_transactions_context_check;
ALTER TABLE public.live_gift_transactions
  ADD CONSTRAINT live_gift_transactions_context_check CHECK (
    (context_type = 'live' AND broadcast_id IS NOT NULL AND context_id IS NULL)
    OR (context_type = 'user' AND broadcast_id IS NULL AND context_id IS NULL)
    OR (context_type IN ('post','video','photo') AND broadcast_id IS NULL AND context_id IS NOT NULL)
  );

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_entry_type_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'purchase'::text,'live_gift_sent'::text,'social_gift_sent'::text,
    'refund'::text,'adjustment'::text
  ]));

CREATE INDEX IF NOT EXISTS live_gift_transactions_context_idx
  ON public.live_gift_transactions(context_type,context_id) WHERE context_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS live_gift_transactions_receiver_created_idx
  ON public.live_gift_transactions(receiver_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.minglora_send_social_gift(
  p_sender_id uuid,
  p_recipient_username text,
  p_gift_code text,
  p_context_type text DEFAULT 'user',
  p_context_id uuid DEFAULT NULL
)
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
  current_balance bigint;
  new_balance bigint;
  transaction_id uuid;
  gross bigint;
  creator_amount bigint;
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

  SELECT * INTO recipient
  FROM public.profiles
  WHERE lower(username)=normalized_username
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Minglora member not found' USING ERRCODE='P0002'; END IF;
  IF recipient.id=p_sender_id THEN RAISE EXCEPTION 'you cannot send a gift to yourself' USING ERRCODE='22023'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=p_sender_id AND b.blocked_id=recipient.id)
       OR (b.blocker_id=recipient.id AND b.blocked_id=p_sender_id)
  ) THEN
    RAISE EXCEPTION 'gifting is unavailable for this relationship' USING ERRCODE='42501';
  END IF;

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

  INSERT INTO public.coin_wallets(user_id) VALUES(p_sender_id) ON CONFLICT DO NOTHING;
  SELECT balance_coins INTO current_balance FROM public.coin_wallets WHERE user_id=p_sender_id FOR UPDATE;
  IF coalesce(current_balance,0)<gift.coin_price THEN RAISE EXCEPTION 'not enough Minglora Coins' USING ERRCODE='22003'; END IF;

  new_balance:=current_balance-gift.coin_price;
  UPDATE public.coin_wallets SET balance_coins=new_balance,updated_at=now() WHERE user_id=p_sender_id;
  INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,description)
  VALUES(p_sender_id,-gift.coin_price,new_balance,'social_gift_sent',
    'Sent '||p_context_type||' gift to @'||normalized_username||': '||gift.name);

  gross:=gift.coin_price;
  creator_amount:=gross/2;
  INSERT INTO public.live_gift_transactions(
    broadcast_id,sender_id,receiver_id,gift_code,coin_amount,gross_minor,
    creator_share_minor,platform_share_minor,context_type,context_id,recipient_username
  ) VALUES(NULL,p_sender_id,recipient.id,gift.code,gift.coin_price,gross,creator_amount,gross-creator_amount,
    p_context_type,p_context_id,normalized_username) RETURNING id INTO transaction_id;

  INSERT INTO public.creator_earnings_ledger(
    creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor
  ) VALUES(recipient.id,transaction_id,gross,creator_amount,gross-creator_amount);

  RETURN jsonb_build_object(
    'ok',true,'giftTransactionId',transaction_id,'giftCode',gift.code,'giftName',gift.name,
    'emoji',gift.emoji,'coinAmount',gift.coin_price,'senderId',p_sender_id,'receiverId',recipient.id,
    'recipientUsername',normalized_username,'contextType',p_context_type,'contextId',p_context_id,
    'remainingCoins',new_balance,'grossMinor',gross,'creatorShareMinor',creator_amount,
    'platformShareMinor',gross-creator_amount,'currency','USD'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) TO service_role;
COMMIT;
