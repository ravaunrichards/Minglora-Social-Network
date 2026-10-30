# Security and production deployment

## Implemented in the current runtime

- Production startup refuses to run without a unique `SESSION_SECRET` of at least 32 characters.
- Session-cookie decoding and signature validation reject malformed values; session records carry user-agent and timestamps, and Supabase access/refresh tokens are encrypted in application state at rest.
- Members can list active sessions, revoke a single device session, or log out other devices.
- Supabase password recovery, authenticated password changes, email-change verification requests, TOTP authenticator enrollment/challenge/verification/removal and MFA-aware sign-in are wired through the server.
- Login failures are throttled (five failed attempts per email/IP key per 15 minutes in the current single-process runtime).
- Unsafe API requests reject cross-site Fetch Metadata and validate a supplied browser `Origin` against `APP_ORIGIN` or the effective request origin.
- API and static responses include baseline content-type, frame, referrer and camera/microphone permissions headers.
- Passwords are never returned in public account objects; local development passwords use salted scrypt hashes, while Supabase Auth owns production passwords.
- Profile, post, Page and Story media use authenticated owner-scoped uploads with signed TUS upload tokens, 6 MB resumable chunks, automatic retries, per-slot size limits (10 MB avatar, 20 MB cover, 200 MB Story, 500 MB post/Page/group), server-side MIME/size/file-signature checks and signed URLs for private media. Media bytes are sent directly to Storage, not through the Node/Edge JSON gateway. Browser forms do not accept pasted image URLs.
- Member reports, support ticket conversations, moderator report status changes, supported content/account actions and audit entries are persisted in the current application state.
- Moderator actions are restricted to IDs in `MODERATOR_USER_IDS` or trusted accounts with explicit `admin`/`moderator` roles.
- The runtime does not seed demo users, posts, messages, reactions or engagement counts.

## Required before public launch

- Move login throttling from the current single-process memory limiter to a persistent, distributed limiter and extend abuse-rate policies to registration, reports, messaging and uploads.
- Add email verification, password recovery, configurable session revocation and a documented account recovery process.
- Replace the current single-document JSONB PostgreSQL compatibility adapter with normalized, transaction-oriented repositories before multi-instance scaling.
- Add database backups, restore testing, monitoring, structured logs and alerting.
- Add a reviewed Content Security Policy and dependency/security scanning; keep the pinned 3D viewer dependency under ongoing release monitoring.
- Complete route-by-route privacy authorization tests, including groups, messages, stories, feeds, blocks and private profile data.
- Add malware/media scanning, human-reviewed appeals, automated copyright workflows and a broader moderation policy matrix. Upload validation, media Storage, member reporting and the initial moderator queue are implemented.
- Add user data export/deletion, retention controls, terms, privacy notices and age/safety workflows appropriate to launch jurisdictions.

Set `NODE_ENV=production`, `APP_ORIGIN` to the canonical browser origin when known, and a long unique `SESSION_SECRET`. Keep database credentials and LiveKit secrets in the hosting provider's private environment settings. A passing CI run is not a complete security audit.
