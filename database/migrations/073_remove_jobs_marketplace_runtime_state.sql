BEGIN;

-- Remove the retired feature collections from the authoritative app-state row.
UPDATE public.minglora_runtime_state
SET state = (
  state - ARRAY['marketplaceSellers','marketplaceSellerEvents','marketplaceQuotes','marketplaceBookings','jobPostings','jobApplications','marketplaceListings','marketplaceSaved','marketplaceInquiries']::text[]
) || jsonb_build_object(
  'mediaAssets',
  CASE
    WHEN jsonb_typeof(state->'mediaAssets') = 'array' THEN
      coalesce(
        (
          SELECT jsonb_agg(asset)
          FROM jsonb_array_elements(state->'mediaAssets') AS assets(asset)
          WHERE coalesce(asset->>'slot','') <> 'marketplace'
            AND coalesce(asset->>'attachedTo','') NOT LIKE 'marketplace:%'
        ),
        '[]'::jsonb
      )
    ELSE coalesce(state->'mediaAssets','[]'::jsonb)
  END
),
updated_at=now()
WHERE state_key='primary'
  AND (
    state ?| ARRAY['marketplaceSellers','marketplaceSellerEvents','marketplaceQuotes','marketplaceBookings','jobPostings','jobApplications','marketplaceListings','marketplaceSaved','marketplaceInquiries']::text[]
    OR jsonb_typeof(state->'mediaAssets')='array'
  );

COMMIT;