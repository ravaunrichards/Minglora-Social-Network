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


## Phase 10 — live security and reliability assessment (2026-11-21)

### Verified controls

- Production startup requires `AUTH_PROVIDER=supabase` and a `SESSION_SECRET` of at least 32 characters. Signed application sessions are HttpOnly, SameSite=Lax and Secure in production; Supabase access/refresh tokens are encrypted at rest.
- The AI Network HTTP route requires an authenticated session, the designated platform owner, moderator authorization and an active MFA reviewer session. A catalogue role or role assignment alone does not grant API access.
- The AI Network database schema is server-only. The live database check found 77 AI tables with RLS enabled; `anon` and `authenticated` have no schema USAGE or table SELECT privileges. All 33 `minglora_ai_*` RPCs checked were executable by `service_role` only and none was SECURITY DEFINER.
- AI provider credential status returns presence/adapter metadata, not secret values. The Edge runtime gateway validates a high-entropy server key by SHA-256 digest comparison. The dedicated worker has a separate token channel and lease/heartbeat recovery contract.
- Input/output moderation, bounded retries, token-budget reservations, task leases, cancellation and append-only audit/event structures exist in the AI provider and execution layers. Autonomous execution remains disabled unless the separately deployed worker and owner-controlled gates are ready.
- `GET /api/health` and `GET /api/ready` are implemented. The readiness endpoint checks durable persistence and authentication configuration.
- The Render application is configured as a single free-plan web service. Its latest observed deployment succeeded; startup logs reported Supabase persistence ready, OpenAI model probe healthy, and AI execution disabled.

### Additional hardening in this phase

- The tracked `.env.example` template is being changed to remove live/project-specific key values and use blank fields or placeholders. Because earlier Git commits remain in repository history, this does not revoke or erase any previously published credential.
- The central HTTP exception handler now emits a structured, redacted error event and an `X-Request-Id`. It deliberately omits request bodies, query strings, cookies, authorization headers, provider response bodies, prompts and stack traces from the application log.
- Unit tests assert the credential-template hygiene, AI owner/MFA boundary, production auth requirements, health endpoints, login throttle invariants and provider-secret non-disclosure.

### Findings still requiring owner/deployment action

- **Credential rotation:** any real server secret ever committed to this public repository must be rotated at its issuing provider and replaced in the private Render/Supabase secret stores. In particular, review the Supabase runtime key, LiveKit API secret and PayPal client secret. Do not merely delete values from the latest template.
- **Authentication configuration:** the Supabase Security Advisor reports anonymous sign-ins enabled and leaked-password protection disabled. Confirm whether anonymous sign-in is intentionally used before changing it; enable leaked-password protection after testing the sign-in policy. The advisor also flags the MFA-factor RPC: it intentionally returns only the current authenticated user's factors using `auth.uid()` and an empty search path, but its SECURITY DEFINER grant should receive a documented security review.
- **Rate limiting:** login failures are capped at five per email/IP key per 15 minutes in a process-local map. The AI worker and relational runtime also have database-backed provider/execution limits, but login and general abuse protection are not yet a distributed limiter across app instances. The current single-instance deployment reduces, but does not remove, that limitation.
- **RBAC completeness:** the owner/MFA gate for the AI Network is verified. The broader Admin route/action audit still records delegated-role coverage as incomplete. Do not activate delegated administrative roles until every privileged route, Edge action and database RPC has an explicit permission mapping and positive/negative tests.
- **Health and monitoring:** the application exposes health and readiness endpoints, but the Render service's configured `healthCheckPath` is empty. Configure it as `/api/ready` in Render. Render/Supabase logs and metrics are available; external alert routing and a dedicated error-tracking service are not evidenced as configured.
- **Backup and restore:** Supabase reports the project active and healthy, but no completed backup inventory, restore drill, or recovery-time/recovery-point measurement was available during this audit. Do not claim recovery is proven until an isolated restore is completed and validated.
- **Worker recovery:** the Render workspace currently lists the web service only; no dedicated AI execution worker service was found. Keep autonomous execution disabled. The worker's source-level lease/heartbeat/retry tests do not prove a production worker deployment.
- **Resource metrics:** Render reported one running web-service instance and provided CPU/memory samples; the sampled HTTP request/latency series were empty. Establish alert thresholds and repeat measurements under representative load before setting capacity targets.

### Release gate

A passing source test or a healthy provider probe is not a complete security audit. Keep autonomous execution and delegated administrative roles disabled until the unresolved deployment, authorization, rate-limit and recovery checks above are completed.
