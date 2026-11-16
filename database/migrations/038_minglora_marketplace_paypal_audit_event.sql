BEGIN;

-- Record a verified PayPal merchant connection separately from identity/KYC.
ALTER TABLE public.marketplace_seller_verification_events
  DROP CONSTRAINT IF EXISTS marketplace_seller_verification_events_event_type_check;

ALTER TABLE public.marketplace_seller_verification_events
  ADD CONSTRAINT marketplace_seller_verification_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'submitted',
    'document_requested',
    'document_received',
    'identity_verified',
    'paypal_connected',
    'approved',
    'rejected',
    'suspended',
    'reinstated'
  ]));

COMMENT ON CONSTRAINT marketplace_seller_verification_events_event_type_check
  ON public.marketplace_seller_verification_events IS
  'Separates PayPal merchant connectivity from independent identity verification and moderation decisions.';

COMMIT;
