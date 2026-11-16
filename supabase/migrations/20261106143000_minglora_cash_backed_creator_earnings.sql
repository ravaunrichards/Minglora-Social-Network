-- Cash-backed creator earnings and platform share hardening for Minglora.
-- Applied to Supabase project gzycobgbasnqqhnympkr on 2026-11-06.
-- Promotional-only Coin activity remains in gift history but cannot create money
-- earnings, platform revenue, exchanges, or PayPal creator payouts.
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
    'eligibleGrossMinor',cash_used+marketing_used
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_get_creator_money_balance(p_creator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  lifetime_creator_earnings_minor bigint;
  available_creator_earnings_minor bigint;
  promotional_gift_creator_share_minor numeric(20,2);
  subscription_net_minor bigint;
  reserved_payout_minor bigint;
  exchanged_minor bigint;
  available_minor bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=p_creator_id
  ) THEN
    RAISE EXCEPTION 'creator account was not found';
  END IF;

  -- Keep unbacked historical promotional entries visible as a separate metric,
  -- but never include them in the real-money creator balance.
  SELECT coalesce(sum(e.creator_share_minor),0)::bigint
    INTO lifetime_creator_earnings_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id
      AND e.funding_source IN ('cash','marketing','mixed','admin_promotional');

  SELECT coalesce(sum(e.creator_share_minor),0)::bigint
    INTO available_creator_earnings_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id
      AND e.status='available'
      AND e.funding_source IN ('cash','marketing','mixed','admin_promotional');

  SELECT coalesce(sum(e.creator_share_minor),0)
    INTO promotional_gift_creator_share_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id
      AND e.funding_source='promo';

  SELECT coalesce(sum(
    CASE
      WHEN e.entry_type='payment' THEN e.creator_minor
      WHEN e.entry_type='refund' THEN -e.creator_minor
      ELSE 0
    END
  ),0)::bigint
    INTO subscription_net_minor
    FROM public.subscription_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id;

  SELECT coalesce(sum(p.amount_minor),0)::bigint
    INTO reserved_payout_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id=p_creator_id
      AND p.status IN ('requested','processing','paid');

  SELECT coalesce(sum(x.amount_minor),0)::bigint
    INTO exchanged_minor
    FROM public.creator_coin_exchanges AS x
    WHERE x.creator_id=p_creator_id;

  available_minor := greatest(
    0,
    available_creator_earnings_minor + subscription_net_minor
      - reserved_payout_minor - exchanged_minor
  );

  RETURN jsonb_build_object(
    'earnedMinor',lifetime_creator_earnings_minor+subscription_net_minor,
    'eligibleGiftEarningsMinor',lifetime_creator_earnings_minor,
    'promotionalGiftEarningsExcludedMinor',promotional_gift_creator_share_minor,
    'reservedMinor',reserved_payout_minor,
    'exchangedMinor',exchanged_minor,
    'availableMinor',available_minor,
    'currency','USD',
    'coinPerCent',1
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_request_creator_payout(p_creator_id uuid, p_amount_minor bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  available_minor bigint;
  reserved_minor bigint;
  subscription_net_minor bigint;
  exchanged_minor bigint;
  payout_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_amount_minor IS NULL OR p_amount_minor < 100 THEN
    RAISE EXCEPTION 'minimum payout is USD 1.00';
  END IF;

  PERFORM 1 FROM public.profiles AS creator
    WHERE creator.id=p_creator_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator account was not found';
  END IF;

  SELECT coalesce(sum(e.creator_share_minor),0)::bigint
    INTO available_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id
      AND e.status='available'
      AND e.funding_source IN ('cash','marketing','mixed','admin_promotional');

  SELECT coalesce(sum(
    CASE
      WHEN e.entry_type='payment' THEN e.creator_minor
      WHEN e.entry_type='refund' THEN -e.creator_minor
      ELSE 0
    END
  ),0)::bigint
    INTO subscription_net_minor
    FROM public.subscription_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id;

  available_minor := available_minor+subscription_net_minor;

  SELECT coalesce(sum(p.amount_minor),0)::bigint
    INTO reserved_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id=p_creator_id
      AND p.status IN ('requested','processing','paid');

  SELECT coalesce(sum(x.amount_minor),0)::bigint
    INTO exchanged_minor
    FROM public.creator_coin_exchanges AS x
    WHERE x.creator_id=p_creator_id;

  IF p_amount_minor > available_minor-reserved_minor-exchanged_minor THEN
    RAISE EXCEPTION 'payout exceeds available cash-backed creator earnings';
  END IF;

  INSERT INTO public.creator_payouts(creator_id,amount_minor,currency,status)
    VALUES(p_creator_id,p_amount_minor,'USD','requested')
    RETURNING id INTO payout_id;
  RETURN payout_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_get_creator_gift_balance(p_creator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

  WITH gift_rows AS (
    SELECT
      t.id,t.gift_code,t.coin_amount,t.created_at,t.funding_source,
      t.cash_backed_coins,t.marketing_backed_coins,t.promo_coins,t.admin_promotional_coins,
      t.sender_id,
      (t.cash_backed_coins+t.marketing_backed_coins+t.admin_promotional_coins)::bigint AS eligible_gross_minor,
      coalesce(b.backing_minor,0)::bigint AS backing_minor,
      coalesce(b.creator_share_minor,0)::numeric AS backing_creator_share_minor,
      coalesce(b.platform_share_minor,0)::numeric AS backing_platform_share_minor,
      b.created_at AS backing_created_at,
      b.gift_coin_amount AS backed_promo_coins
    FROM public.live_gift_transactions AS t
    LEFT JOIN public.minglora_promotional_gift_cash_backings AS b
      ON b.gift_transaction_id=t.id
    WHERE t.receiver_id=p_creator_id
  ),
  recent_rows AS (
    SELECT
      g.*,
      sender.username AS sender_username,
      sender.display_name AS sender_display_name,
      c.name AS gift_name,
      c.emoji AS gift_emoji
    FROM gift_rows g
    LEFT JOIN public.profiles sender ON sender.id=g.sender_id
    LEFT JOIN public.live_gift_catalog c ON c.code=g.gift_code
    ORDER BY g.created_at DESC
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'giftCount',count(*)::bigint,
    'receivedCoins',coalesce(sum(g.coin_amount),0)::bigint,
    'cashBackedCoins',coalesce(sum(g.cash_backed_coins),0)::bigint,
    'marketingBackedCoins',coalesce(sum(g.marketing_backed_coins),0)::bigint,
    'promotionalCoins',coalesce(sum(g.promo_coins),0)::bigint,
    'adminPromotionalCoins',coalesce(sum(g.admin_promotional_coins),0)::bigint,
    'cashBackedPromotionalCoins',coalesce(sum(g.backed_promo_coins),0)::bigint,
    'cashBackedPromotionalGrossMinor',coalesce(sum(g.backing_minor),0)::bigint,
    'cashBackedPromotionalCreatorShareMinor',coalesce(sum(g.backing_creator_share_minor),0),
    'eligibleGrossMinor',coalesce(sum(g.eligible_gross_minor+g.backing_minor),0)::bigint,
    'creatorShareMinor',coalesce(sum(round(g.eligible_gross_minor::numeric/2,2)+g.backing_creator_share_minor),0),
    'platformShareMinor',coalesce(sum(g.eligible_gross_minor::numeric-round(g.eligible_gross_minor::numeric/2,2)+g.backing_platform_share_minor),0),
    'recent',coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',r.id,
          'giftCode',r.gift_code,
          'giftName',r.gift_name,
          'giftEmoji',r.gift_emoji,
          'coinAmount',r.coin_amount,
          'grossMinor',r.eligible_gross_minor+r.backing_minor,
          'creatorShareMinor',round(r.eligible_gross_minor::numeric/2,2)+r.backing_creator_share_minor,
          'platformShareMinor',r.eligible_gross_minor::numeric-round(r.eligible_gross_minor::numeric/2,2)+r.backing_platform_share_minor,
          'cashBackedCoins',r.cash_backed_coins,
          'marketingBackedCoins',r.marketing_backed_coins,
          'promotionalCoins',r.promo_coins,
          'adminPromotionalCoins',r.admin_promotional_coins,
          'cashBackingMinor',r.backing_minor,
          'cashBackingCreatorShareMinor',r.backing_creator_share_minor,
          'cashBackingCreatedAt',r.backing_created_at,
          'fundingSource',CASE WHEN r.backing_minor>0 THEN 'admin_promotional' ELSE r.funding_source END,
          'senderUsername',r.sender_username,
          'senderDisplayName',r.sender_display_name,
          'createdAt',r.created_at
        ) ORDER BY r.created_at DESC
      ) FROM recent_rows r
    ),'[]'::jsonb)
  )
  INTO result
  FROM gift_rows g;

  RETURN coalesce(result,'{}'::jsonb);
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_get_platform_gift_earnings(p_admin_user_id uuid, p_admin_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  eligible_gifts bigint;
  eligible_gross_minor bigint;
  eligible_creator_share_minor numeric(20,2);
  platform_share_minor numeric(20,2);
  excluded_promo_gifts bigint;
  excluded_promo_creator_share_minor numeric(20,2);
  excluded_promo_platform_share_minor numeric(20,2);
  pending_creator_payout_minor bigint;
  paid_creator_payout_minor bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can view platform gift earnings'
      USING ERRCODE='42501';
  END IF;

  SELECT count(*)::bigint,
         coalesce(sum(e.gross_minor),0)::bigint,
         coalesce(sum(e.creator_share_minor),0),
         coalesce(sum(e.platform_share_minor),0)
    INTO eligible_gifts,eligible_gross_minor,eligible_creator_share_minor,platform_share_minor
    FROM public.creator_earnings_ledger e
    WHERE e.funding_source IN ('cash','marketing','mixed','admin_promotional');

  SELECT count(*)::bigint,
         coalesce(sum(e.creator_share_minor),0),
         coalesce(sum(e.platform_share_minor),0)
    INTO excluded_promo_gifts,excluded_promo_creator_share_minor,excluded_promo_platform_share_minor
    FROM public.creator_earnings_ledger e
    WHERE e.funding_source='promo';

  SELECT coalesce(sum(p.amount_minor),0)::bigint
    INTO pending_creator_payout_minor
    FROM public.creator_payouts p
    WHERE p.status IN ('requested','processing');

  SELECT coalesce(sum(p.amount_minor),0)::bigint
    INTO paid_creator_payout_minor
    FROM public.creator_payouts p
    WHERE p.status='paid';

  RETURN jsonb_build_object(
    'eligibleGiftCount',eligible_gifts,
    'eligibleGrossMinor',eligible_gross_minor,
    'eligibleCreatorShareMinor',eligible_creator_share_minor,
    'recordedPlatformShareMinor',platform_share_minor,
    'excludedPromotionalGiftCount',excluded_promo_gifts,
    'excludedPromotionalCreatorShareMinor',excluded_promo_creator_share_minor,
    'excludedPromotionalPlatformShareMinor',excluded_promo_platform_share_minor,
    'pendingCreatorPayoutMinor',pending_creator_payout_minor,
    'paidCreatorPayoutMinor',paid_creator_payout_minor,
    'currency','USD',
    'note','Recorded platform share is a ledger total, not a live PayPal balance or confirmation of available funds.'
  );
END;
$function$


REVOKE ALL ON FUNCTION public.minglora_get_creator_money_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_creator_money_balance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_request_creator_payout(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_request_creator_payout(uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_creator_gift_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_creator_gift_balance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_get_platform_gift_earnings(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_platform_gift_earnings(uuid,text) TO service_role;

COMMIT;
