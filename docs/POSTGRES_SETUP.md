# Minglora PostgreSQL setup

## Purpose

The current Node API can persist state in PostgreSQL instead of local JSON files. The adapter stores the application state in one JSONB document in `public.minglora_runtime_state`. This is a durable compatibility step for the existing routes, not the final normalized, high-scale social-network data layer. Keep the API at one instance; do not add additional API replicas or independent write workers against this document store.

## Required server environment

| Variable | Value |
| --- | --- |
| `PERSISTENCE_DRIVER` | `postgres` |
| `DATABASE_URL` | Private PostgreSQL connection string, stored as a secret |
| `PGSSLMODE` | `require` for hosted PostgreSQL with TLS |
| `PG_POOL_MAX` | `5` |
| `SESSION_SECRET` | Random secret of at least 32 characters |
| `NODE_ENV` | `production` |

Never put `DATABASE_URL` or `SESSION_SECRET` in GitHub files, browser code, comments, or logs.

For Supabase, use a separate Minglora project; never reuse the ZUNO project. Copy a server-side PostgreSQL connection string from the Supabase Connect panel. Use the Session pooler when the direct database connection is not reachable from the host.

## Schema setup

The application creates the runtime-state table on startup if it does not exist. The matching migration is `database/migrations/003_runtime_state_store.sql`. It creates an empty initial state only when the singleton row does not exist.

Migrations 001 and 002 remain normalized relational design foundations. The current API does not yet read or write those normalized tables; they are not active runtime storage.

## Health checks

- `GET /api/health` checks process liveness.
- `GET /api/ready` checks persistence readiness and reports `driver`, `durable`, and `ready`.
- Production JSON-file mode returns HTTP 503 from `/api/ready`.
- PostgreSQL mode reports ready only when the database accepts a health query.

Set the host health-check path to `/api/ready` after configuring the database.

## Operating limits

The PostgreSQL adapter loads the state document into one process and writes it after mutations. It provides durable persistence, but is not safe for multiple API replicas, independent write workers, or high-volume concurrent workloads. It does not replace normalized relational transactions, backups, media object storage, realtime transport, or a job queue.

A new database starts empty. Existing local JSON data is not automatically imported. Export and validate any real records before deliberate migration. No users, posts, messages, or engagement counts are fabricated.
