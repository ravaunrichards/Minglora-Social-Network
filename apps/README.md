# Application workspace

The current browser runtime remains in root `public/`. These boundaries document separation without duplicating or pretending the clients already exist.

- `web/`: future independently bundled browser client after a deliberate extraction.
- `mobile/`: planned Android/iOS client.
- `admin/`: restricted moderation and operations client.

Every client must authenticate against the real API, handle loading/error/empty states, and pass device and accessibility tests.
