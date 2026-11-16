-- Require a real settled USD reserve for owner-issued Coins.
-- Keep all Coin sources equally spendable; track source backing separately.
BEGIN;

ALTER TABLE public.coin_wallets
  ADD CONSTRAINT coin_wallets_source_sum_check
  CHECK (balance_coins = cash_balance_coins + marketing_balance_coins + promo_balance_coins)
  NOT VALID;

ALTER TABLE public.coin_ledger
  ADD CONSTRAINT coin_ledger_source_delta_sum_check
  CHECK (delta_coins = cash_delta_coins + marketing_delta_coins + promo_delta_coins)
  NOT VALID;

CREATE OR REPLACE FUNCTION public.minglora_issue_verified_owner_coins(
  p_owner_user_id uuid,
  p_owner_email text,
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
  existing public.owner_coin_issuances%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  issuance_id uuid;
  verified_email text;
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
  credit_result jsonb;
  budget public.minglora_marketing_budget%ROWTYPE;
  existing_funding_source text;
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
  WHERE u.id=p_owner_user_id
    AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND profile.verification_status='verified'
    AND profile.verification_badge='blue'
    AND staff.role='owner'
    AND staff.active=true
    AND 'platform:admin'=ANY(staff.permissions)
  FOR SHARE OF u,profile,staff;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative account or owner authorization is not active'
      USING ERRCODE='42501';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins<=0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.coin_wallets(user_id)
  VALUES(p_owner_user_id)
  ON CONFLICT(user_id) DO NOTHING;
  SELECT balance_coins INTO current_balance
  FROM public.coin_wallets
  WHERE user_id=p_owner_user_id
  FOR UPDATE;

  SELECT * INTO existing
  FROM public.owner_coin_issuances
  WHERE request_id=p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.owner_user_id<>p_owner_user_id
       OR existing.amount_coins<>p_amount_coins THEN
      RAISE EXCEPTION 'issuance request reference was already used with different details'
        USING ERRCODE='23505';
    END IF;
    SELECT CASE
      WHEN l.marketing_delta_coins=existing.amount_coins THEN 'marketing_cash_backed'
      WHEN l.cash_delta_coins=existing.amount_coins THEN 'cash_backed'
      ELSE 'legacy_unbacked'
    END
    INTO existing_funding_source
    FROM public.coin_ledger l
    WHERE l.user_id=existing.owner_user_id
      AND l.entry_type='owner_issuance'
      AND l.reference_id=existing.id
    ORDER BY l.created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok',true,'alreadyIssued',true,'issuanceId',existing.id,
      'recipientUserId',p_owner_user_id,
      'recipientEmail','creatorhubcreatornetwork@gmail.com',
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource',coalesce(existing_funding_source,'legacy_unbacked')
    );
  END IF;

  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount'
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
      'Insufficient settled USD marketing reserve. Fund the reserve through verified PayPal funding before issuing owner Coins.'
      USING ERRCODE='23514';
  END IF;

  INSERT INTO public.owner_coin_issuances(
    owner_user_id,request_id,amount_coins,note
  )
  VALUES(p_owner_user_id,p_request_id,p_amount_coins,cleaned_note)
  RETURNING id INTO issuance_id;

  UPDATE public.minglora_marketing_budget
  SET reserved_minor=reserved_minor+p_amount_coins,
      updated_at=now()
  WHERE id=true;

  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,reserved_delta_minor,note,actor_user_id
  )
  VALUES(
    'coin_grant',p_request_id,issuance_id,p_amount_coins,
    CASE WHEN cleaned_note=''
      THEN 'Cash-backed Creator Hub owner Coin issuance'
      ELSE 'Cash-backed Creator Hub owner Coin issuance: '||cleaned_note END,
    p_owner_user_id
  );

  credit_result := public.minglora_credit_wallet_sources(
    p_owner_user_id,0,p_amount_coins,0,'owner_issuance',issuance_id,
    CASE WHEN cleaned_note=''
      THEN 'Creator Hub cash-backed owner Coins'
      ELSE 'Creator Hub cash-backed owner Coins: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;

  RETURN jsonb_build_object(
    'ok',true,'alreadyIssued',false,'issuanceId',issuance_id,
    'recipientUserId',p_owner_user_id,
    'recipientEmail','creatorhubcreatornetwork@gmail.com',
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,
    'fundingSource','marketing_cash_backed',
    'usdValueMinor',p_amount_coins,'currency','USD'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text)
  TO service_role;

COMMIT;
