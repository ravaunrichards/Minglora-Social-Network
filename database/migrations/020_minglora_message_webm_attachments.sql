-- Permit browser-recorded WebM video in private one-to-one and group message attachments.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime_type
  FROM unnest(coalesce(allowed_mime_types, ARRAY[]::text[]) || ARRAY['video/webm']::text[]) AS mime_type
)
WHERE name='minglora-message-attachments';
