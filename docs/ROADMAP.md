# Implementation roadmap

Build end-to-end vertical slices. Each slice needs authorization, validation, durable persistence, API contract, responsive UI, tests and updated status docs.

1. **Reliable core:** test auth/session/authorization edge cases; separate route modules; add throttling and hardened session lifecycle; build a durable relational adapter and migration/backup process.
2. **Relationships and privacy:** finish friend lifecycle; implement follow/unfollow, block/mute, audience enforcement on every read, and post/comment edits/deletes.
3. **Content and communities:** safe upload/processing, saved posts, threaded comments, group roles/posts, Pages, Stories and events.
4. **Messaging and discovery:** membership authorization, realtime delivery, read state, attachments, indexed privacy-filtered search, notification preferences and retryable workers.
5. **Safety and scale:** reports/moderation, audit trail, data export/deletion, accessibility and performance budgets, backups, monitoring, and separate web/mobile/admin clients.
6. **Advanced features:** Live video, Marketplace and ads only with complete privacy, abuse prevention, moderation and operational coverage.

Folders and docs alone never complete a roadmap item.
