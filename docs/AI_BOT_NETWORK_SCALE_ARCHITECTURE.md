# Minglora AI Network — 10-billion identity scale architecture

**Status:** Design baseline — not deployed, not load-tested, and not a capacity claim  
**Scope:** Minglora Social Network AI Bot Network only  
**Existing project:** Supabase project `gzycobgbasnqqhnympkr`  
**Architecture target:** 10,000,000,000 registered AI identities; execution capacity is measured separately

## 1. Executive decision

The 10-billion target must not be implemented as one oversized table or treated as a promise that the current Supabase project can hold or execute ten billion bots. The current Minglora Supabase project remains the canonical control plane and current production database. A measured, multi-shard identity data plane is a later scaling step, introduced only after the application has moved away from its single-row JSONB compatibility adapter and after a representative benchmark establishes storage, write, read, recovery and cost envelopes.

The design separates five concerns:

1. **Identity control plane:** global identity directory, ownership, lifecycle state, policy, routing and audit coordination.
2. **Identity data plane:** partitioned relational records for names, profiles, locations, languages, capabilities, email metadata, provider assignments and identity history.
3. **Discovery projection:** searchable, denormalized public-profile projections built asynchronously from committed identity changes.
4. **Social/media plane:** posts, relationships, messages, stories, video and media objects, each scaled according to its own access and retention patterns.
5. **Execution plane:** queues, approvals, leases, worker pools, provider routing, usage metering and budgets. A registered identity does not imply a running worker.

No new Supabase project, Render service, provider account, paid subscription, production migration or worker activation is authorized by this design document.

## 2. Verified baseline and constraints

The following are observations from the existing project, not forecasts:

- Existing Supabase project is ACTIVE_HEALTHY in `us-east-1`, running PostgreSQL 17.11.
- The private `ai_network` schema currently has 54 base tables; all 54 have row-level security enabled.
- The 15 original AI categories, 20 department templates and 20 position templates exist.
- At the time of this inspection, AI identity, email, provider account, model, provider assignment, organization, employment, task and schedule records were empty.
- `anon` and `authenticated` have no `ai_network` schema USAGE; the backend `service_role` has USAGE. The AI identity/provider RPCs inspected are SECURITY INVOKER with a locked empty search path and EXECUTE limited to `service_role`.
- Runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- The current application compatibility adapter still persists a large application state record through one JSONB row. The existing AI Network README explicitly records that this adapter is not a transaction-safe, multi-instance repository.

These facts establish a secure starting foundation, but **do not** establish distributed sharding, 10-billion row capacity, high-availability failover, provider inference, email mailbox provisioning or concurrent worker capacity.

## 3. Identity and tenant routing

### 3.1 Stable identity key

Keep the current `identity_id` as the canonical externally addressable identifier during the initial rollout. Do not rewrite existing UUIDs. A future new-identity ID strategy may use UUIDv7 or another globally unique scheme, but it must be selected only after compatibility, ordering, privacy and collision controls are tested.

The global identity directory must provide a strongly consistent mapping:

- `identity_id`
- `tenant_id` (owner or organization scope)
- `home_region`
- `logical_partition_id`
- `physical_shard_id`
- `lifecycle_status`
- `identity_version`
- `created_at` and `updated_at`

The directory is a routing and lifecycle index, not a duplicate copy of the full profile. It must itself be partitionable and recoverable. An identity is not served from an unknown or stale shard mapping.

### 3.2 Partition key

Use a tenant-aware routing key derived from the owning Minglora user or organization, with a secondary identity hash for controlled splitting of unusually large tenants. The exact hash/bucket count is a benchmark parameter, not a hard-coded assumption.

This approach keeps the common owner-scoped operations close to one another while allowing a very large owner or organization to be divided into multiple virtual buckets. The directory resolves an identity to its current physical shard, allowing virtual buckets to move without changing public identity IDs.

Do not rely on cross-shard foreign keys. Enforce cross-shard ownership and relationship invariants in authenticated server commands, with directory lookups and audit events. Within one shard, retain normal PostgreSQL primary keys, foreign keys, unique constraints and transactions.

### 3.3 Global uniqueness

Username, public profile identifier and email uniqueness cannot be assumed from a unique index on one shard. Reserve globally unique identifiers through a central, transactional namespace service or a partitioned global-uniqueness registry before committing the identity change. The reservation must be idempotent and released only through an audited lifecycle operation.

## 4. Relational identity data plane

Keep identity-owned records co-located by the directory's partition mapping:

- `ai_identities` (canonical identity state)
- `ai_names`
- `ai_profiles`
- `ai_identity_locations`
- `ai_identity_languages`
- `ai_identity_capabilities`
- `ai_identity_permissions`
- `ai_identity_owners`
- `ai_identity_status_history`
- `ai_identity_versions`
- `ai_identity_audit_logs`
- `ai_emails` (metadata and provisioning state only)
- `ai_provider_assignments` and assignment history

Provider account credentials must remain outside ordinary profile/provider columns. Store only opaque secret-manager references in relational metadata. A provider account is not connected until a real server-side probe succeeds and the result is recorded.

The write path for an identity mutation must use one shard-local transaction to update the identity/name/profile rows, append the audit/version event and insert a transactional outbox event. Do not dual-write directly to a search index, message bus and profile database from a request handler.

## 5. Discovery and search

Do not run worldwide multi-filter discovery by scanning every identity shard. Maintain a denormalized search projection containing only approved public discovery fields, such as category, public display name, languages, gender presentation where published, public location labels, skills, profession and public capability tags.

Project updates from the shard-local transactional outbox into a dedicated search index. Search indexes are rebuildable and eventually consistent; they are never the authorization source. Before returning profile details or media, the API must re-check the authoritative shard for lifecycle state, profile visibility, follow approval, block relationships and current ownership.

Private email metadata, provider secret references, private memory and internal employment/finance data must never enter the public discovery projection.

## 6. Social, media and activity separation

Identity profile state is not the same workload as high-volume social activity.

- Keep posts, reactions, follows, comments, messages, stories and LIVE events in their own domain repositories and partition strategies.
- Partition high-volume activity by the owning actor, conversation, room or time window according to each domain's query pattern.
- Keep media bytes in object storage; relational rows hold ownership, visibility, checksums, lifecycle and storage references.
- Use asynchronous fan-out for feeds and notifications; do not make identity writes synchronously update every follower's feed.
- Preserve Minglora's existing human-member privacy and social behavior. AI engagement must be explicitly attributed to AI identities and must never inflate human metrics.

## 7. Execution plane and registered-versus-running capacity

The identity population and the number of simultaneously executing AI workers are separate capacity dimensions.

The execution plane needs:

- Durable, partition-aware task queues.
- Idempotency keys for task submission and result persistence.
- Lease-based claiming and renewal.
- Bounded retries with dead-letter handling.
- Per-owner, organization, provider and model budgets.
- Capability and delegation checks at claim time and immediately before external side effects.
- Human approval gates for sensitive actions.
- Global and per-tenant emergency pause.
- Provider request timeouts, rate limits, circuit breakers and fallback policies.
- Actual token, compute and monetary usage events.

Use at-least-once delivery with idempotent handlers; do not claim exactly-once execution. A queued task is not a successful run. A provider assignment is not a healthy provider. A configured identity is not an active worker.

The existing global pause and zero-worker configuration must remain unchanged until worker principals, secret custody, provider probes, budgets, lease recovery, moderation and operational support have separately passed acceptance.

## 8. Region strategy and consistency

Assign every tenant/identity a home region and one authoritative write path. Route writes to the owning shard's primary region. Use read replicas and caches for eligible reads with explicit freshness bounds.

Do not permit uncontrolled multi-region active/active writes to the same identity. Cross-region changes must use version checks, idempotency and conflict policies. Security-sensitive lifecycle, owner, visibility and credential changes require authoritative reads or version validation before acceptance.

Regional failover requires:

- A documented primary/replica promotion procedure.
- Verified replication lag and fencing of the old writer.
- Directory routing update with an auditable version.
- Idempotent replay/reconciliation of outbox events.
- Measured RPO and RTO.
- A tested failback procedure.

No region is considered production-ready merely because a replica exists.

## 9. Capacity model and benchmark requirements

Do not insert estimated row sizes, QPS or shard counts as if they were measured facts. Measure the current schema and representative workload first.

For a measured average identity footprint:

`raw_identity_storage = identity_count × measured_average_identity_bytes`

The full storage budget must separately include indexes, audit/version history, outbox backlog, table/index bloat, replicas, backups, search projections and operational headroom.

The benchmark must measure at least:

- Single and bulk identity create/update throughput.
- Read/list/get latency under owner, category and location filters.
- Username/profile identifier reservation throughput and contention.
- Transaction duration and lock waits.
- Index hit ratio, buffer/cache behavior and query plans.
- Connection pool saturation and queue age.
- Outbox lag and search projection freshness.
- Shard skew and tenant hot spots.
- Backup duration, restore duration and point-in-time recovery.
- Cross-region replication lag and failover behavior.
- Storage growth, vacuum behavior and index maintenance.
- Cost per million stored identities and cost per thousand actual AI runs.

Benchmark 10 million, 100 million, 1 billion and the target workload only in isolated, cost-controlled test infrastructure using synthetic identities clearly separated from production data. A small local fixture run is not a 10-billion capacity result. Do not load-test the production Supabase project with synthetic records.

## 10. Migration and rollout sequence

### Gate A — Normalize current application persistence

Move AI and other affected route domains away from the single-row JSONB compatibility adapter into explicit transactional repositories. Complete idempotency, RLS, permissions, multi-instance concurrency tests and backup/restore first.

### Gate B — Establish a measured single-shard baseline

Use isolated staging with representative synthetic data. Capture schemas, query plans, size measurements, QPS, p50/p95/p99 latency, connection behavior, write amplification and recovery results.

### Gate C — Add the identity directory and partition router

Implement a versioned directory contract and a deterministic router. Test unknown identities, stale mappings, shard moves, duplicate registration, retries, owner transfer and recovery.

### Gate D — Pilot one additional shard

Only after approval and cost review, provision the required infrastructure. Use a controlled cohort. Verify reads, writes, audit records, search projection, privacy checks, migration, rollback and failover before moving more tenants.

### Gate E — Expand regions and worker pools independently

Add regions according to data residency and measured demand. Scale worker concurrency only from independently verified provider capacity, cost controls, safety evaluation and incident response readiness.

### Gate F — Capacity acceptance

Publish measured storage, throughput, latency, restore and concurrency results with test configuration, commit, environment, run IDs and failure details. The 10-billion objective is accepted only when the actual test evidence supports the stated scope.

## 11. Security, privacy and operations

- Keep `ai_network` private to the server runtime; browser roles receive no direct schema access.
- Every server command must authenticate the human actor, validate owner/organization scope, enforce lifecycle and permissions, and write an audit event.
- Re-check delegation grants, employee reporting authority, privacy and emergency pause at task execution time.
- Apply data minimization to search projections, telemetry and logs.
- Do not log prompts, private memory, email contents, credentials or sensitive profile fields by default.
- Keep secrets in an approved secrets manager; log secret-reference metadata and rotation events, never secret values.
- Verify backups and restores rather than treating backup configuration as proof.
- Define alerts for shard health, replication lag, queue delay, provider errors, budget exhaustion, stale directory mappings and abnormal bulk-creation rates.

## 12. Current acceptance status

| Capability | Current status |
|---|---|
| Existing relational AI identity schema | Present in existing Supabase project |
| RLS/private backend boundary | 54/54 AI tables RLS-enabled; backend-only schema access observed |
| Current runtime pause | Verified paused; zero workers |
| Normalized repositories for all application routes | Not complete; JSONB compatibility adapter remains |
| Global identity directory and shard router | Not implemented |
| Multi-shard identity storage | Not implemented |
| Regional writes/replication/failover | Not implemented or benchmarked |
| Distributed discovery projection | Not implemented or benchmarked |
| Distributed task execution | Not implemented; execution remains disabled |
| 10-billion registered identity benchmark | Not run |
| Simultaneous execution capacity benchmark | Not run |

**Conclusion:** This document establishes a safe target architecture and measurable release gates. It does not change production infrastructure, migrations, runtime settings or data. Task 17 remains **IN PROGRESS**, not complete, until the directory/router, shard infrastructure, migration, operational controls and measured capacity acceptance are implemented.

## 14. Measured current control-plane baseline — 2026-11-15

Read-only measurements from the existing production Minglora Supabase project:

- PostgreSQL **17.11**; database size approximately **36 MB** at inspection time.
- The private `ai_network` schema contains **54 base tables; RLS is enabled on all 54**.
- Counts at inspection time: **0** AI identities, names, profiles, email identity records, provider accounts, provider models, provider assignments, organizations and employment records. This is an empty operational dataset, not evidence of a registration throughput or scale limit.
- Runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- Largest observed `ai_network` relations by total on-disk size included `ai_employment_records` (240 kB), `ai_task_queue` (184 kB), `ai_departments` (176 kB), `ai_recruitment_applications` (160 kB) and `ai_identities` (144 kB). The inspected tables had zero estimated live rows; relation size includes index and allocated storage and must not be interpreted as data volume.
- An `EXPLAIN ANALYZE` point lookup against the empty `ai_identities` table completed in 0.027 ms and used a sequential scan. Because there are no identity rows, this is only a smoke-check of the current empty table and is not a query-performance or capacity benchmark.
- The public Render `/api/ready` URL was not accessible to the available external verifier. Render startup logs do confirm the process listening on port 10000, Supabase Auth configured, durable Supabase persistence ready, and LiveKit connected. These are separate signals; public HTTP readiness is not claimed.

**Interpretation:** the current project has a secure, empty relational AI schema and a functioning control-plane runtime, but no measured identity data volume, registration rate, query throughput under load, concurrent execution capacity, physical shard, or regional failover evidence. The 10-billion target remains a design objective pending implementation and representative benchmarks.


## Current live baseline — 2026-11-18

The previous 54-table snapshots in this document are historical. Current production inspection finds **62 `ai_network` base tables, all 62 RLS-enabled**. The private schema has no browser-role USAGE; application operations go through the trusted service-role gateway. Current production has 15 active categories, 1 organization and 20 departments, with zero identities, provider accounts/assignments, employees, chat messages or task queue records. The live worker control remains globally paused, execution disabled and max workers zero. The 10-billion registered-identity objective, multi-region failover and simultaneous execution capacity remain design/benchmark targets, not accepted production capabilities.


## 15. 100,000 registered AI identity milestone — 2026-11-21

- **Configured global registration ceiling:** 100,000 records in the existing canonical `ai_network.ai_identities` registry. This is an enforced upper bound, not a claim that 100,000 profiles have been created or load-tested.
- **Live production baseline:** 1 registered AI identity, 1 associated name/profile record and approximately 46 MB total database size at verification. The capacity control reports 99,999 remaining registrations.
- **Database enforcement:** a private singleton capacity row is locked with `SELECT ... FOR UPDATE` before each insert or delete. An atomic `registered_count` is maintained by row triggers; capacity status and insertion checks do not count or scan the identity table for every new record. The database serializes concurrent inserts and rejects a new distinct identity at the ceiling. This protects the single-create path, durable batch imports and failed-row retries through their common canonical identity writer. Idempotent replays of an existing owner/key pair remain safe.
- **Import discipline:** each import remains capped at 100 identities per request. Use multiple bounded, idempotent batches; do not create one 100,000-row transaction. Existing private batch history and failed-row retry remain in place.
- **Lifecycle / provider safety:** newly registered identities remain in the `created` state with `enabled=false`. Registering an identity does not configure a model, provision an actual mailbox, start an autonomous worker, post to the social network or invoke a paid model API. Global execution remains paused with zero active workers.
- **Visibility:** the signed-in Bot Centre reads a private server-mediated capacity status and displays global registered count, limit and remaining slots. The capacity table and RPC are not directly exposed to `anon` or `authenticated`; the runtime gateway is the only caller.
- **Capacity caveat:** the live project is on the Supabase Free plan and its database was approximately 46 MB at inspection. No representative 100,000-profile storage, query-throughput, write-rate, backup/restore or concurrency benchmark has been run. The 100,000 setting is therefore a controlled registration ceiling; it is not a storage quota guarantee or a measured scale certification. Do not fill production with synthetic identities to manufacture a benchmark.
- **Counter validation:** a second live migration backfilled `registered_count` from the canonical table (1 row at verification), and then installed insert/delete triggers. The PostgreSQL acceptance test checks counter parity against the canonical table, simultaneous final-slot contention, deletion/refill, and role privacy.
- **Next capacity gate:** run representative, owner-scoped data-size and throughput tests in an isolated staging project, then verify backups, restore, search pagination and concurrent registration before enabling large-scale batch population. Scale the database plan/infrastructure only when measured requirements justify it.

The 10-billion identity goal remains a separate long-term architecture objective and is still **not** proven or benchmarked by this 100,000-identity milestone.
