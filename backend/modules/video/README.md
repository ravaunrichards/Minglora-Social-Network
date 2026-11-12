# Video and short-form content

**Current:** members can upload video posts through the video-only composer. The browser plays real uploaded video attachments. The dedicated For You endpoint filters viewer-authorized video content, ranks it using persisted member activity and paginates recommendations. Watch-time and Not interested feedback are stored as first-party Minglora signals.

**Still pending:** server-side transcoding, adaptive streaming, processing queues, generated thumbnails, caption generation and media delivery optimization. Plays, completion and engagement must come from measured events, never invented.


## Automated video processing

The existing job/domain API and isolated worker are in `src/domain/video-transcode-jobs.js`, `backend/workers/video-transcode/worker.mjs` and `Dockerfile.video-worker`. Production processing remains inactive until the separate Render Background Worker is provisioned with `VIDEO_TRANSCODE_WORKER_TOKEN` and `MINGLORA_API_BASE_URL`, then verified against a disposable video.
