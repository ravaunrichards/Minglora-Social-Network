# Backend domain boundaries

The active HTTP API is in `src/server.js` and JSON persistence is in `src/store.js`. The modules documented below define the target split and are not yet mounted as services. Move one vertical slice at a time, preserve API behavior or version it, and add tests before removing old code. Each module owns its validation, authorization, persistence rules and tests.