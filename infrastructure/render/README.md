# Render service configuration — Minglora

## Existing service

The connected Render resource is the existing `minglora-social-network` web service in Virginia, linked to `ravaunrichards/Minglora-Social-Network` on branch `main`. Its current build and start commands are `npm install` and `npm start`. It is on the Free plan and currently has no configured health-check path. Its public URL is `https://minglora-social-network.onrender.com`.

This guide configures that service. It does not create duplicates or provision a database. The API's liveness route is `/api/health`; its production readiness route is `/api/ready`. Set the Render health-check path to `/api/ready` after the required PostgreSQL and Supabase settings are installed.

## Required environment settings

Add these in the existing Render service:

- `NODE_ENV=production`
- `PERSISTENCE_DRIVER=postgres`
- `DATABASE_URL` — private connection string for Minglora's separate PostgreSQL database
- `PGSSLMODE=require`
- `PG_POOL_MAX=5`
- `AUTH_PROVIDER=supabase`
- `SUPABASE_URL` — Minglora's own project URL, such as `https://<minglora-project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` — the matching `sb_publishable_...` key for that same Minglora project
- `SUPABASE_AUTH_REDIRECT_URL=https://minglora-social-network.onrender.com`
- `APP_ORIGIN=https://minglora-social-network.onrender.com`
- `SESSION_SECRET` — newly generated random secret of at least 32 characters, stored only in Render
- `LIVEKIT_URL` — Minglora LiveKit Cloud WebSocket URL
- `LIVEKIT_API_KEY` — Minglora-only LiveKit API key
- `LIVEKIT_API_SECRET` — Minglora-only LiveKit API secret; keep private and never expose it in frontend variables

Set the health-check path to `/api/ready`. Keep one instance while the current single-document PostgreSQL adapter is active.

Do not copy ZUNO database URLs or keys into this service. Do not commit secrets.

## Operational facts

- The current Render web service is Free and can spin down after inactivity.
- Its local filesystem is ephemeral; `data/db.json` must not be used as production storage there.
- The app reports `durable: false` and fails the production readiness check while using JSON storage.
- A separate PostgreSQL database is required. Use the connection string from Minglora's own Supabase project's PostgreSQL connection settings (or another dedicated Minglora PostgreSQL database); do not use another product's database.
- Free Render Postgres expires after 30 days; it is not a permanent production database option.
- No separate Minglora realtime, media-processing, notifications, or background-worker Render services are deployed yet. The existing web service is the only confirmed Minglora Render service.

Use paid database or service tiers only after reviewing and approving the quoted cost.


## LiveKit isolation

Configure the three LiveKit settings only on the Minglora service, using credentials from the separate LiveKit Cloud project named Minglora. Never copy credentials from ZUNO, Zovara, or another product. The API reports LiveKit as unconfigured until all three values are present.


## Supabase Auth and PostgreSQL

The API uses the publishable key server-side for Supabase Auth REST requests. It requires **both** `SUPABASE_URL` and the matching `SUPABASE_PUBLISHABLE_KEY`; adding only the key is insufficient. Keep the URL and key from the same Minglora project.

The `DATABASE_URL` value is a separate PostgreSQL connection string, not the publishable API key. If Supabase is the database provider, copy the connection string from the PostgreSQL connection settings for the same Minglora project. Never point Minglora at Zovara, ZUNO, or another product's project.

After configuration, apply `database/migrations/004_supabase_auth_profiles.sql` to Minglora's own Supabase project before enabling Supabase Auth. Migrations `001` and `002` are design foundations not consumed by the current runtime; the current PostgreSQL adapter creates `public.minglora_runtime_state` on startup (the equivalent schema is documented in migration `003`). Use `/api/ready` as the Render health-check path after the PostgreSQL connection is configured. The readiness response reports only whether persistence and Auth are configured; it never returns key values.
