# Minglora architecture

## Runtime overview

Minglora is currently a same-origin web application. A Node.js HTTP server serves the browser client and JSON API from one process.

```text
Browser
  ├── public/index.html
  ├── public/styles.css
  └── public/app.js
          │ same-origin /api requests
          ▼
Node.js HTTP server (src/server.js)
  ├── request parsing and route dispatch
  ├── password hashing and signed session cookies
  ├── authentication and authorization checks
  ├── social domain operations
  └── JSON persistence adapter (src/store.js)
          │
          ▼
DATA_DIR/db.json (created at runtime; never committed)
```

This is the runtime that actually serves requests today. The expanded module/database layout described below is a target design and must not be confused with services already mounted in the app.

## Current runtime source

- `public/index.html` — application shell, login and registration forms, navigation landmarks.
- `public/styles.css` — responsive visual system, cards, dialogs and mobile navigation.
- `public/app.js` — browser state, same-origin API client, view rendering and event handling.
- `src/server.js` — HTTP server, API routes, authentication, authorization, validation and static asset delivery.
- `src/store.js` — empty-first-run JSON store, persistence and cleanup of specifically recognized legacy demo records.
- `tests/api.test.js` — isolated HTTP integration test using a temporary data directory.
- `tests/unit/domain.test.js` — unit tests for the pure validation, cursor-pagination and relationship helpers.
- `Dockerfile`, `docker-compose.yml` — container build and local persistent-volume runtime.
- `.github/workflows/ci.yml` — automated test workflow.

## Expanded source organization

- `apps/`: boundaries for future web, mobile and admin client projects. The live browser client remains in `public/` until it is deliberately extracted.
- `backend/modules/`: ownership, authorization expectations, current implementation status and acceptance rules for social-network domains. These are module contracts, not route-mounted services yet.
- `backend/realtime/` and `backend/workers/`: planned boundaries for realtime transport and durable background jobs.
- `src/domain/`: pure, tested helper functions for validation, cursor pagination and relationship visibility. They are not yet wired into the existing API route handlers; avoid treating them as full authorization enforcement until integrated and tested on every route.
- `packages/`: shared API contracts, validation and platform-neutral helpers. These package boundaries are documented but not independently built or published.
- `database/migrations/001_social_core.sql`: relational schema foundation for users, profiles, relationships, media assets, posts, reactions, comments, saved posts, groups, Pages, Stories, messaging, notifications, events, reports, Marketplace listings and audit history.
- `database/policies/`, `database/functions/`, and `database/schemas/`: policy/function design boundaries and schema documentation.
- `docs/REPOSITORY_MAP.md`, `docs/FEATURE_CATALOG.md`, `docs/ROADMAP.md`: map, domain coverage and ordered implementation plan.

The current server does **not** execute SQL migrations or use the new relational schema. The database migration must be tested on a disposable PostgreSQL instance, and a real data adapter plus a verified migration/rollback plan must be implemented before the schema is adopted. Do not treat creating a SQL file as migration completion.

## Data integrity

A new installation initializes every collection as an empty array. The application must never create synthetic people, posts, comments, reactions, messages, notifications, groups, follower counts or engagement metrics. Test fixtures belong only in isolated test storage and must never be copied into the production data directory.

Legacy cleanup is intentionally narrow: only records matching explicitly recognized sample account identifiers are removed, together with their associated content. Review cleanup logic carefully before adding any matching rule; never delete user records based on broad name or content heuristics.

## Current persistence limits

The JSON adapter is a single-process starter persistence layer. It does not provide database transactions, concurrent multi-instance safety, relational constraints, schema migrations or managed backups. It must not be treated as durable production storage for a public social network.

The target persistence architecture uses versioned relational migrations, constraints, indexes, backups and per-user authorization policies. Keep data access behind a clear adapter so route handlers do not need to manipulate storage collections directly.

## Security boundaries

- Passwords are stored as salted scrypt hashes, never plaintext.
- Session cookies are HttpOnly and SameSite=Lax; production cookies are Secure.
- Production startup requires a strong `SESSION_SECRET`.
- JSON API responses set `Cache-Control: no-store`.
- Request bodies have a size limit and inputs are validated at route boundaries.
- The new pure domain validation helpers have unit tests but are not yet connected to existing route handlers.
- This is not a completed security audit. CSRF protection, rate limiting, email verification, password recovery, moderation/reporting, privacy-wide authorization tests and hardened deployment controls remain required before broad public release.
