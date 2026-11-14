ALTER TABLE public.live_gift_catalog
ADD CONSTRAINT live_gift_catalog_only_approved_assets_active_ck
CHECK (
  NOT active
  OR (
    asset_version = '3'
    AND nullif(btrim(model_url), '') IS NOT NULL
    AND nullif(btrim(image_url), '') IS NOT NULL
  )
);
