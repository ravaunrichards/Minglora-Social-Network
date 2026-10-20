# Architecture

- `public/` — responsive single-page interface (HTML/CSS/vanilla JavaScript).
- `src/server.js` — Node.js HTTP server, API routing, session/auth checks and static file serving.
- `src/store.js` — local JSON store initialization and persistence.
- `data/db.json` — created at runtime; intentionally not committed into the ZIP.
- `tests/api.test.js` — Node built-in test runner exercising key API flows.

No npm packages are required. The API and UI run in one process and share the same origin. The local JSON store is a development convenience, not a multi-process database. For production, move persistence to PostgreSQL, use migrations, and use a proper session store.
