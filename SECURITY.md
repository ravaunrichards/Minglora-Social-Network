# Security policy

## Report a vulnerability

Do not post credentials, session cookies, private user data, or exploitable vulnerabilities in a public issue. Contact the repository maintainer privately through the GitHub profile associated with this repository.

## Required deployment safeguards

- Keep `.env` secrets, production data files and access tokens out of version control.
- In production, Minglora refuses to start if `SESSION_SECRET` is missing or shorter than 32 characters.
- Use HTTPS and secure cookie settings in production.
- Restrict filesystem access to the service's data directory and back it up securely.
- Keep the app to a single instance until JSON storage is replaced with a shared transactional database.
- The application is not yet a fully hardened public social network. Do not treat the repository's existence or a passing CI run as a security audit.
