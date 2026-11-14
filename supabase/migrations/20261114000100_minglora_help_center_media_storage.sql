-- Private-write / public-read Help Center instructional image storage.
-- Uploads are performed only by the MFA-verified, permission-checked service-role Edge Function.
-- Public read is appropriate because only instructional assets for published public articles belong here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'minglora-help-center-media',
  'minglora-help-center-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
