BEGIN;

CREATE TABLE IF NOT EXISTS public.creator_coin_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 100),
  coin_amount bigint NOT NULL CHECK (coin_amount > 0 AND coin_amount = amount_minor),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_coin_exchanges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_coin_exchanges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.creator_coin_exchanges TO service_role;
CREATE INDEX IF NOT EXISTS creator_coin_exchanges_creator_created_idx
  ON public.creator_coin_exchanges (creator_id, created_at DESC);

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_entry_type_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'purchase'::text, 'live_gift_sent'::text, 'social_gift_sent'::text,
    'refund'::text, 'adjustment'::text, 'exchange'::text
  ]));

CREATE OR REPLACE FUNCTION public.minglora_get_creator_money_balance(p_creator_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  creator_earnings_minor bigint;
  subscription_net_minor bigint;
  reserved_payout_minor bigint;
  exchanged_minor bigint;
  available_minor bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_creator_id
  ) THEN
    RAISE EXCEPTION 'creator account was not found';
  END IF;
  SELECT coalesce(sum(e.creator_share_minor),0)::bigint INTO creator_earnings_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id = p_creator_id AND e.status = 'available';
  SELECT coalesce(sum(CASE
    WHEN e.entry_type = 'payment' THEN e.creator_minor
    WHEN e.entry_type = 'refund' THEN -e.creator_minor
    ELSE 0 END),0)::bigint INTO subscription_net_minor
    FROM public.subscription_earnings_ledger AS e WHERE e.creator_id = p_creator_id;
  SELECT coalesce(sum(p.amount_minor),0)::bigint INTO reserved_payout_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id = p_creator_id AND p.status IN ('requested','processing','paid');
  SELECT coalesce(sum(x.amount_minor),0)::bigint INTO exchanged_minor
    FROM public.creator_coin_exchanges AS x WHERE x.creator_id = p_creator_id;
  available_minor := greatest(0,creator_earnings_minor+subscription_net_minor-reserved_payout_minor-exchanged_minor);
  RETURN jsonb_build_object(
    'earnedMinor',creator_earnings_minor+subscription_net_minor,
    'reservedMinor',reserved_payout_minor,
    'exchangedMinor',exchanged_minor,
    'availableMinor',available_minor,
    'currency','USD','coinPerCent',1
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_get_creator_money_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_creator_money_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_exchange_creator_earnings_for_coins(
  p_creator_id uuid,p_amount_minor bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  existing public.creator_coin_exchanges%ROWTYPE;
  money_balance jsonb;
  available_minor bigint;
  new_balance bigint;
  exchange_id uuid;
  coin_amount bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_request_id IS NULL OR p_amount_minor IS NULL OR p_amount_minor < 100 THEN
    RAISE EXCEPTION 'exchange must be at least USD 1.00';
  END IF;
  PERFORM 1 FROM public.profiles AS creator WHERE creator.id = p_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator account was not found'; END IF;

  SELECT * INTO existing FROM public.creator_coin_exchanges
    WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF existing.creator_id <> p_creator_id OR existing.amount_minor <> p_amount_minor THEN
      RAISE EXCEPTION 'exchange request id was already used with different details' USING ERRCODE='23505';
    END IF;
    SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id = p_creator_id;
    RETURN jsonb_build_object(
      'ok',true,'alreadyExchanged',true,'exchangeId',existing.id,
      'amountMinor',existing.amount_minor,'coinAmount',existing.coin_amount,
      'balanceAfter',coalesce(new_balance,0)
    );
  END IF;

  money_balance := public.minglora_get_creator_money_balance(p_creator_id);
  available_minor := coalesce((money_balance->>'availableMinor')::bigint,0);
  IF p_amount_minor > available_minor THEN RAISE EXCEPTION 'exchange exceeds available money balance'; END IF;
  coin_amount := p_amount_minor;

  INSERT INTO public.creator_coin_exchanges(creator_id,request_id,amount_minor,coin_amount,currency)
    VALUES(p_creator_id,p_request_id,p_amount_minor,coin_amount,'USD') RETURNING id INTO exchange_id;
  INSERT INTO public.coin_wallets(user_id) VALUES(p_creator_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_coins INTO new_balance FROM public.coin_wallets WHERE user_id = p_creator_id FOR UPDATE;
  UPDATE public.coin_wallets SET balance_coins=balance_coins+coin_amount,updated_at=now()
    WHERE user_id=p_creator_id RETURNING balance_coins INTO new_balance;
  INSERT INTO public.coin_ledger(user_id,delta_coins,balance_after,entry_type,reference_id,description)
    VALUES(p_creator_id,coin_amount,new_balance,'exchange',exchange_id,
      'Converted available USD creator earnings into Minglora Coins');
  RETURN jsonb_build_object(
    'ok',true,'alreadyExchanged',false,'exchangeId',exchange_id,
    'amountMinor',p_amount_minor,'coinAmount',coin_amount,
    'balanceAfter',new_balance,'availableMinorAfter',available_minor-p_amount_minor
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_exchange_creator_earnings_for_coins(uuid,bigint,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_exchange_creator_earnings_for_coins(uuid,bigint,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_request_creator_payout(p_creator_id uuid,p_amount_minor bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
  PERFORM 1 FROM public.profiles AS creator WHERE creator.id=p_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator account was not found'; END IF;
  SELECT coalesce(sum(e.creator_share_minor),0)::bigint INTO available_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id AND e.status='available';
  SELECT coalesce(sum(CASE
    WHEN e.entry_type='payment' THEN e.creator_minor
    WHEN e.entry_type='refund' THEN -e.creator_minor
    ELSE 0 END),0)::bigint INTO subscription_net_minor
    FROM public.subscription_earnings_ledger AS e WHERE e.creator_id=p_creator_id;
  available_minor := available_minor + subscription_net_minor;
  SELECT coalesce(sum(p.amount_minor),0)::bigint INTO reserved_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id=p_creator_id AND p.status IN ('requested','processing','paid');
  SELECT coalesce(sum(x.amount_minor),0)::bigint INTO exchanged_minor
    FROM public.creator_coin_exchanges AS x WHERE x.creator_id=p_creator_id;
  IF p_amount_minor > available_minor-reserved_minor-exchanged_minor THEN
    RAISE EXCEPTION 'payout exceeds available creator earnings';
  END IF;
  INSERT INTO public.creator_payouts(creator_id,amount_minor,currency,status)
    VALUES(p_creator_id,p_amount_minor,'USD','requested') RETURNING id INTO payout_id;
  RETURN payout_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.minglora_request_creator_payout(uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_request_creator_payout(uuid,bigint) TO service_role;

COMMIT;
