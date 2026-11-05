BEGIN;
-- Member credits are distinct from owner issuance and PayPal purchases.
CREATE TABLE IF NOT EXISTS public.admin_coin_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  member_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount_coins bigint NOT NULL CHECK (amount_coins > 0),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_coin_credits_not_self CHECK (admin_user_id <> member_user_id)
);
ALTER TABLE public.admin_coin_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_coin_credits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_coin_credits TO service_role;
CREATE INDEX IF NOT EXISTS admin_coin_credits_member_created_idx
  ON public.admin_coin_credits (member_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_coin_credits_admin_created_idx
  ON public.admin_coin_credits (admin_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.minglora_admin_credit_member_coins(
  p_admin_user_id uuid,
  p_admin_email text,
  p_member_user_id uuid,
  p_amount_coins bigint,
  p_request_id uuid,
  p_note text DEFAULT ''
) RETURNS jsonb
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
  cleaned_note text := left(btrim(coalesce(p_note, '')), 240);
  creator_hub_owner_id constant uuid := '28e1df97-3fe1-488e-bb84-bdc353c58653'::uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_admin_user_id IS DISTINCT FROM creator_hub_owner_id
     OR lower(btrim(coalesce(p_admin_email, ''))) <> 'larryjones2019ersky@gmail.com' THEN
    RAISE EXCEPTION 'Creator Hub owner account only' USING ERRCODE = '42501';
  END IF;
  SELECT lower(auth_user.email)
    INTO verified_email
    FROM auth.users AS auth_user
    JOIN public.profiles AS owner_profile ON owner_profile.id = auth_user.id
    WHERE auth_user.id = p_admin_user_id
      AND lower(auth_user.email) = 'larryjones2019ersky@gmail.com'
      AND owner_profile.verification_status = 'verified'
      AND owner_profile.verification_badge = 'blue'
    FOR SHARE OF auth_user, owner_profile;
  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Creator Hub owner account or verification is not active' USING ERRCODE = '42501';
  END IF;
  IF p_member_user_id IS NULL OR p_member_user_id = creator_hub_owner_id THEN
    RAISE EXCEPTION 'Choose another Minglora member; owner Coins use owner issuance' USING ERRCODE = '22023';
  END IF;
  IF p_amount_coins IS NULL OR p_amount_coins <= 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Enter a positive whole-number Coin amount and request reference' USING ERRCODE = '22023';
  END IF;
  SELECT profile.username
    INTO member_username
    FROM public.profiles AS profile
    JOIN auth.users AS auth_user ON auth_user.id = profile.id
    WHERE profile.id = p_member_user_id
    FOR SHARE OF auth_user, profile;
  IF member_username IS NULL THEN
    RAISE EXCEPTION 'Minglora member account was not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.coin_wallets(user_id)
    VALUES (p_member_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT wallet.balance_coins
    INTO current_balance
    FROM public.coin_wallets AS wallet
    WHERE wallet.user_id = p_member_user_id
    FOR UPDATE;
  SELECT *
    INTO existing
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
  INSERT INTO public.admin_coin_credits(
    admin_user_id, member_user_id, request_id, amount_coins, note
  ) VALUES (
    p_admin_user_id, p_member_user_id, p_request_id, p_amount_coins, cleaned_note
  ) RETURNING id INTO credit_id;
  UPDATE public.coin_wallets
    SET balance_coins = new_balance, updated_at = now()
    WHERE user_id = p_member_user_id;
  INSERT INTO public.coin_ledger(
    user_id, delta_coins, balance_after, entry_type, reference_id, description
  ) VALUES (
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
$function$;
REVOKE ALL ON FUNCTION public.minglora_admin_credit_member_coins(uuid, text, uuid, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_credit_member_coins(uuid, text, uuid, bigint, uuid, text)
  TO service_role;
COMMIT;