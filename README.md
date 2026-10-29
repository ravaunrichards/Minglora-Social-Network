# Minglora Social Network

**Minglora** is an independent social-networking application with a responsive browser interface and a Node.js HTTP API. It uses original branding and does not claim affiliation with Facebook or Meta.

## Data integrity: no seeded or demo content

A new installation starts empty. The application does **not** create example users, sample posts, pretend reactions, fake messages, placeholder groups, invented notifications or fabricated engagement counts. People must register and publish real content before those areas contain records.

The JSON store includes narrowly scoped cleanup for explicitly identified legacy sample records. It must not remove unrelated user records. Automated tests use isolated temporary storage.

## What works in the current application

- Responsive browser interface and account registration/sign-in/sign-out
- Salted scrypt password hashes and signed HttpOnly session cookies
- Basic profile viewing/editing
- Chronological feed, text posts and optional HTTPS image URLs
- Basic post reactions and comments
- Friend requests and friend lists
- Basic group creation, browsing and membership
- Direct text messages and conversation history
- In-app notifications for supported actions
- Basic substring search across people, posts and groups
- JSON-backed persistence for one running application instance
- Node test runner, integration tests, Docker packaging and GitHub Actions CI

These are the capabilities in the **current runtime**, not a claim of Facebook feature parity.

## Expanded repository layout

- `public/`: current browser UI and client code.
- `src/server.js` and `src/store.js`: current HTTP/API and JSON persistence implementation.
- `src/domain/`: reusable, unit-tested validation, cursor-pagination and relationship-policy helpers. Validation is integrated into registration, post creation and profile editing; optional cursor pagination is integrated into the feed. The relationship visibility helper still needs to be applied consistently to every privacy-sensitive route.
- `backend/modules/`: domain boundaries and acceptance requirements for posts, profiles, relationships, groups, Pages, Stories, messaging, notifications, search, media, Live, Video, Marketplace, Ads, privacy and moderation. Documentation here is not proof that the feature is implemented.
- `apps/`: documented boundaries for web, mobile and admin clients. The current web runtime still lives in `public/`; separate mobile/admin applications are not yet implemented.
- `database/migrations/001_social_core.sql`: relational schema foundation for future database-backed persistence. The current app does **not** execute this migration or use this schema.
- `packages/`: planned shared API contracts, validation and platform-neutral helpers.
- `tests/`: current API integration tests plus unit tests and test plans for security, accessibility, performance and browser flows.
- `docs/`: architecture map, feature catalog, roadmap, API, security and deployment guides.

See [the repository map](docs/REPOSITORY_MAP.md), [feature implementation status](docs/FEATURES.md), [feature catalog](docs/FEATURE_CATALOG.md), and [roadmap](docs/ROADMAP.md) for the distinction between live functionality and planned work.

## Requirements

- Node.js 20 or newer
- Docker and Docker Compose are optional for containerized local running

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

The Compose service mounts a named volume at `/app/data` to persist application records. Never commit environment files, session secrets, database files or production credentials.

## Current API overview

All application API endpoints use the `/api` prefix.

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/feed` (optional `?limit=20&cursor=...` pagination), `POST /api/posts`
- `POST /api/posts/:id/reactions`, `POST /api/posts/:id/comments`
- `GET /api/users`, `GET /api/users/:id`, `PATCH /api/users/me`
- `POST /api/friends/:id/request`, `POST /api/friends/:id/accept`
- `GET /api/groups`, `POST /api/groups`, `POST /api/groups/:id/join`
- `GET /api/messages`, `POST /api/messages`
- `GET /api/notifications`, `GET /api/search?q=...`

See [docs/API.md](docs/API.md) for the current contract. Planned endpoints must not be treated as implemented.

## Production limitations

The current JSON store is intended for a single application instance. It does not provide relational transactions, schema migrations or production-grade multi-instance safety. The SQL migration is a design foundation only and is not applied automatically.

Before opening public registration at scale, implement durable database access, migration and backup/restore procedures, rate limiting, CSRF review, email verification/recovery, complete privacy enforcement, media upload safety, content reporting/moderation, observability and a security review. Stories, realtime messaging, Live video, Marketplace and Ads are not currently implemented.

## Project identity

- Product: **Minglora**
- Repository: [ravaunrichards/Minglora-Social-Network](https://github.com/ravaunrichards/Minglora-Social-Network)
