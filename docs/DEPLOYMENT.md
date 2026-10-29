# Deployment and operations

## Local runtime

Use Node.js 20+, set a strong `SESSION_SECRET`, and run `npm start`. The health endpoint is `GET /api/health`. The JSON database path defaults to `data/db.json`; set `DATA_DIR` to an absolute writable persistent directory when needed.

## Container runtime

Build and run with Docker Compose. Supply `SESSION_SECRET` through your shell or a private, untracked `.env` file. The Compose file mounts a named Docker volume to preserve the JSON store.

## Requirements before public deployment

- Set `NODE_ENV=production` and provide a random `SESSION_SECRET` with at least 32 characters.
- Terminate HTTPS at the hosting platform or reverse proxy.
- Use durable, private storage and test restore from backups.
- Keep the app to one running instance while the JSON store is in use.
- Configure log collection, alerting, service health checks and incident response.
- Before scaling to multiple instances, migrate JSON persistence to PostgreSQL or another transactional database with migrations, constraints, backups, and an access-control policy.
- Finish and test rate limiting, CSRF safeguards, email verification, password recovery, content reporting/moderation and secure file uploads before describing those capabilities as available.
- Do not advertise a public site as active until its deployment URL is tested.

The repository does not contain provider credentials and does not deploy automatically to a hosting account. Never commit secrets or production data.
