# Security and production deployment

## Implemented in the current runtime

- Production startup refuses to run without a unique `SESSION_SECRET` of at least 32 characters.
- Session-cookie decoding and signature validation reject malformed values without crashing the request handler.
- Unsafe API requests reject cross-site Fetch Metadata and validate a supplied browser `Origin` against `APP_ORIGIN` or the effective request origin.
- API and static responses include baseline content-type, frame, referrer and camera/microphone permissions headers.
- Passwords are stored as salted scrypt hashes; session cookies are HttpOnly and use SameSite=Lax.
- The runtime does not seed demo users, posts, messages, reactions or engagement counts.

## Required before public launch

- Add persistent, distributed rate limiting for login, registration, messaging and other abuse-sensitive actions.
- Add email verification, password recovery, configurable session revocation and a documented account recovery process.
- Replace the current single-document JSONB PostgreSQL compatibility adapter with normalized, transaction-oriented repositories before multi-instance scaling.
- Add database backups, restore testing, monitoring, structured logs and alerting.
- Add a reviewed Content Security Policy and dependency/security scanning.
- Complete route-by-route privacy authorization tests, including groups, messages, stories, feeds, blocks and private profile data.
- Add content reporting, moderation queues, media scanning, managed media storage and upload limits.
- Add user data export/deletion, retention controls, terms, privacy notices and age/safety workflows appropriate to launch jurisdictions.

Set `NODE_ENV=production`, `APP_ORIGIN` to the canonical browser origin when known, and a long unique `SESSION_SECRET`. Keep database credentials and LiveKit secrets in the hosting provider's private environment settings. A passing CI run is not a complete security audit.
