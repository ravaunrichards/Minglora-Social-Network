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
    SELECT 1 FROM public.profiles WHERE id = p_creator_id
  ) THEN
    RAISE EXCEPTION 'creator account was not found' USING ERRCODE='P0002';
  END IF;

  SELECT jsonb_build_object(
    'giftCount', count(*)::bigint,
    'receivedCoins', coalesce(sum(t.coin_amount), 0)::bigint,
    'cashBackedCoins', coalesce(sum(t.cash_backed_coins), 0)::bigint,
    'marketingBackedCoins', coalesce(sum(t.marketing_backed_coins), 0)::bigint,
    'promotionalCoins', coalesce(sum(t.promo_coins), 0)::bigint,
    'adminPromotionalCoins', coalesce(sum(t.admin_promotional_coins), 0)::bigint,
    'eligibleGrossMinor', coalesce(sum(t.gross_minor), 0)::bigint,
    'creatorShareMinor', coalesce(sum(t.creator_share_minor), 0),
    'recent', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', recent.id,
          'giftCode', recent.gift_code,
          'giftName', recent.gift_name,
          'giftEmoji', recent.gift_emoji,
          'coinAmount', recent.coin_amount,
          'grossMinor', recent.gross_minor,
          'creatorShareMinor', recent.creator_share_minor,
          'cashBackedCoins', recent.cash_backed_coins,
          'marketingBackedCoins', recent.marketing_backed_coins,
          'promotionalCoins', recent.promo_coins,
          'adminPromotionalCoins', recent.admin_promotional_coins,
          'fundingSource', recent.funding_source,
          'senderUsername', recent.sender_username,
          'senderDisplayName', recent.sender_display_name,
          'createdAt', recent.created_at
        )
        ORDER BY recent.created_at DESC
      )
      FROM (
        SELECT
          t.id,
          t.gift_code,
          c.name AS gift_name,
          c.emoji AS gift_emoji,
          t.coin_amount,
          t.gross_minor,
          t.creator_share_minor,
          t.cash_backed_coins,
          t.marketing_backed_coins,
          t.promo_coins,
          t.admin_promotional_coins,
          t.funding_source,
          sender.username AS sender_username,
          sender.display_name AS sender_display_name,
          t.created_at
        FROM public.live_gift_transactions AS t
        LEFT JOIN public.profiles AS sender ON sender.id = t.sender_id
        LEFT JOIN public.live_gift_catalog AS c ON c.code = t.gift_code
        WHERE t.receiver_id = p_creator_id
        ORDER BY t.created_at DESC
        LIMIT 50
      ) AS recent
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.live_gift_transactions AS t
  WHERE t.receiver_id = p_creator_id;

  RETURN coalesce(result, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_get_creator_gift_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.minglora_get_creator_gift_balance(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_get_creator_gift_balance(uuid) TO service_role;
