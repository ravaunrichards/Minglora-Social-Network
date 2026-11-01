BEGIN;
ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_slot_check;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_slot_check
 CHECK (slot IN ('avatar','cover','post','story','group','page','message','marketplace','ringtone'));
ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_storage_bucket_check;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_storage_bucket_check
 CHECK (storage_bucket IS NULL OR storage_bucket IN (
  'minglora-avatars','minglora-covers','minglora-post-media','minglora-stories',
  'minglora-message-attachments','minglora-group-media','minglora-page-media','minglora-ringtones'
 ));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('minglora-ringtones','minglora-ringtones',false,20971520,
 ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav','audio/x-wav','audio/flac','audio/aac']::text[])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
COMMIT;
