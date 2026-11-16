BEGIN;
CREATE INDEX IF NOT EXISTS marketplace_refunds_approved_by_idx
  ON public.marketplace_refunds(approved_by)
  WHERE approved_by IS NOT NULL;
COMMIT;