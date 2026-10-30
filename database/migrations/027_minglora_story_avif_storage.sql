BEGIN;

-- Match the Stories bucket MIME rules to the AVIF image type accepted by
-- Minglora's authenticated upload route and completion signature validator.
UPDATE storage.buckets AS b
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime_type
  FROM unnest(coalesce(b.allowed_mime_types, ARRAY[]::text[]) || ARRAY['image/avif']::text[]) AS mime_type
  ORDER BY mime_type
),
updated_at = now()
WHERE b.id = 'minglora-stories';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'minglora-stories'
      AND allowed_mime_types @> ARRAY['image/avif']::text[]
  ) THEN
    RAISE EXCEPTION 'Minglora stories bucket was not found or image/avif could not be enabled';
  END IF;
END
$$;

COMMIT;
