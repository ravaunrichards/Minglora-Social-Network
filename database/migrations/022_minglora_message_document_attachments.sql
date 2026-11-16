-- Extend private direct-message attachment storage to common document formats.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime_type
  FROM unnest(
    coalesce(allowed_mime_types, ARRAY[]::text[]) ||
    ARRAY[
      'text/plain','text/csv','application/zip','application/x-zip-compressed',
      'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]::text[]
  ) AS mime_type
)
WHERE name='minglora-message-attachments';
