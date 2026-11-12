# Video and short-form content

**Current:** members can upload video posts through the video-only composer. The browser plays real uploaded video attachments. The dedicated For You endpoint filters viewer-authorized video content, ranks it using persisted member activity and paginates recommendations. Watch-time and Not interested feedback are stored as first-party Minglora signals.

**Still pending:** server-side transcoding, adaptive streaming, processing queues, generated thumbnails, caption generation and media delivery optimization. Plays, completion and engagement must come from measured events, never invented.


## Automated processing

An isolated FFmpeg worker and durable retry queue are implemented on the feature branch. Original uploads are immutable; a private 720p MP4 derivative is preferred only after the job is marked ready. Production activation requires migration 074, the updated Edge Function and a separate Render Background Worker. HLS, thumbnails and captions remain future work.
