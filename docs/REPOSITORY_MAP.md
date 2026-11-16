# Minglora repository map

This map separates the **running application** from the **target architecture**. A folder is not proof that a feature is integrated.

## Current runtime
- `public/`: current browser interface.
- `src/server.js`: Node.js HTTP server and API routes.
- `src/store.js`: JSON-file persistence adapter.
- `tests/api.test.js`: isolated HTTP integration test.
- `docs/API.md`, `docs/FEATURES.md`, `docs/ARCHITECTURE.md`: current behavior and limitations.

## Target boundaries
- `apps/`: web, Android, iOS, desktop, TV, admin and Creator Studio boundaries.
- `frontend/`: target components, layouts, pages, navigation and theme organization; active UI remains in `public/`.
- `backend/modules/`: feature ownership and acceptance contracts for current social functions and the wider feature set. Groups, Pages and Stories now include imported service modules and unit tests.
- `src/domain/`: tested validation and pagination utilities used by active routes; relationship helper still needs broader privacy-route coverage.
- `tests/unit/`: domain helper tests plus Groups, Pages and Stories service-policy tests.
- `database/migrations/`: relational schema foundation; not executed by the JSON-backed app.
- `packages/`: shared API, validation, and platform-neutral contracts.

## Rules
1. Never seed fake users, posts, messages, reactions, follower counts, or activity.
2. Implement persistence, authorization, validation, tests, and UI before marking a feature complete.
3. Use reviewed migrations and a verified backup/data migration plan; never silently discard user data.
4. Keep secrets and production user data out of source control.
