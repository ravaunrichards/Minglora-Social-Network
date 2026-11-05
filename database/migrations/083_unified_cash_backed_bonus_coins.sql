-- Unified cash-backed bonus Coins for Minglora.
-- Every Coin has equal face value and gifting behavior. This migration ensures
-- admin/owner bonus credits are reserved against verified USD marketing funds
-- and credits the normal Main Coin wallet's marketing-backed source.
BEGIN;

CREATE TABLE IF NOT EXISTS public.minglora_marketing_funding_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  paypal_order_id text NOT NULL UNIQUE CHECK (length(paypal_order_id) BETWEEN 5 AND 160),
  paypal_capture_id text UNIQUE CHECK (paypal_capture_id IS NULL OR length(paypal_capture_id) BETWEEN 5 AND 160),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 100 AND 50000000),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','captured','cancelled')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  CHECK ((status = 'captured') = (paypal_capture_id IS NOT NULL AND captured_at IS NOT NULL))
);
ALTER TABLE public.minglora_marketing_funding_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minglora_marketing_funding_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.minglora_marketing_funding_orders TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_create_marketing_funding_order(p_admin_user_id uuid, p_admin_email text, p_paypal_order_id text, p_amount_minor bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.minglora_marketing_funding_orders%ROWTYPE;
  created public.minglora_marketing_funding_orders%ROWTYPE;
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can fund cash-backed bonus Coins'
      USING ERRCODE='42501';
  END IF;
  IF p_paypal_order_id IS NULL OR length(p_paypal_order_id) NOT BETWEEN 5 AND 160
     OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 100 AND 50000000
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a PayPal funding order from USD 1.00 to USD 500,000.00'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing
  FROM public.minglora_marketing_funding_orders
  WHERE request_id=p_request_id OR paypal_order_id=p_paypal_order_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.admin_user_id<>p_admin_user_id
       OR existing.paypal_order_id<>p_paypal_order_id
       OR existing.amount_minor<>p_amount_minor THEN
      RAISE EXCEPTION 'Marketing funding request was already used with different details'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('ok',true,'alreadyCreated',true,'order',to_jsonb(existing));
  END IF;

  INSERT INTO public.minglora_marketing_funding_orders(
    request_id,admin_user_id,paypal_order_id,amount_minor,note
  ) VALUES (
    p_request_id,p_admin_user_id,p_paypal_order_id,p_amount_minor,cleaned_note
  ) RETURNING * INTO created;

  RETURN jsonb_build_object('ok',true,'alreadyCreated',false,'order',to_jsonb(created));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.minglora_get_marketing_funding_order(p_admin_user_id uuid, p_admin_email text, p_paypal_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  found_order public.minglora_marketing_funding_orders%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can view marketing funding orders'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO found_order
  FROM public.minglora_marketing_funding_orders
  WHERE admin_user_id=p_admin_user_id AND paypal_order_id=p_paypal_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketing funding order was not found'; END IF;
  RETURN to_jsonb(found_order);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.minglora_settle_marketing_funding_order(p_admin_user_id uuid, p_admin_email text, p_paypal_order_id text, p_paypal_capture_id text, p_amount_minor bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  funding_order public.minglora_marketing_funding_orders%ROWTYPE;
  budget public.minglora_marketing_budget%ROWTYPE;
  ledger_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF NOT public.admin_campaign_coins_authorized(p_admin_user_id,p_admin_email) THEN
    RAISE EXCEPTION 'Only the active Creator Hub owner can settle marketing funding'
      USING ERRCODE='42501';
  END IF;
  IF p_paypal_order_id IS NULL OR length(p_paypal_order_id) NOT BETWEEN 5 AND 160
     OR p_paypal_capture_id IS NULL OR length(p_paypal_capture_id) NOT BETWEEN 5 AND 160
     OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 100 AND 50000000
     OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid confirmed PayPal marketing funding capture' USING ERRCODE='22023';
  END IF;

  SELECT * INTO funding_order
  FROM public.minglora_marketing_funding_orders
  WHERE admin_user_id=p_admin_user_id AND paypal_order_id=p_paypal_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketing funding order was not found'; END IF;

  IF funding_order.status='captured' THEN
    IF funding_order.paypal_capture_id<>p_paypal_capture_id
       OR funding_order.amount_minor<>p_amount_minor
       OR funding_order.request_id<>p_request_id THEN
      RAISE EXCEPTION 'Marketing funding order was already settled with different PayPal details'
        USING ERRCODE='23505';
    END IF;
    SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
    RETURN jsonb_build_object('ok',true,'alreadySettled',true,
      'fundingOrderId',funding_order.id,'fundedMinor',coalesce(budget.funded_minor,0),
      'reservedMinor',coalesce(budget.reserved_minor,0),'spentMinor',coalesce(budget.spent_minor,0),
      'availableMinor',greatest(0,coalesce(budget.funded_minor,0)-coalesce(budget.reserved_minor,0)-coalesce(budget.spent_minor,0)));
  END IF;

  IF funding_order.status<>'created'
     OR funding_order.amount_minor<>p_amount_minor
     OR funding_order.request_id<>p_request_id THEN
    RAISE EXCEPTION 'PayPal capture does not match the recorded marketing funding order';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coin_purchase_orders WHERE paypal_capture_id=p_paypal_capture_id
  ) OR EXISTS (
    SELECT 1 FROM public.minglora_promotional_gift_fund_ledger WHERE paypal_capture_id=p_paypal_capture_id
  ) OR EXISTS (
    SELECT 1 FROM public.minglora_marketing_budget_ledger WHERE funding_reference=p_paypal_capture_id
  ) THEN
    RAISE EXCEPTION 'PayPal capture has already been assigned to another Minglora fund or purchase'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.minglora_marketing_budget(id)
  VALUES(true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  IF budget.funded_minor > 9223372036854775807-p_amount_minor THEN
    RAISE EXCEPTION 'Minglora marketing reserve reached the database maximum';
  END IF;

  UPDATE public.minglora_marketing_budget
  SET funded_minor=funded_minor+p_amount_minor,updated_at=now()
  WHERE id=true RETURNING * INTO budget;

  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,funding_reference,
    funded_delta_minor,note,actor_user_id
  ) VALUES (
    'funding',funding_order.request_id,funding_order.id,p_paypal_capture_id,
    p_amount_minor,
    coalesce(nullif(funding_order.note,''),'Verified PayPal funding for Minglora cash-backed bonus Coins'),
    p_admin_user_id
  ) RETURNING id INTO ledger_id;

  UPDATE public.minglora_marketing_funding_orders
  SET paypal_capture_id=p_paypal_capture_id,status='captured',captured_at=now()
  WHERE id=funding_order.id;

  RETURN jsonb_build_object('ok',true,'alreadySettled',false,
    'fundingLedgerId',ledger_id,'fundingOrderId',funding_order.id,
    'fundedMinor',budget.funded_minor,'reservedMinor',budget.reserved_minor,
    'spentMinor',budget.spent_minor,
    'availableMinor',greatest(0,budget.funded_minor-budget.reserved_minor-budget.spent_minor));
END;
$function$
;
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
  budget public.minglora_marketing_budget%ROWTYPE;
  cash_backed boolean;
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
    SELECT EXISTS(
      SELECT 1 FROM public.minglora_marketing_budget_ledger
      WHERE event_type='coin_grant' AND reference_id=existing.id
    ) INTO cash_backed;
    RETURN jsonb_build_object('ok',true,'alreadyCredited',true,'creditId',existing.id,
      'memberUserId',existing.member_user_id,'memberUsername',member_username,
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource',CASE WHEN cash_backed THEN 'marketing_cash_backed' ELSE 'promo_legacy_unbacked' END);
  END IF;

  INSERT INTO public.minglora_marketing_budget(id) VALUES(true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  IF budget.funded_minor-budget.reserved_minor-budget.spent_minor < p_amount_coins THEN
    RAISE EXCEPTION 'Member bonus Coins require confirmed cash backing. Fund the Minglora bonus reserve before issuing this amount.'
      USING ERRCODE='22003';
  END IF;

  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Member Coin balance reached the database maximum; use a smaller credit amount' USING ERRCODE='22003';
  END IF;

  UPDATE public.minglora_marketing_budget
  SET reserved_minor=reserved_minor+p_amount_coins,updated_at=now()
  WHERE id=true;

  INSERT INTO public.admin_coin_credits(admin_user_id,member_user_id,request_id,amount_coins,note)
    VALUES(p_admin_user_id,p_member_user_id,p_request_id,p_amount_coins,cleaned_note)
    RETURNING id INTO credit_id;
  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,reserved_delta_minor,note,actor_user_id
  ) VALUES (
    'coin_grant',gen_random_uuid(),credit_id,p_amount_coins,
    coalesce(nullif(cleaned_note,''),'Cash-backed admin bonus Coins'),p_admin_user_id
  );

  credit_result := public.minglora_credit_wallet_sources(
    p_member_user_id,0,p_amount_coins,0,'admin_credit',credit_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub admin cash-backed bonus Coins'
      ELSE 'Creator Hub admin cash-backed bonus Coins: '||cleaned_note END
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
  budget public.minglora_marketing_budget%ROWTYPE;
  cash_backed boolean;
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
    SELECT EXISTS(
      SELECT 1 FROM public.minglora_marketing_budget_ledger
      WHERE event_type='coin_grant' AND reference_id=existing.id
    ) INTO cash_backed;
    RETURN jsonb_build_object('ok',true,'alreadyIssued',true,'issuanceId',existing.id,
      'recipientUserId',p_owner_user_id,'recipientEmail','creatorhubcreatornetwork@gmail.com',
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance,
      'fundingSource',CASE WHEN cash_backed THEN 'marketing_cash_backed' ELSE 'promo_legacy_unbacked' END);
  END IF;

  INSERT INTO public.minglora_marketing_budget(id) VALUES(true) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  IF budget.funded_minor-budget.reserved_minor-budget.spent_minor < p_amount_coins THEN
    RAISE EXCEPTION 'Owner bonus Coins require confirmed cash backing. Fund the Minglora bonus reserve before issuing this amount.'
      USING ERRCODE='22003';
  END IF;
  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount' USING ERRCODE='22003';
  END IF;

  UPDATE public.minglora_marketing_budget
  SET reserved_minor=reserved_minor+p_amount_coins,updated_at=now()
  WHERE id=true;

  INSERT INTO public.owner_coin_issuances(owner_user_id,request_id,amount_coins,note)
    VALUES(p_owner_user_id,p_request_id,p_amount_coins,cleaned_note)
    RETURNING id INTO issuance_id;
  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,reserved_delta_minor,note,actor_user_id
  ) VALUES (
    'coin_grant',gen_random_uuid(),issuance_id,p_amount_coins,
    coalesce(nullif(cleaned_note,''),'Cash-backed Creator Hub owner bonus Coins'),p_owner_user_id
  );

  credit_result := public.minglora_credit_wallet_sources(
    p_owner_user_id,0,p_amount_coins,0,'owner_issuance',issuance_id,
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

REVOKE ALL ON FUNCTION public.minglora_record_marketing_funding(p_admin_user_id uuid, p_admin_email text, p_amount_minor bigint, p_request_id uuid, p_funding_reference text, p_note text DEFAULT ''::text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.minglora_create_marketing_funding_order(uuid,text,text,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_get_marketing_funding_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_settle_marketing_funding_order(uuid,text,text,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_create_marketing_funding_order(uuid,text,text,bigint,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_get_marketing_funding_order(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_settle_marketing_funding_order(uuid,text,text,text,bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) TO service_role;
COMMIT;
