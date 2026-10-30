# Minglora Supabase persistence setup

## Supabase project

Minglora uses its dedicated Supabase project `gzycobgbasnqqhnympkr` in US East. Supabase's managed database is PostgreSQL 17. Migrations `005`–`014` establish Auth-linked profiles, the normalized domain schema, RLS and write privileges, Storage buckets, Realtime publication, private authorization helpers, and the Supabase Edge Function persistence gateway.

The schema contains Auth-linked profiles and normalized relational domains for social relationships, posts, media metadata, reactions, comments, Groups, Pages, Stories, messaging, notifications, events, moderation reports, Marketplace, short videos, Live sessions, calls, check-ins, creator fundraisers, privacy/data-rights requests and video watch history. All 47 public tables have RLS enabled. See [database/README.md](../database/README.md) and [Supabase setup](SUPABASE_SETUP.md).

## Application persistence

The Render application no longer opens a raw PostgreSQL connection and no longer needs a database connection string or a PostgreSQL password. It calls the authenticated `minglora-runtime-state` Supabase Edge Function over HTTPS. That function uses the project's server-only Supabase secret key internally and reads/writes `public.minglora_runtime_state`.

The Render-to-function credential is stored only in Render as `SUPABASE_STATE_API_KEY`; Supabase stores only its SHA-256 digest in `public.minglora_runtime_api_secrets`. Browser roles have no access to either runtime table. The old `minglora_runtime` raw database login is disabled and has had its table/schema grants and RLS policy removed.

**Important current limitation:** the Node API still persists its in-memory route model in one JSONB compatibility row. It is durable on Supabase, but it is not yet a set of normalized, transaction-oriented repositories. Keep one API instance and do not add independent writers or scale horizontally until the route layer is migrated to normalized tables and transaction-safe operations.

A clean project starts empty. Existing local JSON data is not automatically imported. Export and validate real records before a deliberate migration. Do not seed sample accounts or pretend activity.

## Required Render environment

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PERSISTENCE_DRIVER` | `supabase` |
| `SUPABASE_STATE_API_URL` | `https://gzycobgbasnqqhnympkr.supabase.co/functions/v1/minglora-runtime-state` |
| `SUPABASE_STATE_API_KEY` | Private service-to-function credential; never commit or expose to browsers |
| `SUPABASE_URL` | Minglora project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Matching Minglora publishable key |
| `AUTH_PROVIDER` | `supabase` |
| `SUPABASE_AUTH_REDIRECT_URL` | `https://minglora-social-network.onrender.com/` |
| `APP_ORIGIN` | `https://minglora-social-network.onrender.com` |
| `SESSION_SECRET` | Random secret of at least 32 characters |

Do not configure `DATABASE_URL`, `PGSSLMODE`, or `PG_POOL_MAX` for this architecture. No separate Render PostgreSQL database is needed. Supabase remains the database provider.

## Health checks

- `GET /api/health` checks process liveness.
- `GET /api/ready` checks Supabase persistence and Supabase Auth configuration.
- Production JSON-file mode is not ready.
- Supabase mode is ready only when the Edge Function can authenticate and read the state revision.

Set the Render health-check path to `/api/ready` after the Edge Function and Render environment settings are deployed.

## Next architecture step

Replace the JSONB compatibility adapter with transactional repositories that read/write the normalized Supabase tables under the existing authorization model. Add database integration tests for ownership, audience visibility, membership, concurrent writes, rollback and data export/restore before scaling beyond one API instance.
