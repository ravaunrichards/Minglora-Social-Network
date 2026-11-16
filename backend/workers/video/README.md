# Minglora video-processing worker

A separate background worker; FFmpeg is never run inside the existing web service. Original uploads remain immutable and are the playback fallback.

## Flow
1. Publishing an uploaded video to a post, Story, Group post or Page post enqueues an idempotent job through the authenticated Edge gateway.
2. PostgreSQL atomically leases one queued job. The Edge Function creates short-lived signed source/download and rendition/upload URLs.
3. The worker probes the source, encodes a 720p H.264/AAC MP4 and uploads to the private `minglora-video-renditions` bucket.
4. Only a database-confirmed `ready` job changes `media_sign` to prefer the derivative. Until then, the original source is signed and played.

The worker does not receive the Supabase service-role key. It uses the Render-to-Edge shared secret, has concurrency one, uses bounded temporary disk, accepts only same-project HTTPS signed URLs, and enforces 500 MB / 60 minute limits. Jobs retry up to four times with backoff.

## Activation steps
- Apply migration 074 to Minglora Supabase.
- Deploy the updated `minglora-runtime-state` Edge Function.
- Provision a separate Render Background Worker using this Dockerfile and repository-root build context. Do not repurpose the web service.
- Store `SUPABASE_URL`, `SUPABASE_STATE_API_URL`, `SUPABASE_PUBLISHABLE_KEY` and `MINGLORA_VIDEO_WORKER_API_KEY` as private worker environment secrets.
- Start with one worker and monitor CPU, memory, temp disk, queue retries and storage costs.

Merging source code alone does not activate processing. Provisioning a worker may incur charges and requires separate cost review.
