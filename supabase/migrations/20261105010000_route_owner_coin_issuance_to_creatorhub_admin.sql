-- Route Creator Hub owner Coin issuance to the designated administrative account.
-- Larry's separate testing account is not the administrative recipient or issuer.

CREATE OR REPLACE FUNCTION public.minglora_issue_verified_owner_coins(
  p_owner_user_id uuid, p_owner_email text, p_amount_coins bigint,
  p_request_id uuid, p_note text DEFAULT ''::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  existing public.owner_coin_issuances%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  issuance_id uuid;
  verified_email text;
  cleaned_note text := left(btrim(coalesce(p_note, '')), 240);
  creator_hub_admin_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_owner_user_id IS DISTINCT FROM creator_hub_admin_id
     OR lower(btrim(coalesce(p_owner_email, ''))) <> 'creatorhubcreatornetwork@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub administrative account only' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email) INTO verified_email
  FROM auth.users AS u
  JOIN public.profiles AS profile ON profile.id = u.id
  JOIN public.minglora_platform_staff AS staff ON staff.user_id = u.id
  WHERE u.id = p_owner_user_id
    AND lower(u.email) = 'creatorhubcreatornetwork@gmail.com'
    AND profile.verification_status = 'verified'
    AND profile.verification_badge = 'blue'
    AND staff.role = 'owner'
    AND staff.active = true
    AND 'platform:admin' = ANY(staff.permissions)
  FOR SHARE OF u, profile, staff;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative account or owner authorization is not active' USING ERRCODE = '42501';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins <= 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES (p_owner_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT wallet.balance_coins INTO current_balance
  FROM public.coin_wallets AS wallet
  WHERE wallet.user_id = p_owner_user_id
  FOR UPDATE;

  SELECT * INTO existing
  FROM public.owner_coin_issuances AS issuance
  WHERE issuance.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id OR existing.amount_coins <> p_amount_coins THEN
      RAISE EXCEPTION 'issuance request reference was already used with different details' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'alreadyIssued', true, 'issuanceId', existing.id,
      'recipientUserId', p_owner_user_id, 'recipientEmail', 'creatorhubcreatornetwork@gmail.com',
      'amountCoins', existing.amount_coins, 'balanceAfter', current_balance
    );
  END IF;

  IF current_balance > 9223372036854775807 - p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount' USING ERRCODE = '22003';
  END IF;

  new_balance := current_balance + p_amount_coins;
  INSERT INTO public.owner_coin_issuances(owner_user_id, request_id, amount_coins, note)
  VALUES (p_owner_user_id, p_request_id, p_amount_coins, cleaned_note)
  RETURNING id INTO issuance_id;

  UPDATE public.coin_wallets
  SET balance_coins = new_balance, updated_at = now()
  WHERE user_id = p_owner_user_id;

  INSERT INTO public.coin_ledger(user_id, delta_coins, balance_after, entry_type, reference_id, description)
  VALUES (
    p_owner_user_id, p_amount_coins, new_balance, 'owner_issuance', issuance_id,
    CASE WHEN cleaned_note = '' THEN 'Creator Hub administrative Coin issuance'
         ELSE 'Creator Hub administrative Coin issuance: ' || cleaned_note END
  );

  RETURN jsonb_build_object(
    'ok', true, 'alreadyIssued', false, 'issuanceId', issuance_id,
    'recipientUserId', p_owner_user_id, 'recipientEmail', 'creatorhubcreatornetwork@gmail.com',
    'amountCoins', p_amount_coins, 'balanceAfter', new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.minglora_admin_credit_member_coins(
  p_admin_user_id uuid, p_admin_email text, p_member_user_id uuid,
  p_amount_coins bigint, p_request_id uuid, p_note text DEFAULT ''::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  existing public.admin_coin_credits%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  credit_id uuid;
  verified_email text;
  member_username text;
  cleaned_note text := left(btrim(coalesce(p_note, '')), 240);
  creator_hub_admin_id constant uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_admin_user_id IS DISTINCT FROM creator_hub_admin_id
     OR lower(btrim(coalesce(p_admin_email, ''))) <> 'creatorhubcreatornetwork@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub administrative account only' USING ERRCODE = '42501';
  END IF;

  SELECT lower(auth_user.email) INTO verified_email
  FROM auth.users AS auth_user
  JOIN public.profiles AS owner_profile ON owner_profile.id = auth_user.id
  JOIN public.minglora_platform_staff AS staff ON staff.user_id = auth_user.id
  WHERE auth_user.id = p_admin_user_id
    AND lower(auth_user.email) = 'creatorhubcreatornetwork@gmail.com'
    AND owner_profile.verification_status = 'verified'
    AND owner_profile.verification_badge = 'blue'
    AND staff.role = 'owner'
    AND staff.active = true
    AND 'platform:admin' = ANY(staff.permissions)
  FOR SHARE OF auth_user, owner_profile, staff;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative account or owner authorization is not active' USING ERRCODE = '42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id = creator_hub_admin_id THEN
    RAISE EXCEPTION 'Choose another Minglora member; owner Coins use owner issuance' USING ERRCODE = '22023';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins <= 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE = '22023';
  END IF;

  SELECT profile.username INTO member_username
  FROM public.profiles AS profile
  JOIN auth.users AS auth_user ON auth_user.id = profile.id
  WHERE profile.id = p_member_user_id
  FOR SHARE OF auth_user, profile;

  IF member_username IS NULL THEN
    RAISE EXCEPTION 'Minglora member account was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES (p_member_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT wallet.balance_coins INTO current_balance
  FROM public.coin_wallets AS wallet
  WHERE wallet.user_id = p_member_user_id
  FOR UPDATE;

  SELECT * INTO existing
  FROM public.admin_coin_credits AS credit
  WHERE credit.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.admin_user_id <> p_admin_user_id
       OR existing.member_user_id <> p_member_user_id
       OR existing.amount_coins <> p_amount_coins THEN
      RAISE EXCEPTION 'credit request reference was already used with different details' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'alreadyCredited', true, 'creditId', existing.id,
      'memberUserId', existing.member_user_id, 'memberUsername', member_username,
      'amountCoins', existing.amount_coins, 'balanceAfter', current_balance
    );
  END IF;

  IF current_balance > 9223372036854775807 - p_amount_coins THEN
    RAISE EXCEPTION 'Member Coin balance reached the database maximum; use a smaller credit amount' USING ERRCODE = '22003';
  END IF;

  new_balance := current_balance + p_amount_coins;
  INSERT INTO public.admin_coin_credits(admin_user_id, member_user_id, request_id, amount_coins, note)
  VALUES (p_admin_user_id, p_member_user_id, p_request_id, p_amount_coins, cleaned_note)
  RETURNING id INTO credit_id;

  UPDATE public.coin_wallets
  SET balance_coins = new_balance, updated_at = now()
  WHERE user_id = p_member_user_id;

  INSERT INTO public.coin_ledger(user_id, delta_coins, balance_after, entry_type, reference_id, description)
  VALUES (
    p_member_user_id, p_amount_coins, new_balance, 'admin_credit', credit_id,
    CASE WHEN cleaned_note = '' THEN 'Creator Hub admin Coin credit'
         ELSE 'Creator Hub admin Coin credit: ' || cleaned_note END
  );

  RETURN jsonb_build_object(
    'ok', true, 'alreadyCredited', false, 'creditId', credit_id,
    'memberUserId', p_member_user_id, 'memberUsername', member_username,
    'amountCoins', p_amount_coins, 'balanceAfter', new_balance
  );
END;
$$;

-- Keep the secondary testing account out of active platform-staff authorization.
UPDATE public.minglora_platform_staff
SET role = 'reviewer', active = false, permissions = ARRAY[]::text[], updated_at = now()
WHERE user_id = '28e1df97-3fe1-488e-bb84-bdc353c58653'::uuid;
