# Minglora PostgreSQL setup

## Supabase project

Minglora uses its own Supabase project: `gzycobgbasnqqhnympkr` (US East, PostgreSQL 17). The canonical Supabase migrations `005_minglora_supabase_relational_platform` and `006_minglora_database_hardening` are already applied there.

The schema contains Auth-linked profiles and normalized relational domains for social relationships, posts, media metadata, reactions, comments, Groups, Pages, Stories, messaging, notifications, events, moderation reports, Marketplace, short videos, Live sessions, calls, check-ins, creator fundraisers, privacy/data-rights requests and video watch history. All 47 public tables have RLS enabled. See [database/README.md](../database/README.md) and [Supabase setup](SUPABASE_SETUP.md).

## Current runtime adapter

The current Node API still uses `public.minglora_runtime_state`, a single JSONB compatibility document, for application persistence. It does not yet use the normalized domain tables as transactional repositories. This is a durable bridge, not a final high-concurrency social-network data layer. Keep the API at one instance while this adapter is in use; do not attach independent write workers or horizontally scale it.

A clean project starts empty. Existing local JSON data is not automatically imported. Export and validate real records before a deliberate migration. Do not seed sample accounts or pretend activity.

## Required server environment

| Variable | Value |
| --- | --- |
| `PERSISTENCE_DRIVER` | `postgres` |
| `DATABASE_URL` | Private Minglora PostgreSQL connection string, stored as a secret |
| `PGSSLMODE` | `require` |
| `PG_POOL_MAX` | `5` |
| `SESSION_SECRET` | Random secret of at least 32 characters |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Minglora Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Matching Minglora publishable key |

Never put `DATABASE_URL`, `SESSION_SECRET`, or a service-role/secret key in GitHub files, browser code, comments or logs. Obtain the private database connection string from the Minglora project's Connect panel. Use the Session pooler when a direct connection is not reachable from the hosting provider.

## Health checks

- `GET /api/health` checks process liveness.
- `GET /api/ready` checks both configured Auth and durable persistence.
- Production JSON-file mode is not ready.
- PostgreSQL mode is ready only when the database accepts a health query and Supabase Auth has a valid URL/key configuration.

Set the hosting service health-check path to `/api/ready` only after its environment has been configured.

## Next architecture step

Replace the compatibility document adapter with transactional repositories that read/write the normalized tables under the same authorization model. Add database integration tests for ownership, audience visibility, membership, concurrent writes, rollback and data export/restore before scaling beyond one API instance.