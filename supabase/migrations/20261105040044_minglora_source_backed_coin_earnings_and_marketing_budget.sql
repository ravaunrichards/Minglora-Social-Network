-- Minglora source-backed Coins, creator gift earnings and funded marketing budget.
-- This migration preserves existing balances while separating paid/exchanged,
-- marketing-funded and ordinary promotional Coin sources.
BEGIN;

ALTER TABLE public.coin_wallets
  ADD COLUMN IF NOT EXISTS cash_balance_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_balance_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_balance_coins bigint NOT NULL DEFAULT 0;
ALTER TABLE public.coin_ledger
  ADD COLUMN IF NOT EXISTS cash_delta_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_delta_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_delta_coins bigint NOT NULL DEFAULT 0;

WITH flow AS (
  SELECT user_id,
    coalesce(sum(CASE WHEN entry_type IN ('purchase','exchange') AND delta_coins>0
      THEN delta_coins ELSE 0 END),0)::bigint AS paid_in,
    coalesce(sum(CASE WHEN entry_type IN ('live_gift_sent','social_gift_sent','live_reward_escrow')
      AND delta_coins<0 THEN -delta_coins ELSE 0 END),0)::bigint AS historical_spend
  FROM public.coin_ledger GROUP BY user_id
)
UPDATE public.coin_wallets w
SET cash_balance_coins=least(w.balance_coins,greatest(0,coalesce(f.paid_in,0)-coalesce(f.historical_spend,0))),
    marketing_balance_coins=0,
    promo_balance_coins=w.balance_coins-
      least(w.balance_coins,greatest(0,coalesce(f.paid_in,0)-coalesce(f.historical_spend,0))),
    updated_at=now()
FROM flow f
WHERE f.user_id=w.user_id
  AND w.cash_balance_coins=0 AND w.marketing_balance_coins=0 AND w.promo_balance_coins=0
  AND w.balance_coins>0;

UPDATE public.coin_wallets w
SET cash_balance_coins=0,marketing_balance_coins=0,promo_balance_coins=w.balance_coins,updated_at=now()
WHERE w.balance_coins>0
  AND w.cash_balance_coins=0 AND w.marketing_balance_coins=0 AND w.promo_balance_coins=0
  AND NOT EXISTS(SELECT 1 FROM public.coin_ledger l WHERE l.user_id=w.user_id);

UPDATE public.coin_ledger
SET cash_delta_coins=CASE
      WHEN entry_type IN ('purchase','exchange') THEN delta_coins
      WHEN entry_type IN ('live_gift_sent','social_gift_sent','live_reward_escrow') AND delta_coins<0 THEN delta_coins
      ELSE 0 END,
    marketing_delta_coins=0,
    promo_delta_coins=CASE
      WHEN entry_type IN ('owner_issuance','admin_credit','adjustment','live_reward_award','live_reward_refund','refund')
      THEN delta_coins ELSE 0 END
WHERE cash_delta_coins=0 AND marketing_delta_coins=0 AND promo_delta_coins=0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coin_wallets_source_balance_check') THEN
    ALTER TABLE public.coin_wallets ADD CONSTRAINT coin_wallets_source_balance_check
      CHECK(cash_balance_coins>=0 AND marketing_balance_coins>=0 AND promo_balance_coins>=0
        AND balance_coins=cash_balance_coins+marketing_balance_coins+promo_balance_coins);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coin_ledger_source_delta_check') THEN
    ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_source_delta_check
      CHECK(delta_coins=cash_delta_coins+marketing_delta_coins+promo_delta_coins);
  END IF;
END $$;

ALTER TABLE public.live_gift_transactions
  ADD COLUMN IF NOT EXISTS cash_backed_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_backed_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'cash';

UPDATE public.live_gift_transactions
SET cash_backed_coins=coin_amount,marketing_backed_coins=0,promo_coins=0,funding_source='cash'
WHERE cash_backed_coins=0 AND marketing_backed_coins=0 AND promo_coins=0 AND coin_amount>0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_gift_transactions_funding_source_check') THEN
    ALTER TABLE public.live_gift_transactions ADD CONSTRAINT live_gift_transactions_funding_source_check
      CHECK(funding_source IN ('cash','marketing','promo','mixed')
        AND cash_backed_coins>=0 AND marketing_backed_coins>=0 AND promo_coins>=0
        AND coin_amount=cash_backed_coins+marketing_backed_coins+promo_coins);
  END IF;
END $$;

ALTER TABLE public.live_reward_drops
  ADD COLUMN IF NOT EXISTS cash_remaining_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_remaining_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_remaining_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_balances_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE public.live_reward_participants
  ADD COLUMN IF NOT EXISTS cash_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_coins bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_coins bigint NOT NULL DEFAULT 0;

UPDATE public.live_reward_drops
SET cash_remaining_coins=0,marketing_remaining_coins=0,
    promo_remaining_coins=greatest(0,total_coins-coalesce((
      SELECT sum(p.reward_coins) FROM public.live_reward_participants p WHERE p.drop_id=live_reward_drops.id
    ),0)),
    source_balances_initialized=true
WHERE source_balances_initialized=false;

CREATE TABLE IF NOT EXISTS public.minglora_marketing_budget (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  funded_minor bigint NOT NULL DEFAULT 0 CHECK(funded_minor>=0),
  reserved_minor bigint NOT NULL DEFAULT 0 CHECK(reserved_minor>=0),
  spent_minor bigint NOT NULL DEFAULT 0 CHECK(spent_minor>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(reserved_minor+spent_minor<=funded_minor)
);
INSERT INTO public.minglora_marketing_budget(id) VALUES(true) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minglora_marketing_budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK(event_type IN ('funding','coin_grant','gift_spend')),
  request_id uuid NOT NULL UNIQUE,
  reference_id uuid,
  funding_reference text,
  funded_delta_minor bigint NOT NULL DEFAULT 0,
  reserved_delta_minor bigint NOT NULL DEFAULT 0,
  spent_delta_minor bigint NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=240),
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(funded_delta_minor<>0 OR reserved_delta_minor<>0 OR spent_delta_minor<>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS minglora_marketing_funding_reference_uq
  ON public.minglora_marketing_budget_ledger(funding_reference) WHERE funding_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS minglora_marketing_budget_reference_event_uq
  ON public.minglora_marketing_budget_ledger(event_type,reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.minglora_marketing_coin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  amount_coins bigint NOT NULL CHECK(amount_coins>0),
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=240),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minglora_marketing_coin_grants_user_created_idx
  ON public.minglora_marketing_coin_grants(user_id,created_at DESC);

ALTER TABLE public.minglora_marketing_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_marketing_budget_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_marketing_coin_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.minglora_marketing_budget,public.minglora_marketing_budget_ledger,
  public.minglora_marketing_coin_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.minglora_marketing_budget,public.minglora_marketing_budget_ledger,
  public.minglora_marketing_coin_grants TO service_role;

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
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance);
  END IF;
  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Member Coin balance reached the database maximum; use a smaller credit amount' USING ERRCODE='22003';
  END IF;

  INSERT INTO public.admin_coin_credits(admin_user_id,member_user_id,request_id,amount_coins,note)
    VALUES(p_admin_user_id,p_member_user_id,p_request_id,p_amount_coins,cleaned_note) RETURNING id INTO credit_id;
  credit_result := public.minglora_credit_wallet_sources(
    p_member_user_id,0,0,p_amount_coins,'admin_credit',credit_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub admin Coin credit'
      ELSE 'Creator Hub admin Coin credit: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  RETURN jsonb_build_object('ok',true,'alreadyCredited',false,'creditId',credit_id,
    'memberUserId',p_member_user_id,'memberUsername',member_username,
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,'fundingSource','promo');
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_claim_live_treasure_box(p_user_id uuid, p_drop_id uuid, p_keyword text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  reward_drop public.live_reward_drops%ROWTYPE;
  existing_entry public.live_reward_participants%ROWTYPE;
  claimant_count integer;
  claim_order_value integer;
  remaining_slots integer;
  remaining_pool bigint;
  max_reward bigint;
  awarded_so_far bigint;
  reward_amount bigint;
  new_balance bigint;
  keyword_matches boolean := false;
  split record;
  cash_award bigint;
  marketing_award bigint;
  promo_award bigint;
  credit_result jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_drop_id IS NULL THEN RAISE EXCEPTION 'invalid Treasure Box claim'; END IF;

  SELECT * INTO reward_drop FROM public.live_reward_drops WHERE id=p_drop_id FOR UPDATE;
  IF NOT FOUND OR reward_drop.kind<>'treasure_box' OR reward_drop.status<>'active'
     OR reward_drop.opens_at>now() OR reward_drop.closes_at<=now() THEN
    RAISE EXCEPTION 'this Treasure Box is not open for claims';
  END IF;
  IF p_user_id=reward_drop.creator_id THEN RAISE EXCEPTION 'the host cannot claim their own Treasure Box'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_broadcasts WHERE id=reward_drop.broadcast_id AND status='live') THEN
    RAISE EXCEPTION 'this LIVE is no longer active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id=p_user_id AND blocked_id=reward_drop.creator_id)
       OR (blocker_id=reward_drop.creator_id AND blocked_id=p_user_id)
  ) THEN RAISE EXCEPTION 'you cannot claim this Treasure Box'; END IF;

  SELECT * INTO existing_entry FROM public.live_reward_participants
    WHERE drop_id=p_drop_id AND user_id=p_user_id;
  IF FOUND THEN
    SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id=p_user_id;
    RETURN jsonb_build_object('ok',true,'alreadyClaimed',true,'rewardCoins',existing_entry.reward_coins,'balanceAfter',coalesce(new_balance,0));
  END IF;

  IF reward_drop.participation_method='comment' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.live_chat_messages
      WHERE broadcast_id=reward_drop.broadcast_id AND user_id=p_user_id
        AND created_at>=reward_drop.created_at AND lower(btrim(body))=reward_drop.keyword
    ) INTO keyword_matches;
    IF NOT keyword_matches THEN RAISE EXCEPTION 'comment the Treasure Box keyword in LIVE chat before claiming'; END IF;
  END IF;

  remaining_pool := reward_drop.cash_remaining_coins+reward_drop.marketing_remaining_coins+reward_drop.promo_remaining_coins;
  SELECT count(*),coalesce(sum(reward_coins),0) INTO claimant_count,awarded_so_far
    FROM public.live_reward_participants WHERE drop_id=p_drop_id;
  IF claimant_count>=reward_drop.winner_count THEN RAISE EXCEPTION 'all Treasure Box rewards have been claimed'; END IF;
  IF remaining_pool<1 THEN RAISE EXCEPTION 'Treasure Box has no remaining Coins'; END IF;

  claim_order_value:=claimant_count+1;
  remaining_slots:=reward_drop.winner_count-claimant_count;
  IF remaining_pool<remaining_slots THEN RAISE EXCEPTION 'Treasure Box has insufficient remaining Coins for its winner slots'; END IF;
  IF remaining_slots=1 THEN
    reward_amount:=remaining_pool;
  ELSE
    max_reward:=remaining_pool-(remaining_slots-1);
    reward_amount:=1+floor(random()*max_reward)::bigint;
  END IF;

  SELECT * INTO split FROM public.minglora_split_reward_coin_sources(
    reward_amount,reward_drop.cash_remaining_coins,reward_drop.marketing_remaining_coins,reward_drop.promo_remaining_coins
  );
  cash_award:=split.cash_coins;
  marketing_award:=split.marketing_coins;
  promo_award:=split.promo_coins;

  UPDATE public.live_reward_drops
  SET cash_remaining_coins=cash_remaining_coins-cash_award,
      marketing_remaining_coins=marketing_remaining_coins-marketing_award,
      promo_remaining_coins=promo_remaining_coins-promo_award
  WHERE id=p_drop_id;

  credit_result := public.minglora_credit_wallet_sources(
    p_user_id,cash_award,marketing_award,promo_award,'live_reward_award',p_drop_id,
    'Claimed a Minglora LIVE Treasure Box'
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;

  INSERT INTO public.live_reward_participants(
    drop_id,user_id,claim_order,reward_coins,cash_coins,marketing_coins,promo_coins
  ) VALUES (p_drop_id,p_user_id,claim_order_value,reward_amount,cash_award,marketing_award,promo_award);

  RETURN jsonb_build_object('ok',true,'alreadyClaimed',false,'claimOrder',claim_order_value,
    'rewardCoins',reward_amount,'balanceAfter',new_balance,
    'cashBackedCoins',cash_award,'marketingBackedCoins',marketing_award,'promoCoins',promo_award);
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_create_live_reward_drop(p_creator_id uuid, p_broadcast_id uuid, p_request_id uuid, p_kind text, p_total_coins bigint, p_winner_count integer, p_countdown_seconds integer, p_participation_method text DEFAULT 'tap'::text, p_keyword text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing_drop public.live_reward_drops%ROWTYPE;
  new_drop public.live_reward_drops%ROWTYPE;
  debit_result jsonb;
  current_balance bigint;
  cash_used bigint;
  marketing_used bigint;
  promo_used bigint;
  normalized_keyword text := lower(btrim(coalesce(p_keyword,'')));
  starts_at timestamptz := now();
  new_drop_id uuid := gen_random_uuid();
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_broadcast_id IS NULL OR p_request_id IS NULL
     OR p_kind NOT IN ('goody_bag','treasure_box')
     OR p_total_coins NOT BETWEEN 1 AND 1000000
     OR p_winner_count NOT BETWEEN 1 AND 100
     OR p_winner_count > p_total_coins
     OR p_countdown_seconds NOT BETWEEN 30 AND 600
     OR p_participation_method NOT IN ('tap','comment')
     OR (p_participation_method='comment' AND length(normalized_keyword) NOT BETWEEN 1 AND 40)
     OR length(normalized_keyword)>40 THEN
    RAISE EXCEPTION 'invalid LIVE reward drop settings';
  END IF;

  SELECT * INTO existing_drop FROM public.live_reward_drops
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing_drop.creator_id<>p_creator_id OR existing_drop.broadcast_id<>p_broadcast_id
       OR existing_drop.kind<>p_kind OR existing_drop.total_coins<>p_total_coins
       OR existing_drop.winner_count<>p_winner_count
       OR existing_drop.countdown_seconds<>p_countdown_seconds
       OR existing_drop.participation_method<>p_participation_method
       OR existing_drop.keyword<>normalized_keyword THEN
      RAISE EXCEPTION 'reward drop request id was already used with different settings';
    END IF;
    SELECT balance_coins INTO current_balance FROM public.coin_wallets WHERE user_id=p_creator_id;
    RETURN jsonb_build_object('ok',true,'alreadyCreated',true,'drop',to_jsonb(existing_drop),'balanceAfter',coalesce(current_balance,0));
  END IF;

  PERFORM 1 FROM public.live_broadcasts
    WHERE id=p_broadcast_id AND host_id=p_creator_id AND status='live' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'only the host of an active LIVE can create a reward drop'; END IF;

  debit_result := public.minglora_debit_wallet_sources(
    p_creator_id,p_total_coins,'live_reward_escrow',new_drop_id,
    CASE WHEN p_kind='goody_bag' THEN 'Funded a LIVE Goody Bag' ELSE 'Funded a LIVE Treasure Box' END
  );
  current_balance := (debit_result->>'balanceAfter')::bigint;
  cash_used := (debit_result->>'cashCoins')::bigint;
  marketing_used := (debit_result->>'marketingCoins')::bigint;
  promo_used := (debit_result->>'promoCoins')::bigint;

  INSERT INTO public.live_reward_drops(
    id,request_id,broadcast_id,creator_id,kind,total_coins,winner_count,
    countdown_seconds,participation_method,keyword,opens_at,closes_at,
    cash_remaining_coins,marketing_remaining_coins,promo_remaining_coins,source_balances_initialized
  ) VALUES (
    new_drop_id,p_request_id,p_broadcast_id,p_creator_id,p_kind,p_total_coins,p_winner_count,
    p_countdown_seconds,p_participation_method,normalized_keyword,
    CASE WHEN p_kind='treasure_box' THEN starts_at+make_interval(secs=>p_countdown_seconds) ELSE starts_at END,
    CASE WHEN p_kind='treasure_box' THEN starts_at+make_interval(secs=>p_countdown_seconds+120)
      ELSE starts_at+make_interval(secs=>p_countdown_seconds) END,
    cash_used,marketing_used,promo_used,true
  ) RETURNING * INTO new_drop;

  RETURN jsonb_build_object('ok',true,'alreadyCreated',false,'drop',to_jsonb(new_drop),
    'balanceAfter',current_balance,'cashBackedCoins',cash_used,
    'marketingBackedCoins',marketing_used,'promoCoins',promo_used);
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_credit_wallet_sources(p_user_id uuid, p_cash_coins bigint, p_marketing_coins bigint, p_promo_coins bigint, p_entry_type text, p_reference_id uuid, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  wallet public.coin_wallets%ROWTYPE;
  total_credit bigint;
  new_balance bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_cash_coins IS NULL OR p_marketing_coins IS NULL OR p_promo_coins IS NULL
     OR p_cash_coins < 0 OR p_marketing_coins < 0 OR p_promo_coins < 0
     OR (p_cash_coins+p_marketing_coins+p_promo_coins) <= 0
     OR p_entry_type NOT IN ('purchase','exchange','owner_issuance','admin_credit','live_reward_award','live_reward_refund','refund','adjustment')
     OR p_reference_id IS NULL THEN
    RAISE EXCEPTION 'invalid Coin source credit' USING ERRCODE='22023';
  END IF;
  total_credit := p_cash_coins+p_marketing_coins+p_promo_coins;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO wallet FROM public.coin_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF wallet.balance_coins > 9223372036854775807-total_credit
     OR wallet.cash_balance_coins > 9223372036854775807-p_cash_coins
     OR wallet.marketing_balance_coins > 9223372036854775807-p_marketing_coins
     OR wallet.promo_balance_coins > 9223372036854775807-p_promo_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller credit amount' USING ERRCODE='22003';
  END IF;

  new_balance := wallet.balance_coins+total_credit;
  UPDATE public.coin_wallets
  SET balance_coins=new_balance,
      cash_balance_coins=cash_balance_coins+p_cash_coins,
      marketing_balance_coins=marketing_balance_coins+p_marketing_coins,
      promo_balance_coins=promo_balance_coins+p_promo_coins,
      updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.coin_ledger(
    user_id,delta_coins,balance_after,entry_type,reference_id,description,
    cash_delta_coins,marketing_delta_coins,promo_delta_coins
  ) VALUES (
    p_user_id,total_credit,new_balance,p_entry_type,p_reference_id,left(coalesce(p_description,''),240),
    p_cash_coins,p_marketing_coins,p_promo_coins
  );

  RETURN jsonb_build_object(
    'ok',true,'balanceAfter',new_balance,
    'cashBalanceCoins',wallet.cash_balance_coins+p_cash_coins,
    'marketingBalanceCoins',wallet.marketing_balance_coins+p_marketing_coins,
    'promoBalanceCoins',wallet.promo_balance_coins+p_promo_coins
  );
END;
$function$


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

  -- A marketing-backed LIVE/profile gift spends the previously reserved
  -- campaign funds. Reward-drop escrow keeps its funding reserved until the
  -- coins are transferred to winners or refunded.
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


CREATE OR REPLACE FUNCTION public.minglora_exchange_creator_earnings_for_coins(p_creator_id uuid, p_amount_minor bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.creator_coin_exchanges%ROWTYPE;
  money_balance jsonb;
  available_minor bigint;
  exchange_id uuid;
  coin_amount bigint;
  credit_result jsonb;
  new_balance bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_request_id IS NULL OR p_amount_minor IS NULL OR p_amount_minor<100 THEN
    RAISE EXCEPTION 'exchange must be at least USD 1.00';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator account was not found'; END IF;

  SELECT * INTO existing FROM public.creator_coin_exchanges WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.creator_id<>p_creator_id OR existing.amount_minor<>p_amount_minor THEN
      RAISE EXCEPTION 'exchange request id was already used with different details' USING ERRCODE='23505';
    END IF;
    SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id=p_creator_id;
    RETURN jsonb_build_object('ok',true,'alreadyExchanged',true,'exchangeId',existing.id,
      'amountMinor',existing.amount_minor,'coinAmount',existing.coin_amount,'balanceAfter',coalesce(new_balance,0));
  END IF;

  money_balance := public.minglora_get_creator_money_balance(p_creator_id);
  available_minor := coalesce((money_balance->>'availableMinor')::bigint,0);
  IF p_amount_minor>available_minor THEN RAISE EXCEPTION 'exchange exceeds available money balance'; END IF;
  coin_amount := p_amount_minor;

  INSERT INTO public.creator_coin_exchanges(creator_id,request_id,amount_minor,coin_amount,currency)
    VALUES(p_creator_id,p_request_id,p_amount_minor,coin_amount,'USD') RETURNING id INTO exchange_id;
  credit_result := public.minglora_credit_wallet_sources(
    p_creator_id,coin_amount,0,0,'exchange',exchange_id,
    'Converted available USD creator earnings into Minglora Coins'
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  RETURN jsonb_build_object('ok',true,'alreadyExchanged',false,'exchangeId',exchange_id,
    'amountMinor',p_amount_minor,'coinAmount',coin_amount,'balanceAfter',new_balance,
    'availableMinorAfter',available_minor-p_amount_minor,'fundingSource','cash');
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_get_marketing_budget()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  budget public.minglora_marketing_budget%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
  RETURN jsonb_build_object(
    'currency','USD',
    'fundedMinor',budget.funded_minor,
    'reservedMinor',budget.reserved_minor,
    'spentMinor',budget.spent_minor,
    'availableMinor',budget.funded_minor-budget.reserved_minor-budget.spent_minor
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_grant_marketing_coins(p_admin_user_id uuid, p_admin_email text, p_member_user_id uuid, p_amount_coins bigint, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.minglora_marketing_coin_grants%ROWTYPE;
  verified_email text;
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
  budget public.minglora_marketing_budget%ROWTYPE;
  credit_result jsonb;
  member_username text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_admin_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid
     OR lower(btrim(coalesce(p_admin_email,''))) <> 'creatorhubcreatornetwork@gmail.com'
     OR p_member_user_id IS NULL OR p_member_user_id=p_admin_user_id
     OR p_amount_coins IS NULL OR p_amount_coins < 1 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'valid admin, member and positive Coin grant are required' USING ERRCODE='22023';
  END IF;

  SELECT lower(u.email) INTO verified_email
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.minglora_platform_staff s ON s.user_id=u.id
  WHERE u.id=p_admin_user_id
    AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND p.verification_status='verified' AND p.verification_badge='blue'
    AND s.role='owner' AND s.active=true AND 'platform:admin'=ANY(s.permissions)
  FOR SHARE OF u,p,s;
  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative authorization is not active' USING ERRCODE='42501';
  END IF;

  SELECT profile.username INTO member_username
  FROM public.profiles profile
  JOIN auth.users u ON u.id=profile.id
  WHERE profile.id=p_member_user_id
  FOR SHARE OF profile,u;
  IF member_username IS NULL THEN RAISE EXCEPTION 'Minglora member account was not found' USING ERRCODE='P0002'; END IF;

  SELECT * INTO existing FROM public.minglora_marketing_coin_grants
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.user_id<>p_member_user_id OR existing.amount_coins<>p_amount_coins THEN
      RAISE EXCEPTION 'marketing grant request was already used with different details' USING ERRCODE='23505';
    END IF;
    SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
    RETURN jsonb_build_object('ok',true,'alreadyGranted',true,'grantId',existing.id,
      'memberUserId',existing.user_id,'memberUsername',member_username,
      'amountCoins',existing.amount_coins,
      'availableMinor',budget.funded_minor-budget.reserved_minor-budget.spent_minor);
  END IF;

  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  IF budget.funded_minor-budget.reserved_minor-budget.spent_minor < p_amount_coins THEN
    RAISE EXCEPTION 'marketing grant exceeds confirmed, unreserved marketing funds' USING ERRCODE='22003';
  END IF;

  UPDATE public.minglora_marketing_budget
  SET reserved_minor=reserved_minor+p_amount_coins,updated_at=now()
  WHERE id=true;
  INSERT INTO public.minglora_marketing_coin_grants(
    request_id,user_id,amount_coins,note,created_by
  ) VALUES (p_request_id,p_member_user_id,p_amount_coins,cleaned_note,p_admin_user_id)
  RETURNING * INTO existing;
  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,reference_id,reserved_delta_minor,note,actor_user_id
  ) VALUES ('coin_grant',gen_random_uuid(),existing.id,p_amount_coins,
    coalesce(cleaned_note,'Marketing-funded Minglora Coin grant'),p_admin_user_id);

  credit_result := public.minglora_credit_wallet_sources(
    p_member_user_id,0,p_amount_coins,0,'adjustment',existing.id,
    CASE WHEN cleaned_note='' THEN 'Minglora marketing-funded promotional Coins'
      ELSE 'Minglora marketing-funded promotional Coins: '||cleaned_note END
  );
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
  RETURN jsonb_build_object('ok',true,'alreadyGranted',false,'grantId',existing.id,
    'memberUserId',p_member_user_id,'memberUsername',member_username,
    'amountCoins',p_amount_coins,'wallet',credit_result,
    'availableMinor',budget.funded_minor-budget.reserved_minor-budget.spent_minor);
END;
$function$


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
      'amountCoins',existing.amount_coins,'balanceAfter',current_balance);
  END IF;
  IF current_balance>9223372036854775807-p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount' USING ERRCODE='22003';
  END IF;

  INSERT INTO public.owner_coin_issuances(owner_user_id,request_id,amount_coins,note)
    VALUES(p_owner_user_id,p_request_id,p_amount_coins,cleaned_note) RETURNING id INTO issuance_id;
  credit_result := public.minglora_credit_wallet_sources(
    p_owner_user_id,0,0,p_amount_coins,'owner_issuance',issuance_id,
    CASE WHEN cleaned_note='' THEN 'Creator Hub administrative Coin issuance'
      ELSE 'Creator Hub administrative Coin issuance: '||cleaned_note END
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  RETURN jsonb_build_object('ok',true,'alreadyIssued',false,'issuanceId',issuance_id,
    'recipientUserId',p_owner_user_id,'recipientEmail','creatorhubcreatornetwork@gmail.com',
    'amountCoins',p_amount_coins,'balanceAfter',new_balance,'fundingSource','promo');
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_record_marketing_funding(p_admin_user_id uuid, p_admin_email text, p_amount_minor bigint, p_request_id uuid, p_funding_reference text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing public.minglora_marketing_budget_ledger%ROWTYPE;
  verified_email text;
  cleaned_reference text := left(btrim(coalesce(p_funding_reference,'')),160);
  cleaned_note text := left(btrim(coalesce(p_note,'')),240);
  budget public.minglora_marketing_budget%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_admin_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid
     OR lower(btrim(coalesce(p_admin_email,''))) <> 'creatorhubcreatornetwork@gmail.com'
     OR p_amount_minor IS NULL OR p_amount_minor < 100
     OR p_request_id IS NULL OR cleaned_reference='' THEN
    RAISE EXCEPTION 'valid Creator Hub admin, funding reference and minimum USD 1.00 are required' USING ERRCODE='22023';
  END IF;

  SELECT lower(u.email) INTO verified_email
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.minglora_platform_staff s ON s.user_id=u.id
  WHERE u.id=p_admin_user_id
    AND lower(u.email)='creatorhubcreatornetwork@gmail.com'
    AND p.verification_status='verified' AND p.verification_badge='blue'
    AND s.role='owner' AND s.active=true AND 'platform:admin'=ANY(s.permissions)
  FOR SHARE OF u,p,s;
  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub administrative authorization is not active' USING ERRCODE='42501';
  END IF;

  SELECT * INTO existing FROM public.minglora_marketing_budget_ledger
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.event_type<>'funding' OR existing.funded_delta_minor<>p_amount_minor
       OR existing.funding_reference<>cleaned_reference THEN
      RAISE EXCEPTION 'funding request reference was already used with different details' USING ERRCODE='23505';
    END IF;
    SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
    RETURN jsonb_build_object('ok',true,'alreadyRecorded',true,'fundingEventId',existing.id,
      'fundedMinor',budget.funded_minor,'availableMinor',budget.funded_minor-budget.reserved_minor-budget.spent_minor,
      'reservedMinor',budget.reserved_minor,'spentMinor',budget.spent_minor);
  END IF;

  PERFORM 1 FROM public.minglora_marketing_budget WHERE id=true FOR UPDATE;
  UPDATE public.minglora_marketing_budget
  SET funded_minor=funded_minor+p_amount_minor,updated_at=now()
  WHERE id=true;
  INSERT INTO public.minglora_marketing_budget_ledger(
    event_type,request_id,funding_reference,funded_delta_minor,note,actor_user_id
  ) VALUES ('funding',p_request_id,cleaned_reference,p_amount_minor,
    coalesce(cleaned_note,'Externally received and verified Minglora marketing funds'),p_admin_user_id)
  RETURNING * INTO existing;
  SELECT * INTO budget FROM public.minglora_marketing_budget WHERE id=true;
  RETURN jsonb_build_object('ok',true,'alreadyRecorded',false,'fundingEventId',existing.id,
    'fundedMinor',budget.funded_minor,'availableMinor',budget.funded_minor-budget.reserved_minor-budget.spent_minor,
    'reservedMinor',budget.reserved_minor,'spentMinor',budget.spent_minor);
END;
$function$


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
  eligible_gross := cash_used+marketing_used;
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
      creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor
    ) VALUES (
      broadcast.host_id,gift_id,eligible_gross,creator_amount,eligible_gross-creator_amount
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
  eligible_gross := cash_used+marketing_used;
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
      creator_id,gift_transaction_id,gross_minor,creator_share_minor,platform_share_minor
    ) VALUES (
      recipient.id,transaction_id,eligible_gross,creator_amount,eligible_gross-creator_amount
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


CREATE OR REPLACE FUNCTION public.minglora_settle_coin_purchase(p_user_id uuid, p_paypal_order_id text, p_paypal_capture_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  purchase public.coin_purchase_orders%ROWTYPE;
  credit_result jsonb;
  new_balance bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO purchase FROM public.coin_purchase_orders
    WHERE user_id=p_user_id AND paypal_order_id=p_paypal_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found'; END IF;
  IF purchase.status='captured' THEN
    IF purchase.paypal_capture_id<>p_paypal_capture_id THEN
      RAISE EXCEPTION 'purchase already settled with a different capture';
    END IF;
    SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id=p_user_id;
    RETURN jsonb_build_object('ok',true,'alreadySettled',true,'balance',new_balance,'coins',purchase.coin_amount);
  END IF;
  IF purchase.status<>'created' THEN RAISE EXCEPTION 'purchase is not payable'; END IF;
  IF p_paypal_capture_id IS NULL OR length(p_paypal_capture_id) NOT BETWEEN 5 AND 160 THEN
    RAISE EXCEPTION 'invalid PayPal capture reference';
  END IF;

  credit_result := public.minglora_credit_wallet_sources(
    p_user_id,purchase.coin_amount,0,0,'purchase',purchase.id,'Verified PayPal coin purchase'
  );
  new_balance := (credit_result->>'balanceAfter')::bigint;
  UPDATE public.coin_purchase_orders
  SET paypal_capture_id=p_paypal_capture_id,status='captured',captured_at=now()
  WHERE id=purchase.id;
  RETURN jsonb_build_object('ok',true,'alreadySettled',false,'balance',new_balance,'coins',purchase.coin_amount);
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_settle_live_reward_drops(p_broadcast_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  reward_drop public.live_reward_drops%ROWTYPE;
  participant record;
  entry_count integer;
  actual_winners integer;
  winner_rank integer;
  base_reward bigint;
  remainder_coins bigint;
  awarded_coins bigint;
  refund_coins bigint;
  refund_cash bigint;
  refund_marketing bigint;
  refund_promo bigint;
  cash_remaining bigint;
  marketing_remaining bigint;
  promo_remaining bigint;
  remaining_pool bigint;
  reward_amount bigint;
  split record;
  credit_result jsonb;
  settled_count integer := 0;
  refunded_total bigint := 0;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;

  FOR reward_drop IN
    SELECT d.* FROM public.live_reward_drops d
    WHERE d.status='active'
      AND (p_broadcast_id IS NULL OR d.broadcast_id=p_broadcast_id)
      AND (d.closes_at<=now()
        OR EXISTS(SELECT 1 FROM public.live_broadcasts b WHERE b.id=d.broadcast_id AND b.status<>'live'))
    ORDER BY d.closes_at,d.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    cash_remaining:=reward_drop.cash_remaining_coins;
    marketing_remaining:=reward_drop.marketing_remaining_coins;
    promo_remaining:=reward_drop.promo_remaining_coins;
    awarded_coins:=0;
    entry_count:=0;

    IF reward_drop.kind='goody_bag' THEN
      SELECT count(*) INTO entry_count FROM public.live_reward_participants WHERE drop_id=reward_drop.id;
      actual_winners:=least(entry_count,reward_drop.winner_count);
      IF actual_winners>0 THEN
        base_reward:=reward_drop.total_coins/actual_winners;
        remainder_coins:=mod(reward_drop.total_coins,actual_winners);
        winner_rank:=0;
        FOR participant IN
          SELECT user_id FROM public.live_reward_participants
          WHERE drop_id=reward_drop.id
          ORDER BY gen_random_uuid()
          LIMIT actual_winners
        LOOP
          winner_rank:=winner_rank+1;
          reward_amount:=base_reward+CASE WHEN winner_rank<=remainder_coins THEN 1 ELSE 0 END;
          remaining_pool:=cash_remaining+marketing_remaining+promo_remaining;
          SELECT * INTO split FROM public.minglora_split_reward_coin_sources(
            reward_amount,cash_remaining,marketing_remaining,promo_remaining
          );
          UPDATE public.live_reward_drops
          SET cash_remaining_coins=cash_remaining_coins-split.cash_coins,
              marketing_remaining_coins=marketing_remaining_coins-split.marketing_coins,
              promo_remaining_coins=promo_remaining_coins-split.promo_coins
          WHERE id=reward_drop.id;

          credit_result:=public.minglora_credit_wallet_sources(
            participant.user_id,split.cash_coins,split.marketing_coins,split.promo_coins,
            'live_reward_award',reward_drop.id,'Won a Minglora LIVE Goody Bag'
          );
          UPDATE public.live_reward_participants
          SET claim_order=winner_rank,reward_coins=reward_amount,
              cash_coins=split.cash_coins,marketing_coins=split.marketing_coins,promo_coins=split.promo_coins
          WHERE drop_id=reward_drop.id AND user_id=participant.user_id;

          cash_remaining:=cash_remaining-split.cash_coins;
          marketing_remaining:=marketing_remaining-split.marketing_coins;
          promo_remaining:=promo_remaining-split.promo_coins;
          awarded_coins:=awarded_coins+reward_amount;
        END LOOP;
      END IF;
    ELSE
      SELECT coalesce(sum(reward_coins),0) INTO awarded_coins
      FROM public.live_reward_participants WHERE drop_id=reward_drop.id;
    END IF;

    refund_cash:=cash_remaining;
    refund_marketing:=marketing_remaining;
    refund_promo:=promo_remaining;
    refund_coins:=refund_cash+refund_marketing+refund_promo;
    IF refund_coins>0 THEN
      credit_result:=public.minglora_credit_wallet_sources(
        reward_drop.creator_id,refund_cash,refund_marketing,refund_promo,
        'live_reward_refund',reward_drop.id,
        CASE WHEN reward_drop.kind='goody_bag' THEN 'Refund for unused LIVE Goody Bag Coins'
          ELSE 'Refund of unclaimed LIVE Treasure Box Coins' END
      );
      refunded_total:=refunded_total+refund_coins;
    END IF;

    UPDATE public.live_reward_drops
    SET cash_remaining_coins=0,marketing_remaining_coins=0,promo_remaining_coins=0,
      status=CASE
        WHEN reward_drop.kind='goody_bag' AND entry_count=0 THEN 'refunded'
        WHEN reward_drop.kind='treasure_box' AND awarded_coins=0 THEN 'refunded'
        ELSE 'completed' END,
      settled_at=now()
    WHERE id=reward_drop.id;
    settled_count:=settled_count+1;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'settledCount',settled_count,'refundedCoins',refunded_total);
END;
$function$


CREATE OR REPLACE FUNCTION public.minglora_split_reward_coin_sources(p_amount bigint, p_cash_remaining bigint, p_marketing_remaining bigint, p_promo_remaining bigint)
 RETURNS TABLE(cash_coins bigint, marketing_coins bigint, promo_coins bigint)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  total_remaining bigint;
  shortage bigint;
  add_cash bigint;
  add_marketing bigint;
BEGIN
  total_remaining := p_cash_remaining+p_marketing_remaining+p_promo_remaining;
  IF p_amount IS NULL OR p_amount < 0 OR p_cash_remaining < 0
     OR p_marketing_remaining < 0 OR p_promo_remaining < 0
     OR p_amount > total_remaining OR total_remaining <= 0 THEN
    RAISE EXCEPTION 'invalid reward Coin source split' USING ERRCODE='22023';
  END IF;
  cash_coins := floor(p_amount::numeric*p_cash_remaining::numeric/total_remaining::numeric)::bigint;
  marketing_coins := floor(p_amount::numeric*p_marketing_remaining::numeric/total_remaining::numeric)::bigint;
  promo_coins := p_amount-cash_coins-marketing_coins;

  IF promo_coins > p_promo_remaining THEN
    shortage := promo_coins-p_promo_remaining;
    promo_coins := p_promo_remaining;
    add_cash := least(shortage,p_cash_remaining-cash_coins);
    cash_coins := cash_coins+add_cash;
    shortage := shortage-add_cash;
    add_marketing := least(shortage,p_marketing_remaining-marketing_coins);
    marketing_coins := marketing_coins+add_marketing;
    shortage := shortage-add_marketing;
    IF shortage <> 0 THEN
      RAISE EXCEPTION 'reward source split could not be balanced' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEXT;
END;
$function$


REVOKE ALL ON FUNCTION public.minglora_credit_wallet_sources(uuid,bigint,bigint,bigint,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_credit_wallet_sources(uuid,bigint,bigint,bigint,text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_debit_wallet_sources(uuid,bigint,text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_split_reward_coin_sources(bigint,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_split_reward_coin_sources(bigint,bigint,bigint,bigint) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_record_marketing_funding(uuid,text,bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_record_marketing_funding(uuid,text,bigint,uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_grant_marketing_coins(uuid,text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_grant_marketing_coins(uuid,text,uuid,bigint,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_get_marketing_budget() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_marketing_budget() TO service_role;

REVOKE ALL ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_issue_verified_owner_coins(uuid,text,bigint,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_credit_member_coins(uuid,text,uuid,bigint,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_settle_coin_purchase(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_settle_coin_purchase(uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_exchange_creator_earnings_for_coins(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_exchange_creator_earnings_for_coins(uuid,bigint,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_live_gift(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_send_social_gift(uuid,text,text,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_create_live_reward_drop(uuid,uuid,uuid,text,bigint,integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_create_live_reward_drop(uuid,uuid,uuid,text,bigint,integer,integer,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.minglora_settle_live_reward_drops(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_settle_live_reward_drops(uuid) TO service_role;

COMMIT;
