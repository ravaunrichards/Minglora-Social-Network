BEGIN;

-- Correct the PayPal receiver email constraint. The previous expression had
-- over-escaped backslashes and rejected ordinary addresses such as user@example.com.
ALTER TABLE public.creator_payout_accounts
  DROP CONSTRAINT IF EXISTS creator_payout_accounts_email_check;

ALTER TABLE public.creator_payout_accounts
  ADD CONSTRAINT creator_payout_accounts_email_check
  CHECK (
    char_length(paypal_email) <= 254
    AND paypal_email = lower(btrim(paypal_email))
    AND paypal_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  );

COMMIT;
