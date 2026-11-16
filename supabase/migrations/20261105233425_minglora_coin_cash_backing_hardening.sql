-- Minglora Coin cash-backing hardening.
-- Applied to Supabase project gzycobgbasnqqhnympkr on 2026-11-05.
BEGIN;

ALTER TABLE public.creator_earnings_ledger
  DROP CONSTRAINT IF EXISTS creator_earnings_ledger_funding_source_check;
ALTER TABLE public.creator_earnings_ledger
  ADD CONSTRAINT creator_earnings_ledger_funding_source_check
  CHECK (funding_source IN ('cash','marketing','mixed','admin_promotional'))
  NOT VALID;

ALTER TABLE public.live_gift_transactions
  ADD CONSTRAINT live_gift_transactions_cash_backing_gross_check
  CHECK (
    gross_minor =
      cash_backed_coins + marketing_backed_coins + admin_promotional_coins
  )
  NOT VALID;

CREATE OR REPLACE FUNCTION public.minglora_admin_credit_member_coins(
  p_admin_user_id uuid,
  p_admin_email text,
  p_member_user_id uuid,
  p_amount_coins bigint,
  p_request_id uuid,
  p_note text DEFAULT ''::text
)
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
  budget public.minglora_marketing_budget%ROWTYPE;
  legacy_source text;
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
  WHERE u.id=p_admin_user_id
    AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND p.verification_status='verified'
    AND p.verification_badge='blue'
    AND s.role='owner'
    AND s.active=true
    AND 'platform:admin'=ANY(s.permissions)
  FOR SHARE OF u,p,s;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative authorization is not active' USING ERRCODE='42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id=creator_hub_admin_id THEN
    RAISE EXCEPTION 'Choose another Minglora member; owner Coins use owner issuance' USING ERRCODE='22023';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins<=0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE='22023';
  END IF;

  SELECT profile.username INTO member_username
  FROM public.profiles profile
  JOIN auth.users u ON u.id=profile.id
  WHERE profile.id=p_member_user_id
  FOR SHARE OF u,profile;
  IF member_username IS NULL THEN
    RAISE EXCEPTION 'Minglora member account was not found' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.coin_wallets(user_id)
  VALUES(p_member_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO current_balance
  FROM public.coin_wallets
  WHERE user_id=p_member_user_id
  FOR UPDATE;

  SELECT * INTO existing
  FROM public.admin_coin_credits
  WHERE request_id=p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.admin_user_id<>p_admin_user_id
       OR existing.member_user_id<>p_member_user_id
       OR existing.amount_coins<>p_amount_coins THEN
      RAISE EXCEPTION 'credit request reference was already used with different details'
        USING ERRCODE='23505';
    END IF;
    SELECT CASE
      WHEN l.marketing_delta_coins=existing.amount_coins THEN 'marketing_cash_backed'
      WHEN l.cash_delta_coins=existing.amount_coins THEN 'cash_backed'
      ELSE 'legacy_unbacked'
    END
    INTO legacy_source
    FROM public.coin_ledger l
    WHERE l.user_id=existing.member_user_id
      AND l.entry_type='admin_credit'
      AND l.reference_id=existing.id
    ORDER BY l.created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok',true,'alreadyCredited',true,'creditId',existing.id,
      'memberUserId',existing.member_user_id,'memberUsername',member_username,
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource',coalesce(legacy_source,'legacy_unbacked')
    );
  END IF;

  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Member Coin balance reached the database maximum; use a smaller credit amount'
      USING ERRCODE='22003';
  END IF;

  INSERT INTO public.minglora_marketing_budget(id)
  VALUES(true)
  ON CONFLICT(id) DO NOTHING;
  SELECT * INTO budget
  FROM public.minglora_marketing_budget
  WHERE id=true
  FOR UPDATE;

  IF budget.funded_minor-budget.reserved_minor-budget.spent_minor < p_amount_coins THEN
    RAISE EXCEPTION
      'Insufficient settled USD marketing reserve. Fund the reserve through the verified PayPal funding flow before issuing cash-backed Coins.'
      USING ERRCODE='23514';
  END IF;

  INSERT INTO public.admin_coin_credits(
    admin_user_id,member_user_id,request_id,amount_coins,note
  )
  VALUES(p_admin_user_id,p_member_user_id,p_request_id,p_amount_coins,cleaned_note)
  RETURNING id INTO credit_id;

  UPDATE public.minglora_marketing_budget
  SET reserved_minor=reserved_minor+p_amount_coins,updated_at=now()
  WHERE id=true;

  INSERT INTO public.minglora_marketing_coin_grants(
    request_id,user_id,amount_coins,note,created_by
  )
  VALUES(p_request_id,p_member_user_id,p_amount_coins,cleaned_note,p_admin_user_id);

  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,reserved_delta_minor,note,actor_user_id
  )
  VALUES(
    'coin_grant',p_request_id,credit_id,p_amount_coins,
    CASE WHEN cleaned_note='' THEN 'Cash-backed Creator Hub Coin grant'
      ELSE 'Cash-backed Creator Hub Coin grant: '||cleaned_note END,
    p_admin_user_id
  );

  credit_result := public.minglora_credit_wallet_sources(
    p_member_user_id,0,p_amount_coins,0,'admin_credit',credit_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub cash-backed Coin credit'
      ELSE 'Creator Hub cash-backed Coin credit: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;

  RETURN jsonb_build_object(
    'ok',true,'alreadyCredited',false,'creditId',credit_id,
    'memberUserId',p_member_user_id,'memberUsername',member_username,
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,
    'fundingSource','marketing_cash_backed',
    'usdValueMinor',p_amount_coins,'currency','USD'
  );
END;
$function$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.minglora_send_live_gift(uuid,uuid,text)'::regprocedure,
    'public.minglora_send_social_gift(uuid,text,text,text,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_get_functiondef(v_signature);
    v_updated := replace(
      v_definition,
      'eligible_gross := cash_used+marketing_used+promo_used;',
      'eligible_gross := cash_used+marketing_used;'
    );
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Could not locate the expected Coin backing calculation in %', v_signature;
    END IF;
    EXECUTE v_updated;
  END LOOP;
END
$migration$;

REVOKE ALL ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid)
  TO service_role;

COMMIT;
