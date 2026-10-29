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

## Source layout

- `public/index.html` — semantic application shell, login and registration forms, navigation landmarks.
- `public/styles.css` — responsive visual system, layout, cards, dialogs and mobile navigation.
- `public/app.js` — browser state, same-origin API client, view rendering and event handling.
- `src/server.js` — HTTP server, API routes, authentication, authorization, validation and static asset delivery.
- `src/store.js` — empty-first-run JSON store, persistence and cleanup of specifically recognized legacy demo records.
- `tests/api.test.js` — isolated end-to-end API test using a temporary data directory.
- `docs/` — architecture, feature status, API contract and deployment guidance.
- `.github/workflows/ci.yml` — automated test workflow.
- `Dockerfile`, `docker-compose.yml` — container build and local persistent-volume runtime.

## Data integrity

A new installation initializes every collection as an empty array. The application must never create synthetic people, posts, comments, reactions, messages, notifications, groups, follower counts or engagement metrics. Test fixtures belong only in isolated test storage and must never be copied into the production data directory.

Legacy cleanup is intentionally narrow: only records matching the explicit sample account identifiers are removed, together with their associated content. Review cleanup logic carefully before adding any matching rule; never delete user records based on broad name or content heuristics.

## Current persistence limits

The JSON adapter is a single-process starter persistence layer. It does not provide database transactions, concurrent multi-instance safety, relational constraints, schema migrations, or managed backups. It must not be treated as durable production storage for a public social network.

The next persistence architecture should use PostgreSQL with versioned migrations, indexes, constraints, backups, and per-user authorization policies. Keep the data-access boundary isolated so routes can move away from direct in-memory collection access.

## Security boundaries

- Passwords are stored as salted scrypt hashes, never plaintext.
- Session cookies are HttpOnly and SameSite=Lax; production cookies are Secure.
- Production startup requires a strong `SESSION_SECRET`.
- API responses set no-store for JSON responses.
- Request bodies have a size limit and inputs are validated at route boundaries.
- This is not a completed security audit. CSRF protection, rate limiting, email verification, password recovery, moderation/reporting, and hardened deployment controls remain required before broad public release.
