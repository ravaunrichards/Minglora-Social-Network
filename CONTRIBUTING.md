# Contributing

## Before changing code

1. Read `README.md`, `docs/ARCHITECTURE.md`, and `docs/FEATURES.md`.
2. Keep the product name Minglora and preserve the existing repository structure unless a documented architectural change requires otherwise.
3. Never add seeded users, sample social posts, fabricated counts, fake activity, mock production responses, or pre-created demo credentials.
4. Keep automated test data inside an isolated temporary `DATA_DIR`.
5. Do not commit secrets, runtime database files, user uploads, or personal data.

## Local checks

- Use Node.js 20 or newer.
- Run `npm test` before submitting changes.
- Run `npm start` and verify the health endpoint at `/api/health`.
- Check the browser UI at desktop and mobile widths.
- Confirm empty states remain empty when the database contains no records.

## Change discipline

- Implement real behavior before adding a UI control that advertises it.
- Update `docs/FEATURES.md` when implementation status changes.
- Update `docs/API.md` and integration tests when API behavior changes.
- Do not claim a feature, deployment, or verification is complete unless it has been tested.
