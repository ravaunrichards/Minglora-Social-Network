BEGIN;

-- Browser voice notes are normalized to audio/webm before signed upload creation.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime_type
  FROM unnest(coalesce(allowed_mime_types, ARRAY[]::text[]) || ARRAY['audio/webm']::text[]) AS mime_type
)
WHERE name='minglora-message-attachments';

COMMIT;
