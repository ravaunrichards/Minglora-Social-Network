# Minglora Social Network

**Minglora** is an independent social-networking application with a responsive browser interface and a Node.js HTTP API. It uses original branding and does not claim affiliation with Facebook or Meta.

## Data integrity: no seeded or demo content

A new installation starts empty. The application does **not** create example users, sample posts, pretend reactions, fake messages, placeholder groups, invented notifications or fabricated engagement counts. People must register and publish real content before those areas contain records.

The JSON store includes narrowly scoped cleanup for explicitly identified legacy sample records. It must not remove unrelated user records. Automated tests use isolated temporary storage.

## What works in the current application

- Responsive browser interface and account registration/sign-in/sign-out
- Salted scrypt password hashes and signed HttpOnly session cookies
- Basic profile viewing/editing
- All/Following/Friends feeds backed by persisted relationships, with optional cursor pagination
- Create, edit and delete your own posts, add reactions/comments, and save/unsave posts
- Friend requests and friend lists, directed follows/unfollows, block/unblock, follower/following lists and profile counts
- Group creation/browsing, join/leave, group detail pages and member-only text discussions
- Public Pages with unique handles, Page follows, Page details, owner publishing and deletion
- Text/HTTPS-image Stories with public/friends/followers/private audiences, 24-hour expiry and actual viewer tracking
- Direct text messages and conversation history
- In-app notifications for supported actions
- Basic substring search across people, posts, groups and Pages
- Server-side LiveKit session and token API foundation with host publishing permissions and subscriber-only viewer tokens (requires a separate Minglora LiveKit Cloud project and server credentials)
- JSON-file persistence for local development and PostgreSQL-backed durable storage for one running API instance
- Node test runner, integration tests, Docker packaging and GitHub Actions CI

These are the capabilities in the **current runtime**, not a claim of Facebook feature parity.

## Expanded repository layout

- `public/`: current browser UI and client code.
- `src/server.js` and `src/store.js`: current HTTP/API and JSON/PostgreSQL persistence adapters.
- `src/domain/`: reusable, unit-tested validation, cursor-pagination and relationship-policy helpers. Validation is integrated into registration, post creation and profile editing; optional cursor pagination is integrated into the feed. The relationship visibility helper still needs to be applied consistently to every privacy-sensitive route.
- `backend/modules/`: domain boundaries for posts, profiles, relationships, Groups, Pages, Stories, messaging, notifications, search, media, Live, Video, Marketplace, Ads, privacy, moderation, Reels, albums, calls, Memories, Events and data rights. Groups, Pages and Stories have imported service modules with unit tests; other module documents are not proof of implementation.
- `apps/`: documented boundaries for web, Android, iOS, desktop, TV, admin and Creator Studio clients. Only the browser client is currently implemented.
- `frontend/`: target component, layout, page, navigation and theme organization; current UI remains in `public/`.
- `database/migrations/001_social_core.sql` and `002_extended_social_domains.sql`: normalized relational schema design foundations; the current API does not yet use those tables.\n- `database/migrations/003_runtime_state_store.sql`: runtime PostgreSQL state table used by the current compatibility adapter.
- `packages/`: planned shared API contracts, validation and platform-neutral helpers.
- `tests/`: current API integration tests plus unit tests and test plans for security, accessibility, performance and browser flows.
- `docs/`: architecture map, feature catalog, roadmap, API, security and deployment guides.

See [the repository map](docs/REPOSITORY_MAP.md), [platform coverage](docs/PLATFORM_COVERAGE.md), [feature implementation status](docs/FEATURES.md), [feature catalog](docs/FEATURE_CATALOG.md), and [roadmap](docs/ROADMAP.md) for the distinction between live functionality and planned work.

## Requirements

- Node.js 20 or newer
- Docker and Docker Compose are optional for containerized local running

## Persistence modes\n\nLocal development defaults to the empty-first-run JSON store. For hosted persistence, set `PERSISTENCE_DRIVER=postgres`, `DATABASE_URL`, and `PGSSLMODE=require`. The application creates `public.minglora_runtime_state` on startup. See [PostgreSQL setup](docs/POSTGRES_SETUP.md) and [Render configuration](infrastructure/render/README.md).\n\nThe PostgreSQL adapter stores application state in one JSONB document to preserve compatibility with current routes. It is durable but remains single-instance and is not a normalized, high-scale relational adapter. Do not scale horizontally until transaction-oriented repositories replace it.\n\n## Run locally

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

The Compose service mounts a named volume at `/app/data` to persist application records. Never commit environment files, session secrets, database files or production credentials.

## Current API overview

All application API endpoints use the `/api` prefix.

- `GET /api/health`, `GET /api/ready` (persistence readiness)
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/feed` (optional `?limit=20&cursor=...` pagination), `POST /api/posts`
- `POST /api/posts/:id/reactions`, `POST /api/posts/:id/comments`
- `GET /api/users`, `GET /api/users/:id`, `PATCH /api/users/me`
- `POST /api/friends/:id/request`, `POST /api/friends/:id/accept`
- `GET /api/groups`, `POST /api/groups`, group detail and discussion routes under `/api/groups/:id`
- `GET /api/pages`, `POST /api/pages`, Page detail/follow/post routes under `/api/pages/:id`
- `GET /api/stories`, `POST /api/stories`, `POST /api/stories/:id/view`, `DELETE /api/stories/:id`
- `GET /api/messages`, `POST /api/messages`
- `GET /api/notifications`, `GET /api/search?q=...`
- `/api/live/*` session/status routes documented in [LiveKit integration](backend/modules/live/README.md)

See [docs/API.md](docs/API.md) for the current contract. Planned endpoints must not be treated as implemented.

## Production limitations

The local JSON store is for development only. Hosted production must use PostgreSQL; JSON mode reports production readiness as unavailable because ephemeral filesystems are not durable. The PostgreSQL adapter provides durable single-instance storage through one JSONB row, but not normalized relational transactions or multi-instance concurrency. Migrations 001 and 002 remain design foundations; migration 003 creates the runtime store table.

Before opening public registration at scale, replace the JSONB compatibility adapter with normalized relational repositories and transactions, configure and test database backups/restore, implement rate limiting, CSRF safeguards, email verification/recovery, complete privacy enforcement, media upload safety, content reporting/moderation, observability and a security review. Story media uploads/moderation, realtime messaging, Live video, short-form video playback, Marketplace and Ads are not currently implemented.

## Project identity

- Product: **Minglora**
- Repository: [ravaunrichards/Minglora-Social-Network](https://github.com/ravaunrichards/Minglora-Social-Network)
