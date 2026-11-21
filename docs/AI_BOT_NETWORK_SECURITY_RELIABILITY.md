# Minglora AI Bot Network — Security and Reliability Runbook

**Scope:** Phase 10 security/reliability controls for the AI Network API and its private data/runtime boundary. This runbook separates source safeguards from production controls that still require authorized owner/provider action.

## 1. Authentication, authorization and roles

- Human access to `/api/ai-network` and its subroutes requires a valid Minglora session, the designated Creator Hub administrator, moderator authorization, and an active MFA/reviewer session.
- AI-account records are explicitly rejected as human administrators. An AI identity is a managed data principal, not a human login or administrator credential.
- This phase grants no delegated AI identity role. Human platform roles do not automatically confer AI Network access; the designated-owner/MFA boundary remains the narrowest supported role.
- The `ai_network` schema stays private to the backend runtime. Direct `anon` and `authenticated` access is revoked; commands use `service_role`-only RPCs with server-side actor/owner checks. Do not add client policies to make the browser appear operational.
- The inbound email webhook is a separate provider-to-server path. It is rate-limited and still requires the provider's signed webhook verification before processing.

## 2. API abuse controls and validation

The AI API uses bounded process-local fixed-window limits, keyed by a SHA-256 digest of the authenticated principal or, for unauthenticated calls, the socket peer address. Forwarded client-IP headers are not trusted by this limiter.

| Request class | Limit |
|---|---:|
| Authenticated AI API requests | 90 per minute |
| Authenticated short burst | 20 per 10 seconds |
| Unauthenticated requests | 24 per minute |
| Unauthenticated short burst | 8 per 10 seconds |
| Bot chat | 6 per minute |
| Mutating AI API calls | 30 per minute |
| OpenAI provider-health probes | 4 per 5 minutes |
| Signed email webhook requests | 120 per minute |

The rate-limit bucket map is capped at 10,000 entries. A blocked request receives HTTP 429 and a `Retry-After` header. Bot chat retains its existing one-conversation-at-a-time guard, daily token budget, idempotent request tracking and bounded generation limits.

This limiter and its counters are process-local. They are appropriate only while Minglora runs as a single API instance; they are not a distributed limiter and must be replaced by a shared gateway/Redis/Edge limiter before horizontal or multi-region scaling.

Existing request parsing enforces per-endpoint byte limits and JSON/object validation. Provider account/model metadata APIs reject credential-like fields. OpenAI chat and Creator Studio generation moderate user input and generated output; moderation/provider failures are fail-closed, Responses calls use `store:false` and no tools, and unmoderated output is not saved.

## 3. Provider credential handling

Provider credentials remain in the private server environment. They are not accepted through browser request bodies, AI provider catalogue records, model assignments or health-probe parameters. Provider metadata and connection health are distinct states; a catalogue entry does not mean a provider is connected. Never put credentials in source control, browser tools, issue comments or audit events.

## 4. Audit, monitoring and error tracking

- Bot configuration edits/removals and existing identity, provider, task, HR and approval actions use the existing persistent audit/event records. The AI dashboard's audit history is sourced from persisted records.
- `GET /api/health` remains the public liveness check and `GET /api/ready` remains the persistence/Auth readiness check.
- `GET /api/ai-network/health` is protected by the same designated-owner/moderator/MFA gate as the rest of the AI API. It reports auth/persistence/provider readiness, process RSS/heap and low-cardinality API counters/latency aggregates. It never returns provider secrets, prompts, message bodies, cookies or identity/user IDs.
- AI API requests receive an `X-Minglora-Request-ID` response header. Unexpected errors are logged as structured metadata (request ID, route group, method, safe error code and timestamp); raw error messages, stack traces, request bodies, prompts and credentials are not logged.
- Operational counters and last-error timestamp are in memory and reset on process restart. They are not an external APM/error-tracking integration. Forward structured platform logs to an access-controlled log sink and configure alert thresholds before public-scale use.

## 5. Failure handling and service recovery

- The existing OpenAI provider router uses bounded retries and a per-model circuit breaker with cooldown/half-open probing. The breaker is process-local, not shared between instances.
- Existing generation/request leases and idempotency records support safe retry/recovery for their implemented flows. Durable task workers remain disabled until worker authentication, per-worker authorization, claim/heartbeat/completion/failure recovery and operational acceptance are complete.
- Keep the AI runtime fail-closed: the current operational baseline is `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. Do not resume workers to test service recovery.
- Recovery sequence: preserve global pause; inspect `/api/health` and `/api/ready`; inspect the owner-only AI health endpoint and sanitized platform logs; verify Supabase persistence/Auth and provider probe separately; retry only idempotent, lease-expired work; keep the pause in place until owner acceptance confirms recovery.

## 6. Resource and usage monitoring

The existing AI usage ledger records provider-measured input/output tokens and enforces owner/day token budgets and reservations for supported generation paths. Dashboard performance summaries must remain derived from recorded events. The protected AI health endpoint adds process memory and route latency/status counters. Exact model-dollar cost reconciliation, durable CPU/heap time-series, storage-growth alerting and multi-instance resource metrics are not complete.

## 7. Backup and restore procedure

**Backup and restore acceptance remains open.** This repository does not have authority to enable or inspect the production Supabase backup plan, and no production restore has been performed in this phase. Do not claim a backup schedule or recovery point until the connected Supabase project shows it.

Before enabling AI execution or accepting production data growth:

1. In Supabase, verify the active backup/PITR entitlement, most recent successful backup timestamp and retention window. Record the actual RPO/RTO supported by the plan; do not infer these values.
2. Enable and document the approved managed backup schedule. Take a pre-migration restore point before each schema release. Keep an encrypted copy or managed backup in a separate administrative boundary where the selected plan supports it.
3. Ensure the recovery package includes the database backup, migration ledger, matching Git commit/Edge Function source, private Storage objects and a separately controlled secret inventory. Never put secrets in the backup manifest or repository.
4. Restore into an isolated recovery project, never over the active production project. Reapply/verify migrations, extension/function versions, RLS enablement, table grants, SECURITY INVOKER/search-path properties and service-role-only RPC grants.
5. Verify identity owner isolation, bot/conversation ownership, task idempotency/lease expiry, provider-secret non-disclosure, audit history, row counts and `/api/ready` before any cutover.
6. Obtain designated-owner approval for cutover. Keep AI execution globally paused and workers at zero through restore validation; resume only after separate provider, authorization and worker acceptance.

A GitHub CI test or rollback-only database contract is not a production backup/restore drill. Production backup scheduling, off-project retention, Storage-object recovery, measured RPO/RTO and a signed restore exercise remain unresolved.

## 8. Release gates still required

- Run full repository CI and the focused AI Network workflow on the Phase 10 branch.
- Verify the live production Render target and deploy only after PR review/merge; this branch does not change Render configuration or deployment state.
- Complete signed-in designated-owner/MFA HTTP and Android/desktop browser acceptance, including negative tests with ordinary-member and AI-account sessions.
- Verify current Supabase backup entitlement/schedule and perform a non-production restore drill.
- Before scaling beyond one instance, move rate limits, telemetry and circuit-breaker state to shared services and complete representative load/concurrency tests.
