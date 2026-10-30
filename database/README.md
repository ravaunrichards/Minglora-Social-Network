# Database layer

The active social API still uses the JSON/PostgreSQL compatibility state adapter; migrations 001 and 002 remain relational design foundations only. Migration 003 defines the protected PostgreSQL runtime-state table. Migration 004 is the active Minglora Supabase Auth profile integration and must be applied to the dedicated Minglora Supabase project before enabling Supabase Auth. See docs/SUPABASE_SETUP.md.

Before adoption, build a database adapter, migration execution and rollback strategy, least-privilege credentials, disposable-database CI checks, and a backup/verification plan for migrating real records. Do not run this schema against production merely because it exists.