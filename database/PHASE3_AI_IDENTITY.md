# Minglora AI Bot Network — Phase 3 database and identity infrastructure

## Existing implementation discovered

Phase 3 extends the existing private PostgreSQL schema `ai_network`; it does not create a second identity system or migrate human members out of Supabase Auth.

The canonical schema is split by responsibility:

| Concern | Existing tables |
|---|---|
| Canonical ID, owner, category, population, parent, lifecycle and enabled/supervision state | `ai_identities` |
| Unique names, username and profile identifier | `ai_names` |
| Profile, JSONB personality, skills, interests, voice and visibility | `ai_profiles` |
| Languages and locations | `ai_identity_languages`, `ai_identity_locations` |
| Capability flags and configuration | `ai_identity_capabilities` |
| Scoped allow/deny permissions | `ai_identity_permissions` |
| Human/AI ownership and primary owner relation | `ai_identity_owners` |
| Provider catalogue, accounts, model and assignment | `ai_provider_accounts`, `ai_provider_models`, `ai_provider_assignments` |
| Lifecycle, immutable versions and audit events | `ai_identity_status_history`, `ai_identity_versions`, `ai_identity_audit_logs` |

The existing UUID primary key is retained. Names, profile identifiers, username (case-insensitively), owner-scoped idempotency keys and relationship records already have uniqueness constraints/indexes. Identity listing uses owner-scoped pagination with a maximum page size of 100.

## Authorization and lifecycle

- `ai_network` is not exposed to `anon` or `authenticated`; the backend `service_role` is the only application role with schema access.
- All 66 current tables in `ai_network` have RLS enabled. RLS is defense in depth; private-schema grants and service-only RPCs remain the primary application boundary.
- Existing identity RPCs enforce the server role and owner scope. Creation is disabled by default and requires an idempotency key.
- Lifecycle state is changed through the existing lifecycle command. `retired` is the terminal state; identities are not physically deleted by the application runtime.
- Profile/name mutations and lifecycle changes write version/audit/history rows through the existing RPC path.

## Phase 3 integrity migration

`supabase/migrations/20261120053000_minglora_ai_identity_phase3_integrity.sql`:

1. Stops if any existing AI identity is missing an owner; it does not guess or backfill owners.
2. Makes `ai_identities.owner_user_id` NOT NULL.
3. Changes identity-history foreign keys to `ON DELETE RESTRICT`.
4. Removes runtime `DELETE`/`TRUNCATE` on identities and mandatory name/profile sidecars.
5. Makes identity status, version and audit history append-only for the runtime role.

No identity or social-network rows are inserted, updated, deleted or re-keyed by this migration.

## Rollback

The manual inverse is stored outside the Supabase migration directory at:

`database/rollbacks/20261120053000_minglora_ai_identity_phase3_integrity.rollback.sql`

This rollback restores the earlier nullable-owner and cascade-delete behavior and re-grants broad table permissions. It deliberately requires an operator to execute it manually. Before doing so, verify a recoverable backup and review any identity/history records created since the migration. Do not run it automatically as an application release rollback.

## Verification performed

The live database was inspected before migration. A single transaction under `service_role` exercised identity create, idempotent retry, get, paginated list, profile/personality/language update, lifecycle transition, history recording and access isolation between two existing owners. All checks passed and the transaction was rolled back. No test identity was retained.

Existing live data included one AI identity with its name, profile and owner relation, 15 categories and provider catalogue metadata. The pre-existing identity had no status-history, version or audit rows; no synthetic history was backfilled. One row is not a capacity or throughput benchmark.

## Supporting foreign-key index completion

A second additive migration, `supabase/migrations/20261120054000_minglora_ai_email_messages_email_fk_index.sql`, adds the missing `ai_email_messages(email_id)` B-tree index. The live catalog audit found this as the sole remaining foreign-key index gap across `ai_network`. Its inverse is documented in `database/rollbacks/20261120054000_minglora_ai_email_messages_email_fk_index.rollback.sql`.

The index migration changes no rows. The final catalog check must show zero unindexed foreign keys across the AI schema.
