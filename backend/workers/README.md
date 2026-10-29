# Background workers

**Current:** no dedicated durable job queue is wired into the app.

Use workers for retryable notification delivery, media processing, expiry cleanup, data export and search indexing. Jobs require durable state, idempotency, bounded retries, dead-letter handling and metrics; critical work must not depend on an in-memory timer.