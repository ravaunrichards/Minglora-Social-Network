# Render service configuration — Minglora

## Existing service

The connected Render resource is the existing `minglora-social-network` web service in Virginia, linked to `ravaunrichards/Minglora-Social-Network` on branch `main`. Its build and start commands are `npm install` and `npm start`. It is on the Free plan. Its public URL is `https://minglora-social-network.onrender.com`.

The service uses Supabase for Auth and durable application persistence. There is no separate Render PostgreSQL database. Supabase itself runs managed PostgreSQL; the Node app accesses it through a secured Supabase Edge Function over HTTPS, not a raw database connection.

## Required environment settings

- `NODE_ENV=production`
- `PERSISTENCE_DRIVER=supabase`
- `SUPABASE_STATE_API_URL=https://gzycobgbasnqqhnympkr.supabase.co/functions/v1/minglora-runtime-state`
- `SUPABASE_STATE_API_KEY` — private Render-to-Edge-Function credential; never commit or expose it to browsers
- `AUTH_PROVIDER=supabase`
- `SUPABASE_URL` — Minglora's own project URL
- `SUPABASE_PUBLISHABLE_KEY` — matching Minglora publishable key
- `SUPABASE_AUTH_REDIRECT_URL=https://minglora-social-network.onrender.com/`
- `APP_ORIGIN=https://minglora-social-network.onrender.com`
- `SESSION_SECRET` — random secret of at least 32 characters, stored only in Render
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — Minglora-only credentials, only when LiveKit is configured

Do not set `DATABASE_URL`, `PGSSLMODE`, or `PG_POOL_MAX`. The app does not use the `pg` package or open its own PostgreSQL connection. Keep the runtime API at one instance while the single-row compatibility adapter is in use.

Set the health-check path to `/api/ready` after Supabase persistence is deployed and enabled.

## Supabase runtime gateway

The Supabase project is `gzycobgbasnqqhnympkr`. The deployed Edge Function is:

`https://gzycobgbasnqqhnympkr.supabase.co/functions/v1/minglora-runtime-state`

The function validates the Render-only shared key against a SHA-256 digest stored in `public.minglora_runtime_api_secrets`. It uses the Supabase server-only secret key injected into the Edge Function environment. That privileged key never enters Render, GitHub or browser code. The function provides revision-checked load/save operations on `public.minglora_runtime_state`.

The previous `minglora_runtime` direct database login has been disabled and its access policy and grants have been removed. The state table and its existing contents are preserved. Migrations `005`–`014` are installed; do not apply historical migrations `001`–`004` to this project.

## Operational facts

- Render's local filesystem is ephemeral; `data/db.json` is only for local development.
- Supabase is the production database provider; the app uses Supabase's HTTPS Edge Function gateway.
- The current route layer still serializes the app's in-memory model into one JSONB row. This is durable but not yet a normalized, transaction-oriented repository layer. Keep one API instance; do not add independent writers or scale horizontally until the route layer is migrated.
- The current Render web service is Free and can spin down after inactivity.
- No separate Minglora realtime, media-processing, notifications, or background-worker Render services are deployed yet. The existing web service is the only confirmed Minglora Render service.

Use paid service tiers only after reviewing and approving the quoted cost.

## LiveKit isolation

Configure the three LiveKit settings only on the Minglora service, using credentials from the separate LiveKit Cloud project named Minglora. Never copy credentials from ZUNO, Zovara, or another product. The API reports LiveKit as unconfigured until all three values are present.
