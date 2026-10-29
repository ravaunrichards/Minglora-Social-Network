# Database layer

The active service currently uses the JSON file in `DATA_DIR`; it does not execute SQL migrations. `migrations/001_social_core.sql` is a relational schema foundation for the planned database-backed architecture, not an active application database.

Before adoption, build a database adapter, migration execution and rollback strategy, least-privilege credentials, disposable-database CI checks, and a backup/verification plan for migrating real records. Do not run this schema against production merely because it exists.