# Render service configuration — Minglora

## Existing service

The connected Render resource is the existing `Minglora-Social-Network` web service in Virginia, linked to `ravaunrichards/Minglora-Social-Network` on branch `main`. Its current build and start commands are `npm install` and `npm start`. It is on the Free plan and currently has no configured health-check path.

This guide configures that service. It does not create duplicates or provision a database.

## Required environment settings

Add these in the existing Render service:

- `NODE_ENV=production`
- `PERSISTENCE_DRIVER=postgres`
- `DATABASE_URL` — private connection string for Minglora's separate PostgreSQL database
- `PGSSLMODE=require`
- `PG_POOL_MAX=5`
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
- A separate PostgreSQL database is required. No Minglora database was provisioned during this update.
- Free Render Postgres expires after 30 days; it is not a permanent production database option.
- No separate Minglora realtime, media-processing, notifications, or background-worker Render services are deployed yet. The existing web service is the only confirmed Minglora Render service.

Use paid database or service tiers only after reviewing and approving the quoted cost.


## LiveKit isolation

Configure the three LiveKit settings only on the Minglora service, using credentials from the separate LiveKit Cloud project named Minglora. Never copy credentials from ZUNO, Zovara, or another product. The API reports LiveKit as unconfigured until all three values are present.
