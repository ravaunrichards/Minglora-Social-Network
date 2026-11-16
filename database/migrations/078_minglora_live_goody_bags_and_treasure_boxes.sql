BEGIN;

CREATE TABLE IF NOT EXISTS public.live_reward_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  broadcast_id uuid NOT NULL REFERENCES public.live_broadcasts(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('goody_bag','treasure_box')),
  total_coins bigint NOT NULL CHECK (total_coins BETWEEN 1 AND 1000000),
  winner_count integer NOT NULL CHECK (winner_count BETWEEN 1 AND 100),
  countdown_seconds integer NOT NULL CHECK (countdown_seconds BETWEEN 30 AND 600),
  participation_method text NOT NULL DEFAULT 'tap' CHECK (participation_method IN ('tap','comment')),
  keyword text NOT NULL DEFAULT '' CHECK (length(keyword) <= 40),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','refunded')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (winner_count <= total_coins),
  CHECK (closes_at > opens_at),
  CHECK ((participation_method = 'tap') OR length(keyword) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS live_reward_drops_broadcast_created_idx
  ON public.live_reward_drops (broadcast_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_reward_drops_due_idx
  ON public.live_reward_drops (closes_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.live_reward_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid NOT NULL REFERENCES public.live_reward_drops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  claim_order integer,
  reward_coins bigint NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  UNIQUE (drop_id, user_id),
  CHECK (claim_order IS NULL OR claim_order BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS live_reward_participants_drop_joined_idx
  ON public.live_reward_participants (drop_id, joined_at);
CREATE INDEX IF NOT EXISTS live_reward_participants_user_joined_idx
  ON public.live_reward_participants (user_id, joined_at DESC);

ALTER TABLE public.live_reward_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_reward_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.live_reward_drops, public.live_reward_participants
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.live_reward_drops, public.live_reward_participants
  TO service_role;

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_entry_type_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'purchase'::text, 'live_gift_sent'::text, 'social_gift_sent'::text,
    'refund'::text, 'adjustment'::text, 'exchange'::text,
    'owner_issuance'::text, 'admin_credit'::text,
    'live_reward_escrow'::text, 'live_reward_award'::text, 'live_reward_refund'::text
  ]));

CREATE OR REPLACE FUNCTION public.minglora_create_live_reward_drop(
  p_creator_id uuid,
  p_broadcast_id uuid,
  p_request_id uuid,
  p_kind text,
  p_total_coins bigint,
  p_winner_count integer,
  p_countdown_seconds integer,
  p_participation_method text DEFAULT 'tap',
  p_keyword text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  existing_drop public.live_reward_drops%ROWTYPE;
  new_drop public.live_reward_drops%ROWTYPE;
  current_balance bigint;
  new_balance bigint;
  normalized_keyword text := lower(btrim(coalesce(p_keyword,'')));
  starts_at timestamptz := now();
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
     OR (p_participation_method='comment' AND (length(normalized_keyword) NOT BETWEEN 1 AND 40))
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
    SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id=p_creator_id;
    RETURN jsonb_build_object('ok',true,'alreadyCreated',true,'drop',to_jsonb(existing_drop),'balanceAfter',coalesce(new_balance,0));
  END IF;

  PERFORM 1 FROM public.live_broadcasts
    WHERE id=p_broadcast_id AND host_id=p_creator_id AND status='live'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'only the host of an active LIVE can create a reward drop'; END IF;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_creator_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO current_balance FROM public.coin_wallets
    WHERE user_id=p_creator_id FOR UPDATE;
  IF current_balance < p_total_coins THEN
    RAISE EXCEPTION 'not enough Minglora Coins for this reward pool';
  END IF;

  INSERT INTO public.live_reward_drops(
    request_id,broadcast_id,creator_id,kind,total_coins,winner_count,
    countdown_seconds,participation_method,keyword,opens_at,closes_at
  ) VALUES (
    p_request_id,p_broadcast_id,p_creator_id,p_kind,p_total_coins,p_winner_count,
    p_countdown_seconds,p_participation_method,normalized_keyword,
    CASE WHEN p_kind='treasure_box' THEN starts_at + make_interval(secs=>p_countdown_seconds) ELSE starts_at END,
    CASE WHEN p_kind='treasure_box'
      THEN starts_at + make_interval(secs=>p_countdown_seconds + 120)
      ELSE starts_at + make_interval(secs=>p_countdown_seconds) END
  ) RETURNING * INTO new_drop;

  new_balance := current_balance-p_total_coins;
  UPDATE public.coin_wallets SET balance_coins=new_balance,updated_at=now()
    WHERE user_id=p_creator_id;
  INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,reference_id,description)
    VALUES(p_creator_id,-p_total_coins,new_balance,'live_reward_escrow',new_drop.id,
      CASE WHEN p_kind='goody_bag' THEN 'Funded a LIVE Goody Bag' ELSE 'Funded a LIVE Treasure Box' END);

  RETURN jsonb_build_object('ok',true,'alreadyCreated',false,'drop',to_jsonb(new_drop),'balanceAfter',new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_join_live_goody_bag(
  p_user_id uuid,p_drop_id uuid,p_keyword text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  reward_drop public.live_reward_drops%ROWTYPE;
  already_joined boolean;
  keyword_matches boolean := false;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_drop_id IS NULL THEN RAISE EXCEPTION 'invalid Goody Bag join'; END IF;

  SELECT * INTO reward_drop FROM public.live_reward_drops
    WHERE id=p_drop_id FOR UPDATE;
  IF NOT FOUND OR reward_drop.kind<>'goody_bag' OR reward_drop.status<>'active'
     OR reward_drop.closes_at<=now() THEN
    RAISE EXCEPTION 'this Goody Bag is no longer accepting entries';
  END IF;
  IF p_user_id=reward_drop.creator_id THEN RAISE EXCEPTION 'the host cannot enter their own Goody Bag'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_broadcasts WHERE id=reward_drop.broadcast_id AND status='live') THEN
    RAISE EXCEPTION 'this LIVE is no longer active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id=p_user_id AND blocked_id=reward_drop.creator_id)
       OR (blocker_id=reward_drop.creator_id AND blocked_id=p_user_id)
  ) THEN RAISE EXCEPTION 'you cannot enter this reward drop'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.live_reward_participants
    WHERE drop_id=p_drop_id AND user_id=p_user_id) INTO already_joined;
  IF already_joined THEN RETURN jsonb_build_object('ok',true,'alreadyJoined',true,'dropId',p_drop_id); END IF;

  IF reward_drop.participation_method='comment' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.live_chat_messages
      WHERE broadcast_id=reward_drop.broadcast_id AND user_id=p_user_id
        AND created_at>=reward_drop.created_at
        AND lower(btrim(body))=reward_drop.keyword
    ) INTO keyword_matches;
    IF NOT keyword_matches THEN RAISE EXCEPTION 'comment the Goody Bag keyword in LIVE chat before joining'; END IF;
  END IF;

  INSERT INTO public.live_reward_participants(drop_id,user_id)
    VALUES(p_drop_id,p_user_id);
  RETURN jsonb_build_object('ok',true,'alreadyJoined',false,'dropId',p_drop_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_claim_live_treasure_box(
  p_user_id uuid,p_drop_id uuid,p_keyword text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  reward_drop public.live_reward_drops%ROWTYPE;
  existing_entry public.live_reward_participants%ROWTYPE;
  claimant_count integer;
  claim_order_value integer;
  base_reward bigint;
  remainder_coins bigint;
  reward_amount bigint;
  new_balance bigint;
  keyword_matches boolean := false;
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
        AND created_at>=reward_drop.created_at
        AND lower(btrim(body))=reward_drop.keyword
    ) INTO keyword_matches;
    IF NOT keyword_matches THEN RAISE EXCEPTION 'comment the Treasure Box keyword in LIVE chat before claiming'; END IF;
  END IF;

  SELECT count(*) INTO claimant_count FROM public.live_reward_participants WHERE drop_id=p_drop_id;
  IF claimant_count>=reward_drop.winner_count THEN RAISE EXCEPTION 'all Treasure Box rewards have been claimed'; END IF;
  claim_order_value:=claimant_count+1;
  base_reward:=reward_drop.total_coins/reward_drop.winner_count;
  remainder_coins:=mod(reward_drop.total_coins,reward_drop.winner_count);
  reward_amount:=base_reward+CASE WHEN claim_order_value<=remainder_coins THEN 1 ELSE 0 END;

  INSERT INTO public.coin_wallets(user_id) VALUES(p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id=p_user_id FOR UPDATE;
  new_balance:=new_balance+reward_amount;
  UPDATE public.coin_wallets SET balance_coins=new_balance,updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,reference_id,description)
    VALUES(p_user_id,reward_amount,new_balance,'live_reward_award',reward_drop.id,'Claimed a Minglora LIVE Treasure Box');
  INSERT INTO public.live_reward_participants(drop_id,user_id,claim_order,reward_coins)
    VALUES(p_drop_id,p_user_id,claim_order_value,reward_amount);

  RETURN jsonb_build_object('ok',true,'alreadyClaimed',false,'claimOrder',claim_order_value,'rewardCoins',reward_amount,'balanceAfter',new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_settle_live_reward_drops(
  p_broadcast_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
  new_balance bigint;
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
      AND (
        d.closes_at<=now()
        OR EXISTS(SELECT 1 FROM public.live_broadcasts b WHERE b.id=d.broadcast_id AND b.status<>'live')
      )
    ORDER BY d.closes_at,d.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    awarded_coins:=0;
    IF reward_drop.kind='goody_bag' THEN
      SELECT count(*) INTO entry_count FROM public.live_reward_participants
        WHERE drop_id=reward_drop.id;
      actual_winners:=least(entry_count,reward_drop.winner_count);
      IF actual_winners=0 THEN
        refund_coins:=reward_drop.total_coins;
      ELSE
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
          awarded_coins:=base_reward+CASE WHEN winner_rank<=remainder_coins THEN 1 ELSE 0 END;
          INSERT INTO public.coin_wallets(user_id) VALUES(participant.user_id)
            ON CONFLICT (user_id) DO NOTHING;
          UPDATE public.coin_wallets SET balance_coins=balance_coins+awarded_coins,updated_at=now()
            WHERE user_id=participant.user_id RETURNING balance_coins INTO new_balance;
          INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,reference_id,description)
            VALUES(participant.user_id,awarded_coins,new_balance,'live_reward_award',reward_drop.id,'Won a Minglora LIVE Goody Bag');
          UPDATE public.live_reward_participants
            SET claim_order=winner_rank,reward_coins=awarded_coins
            WHERE drop_id=reward_drop.id AND user_id=participant.user_id;
        END LOOP;
        refund_coins:=0;
      END IF;
    ELSE
      SELECT coalesce(sum(reward_coins),0) INTO awarded_coins
        FROM public.live_reward_participants WHERE drop_id=reward_drop.id;
      refund_coins:=greatest(0,reward_drop.total_coins-awarded_coins);
    END IF;

    IF refund_coins>0 THEN
      INSERT INTO public.coin_wallets(user_id) VALUES(reward_drop.creator_id)
        ON CONFLICT (user_id) DO NOTHING;
      UPDATE public.coin_wallets SET balance_coins=balance_coins+refund_coins,updated_at=now()
        WHERE user_id=reward_drop.creator_id RETURNING balance_coins INTO new_balance;
      INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,reference_id,description)
        VALUES(reward_drop.creator_id,refund_coins,new_balance,'live_reward_refund',reward_drop.id,
          CASE WHEN reward_drop.kind='goody_bag'
            THEN 'Refund for an unused LIVE Goody Bag'
            ELSE 'Refund of unclaimed LIVE Treasure Box coins' END);
      refunded_total:=refunded_total+refund_coins;
    END IF;

    UPDATE public.live_reward_drops SET status=CASE
        WHEN reward_drop.kind='goody_bag' AND entry_count=0 THEN 'refunded'
        WHEN reward_drop.kind='treasure_box' AND awarded_coins=0 THEN 'refunded'
        ELSE 'completed' END,
      settled_at=now()
    WHERE id=reward_drop.id;
    settled_count:=settled_count+1;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'settledCount',settled_count,'refundedCoins',refunded_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_create_live_reward_drop(uuid,uuid,uuid,text,bigint,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.minglora_join_live_goody_bag(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.minglora_settle_live_reward_drops(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_create_live_reward_drop(uuid,uuid,uuid,text,bigint,integer,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_join_live_goody_bag(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.minglora_settle_live_reward_drops(uuid) TO service_role;

COMMIT;