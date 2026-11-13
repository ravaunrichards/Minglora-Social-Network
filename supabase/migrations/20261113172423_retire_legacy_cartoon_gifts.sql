-- Retire legacy generated version-1 gifts from the selectable Minglora catalogue.
-- Preserve catalogue rows referenced by completed transactions so receipts and
-- creator earnings remain resolvable; permanently remove unreferenced legacy rows.
BEGIN;

UPDATE public.live_gift_catalog AS c
SET active = false
WHERE c.asset_version = '1'
  AND EXISTS (
    SELECT 1
    FROM public.live_gift_transactions AS t
    WHERE t.gift_code = c.code
  );

DELETE FROM public.live_gift_catalog AS c
WHERE c.asset_version = '1'
  AND NOT EXISTS (
    SELECT 1
    FROM public.live_gift_transactions AS t
    WHERE t.gift_code = c.code
  );

COMMIT;
