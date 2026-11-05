-- Private host-created LIVE recordings are uploaded through the service-role media gateway.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'minglora-live-recordings',
  'minglora-live-recordings',
  false,
  1073741824,
  array['video/webm','video/mp4']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.media_assets
  drop constraint if exists media_assets_slot_check;
alter table public.media_assets
  add constraint media_assets_slot_check
  check (slot = any (array[
    'avatar','cover','post','story','group','page','message','marketplace',
    'ringtone','sound','live_recording'
  ]::text[]));

alter table public.media_assets
  drop constraint if exists media_assets_storage_bucket_check;
alter table public.media_assets
  add constraint media_assets_storage_bucket_check
  check (storage_bucket is null or storage_bucket = any (array[
    'minglora-avatars','minglora-covers','minglora-post-media','minglora-stories',
    'minglora-message-attachments','minglora-group-media','minglora-page-media',
    'minglora-ringtones','minglora-sounds','minglora-live-recordings'
  ]::text[]));

create index if not exists media_assets_live_recordings_owner_created_idx
  on public.media_assets (owner_id, created_at desc)
  where slot = 'live_recording' and asset_status <> 'deleted';
