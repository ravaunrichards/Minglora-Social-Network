BEGIN;

-- PayPal merchant_id and payer_id are different identifiers. Migration 046
-- provisionally copied merchant_id so the payout RPC could require a value;
-- do not treat that value as a verified payer_id.
UPDATE public.marketplace_seller_paypal_accounts
SET paypal_payer_id = NULL,
    updated_at = now(),
    status_reason = CASE
      WHEN status_reason = '' THEN 'PayPal payer ID must be retrieved from a verified merchant integration response.'
      ELSE status_reason || ' PayPal payer ID requires independent verification.'
    END
WHERE paypal_payer_id IS NOT NULL
  AND paypal_payer_id = merchant_id;

COMMENT ON COLUMN public.marketplace_seller_paypal_accounts.paypal_payer_id IS
  'PayPal payer_id received from a verified PayPal merchant integration response; never populate from merchant_id or browser input.';

COMMIT;
