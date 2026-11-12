# Minglora automated video processing

This is the first-stage processing pipeline for member-uploaded post videos. It is deliberately separate from the public web process.

## Processing flow

1. A member uploads a video through the existing signed Supabase TUS flow and publishes a post.
2. The post-creation route adds an idempotent processing job to Minglora's existing durable runtime state. Only an attached video asset referenced by a live post is eligible.
3. A separate worker claims a job through an authenticated internal API. Claims use expiring leases; interrupted work can be reclaimed and failed jobs use bounded exponential retry.
4. The worker downloads a short-lived signed source URL, runs FFmpeg in its own process/container, and encodes an H.264/AAC MP4 capped at 720p.
5. The worker uploads a new output object through the existing signed TUS storage path. Minglora verifies the upload and records the derivative.
6. Playback switches to the derivative only after the output has been finalized. The original upload is never overwritten or deleted and remains the playback fallback if processing is unavailable or fails.

The worker has no direct database credentials and does not write the runtime-state row. All job transitions and asset registration pass through the Minglora API, preserving the current single-writer persistence boundary.

## Deploying the worker

Build Dockerfile.video-worker as a separate Render Background Worker (or another isolated container worker) from the same repository. Configure these environment variables on both the web service and worker:

- VIDEO_TRANSCODE_WORKER_TOKEN: the same random secret of at least 32 characters; store it as a secret, never in source control.
- MINGLORA_API_BASE_URL: HTTPS base URL of the active Minglora API service, with no trailing slash (worker only).

The web service must have VIDEO_TRANSCODE_WORKER_TOKEN configured before the worker can authenticate. The current Render web service can continue serving original videos without the worker. A dedicated worker may require a paid Render plan or another processing provider; do not provision or change billing automatically.

## Current limits

- The web application and original uploads remain available while the worker is absent.
- This stage produces one optimized MP4 derivative; adaptive HLS/DASH renditions, thumbnails, captions, malware scanning, and CDN policy are later stages.
- No existing media object is rewritten, deleted, or migrated.
- Worker capacity is intentionally one job at a time to protect memory and disk.
- A production deployment is not complete until the separate worker is deployed with real credentials, end-to-end tests pass on a disposable video, and monitored output/playback is verified.
