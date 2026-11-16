BEGIN;

-- Browser voice notes use audio/webm; match the bucket restriction to the
-- application and trusted upload-gateway allowlists.
UPDATE storage.buckets AS b
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime_type
  FROM unnest(coalesce(b.allowed_mime_types, ARRAY[]::text[]) || ARRAY['audio/webm']::text[]) AS mime_type
  ORDER BY mime_type
),
updated_at = now()
WHERE b.id = 'minglora-message-attachments';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'minglora-message-attachments'
      AND allowed_mime_types @> ARRAY['audio/webm']::text[]
  ) THEN
    RAISE EXCEPTION 'Minglora message attachment bucket was not found or audio/webm could not be enabled';
  END IF;
END
$$;

COMMIT;
