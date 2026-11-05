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
  remaining_slots integer;
  remaining_pool bigint;
  max_reward bigint;
  awarded_so_far bigint;
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

  SELECT count(*),coalesce(sum(reward_coins),0)
    INTO claimant_count,awarded_so_far
    FROM public.live_reward_participants WHERE drop_id=p_drop_id;
  IF claimant_count>=reward_drop.winner_count THEN RAISE EXCEPTION 'all Treasure Box rewards have been claimed'; END IF;

  claim_order_value:=claimant_count+1;
  remaining_slots:=reward_drop.winner_count-claimant_count;
  remaining_pool:=reward_drop.total_coins-awarded_so_far;
  IF remaining_pool<remaining_slots THEN RAISE EXCEPTION 'Treasure Box has insufficient remaining Coins for its winner slots'; END IF;
  IF remaining_slots=1 THEN
    reward_amount:=remaining_pool;
  ELSE
    max_reward:=remaining_pool-(remaining_slots-1);
    reward_amount:=1+floor(random()*max_reward)::bigint;
  END IF;

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

REVOKE ALL ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_claim_live_treasure_box(uuid,uuid,text) TO service_role;