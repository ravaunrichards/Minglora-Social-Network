# Security and deployment checklist

Before deploying publicly:

- Set `NODE_ENV=production` and a long unique `SESSION_SECRET`.
- Replace the local JSON data store with a transactional database and backups.
- Add CSRF protection, login/register rate limiting, email verification, password reset, session revocation, and stronger password policy controls.
- Add moderation, reporting, blocking, abuse prevention, and privacy controls.
- Validate/scan uploads and store media in managed object storage; do not allow arbitrary uploads without validation.
- Add security headers and a Content Security Policy, dependency scanning, logs/metrics, monitoring and error tracking.
- Add data export/deletion, terms, privacy notice, retention policy, and age/safety workflows appropriate to launch jurisdictions.
- Use TLS/HTTPS at the public edge and never expose development credentials.

The included demo account is for local testing only. Change/remove it before launch.
