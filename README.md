# Minglora Social Network

**Minglora** is an independent social-networking application with a responsive browser interface and a Node.js HTTP API. It uses original branding and does not claim affiliation with Facebook or Meta.

## Data integrity: no seeded or demo content

A new installation starts empty. The application does **not** create example users, sample posts, pretend reactions, fake messages, placeholder groups, invented notifications or fabricated engagement counts. People must register and publish real content before those areas contain records.

The local JSON store includes narrowly scoped cleanup for explicitly identified legacy sample records. It must not remove unrelated user records. Automated tests use isolated temporary storage.

## What works in the current application

- Responsive browser interface and account registration/sign-in/sign-out (Supabase Auth when configured)
- Signed HttpOnly application session cookies; Supabase Auth owns production passwords, while salted scrypt hashes remain only for legacy-account migration
- Profile editing for display name, unique username, bio and location; avatar/cover gallery, file and camera selection with image zoom/crop/rotation and Supabase Storage delivery
- All/Following/Friends feeds backed by persisted relationships, with optional cursor pagination; posts accept uploaded images, video, audio and interactive GLB 3D files (no pasted image URLs)
- Create, edit and delete your own posts, add reactions/comments, and save/unsave posts
- Friend requests and friend lists, directed follows/unfollows, automatic friendship on reciprocal follow, clickable follower/following lists, block/unblock and profile counts
- Group creation/browsing, join/leave, group detail pages and member-only text discussions
- Public Pages with unique handles, Page follows, Page details, owner publishing with device-uploaded media and deletion
- Text and uploaded photo/video Stories with public/friends/followers/private audiences, 24-hour expiry and actual viewer tracking
- Direct one-to-one text messages with authorized uploaded image/video/audio/document attachments, unread counts, recipient-confirmed read receipts and floating Messenger-style chat windows (visible windows refresh every five seconds; this is polling, not WebSocket delivery)
- In-app notifications for supported actions, with persisted account-level notification controls
- Dedicated Settings & Privacy hub with server-persisted privacy and notification preferences, password/email change requests, TOTP MFA, session revocation, blocked members and downloadable account export
- Basic substring search across people, posts, groups and Pages
- Member reports, moderator review queue and supported moderation actions (moderator access requires an explicit ID allow-list)
- Help & support ticket creation, member replies, status tracking and moderator responses
- Server-side LiveKit session and token API foundation with host publishing permissions and subscriber-only viewer tokens (requires a separate Minglora LiveKit Cloud project and server credentials)
- Local JSON-file persistence for development and durable Supabase-backed persistence for the hosted API
- Node test runner, integration tests, Docker packaging and GitHub Actions CI

These are the capabilities in the **current runtime**, not a claim of Facebook feature parity.

## Expanded repository layout

- `public/`: current browser UI and client code.
- `src/server.js` and `src/store.js`: current HTTP/API and local JSON / Supabase persistence adapters.
- `src/domain/`: reusable, unit-tested validation, cursor-pagination and relationship-policy helpers. Validation is integrated into registration, post creation and profile editing; optional cursor pagination is integrated into the feed. The relationship visibility helper still needs to be applied consistently to every privacy-sensitive route.
- `backend/modules/`: domain boundaries for posts, profiles, relationships, Groups, Pages, Stories, messaging, notifications, search, media, Live, Video, Marketplace, Ads, privacy, moderation, Reels, albums, calls, Memories, Events and data rights. Groups, Pages and Stories have imported service modules with unit tests; other module documents are not proof of implementation.
- `apps/`: documented boundaries for web, Android, iOS, desktop, TV, admin and Creator Studio clients. Only the browser client is currently implemented.
- `frontend/`: target component, layout, page, navigation and theme organization; current UI remains in `public/`.
- `database/migrations/005_minglora_supabase_relational_platform.sql`: consolidated Supabase-native relational schema using `auth.users` as the identity source, with RLS, storage and Realtime configuration.
- `database/migrations/006`–`014`: database hardening, authorization controls, restricted-role lockdown and the Supabase Edge Function runtime gateway.
- `database/types/database.types.ts`: generated types for the deployed Minglora Supabase schema.
- `database/migrations/001`–`004`: historical design/setup artifacts; do not apply these separately to a clean Supabase project.
- `supabase/functions/minglora-runtime-state/index.ts`: server-only HTTPS gateway for the current application persistence adapter.
- `packages/`: planned shared API contracts, validation and platform-neutral helpers.
- `tests/`: current API integration tests plus unit tests and test plans for security, accessibility, performance and browser flows.
- `docs/`: architecture map, feature catalog, roadmap, API, security and deployment guides.

See [the repository map](docs/REPOSITORY_MAP.md), [platform coverage](docs/PLATFORM_COVERAGE.md), [feature implementation status](docs/FEATURES.md), [feature catalog](docs/FEATURE_CATALOG.md), and [roadmap](docs/ROADMAP.md) for the distinction between live functionality and planned work.

## Requirements

- Node.js 20 or newer
- Docker and Docker Compose are optional for containerized local running

## Persistence modes

Local development defaults to the empty-first-run JSON store. The hosted application uses `PERSISTENCE_DRIVER=supabase` and calls Minglora's secured Supabase Edge Function over HTTPS. The Edge Function reads and writes the existing `public.minglora_runtime_state` row using the server-only Supabase secret key provided by Supabase. The Render app does not install the `pg` package, open a raw PostgreSQL connection, or require a database connection string/password.

Supabase itself is the managed PostgreSQL database. There is no separate Render PostgreSQL database. The Render-to-function credential is held only in Render; Supabase stores only its SHA-256 digest. See [Supabase persistence setup](docs/POSTGRES_SETUP.md) and [Render configuration](infrastructure/render/README.md).

**Current architecture limitation:** the app still serializes its route model into one JSONB compatibility document. The normalized Supabase relational schema, policies, Storage buckets and Realtime publication are installed, but the current Node route handlers have not yet been migrated to use those normalized tables as individual transactional repositories. This adapter is durable but single-instance only. Do not scale horizontally or add independent write workers until the route layer has been converted to transactional repositories.

## Run locally

```bash
npm start
```

Open http://localhost:3000 and register an account. The first run creates an empty data store in `data/db.json`; there is no default account or shared password.

For persistent sessions across restarts, set `SESSION_SECRET` in your local environment to a random secret of at least 32 characters. A development-only random value is generated if it is unset, which invalidates sessions when the process restarts.

Generate a strong value with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Tests

```bash
npm test
```

The integration test starts an isolated server with its own temporary data directory and removes that directory when complete. Domain unit tests cover input validation, stable cursor pagination and relationship visibility helpers.

## Docker Compose

Set a strong `SESSION_SECRET` in your shell or private local environment, then run:

```bash
docker compose up --build
```

The Compose service mounts a named volume at `/app/data` to persist local application records. Never commit environment files, session secrets, database files or production credentials.

## Current API overview

All application API endpoints use the `/api` prefix.

- `GET /api/health`, `GET /api/ready` (persistence readiness)
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/feed` (optional `?limit=20&cursor=...` pagination), `POST /api/posts`
- `POST /api/posts/:id/reactions`, `POST /api/posts/:id/comments`
- `GET /api/users`, `GET /api/users/:id`, `GET /api/users/:id/followers|following|friends`, `PATCH /api/users/me`
- `POST /api/friends/:id/request`, `POST /api/friends/:id/accept`
- `GET /api/groups`, `POST /api/groups`, group detail and discussion routes under `/api/groups/:id`
- `GET /api/pages`, `POST /api/pages`, Page detail/follow/post routes under `/api/pages/:id`
- `GET /api/stories`, `POST /api/stories`, `POST /api/stories/:id/view`, `DELETE /api/stories/:id`
- `GET /api/messages`, `POST /api/messages`
- `GET /api/notifications`, `GET /api/search?q=...`
- `GET/PATCH /api/settings`, `POST /api/media/upload/prepare`, `POST /api/media/upload/complete`, `GET /api/account/export`
- `/api/security/*` password, email, MFA and session controls; `/api/reports/*`, `/api/moderation/*` and `/api/support/*` reporting, review and support workflows
- `/api/live/*` session/status routes documented in [LiveKit integration](backend/modules/live/README.md)

See [docs/API.md](docs/API.md) for the current contract. Planned endpoints must not be treated as implemented.

## Production limitations

Hosted persistence now uses Supabase's PostgreSQL database through the Supabase Edge Function gateway. The old direct app database login is disabled; no raw database URL or password is required on Render. JSON mode remains for development only because the Render filesystem is ephemeral.

The single-row JSONB compatibility adapter is durable but does not provide normalized relational transactions or multi-instance concurrency. Minglora's Supabase relational schema and hardening migrations 005–014 are installed. Application routes still need to move to the normalized tables before the system can be considered a high-concurrency social-network data layer.

Before opening public registration at scale, replace the JSONB compatibility adapter with normalized relational repositories and transactions, configure and test database backups/restore, complete Supabase Auth email templates and redirect allow-lists, move login throttling to a distributed rate limiter, add malware/media scanning and appeals policy automation, complete route-by-route privacy/accessibility audits, observability and a security review. Device-based media upload, Story photo/video, member reporting, the initial moderator queue and support tickets are implemented. Automated video transcoding, real-time messaging, Live video, short-form video playback, Marketplace and Ads remain unfinished.

## Supabase Auth integration

New registrations are sent to Minglora Supabase Auth. The browser never receives a service-role or secret key. When email confirmation is enabled in Supabase, Minglora displays a confirmation message and waits for the user to verify the email before login. A database trigger creates the matching profile row. Existing accounts created by the legacy local password store are migrated lazily on their next successful legacy-password login; the old password is verified locally before a Supabase Auth user is created. Minglora's Supabase migrations 005–014 are applied to its dedicated project. Supabase Auth is the identity source and the database creates a matching profile automatically. The project URL and publishable key are configured on Render. Production uses the secured Edge Function runtime gateway; no `DATABASE_URL` or direct PostgreSQL login is required.

Copy `.env.example` to a private environment file and replace each `YOUR_PROJECT_REF` / `REPLACE_ME` value with credentials from Minglora's own services.

## Project identity

- Product: **Minglora**
- Repository: [ravaunrichards/Minglora-Social-Network](https://github.com/ravaunrichards/Minglora-Social-Network)
