# Deployment and operations

## Local runtime

Use Node.js 20+, set a strong `SESSION_SECRET`, and run `npm start`. The health endpoint is `GET /api/health`. The JSON database path defaults to `data/db.json`; set `DATA_DIR` to an absolute writable persistent directory when needed.

## Container runtime

Build and run with Docker Compose. Supply `SESSION_SECRET` through your shell or a private, untracked `.env` file. The Compose file mounts a named Docker volume to preserve the JSON store.

## Hosted PostgreSQL mode\n\nSet `PERSISTENCE_DRIVER=postgres`, a private `DATABASE_URL`, `PGSSLMODE=require`, `PG_POOL_MAX=5`, `NODE_ENV=production`, and a strong `SESSION_SECRET`. The app creates the runtime-state table automatically if missing. Set the host health-check path to `/api/ready`; keep one API instance while the JSONB adapter is active. See [PostgreSQL setup](POSTGRES_SETUP.md) and [Render configuration](../infrastructure/render/README.md).\n\n## Requirements before public deployment

- Set `NODE_ENV=production` and provide a random `SESSION_SECRET` with at least 32 characters.
- Terminate HTTPS at the hosting platform or reverse proxy.
- Use durable, private storage and test restore from backups.
- Keep one running instance while either JSON or the PostgreSQL JSONB compatibility adapter is in use.
- Configure log collection, alerting, service health checks and incident response.
- Before scaling to multiple instances, replace the single JSONB state document with normalized PostgreSQL repositories, per-operation transactions, constraints, indexes, backups and tested access-control policies.
- Finish and test rate limiting, CSRF safeguards, email verification, password recovery, content reporting/moderation and secure file uploads before describing those capabilities as available.
- Do not advertise a public site as active until its deployment URL is tested.

The repository does not contain provider credentials and does not deploy automatically to a hosting account. Never commit secrets or production data.
