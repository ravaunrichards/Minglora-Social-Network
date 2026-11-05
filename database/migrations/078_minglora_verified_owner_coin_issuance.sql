BEGIN;

-- Owner issuance is not a purchase or a member credit. It is a separately
-- audited issuance into the verified Creator Hub owner's own wallet.
CREATE TABLE IF NOT EXISTS public.owner_coin_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount_coins bigint NOT NULL CHECK (amount_coins > 0),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_coin_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_coin_issuances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.owner_coin_issuances TO service_role;
CREATE INDEX IF NOT EXISTS owner_coin_issuances_owner_created_idx
  ON public.owner_coin_issuances (owner_user_id, created_at DESC);

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_entry_type_check;
ALTER TABLE public.coin_ledger
  ADD CONSTRAINT coin_ledger_entry_type_check
  CHECK (entry_type = ANY (ARRAY[
    'purchase'::text,
    'live_gift_sent'::text,
    'social_gift_sent'::text,
    'refund'::text,
    'adjustment'::text,
    'exchange'::text,
    'owner_issuance'::text,
    'admin_credit'::text
  ]));

CREATE OR REPLACE FUNCTION public.minglora_issue_verified_owner_coins(
  p_owner_user_id uuid,
  p_owner_email text,
  p_amount_coins bigint,
  p_request_id uuid,
  p_note text DEFAULT ''
) RETURNS jsonb
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
  cleaned_note text := left(btrim(coalesce(p_note, '')), 240);
  creator_hub_owner_id constant uuid := '28e1df97-3fe1-488e-bb84-bdc353c58653'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_owner_user_id IS DISTINCT FROM creator_hub_owner_id
     OR lower(btrim(coalesce(p_owner_email, ''))) <> 'larryjones2019ersky@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub owner account only' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email)
    INTO verified_email
    FROM auth.users AS u
    JOIN public.profiles AS profile ON profile.id = u.id
    WHERE u.id = p_owner_user_id
      AND lower(u.email) = 'larryjones2019ersky@gmail.com'
      AND profile.verification_status = 'verified'
      AND profile.verification_badge = 'blue'
    FOR SHARE OF u, profile;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub owner account or verification is not active' USING ERRCODE = '42501';
  END IF;

  IF p_amount_coins IS NULL OR p_amount_coins <= 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coin_wallets(user_id)
    VALUES (p_owner_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT wallet.balance_coins
    INTO current_balance
    FROM public.coin_wallets AS wallet
    WHERE wallet.user_id = p_owner_user_id
    FOR UPDATE;

  SELECT *
    INTO existing
    FROM public.owner_coin_issuances AS issuance
    WHERE issuance.request_id = p_request_id
    FOR UPDATE;

  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id OR existing.amount_coins <> p_amount_coins THEN
      RAISE EXCEPTION 'issuance request reference was already used with different details'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'alreadyIssued', true, 'issuanceId', existing.id,
      'amountCoins', existing.amount_coins, 'balanceAfter', current_balance
    );
  END IF;

  IF current_balance > 9223372036854775807 - p_amount_coins THEN
    RAISE EXCEPTION 'Coin balance reached the database maximum; use a smaller issuance amount'
      USING ERRCODE = '22003';
  END IF;

  new_balance := current_balance + p_amount_coins;
  INSERT INTO public.owner_coin_issuances(
    owner_user_id, request_id, amount_coins, note
  ) VALUES (
    p_owner_user_id, p_request_id, p_amount_coins, cleaned_note
  ) RETURNING id INTO issuance_id;

  UPDATE public.coin_wallets
    SET balance_coins = new_balance, updated_at = now()
    WHERE user_id = p_owner_user_id;

  INSERT INTO public.coin_ledger(
    user_id, delta_coins, balance_after, entry_type, reference_id, description
  ) VALUES (
    p_owner_user_id,
    p_amount_coins,
    new_balance,
    'owner_issuance',
    issuance_id,
    CASE
      WHEN cleaned_note = '' THEN 'Creator Hub owner Coin issuance'
      ELSE 'Creator Hub owner Coin issuance: ' || cleaned_note
    END
  );

  RETURN jsonb_build_object(
    'ok', true, 'alreadyIssued', false, 'issuanceId', issuance_id,
    'amountCoins', p_amount_coins, 'balanceAfter', new_balance
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_issue_verified_owner_coins(uuid, text, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_issue_verified_owner_coins(uuid, text, bigint, uuid, text)
  TO service_role;

COMMIT;
