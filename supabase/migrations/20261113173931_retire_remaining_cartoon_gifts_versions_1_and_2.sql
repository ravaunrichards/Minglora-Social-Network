-- Retire every remaining version-1/version-2 generated gift from selection.
-- Preserve gift catalogue rows referenced by prior transactions so transaction
-- receipts, earnings and creator history retain their foreign-key targets.
-- Permanently delete legacy rows with no gift transaction history.
BEGIN;

UPDATE public.live_gift_catalog AS c
SET active = false
WHERE c.asset_version IN ('1', '2')
  AND c.active = true
  AND EXISTS (
    SELECT 1
    FROM public.live_gift_transactions AS t
    WHERE t.gift_code = c.code
  );

DELETE FROM public.live_gift_catalog AS c
WHERE c.asset_version IN ('1', '2')
  AND NOT EXISTS (
    SELECT 1
    FROM public.live_gift_transactions AS t
    WHERE t.gift_code = c.code
  );

COMMIT;
