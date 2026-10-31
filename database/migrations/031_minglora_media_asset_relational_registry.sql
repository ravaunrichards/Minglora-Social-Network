BEGIN;

-- Preserve the storage metadata currently maintained by the signed-upload gateway.
-- The JSONB state remains untouched; this migration copies metadata only.
ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_media_type_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_media_type_check CHECK (media_type IN ('image','video','audio','document','model3d'));

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS slot text NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS asset_status text NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attached_to text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $media_slot$
BEGIN
  ALTER TABLE public.media_assets
    ADD CONSTRAINT media_assets_slot_check
    CHECK (slot IN ('avatar','cover','post','story','group','page','message','marketplace'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $media_slot$;

DO $media_status$
BEGIN
  ALTER TABLE public.media_assets
    ADD CONSTRAINT media_assets_asset_status_check
    CHECK (asset_status IN ('uploading','uploaded','attached','deleted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $media_status$;

DO $media_bucket$
BEGIN
  ALTER TABLE public.media_assets
    ADD CONSTRAINT media_assets_storage_bucket_check
    CHECK (storage_bucket IS NULL OR storage_bucket IN (
      'minglora-avatars','minglora-covers','minglora-post-media','minglora-stories',
      'minglora-message-attachments','minglora-group-media','minglora-page-media'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $media_bucket$;

CREATE INDEX IF NOT EXISTS media_assets_owner_slot_status_idx
  ON public.media_assets(owner_id,slot,asset_status,created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_bucket_key_idx
  ON public.media_assets(storage_bucket,storage_key);

-- Backfill the current 36 uploaded-media metadata records without deleting or
-- rewriting any legacy runtime-state data. Missing/invalid rows are not guessed.
INSERT INTO public.media_assets(
  id,owner_id,storage_key,media_type,mime_type,byte_size,width,height,duration_ms,
  processing_status,storage_bucket,slot,asset_status,original_name,attached_to,completed_at,created_at
)
SELECT
  (item->>'id')::uuid,
  (item->>'ownerId')::uuid,
  item->>'path',
  CASE WHEN item->>'mediaType' IN ('image','video','audio','model3d','document')
       THEN item->>'mediaType' ELSE 'document' END,
  lower(item->>'mimeType'),
  greatest(1,coalesce(nullif(item->>'byteSize','')::bigint,1)),
  nullif(item->>'width','')::integer,
  nullif(item->>'height','')::integer,
  nullif(item->>'durationMs','')::bigint,
  CASE WHEN item->>'status'='uploading' THEN 'pending'
       WHEN item->>'status'='deleted' THEN 'deleted'
       ELSE 'ready' END,
  item->>'bucket',
  CASE WHEN item->>'slot' IN ('avatar','cover','post','story','group','page','message','marketplace')
       THEN item->>'slot' ELSE 'post' END,
  CASE WHEN item->>'status' IN ('uploading','uploaded','attached','deleted')
       THEN item->>'status' ELSE 'uploaded' END,
  coalesce(item->>'originalName',''),
  nullif(item->>'attachedTo',''),
  nullif(item->>'completedAt','')::timestamptz,
  coalesce(nullif(item->>'createdAt','')::timestamptz,now())
FROM public.minglora_runtime_state state_row
CROSS JOIN LATERAL jsonb_array_elements(coalesce(state_row.state->'mediaAssets','[]'::jsonb)) item
WHERE state_row.state_key='primary'
  AND jsonb_typeof(item)='object'
  AND (item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (item->>'ownerId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND nullif(item->>'path','') IS NOT NULL
  AND nullif(item->>'bucket','') IN (
    'minglora-avatars','minglora-covers','minglora-post-media','minglora-stories',
    'minglora-message-attachments','minglora-group-media','minglora-page-media'
  )
ON CONFLICT(id) DO UPDATE SET
  owner_id=excluded.owner_id,
  storage_key=excluded.storage_key,
  media_type=excluded.media_type,
  mime_type=excluded.mime_type,
  byte_size=excluded.byte_size,
  width=excluded.width,
  height=excluded.height,
  duration_ms=excluded.duration_ms,
  processing_status=excluded.processing_status,
  storage_bucket=excluded.storage_bucket,
  slot=excluded.slot,
  asset_status=excluded.asset_status,
  original_name=excluded.original_name,
  attached_to=excluded.attached_to,
  completed_at=excluded.completed_at;

-- Complete foreign-key indexes identified by the live Supabase advisor for
-- Marketplace-specific query paths.
CREATE INDEX IF NOT EXISTS marketplace_case_messages_case_idx ON public.marketplace_case_messages(case_id);
CREATE INDEX IF NOT EXISTS marketplace_fulfillment_rates_seller_idx ON public.marketplace_fulfillment_rates(seller_id);
CREATE INDEX IF NOT EXISTS marketplace_order_events_actor_idx ON public.marketplace_order_events(actor_id);
CREATE INDEX IF NOT EXISTS marketplace_payment_configuration_updated_by_idx ON public.marketplace_payment_configuration(updated_by);
CREATE INDEX IF NOT EXISTS marketplace_payout_events_payout_idx ON public.marketplace_payout_events(payout_id);
CREATE INDEX IF NOT EXISTS marketplace_refunds_case_idx ON public.marketplace_refunds(case_id);
CREATE INDEX IF NOT EXISTS marketplace_refunds_requested_by_idx ON public.marketplace_refunds(requested_by);
CREATE INDEX IF NOT EXISTS marketplace_refunds_seller_order_idx ON public.marketplace_refunds(seller_order_id);
CREATE INDEX IF NOT EXISTS marketplace_reviews_seller_idx ON public.marketplace_reviews(seller_id);
CREATE INDEX IF NOT EXISTS marketplace_saved_listings_listing_idx ON public.marketplace_saved_listings(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_seller_profiles_reviewer_idx ON public.marketplace_seller_profiles(reviewed_by);
CREATE INDEX IF NOT EXISTS marketplace_seller_events_actor_idx ON public.marketplace_seller_verification_events(actor_id);

COMMIT;
