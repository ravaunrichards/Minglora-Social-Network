BEGIN;
ALTER TABLE public.creator_subscriptions
  ADD COLUMN IF NOT EXISTS provider_approval_url text;
ALTER TABLE public.creator_subscriptions
  DROP CONSTRAINT IF EXISTS creator_subscriptions_provider_approval_url_check;
ALTER TABLE public.creator_subscriptions
  ADD CONSTRAINT creator_subscriptions_provider_approval_url_check
  CHECK (
    provider_approval_url IS NULL OR (
      length(provider_approval_url) <= 2048 AND
      provider_approval_url ~ '^https://([A-Za-z0-9-]+\.)*paypal\.com(/|$)'
    )
  );
COMMENT ON COLUMN public.creator_subscriptions.provider_approval_url IS
  'Validated PayPal approval URL used only to resume a still-pending monthly creator subscription checkout.';
COMMIT;
