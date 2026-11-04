CREATE OR REPLACE FUNCTION public.minglora_get_creator_money_balance(
  p_creator_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  lifetime_creator_earnings_minor bigint;
  available_creator_earnings_minor bigint;
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
  SELECT coalesce(sum(e.creator_share_minor),0)::bigint
    INTO lifetime_creator_earnings_minor
    FROM public.creator_earnings_ledger AS e WHERE e.creator_id = p_creator_id;
  SELECT coalesce(sum(e.creator_share_minor),0)::bigint
    INTO available_creator_earnings_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id = p_creator_id AND e.status = 'available';
  SELECT coalesce(sum(CASE
    WHEN e.entry_type = 'payment' THEN e.creator_minor
    WHEN e.entry_type = 'refund' THEN -e.creator_minor
    ELSE 0 END),0)::bigint
    INTO subscription_net_minor
    FROM public.subscription_earnings_ledger AS e WHERE e.creator_id = p_creator_id;
  SELECT coalesce(sum(p.amount_minor),0)::bigint INTO reserved_payout_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id = p_creator_id AND p.status IN ('requested','processing','paid');
  SELECT coalesce(sum(x.amount_minor),0)::bigint INTO exchanged_minor
    FROM public.creator_coin_exchanges AS x WHERE x.creator_id = p_creator_id;
  available_minor := greatest(
    0,
    available_creator_earnings_minor + subscription_net_minor
      - reserved_payout_minor - exchanged_minor
  );
  RETURN jsonb_build_object(
    'earnedMinor', lifetime_creator_earnings_minor + subscription_net_minor,
    'reservedMinor', reserved_payout_minor,
    'exchangedMinor', exchanged_minor,
    'availableMinor', available_minor,
    'currency', 'USD',
    'coinPerCent', 1
  );
END;
$function$;
