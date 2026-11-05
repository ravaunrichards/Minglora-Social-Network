-- Allow the designated platform owner to cash-back an existing, ordinary promotional
-- gift only after real USD has been captured into the independent promotional gift reserve.
-- Original Coin source columns remain unchanged; the backing has its own auditable ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_promotional_gift_cash_backings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  gift_transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.live_gift_transactions(id) ON DELETE RESTRICT,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  gift_coin_amount bigint NOT NULL CHECK (gift_coin_amount > 0),
  backing_minor bigint NOT NULL CHECK (backing_minor > 0),
  creator_share_minor numeric(20,2) NOT NULL CHECK (creator_share_minor >= 0),
  platform_share_minor numeric(20,2) NOT NULL CHECK (platform_share_minor >= 0),
  fund_ledger_id uuid REFERENCES public.minglora_promotional_gift_fund_ledger(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_promo_gift_cash_backing_value_ck
    CHECK (backing_minor = gift_coin_amount
      AND creator_share_minor + platform_share_minor = backing_minor)
);

CREATE INDEX IF NOT EXISTS minglora_promo_gift_cash_backings_creator_idx
  ON public.minglora_promotional_gift_cash_backings(creator_id, created_at DESC);

ALTER TABLE public.minglora_promotional_gift_cash_backings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minglora_promotional_gift_cash_backings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.minglora_promotional_gift_cash_backings TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_list_promotional_gifts_for_cash_backing(
  p_admin_user_id uuid,
  p_admin_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  items jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can review promotional gift cash backing'
      USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.created_at DESC),'[]'::jsonb)
  INTO items
  FROM (
    SELECT
      t.id AS gift_transaction_id,
      t.gift_code,
      coalesce(c.name,t.gift_code) AS gift_name,
      coalesce(c.emoji,'🎁') AS gift_emoji,
      t.coin_amount,
      t.created_at,
      t.context_type,
      t.recipient_username,
      sender.username AS sender_username,
      recipient.username AS creator_username,
      recipient.display_name AS creator_display_name,
      t.coin_amount::bigint AS required_minor,
      round(t.coin_amount::numeric / 2, 2) AS creator_share_minor,
      t.coin_amount::numeric - round(t.coin_amount::numeric / 2, 2) AS platform_share_minor
    FROM public.live_gift_transactions AS t
    LEFT JOIN public.live_gift_catalog AS c ON c.code=t.gift_code
    LEFT JOIN public.profiles AS sender ON sender.id=t.sender_id
    LEFT JOIN public.profiles AS recipient ON recipient.id=t.receiver_id
    WHERE t.funding_source='promo'
      AND t.gross_minor=0
      AND t.cash_backed_coins=0
      AND t.marketing_backed_coins=0
      AND t.promo_coins=t.coin_amount
      AND t.admin_promotional_coins=0
      AND NOT EXISTS (
        SELECT 1 FROM public.minglora_promotional_gift_cash_backings AS b
        WHERE b.gift_transaction_id=t.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.creator_earnings_ledger AS e
        WHERE e.gift_transaction_id=t.id
      )
    ORDER BY t.created_at DESC
    LIMIT 100
  ) AS candidate;

  RETURN jsonb_build_object('items',items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_backfill_promotional_gift_cash(
  p_admin_user_id uuid,
  p_admin_email text,
  p_gift_transaction_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  gift public.live_gift_transactions%ROWTYPE;
  existing public.minglora_promotional_gift_cash_backings%ROWTYPE;
  fund public.minglora_promotional_gift_fund%ROWTYPE;
  fund_ledger_id uuid;
  creator_share numeric(20,2);
  platform_share numeric(20,2);
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can cash-back a promotional gift'
      USING ERRCODE='42501';
  END IF;
  IF p_gift_transaction_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'A gift transaction and secure request reference are required'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing
  FROM public.minglora_promotional_gift_cash_backings
  WHERE request_id=p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.gift_transaction_id<>p_gift_transaction_id
       OR existing.actor_user_id<>p_admin_user_id THEN
      RAISE EXCEPTION 'Cash-backing request reference was already used with different details'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'alreadyBacked',true,'giftTransactionId',existing.gift_transaction_id,
      'creatorId',existing.creator_id,'coinAmount',existing.gift_coin_amount,
      'backingMinor',existing.backing_minor,'creatorShareMinor',existing.creator_share_minor,
      'platformShareMinor',existing.platform_share_minor,'createdAt',existing.created_at
    );
  END IF;

  SELECT * INTO gift
  FROM public.live_gift_transactions
  WHERE id=p_gift_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotional gift transaction was not found' USING ERRCODE='P0002';
  END IF;

  SELECT * INTO existing
  FROM public.minglora_promotional_gift_cash_backings
  WHERE gift_transaction_id=p_gift_transaction_id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok',true,'alreadyBacked',true,'giftTransactionId',existing.gift_transaction_id,
      'creatorId',existing.creator_id,'coinAmount',existing.gift_coin_amount,
      'backingMinor',existing.backing_minor,'creatorShareMinor',existing.creator_share_minor,
      'platformShareMinor',existing.platform_share_minor,'createdAt',existing.created_at
    );
  END IF;

  IF gift.funding_source<>'promo'
     OR gift.gross_minor<>0
     OR gift.cash_backed_coins<>0
     OR gift.marketing_backed_coins<>0
     OR gift.promo_coins<>gift.coin_amount
     OR gift.admin_promotional_coins<>0
     OR gift.coin_amount<=0 THEN
    RAISE EXCEPTION 'Only a wholly ordinary promotional gift with no existing cash earnings can be backed'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE gift_transaction_id=p_gift_transaction_id
  ) THEN
    RAISE EXCEPTION 'This gift already has a creator earnings entry and cannot be backed twice'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.minglora_promotional_gift_fund(id)
  VALUES(true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO fund
  FROM public.minglora_promotional_gift_fund
  WHERE id=true
  FOR UPDATE;
  IF fund.funded_minor-fund.spent_minor < gift.coin_amount THEN
    RAISE EXCEPTION 'Insufficient verified USD reserve. Fund at least USD % before backing this gift.',
      to_char(gift.coin_amount::numeric/100,'FM999999999990.00')
      USING ERRCODE='22003';
  END IF;

  creator_share:=round(gift.coin_amount::numeric/2,2);
  platform_share:=gift.coin_amount::numeric-creator_share;

  UPDATE public.minglora_promotional_gift_fund
  SET spent_minor=spent_minor+gift.coin_amount,updated_at=now()
  WHERE id=true;

  INSERT INTO public.minglora_promotional_gift_fund_ledger(
    request_id,event_type,reference_id,spent_delta_minor,note,actor_user_id
  ) VALUES (
    gen_random_uuid(),'gift_spend',gift.id,gift.coin_amount,
    'Verified USD reserve used to cash-back a previously sent ordinary promotional gift',
    p_admin_user_id
  ) RETURNING id INTO fund_ledger_id;

  INSERT INTO public.minglora_promotional_gift_cash_backings(
    request_id,gift_transaction_id,creator_id,gift_coin_amount,backing_minor,
    creator_share_minor,platform_share_minor,fund_ledger_id,actor_user_id
  ) VALUES (
    p_request_id,gift.id,gift.receiver_id,gift.coin_amount,gift.coin_amount,
    creator_share,platform_share,fund_ledger_id,p_admin_user_id
  ) RETURNING * INTO existing;

  INSERT INTO public.creator_earnings_ledger(
    creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor,
    funding_source
  ) VALUES (
    gift.receiver_id,gift.id,gift.coin_amount,creator_share,platform_share,'admin_promotional'
  );

  RETURN jsonb_build_object(
    'ok',true,'alreadyBacked',false,'giftTransactionId',gift.id,
    'creatorId',gift.receiver_id,'coinAmount',gift.coin_amount,
    'backingMinor',gift.coin_amount,'creatorShareMinor',creator_share,
    'platformShareMinor',platform_share,'createdAt',existing.created_at,
    'fundedReserveSpentMinor',gift.coin_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_get_creator_gift_balance(
  p_creator_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=p_creator_id
  ) THEN
    RAISE EXCEPTION 'creator account was not found' USING ERRCODE='P0002';
  END IF;

  SELECT jsonb_build_object(
    'giftCount',count(*)::bigint,
    'receivedCoins',coalesce(sum(t.coin_amount),0)::bigint,
    'cashBackedCoins',coalesce(sum(t.cash_backed_coins),0)::bigint,
    'marketingBackedCoins',coalesce(sum(t.marketing_backed_coins),0)::bigint,
    'promotionalCoins',coalesce(sum(t.promo_coins),0)::bigint,
    'adminPromotionalCoins',coalesce(sum(t.admin_promotional_coins),0)::bigint,
    'cashBackedPromotionalCoins',coalesce(sum(b.gift_coin_amount),0)::bigint,
    'cashBackedPromotionalGrossMinor',coalesce(sum(b.backing_minor),0)::bigint,
    'cashBackedPromotionalCreatorShareMinor',coalesce(sum(b.creator_share_minor),0),
    'eligibleGrossMinor',coalesce(sum(t.gross_minor),0)::bigint
      + coalesce(sum(b.backing_minor),0)::bigint,
    'creatorShareMinor',coalesce(sum(t.creator_share_minor),0)
      + coalesce(sum(b.creator_share_minor),0),
    'recent',coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',recent.id,
          'giftCode',recent.gift_code,
          'giftName',recent.gift_name,
          'giftEmoji',recent.gift_emoji,
          'coinAmount',recent.coin_amount,
          'grossMinor',recent.gross_minor+coalesce(recent.backing_minor,0),
          'creatorShareMinor',recent.creator_share_minor+coalesce(recent.backing_creator_share_minor,0),
          'cashBackedCoins',recent.cash_backed_coins,
          'marketingBackedCoins',recent.marketing_backed_coins,
          'promotionalCoins',recent.promo_coins,
          'adminPromotionalCoins',recent.admin_promotional_coins,
          'cashBackingMinor',coalesce(recent.backing_minor,0),
          'cashBackingCreatorShareMinor',coalesce(recent.backing_creator_share_minor,0),
          'cashBackingCreatedAt',recent.backing_created_at,
          'fundingSource',recent.funding_source,
          'senderUsername',recent.sender_username,
          'senderDisplayName',recent.sender_display_name,
          'createdAt',recent.created_at
        )
        ORDER BY recent.created_at DESC
      )
      FROM (
        SELECT
          t.id,t.gift_code,c.name AS gift_name,c.emoji AS gift_emoji,
          t.coin_amount,t.gross_minor,t.creator_share_minor,
          t.cash_backed_coins,t.marketing_backed_coins,t.promo_coins,
          t.admin_promotional_coins,t.funding_source,
          sender.username AS sender_username,
          sender.display_name AS sender_display_name,
          t.created_at,
          b.backing_minor,
          b.creator_share_minor AS backing_creator_share_minor,
          b.created_at AS backing_created_at
        FROM public.live_gift_transactions AS t
        LEFT JOIN public.minglora_promotional_gift_cash_backings AS b
          ON b.gift_transaction_id=t.id
        LEFT JOIN public.profiles AS sender ON sender.id=t.sender_id
        LEFT JOIN public.live_gift_catalog AS c ON c.code=t.gift_code
        WHERE t.receiver_id=p_creator_id
        ORDER BY t.created_at DESC
        LIMIT 50
      ) AS recent
    ),'[]'::jsonb)
  )
  INTO result
  FROM public.live_gift_transactions AS t
  LEFT JOIN public.minglora_promotional_gift_cash_backings AS b
    ON b.gift_transaction_id=t.id
  WHERE t.receiver_id=p_creator_id;

  RETURN coalesce(result,'{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_list_promotional_gifts_for_cash_backing(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_list_promotional_gifts_for_cash_backing(uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_backfill_promotional_gift_cash(uuid,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_backfill_promotional_gift_cash(uuid,text,uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_creator_gift_balance(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_creator_gift_balance(uuid)
  TO service_role;

COMMIT;
