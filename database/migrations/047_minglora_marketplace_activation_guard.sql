BEGIN;

CREATE OR REPLACE FUNCTION private.guard_marketplace_payment_configuration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.checkout_enabled AND (
    NEW.provider IS DISTINCT FROM 'paypal'
    OR NEW.marketplace_approval_status <> 'approved'
    OR NOT NEW.payouts_enabled
    OR NOT NEW.tax_calculation_enabled
    OR NOT NEW.delayed_disbursement_enabled
  ) THEN
    RAISE EXCEPTION 'Marketplace checkout requires approved PayPal partner status, verified tax calculation, seller payouts and delayed disbursement';
  END IF;

  IF NEW.payouts_enabled AND (
    NEW.provider IS DISTINCT FROM 'paypal'
    OR NEW.marketplace_approval_status <> 'approved'
    OR NOT NEW.delayed_disbursement_enabled
  ) THEN
    RAISE EXCEPTION 'Marketplace seller payouts require approved PayPal partner status and delayed disbursement';
  END IF;

  IF NEW.card_payments_enabled AND (
    NOT NEW.checkout_enabled
    OR NEW.provider IS DISTINCT FROM 'paypal'
    OR NOT NEW.delayed_disbursement_enabled
  ) THEN
    RAISE EXCEPTION 'Marketplace card processing requires approved and enabled checkout with delayed seller disbursement';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS marketplace_payment_configuration_guard
  ON public.marketplace_payment_configuration;
CREATE TRIGGER marketplace_payment_configuration_guard
BEFORE INSERT OR UPDATE OF provider,marketplace_approval_status,checkout_enabled,
  payouts_enabled,tax_calculation_enabled,delayed_disbursement_enabled,
  card_payments_enabled
ON public.marketplace_payment_configuration
FOR EACH ROW EXECUTE FUNCTION private.guard_marketplace_payment_configuration();

REVOKE ALL ON FUNCTION private.guard_marketplace_payment_configuration() FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION private.guard_marketplace_payment_configuration() IS
  'Fail-closed financial activation guard. Buyer checkout and seller settlement cannot be enabled until provider approval, tax and delayed disbursement gates are satisfied. Card processing additionally requires approved checkout.';

COMMIT;
