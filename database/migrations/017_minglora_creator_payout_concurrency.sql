BEGIN;

-- Serialize payout reservations per creator. This prevents two concurrent
-- requests from reserving the same earned amount.
CREATE OR REPLACE FUNCTION public.minglora_request_creator_payout(
  p_creator_id uuid,
  p_amount_minor bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  available_minor bigint;
  reserved_minor bigint;
  payout_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF p_creator_id IS NULL OR p_amount_minor IS NULL OR p_amount_minor < 100 THEN
    RAISE EXCEPTION 'minimum payout is USD 1.00';
  END IF;

  PERFORM 1 FROM public.profiles AS creator
    WHERE creator.id=p_creator_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creator account was not found';
  END IF;

  SELECT coalesce(sum(e.creator_share_minor),0)
    INTO available_minor
    FROM public.creator_earnings_ledger AS e
    WHERE e.creator_id=p_creator_id AND e.status='available';

  SELECT coalesce(sum(p.amount_minor),0)
    INTO reserved_minor
    FROM public.creator_payouts AS p
    WHERE p.creator_id=p_creator_id
      AND p.status IN ('requested','processing','paid');

  IF p_amount_minor > available_minor-reserved_minor THEN
    RAISE EXCEPTION 'payout exceeds available creator earnings';
  END IF;

  INSERT INTO public.creator_payouts(creator_id,amount_minor,currency,status)
    VALUES(p_creator_id,p_amount_minor,'USD','requested')
    RETURNING id INTO payout_id;
  RETURN payout_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_request_creator_payout(uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_request_creator_payout(uuid,bigint)
  TO service_role;

CREATE INDEX IF NOT EXISTS creator_payouts_paypal_batch_idx
  ON public.creator_payouts(paypal_batch_id)
  WHERE paypal_batch_id IS NOT NULL;

COMMIT;
