# scripts

Scripts must be deterministic, safe to run locally and documented here. `check-repository.mjs` validates required architecture paths and rejects empty files and `.gitkeep` placeholders. Database migration/backup scripts must not target production by default and must require an explicit reviewed environment.
