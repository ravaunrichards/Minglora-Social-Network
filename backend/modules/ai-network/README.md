# Minglora AI Network module

This module owns the first-party AI Bot Network domain rules. It is intentionally independent from feed, messaging, LIVE, gifts, Coin accounting and Creator League.

## Implemented domain contracts

- Owner-scoped Bot Personality Lab records with explicit AI identity, allowlisted capabilities and duplicate-personality rejection.
- Human-reviewed bot teams; cross-owner bot IDs are rejected.
- Future schedules with IANA time-zone validation. Schedules start paused; activation is blocked while the network is paused or provider execution is unavailable.
- Creator Studio draft jobs. No generated output is fabricated or written without a provider-backed worker.
- Human approval records for approved high-impact action classes. Approvals never execute the requested operation.
- A hard denylist for financial, payout, Coin, moderation deletion, admin-privilege, account-suspension and security-setting actions.
- Explicit AI companion consent and withdrawal.
- AI-disclosed community event drafts with opt-in-only invitation mode.
- Performance summaries derived only from recorded execution events.
- Owner command-center snapshot and emergency pause.

## Routes

All routes are under /api/ai-network and require the signed-in Minglora session.

- GET /api/ai-network
- GET /api/ai-network/categories/admin (authorized Minglora moderators only)
- POST /api/ai-network/categories/admin (authorized Minglora moderators only)
- POST /api/ai-network/bots
- GET /api/ai-network/bots/:botId/conversation
- POST /api/ai-network/bots/:botId/chat
- PATCH /api/ai-network/bots/:id/status
- POST /api/ai-network/teams
- POST /api/ai-network/schedules
- PATCH /api/ai-network/schedules/:id/status
- PATCH /api/ai-network/settings
- POST /api/ai-network/creator-jobs
- POST /api/ai-network/approvals
- PATCH /api/ai-network/approvals/:id
- POST /api/ai-network/companion/consent
- POST /api/ai-network/community-events
- POST /api/ai-network/emergency-pause
- POST /api/ai-network/emergency-resume
- GET /api/ai-network/department-templates
- GET /api/ai-network/position-templates
- GET /api/ai-network/organizations
- POST /api/ai-network/organizations
- GET/POST /api/ai-network/organizations/:id/departments
- GET /api/ai-network/provider-accounts
- POST /api/ai-network/provider-accounts
- GET /api/ai-network/provider-models
- POST /api/ai-network/provider-models
- GET /api/ai-network/provider-assignments
- POST /api/ai-network/provider-assignments
- PATCH /api/ai-network/provider-assignments/:assignmentId/status
- GET /api/ai-network/tasks
- POST /api/ai-network/tasks
- PATCH /api/ai-network/tasks/:taskId/approval
- POST /api/ai-network/tasks/:taskId/cancel
- GET /api/ai-network/tasks/:taskId/history
- GET/POST /api/ai-network/organizations/:id/positions
- GET/POST /api/ai-network/organizations/:id/vacancies
- PATCH /api/ai-network/organizations/:id/vacancies/:vacancyId/status
- GET/POST /api/ai-network/organizations/:id/applications
- PATCH /api/ai-network/organizations/:id/applications/:applicationId/review
- GET/POST /api/ai-network/organizations/:id/employees
- PATCH /api/ai-network/organizations/:id/employees/:employmentId/status
- PATCH /api/ai-network/organizations/:id/employees/:employmentId/manager
- POST /api/ai-network/organizations/:id/employees/:employmentId/transfer
- POST /api/ai-network/organizations/:id/employees/:employmentId/promote
- GET/POST /api/ai-network/organizations/:id/performance-reviews
- PATCH /api/ai-network/organizations/:id/performance-reviews/:reviewId/finalize
- GET/POST /api/ai-network/organizations/:id/succession-plans
- PATCH /api/ai-network/organizations/:id/succession-plans/:planId/status
- GET /api/ai-network/organizations/:id/promotions

## Provider execution gate

Provider credentials are read only from the private server environment. The human-initiated bot-chat and Creator Studio adapters use OpenAI and apply input/output moderation, usage limits and a no-tools/no-external-actions boundary. Other catalogue providers are metadata only until their adapters and moderation/usage contracts are independently implemented and tested.

The Phase 6 worker consumer is implemented in `ai-task-worker.js` and is disabled by default. It requires `MINGLORA_AI_WORKER_ENABLED=true`, a dedicated `MINGLORA_AI_WORKER_TOKEN` (40+ characters), durable Supabase persistence, and working OpenAI credentials/model configuration. Worker calls use the dedicated token header, never the owner/admin runtime key. The private Edge gateway authenticates the token hash and limits the credential to worker commands. The worker does not change database runtime controls or grant identity permissions.

The claim response supplies the task's owner-scoped identity and database-selected provider/model route. Execution is limited to the task types and content/read-only action classes accepted by the database policy. The worker independently checks the OpenAI adapter and text capabilities, applies a task token budget, reserves rate capacity for each provider model attempt, heartbeats the lease, and records either a non-empty moderated result with route metadata or a failure. Bounded retries follow each task's attempt limit. Provider fallback is limited to a second OpenAI model explicitly present in the claimed database route. AI-to-AI task types produce a private, human-reviewable handoff draft stored as the task result; they do not send messages or perform external actions.

Database execution must separately be unpaused, enabled and assigned a positive concurrency limit; claims are rejected while those controls are closed. The worker has no authority to override these gates. Task history is exposed through the same designated-owner/MFA-protected Node API. Task scheduling is dispatched by the active Supabase cron job `minglora_ai_schedule_dispatch` every minute through `ai_network.dispatch_due_task_schedules()`. Each due occurrence is created in the durable queue as `pending_approval` with a required human approval; schedule dispatch never bypasses approval or starts provider execution. The worker processes the occurrence only after the database moves it to an approved/due queue state.

Current limitation: the live task cancellation command supports waiting/queued/observation-only tasks. It does not cancel a task that is already running; running cancellation needs a separately reviewed database migration and worker cancellation signal. No such migration is applied by this branch.

Provider environment slots, the OpenAI bot-chat/Creator Studio setup and the non-routable ChatGPT guest-session boundary are documented in [AI Provider Configuration](../../../docs/AI_PROVIDER_CONFIGURATION.md). Provider-specific credential presence is reported without exposing values; it does not mark a provider connected or enable execution.

## Controlled model fallback and recovery

Bot chat and Creator Studio generation call the shared `provider-routing.js` helper. It supports explicit same-provider OpenAI alternate-model routing, bounded retries for transient generation errors, and a process-local per-model circuit breaker with one half-open recovery request. Credentials continue to come from the existing private OpenAI environment variables. The selected model and attempt summary are returned as non-secret routing metadata.

The helper wraps generation only. Input moderation runs before routing and output moderation runs after the chosen model responds; neither moderation failure can trigger fallback or allow unmoderated content to be saved. Authentication/permission errors and invalid configuration do not fail over. Other catalogue providers remain non-routable until their adapters are independently implemented and tested. The circuit breaker is not shared across instances; autonomous execution remains paused.

## Persistence note

The existing durable store adapter still keeps some legacy bot/team/schedule state in one JSONB row, so that subset needs normalized repositories before multi-instance worker execution. AI identities, profiles, bot conversations, messages, token budgets, task approvals, organizations and HR records already use the private relational `ai_network` schema with service-role-only access. Keep autonomous workers disabled until every remaining state domain has transaction-safe claims and multi-instance concurrency acceptance.

## Corporate governance foundation

The feature branch now includes an owner-scoped corporate workspace backed by the additive `ai_network` organization migration. It exposes department and position templates, organization creation, and per-organization department/position provisioning through the existing authenticated Supabase runtime gateway. The UI reports only records returned by the database; it does not create employees or assert that positions are filled.

The organization/workforce and HR SQL migrations and runtime Edge Function handlers are source-only until reviewed and deployed. All organization/HR write routes require the existing authenticated platform-staff authorization check and forward to the private service-role runtime; clients never access `ai_network` directly. The API deliberately reports the center unavailable when the required migration or runtime action is missing.

The feature branch includes source for owner-scoped organization creation, 20 department templates, position templates, vacancy drafts/status, AI candidate applications/review, approval-gated appointment into onboarding, employment status transitions, manager hierarchy/cycle checks and transfer history. The HR talent extension adds promotion records linked to the existing role-transfer history, human-authored performance reviews with separate finalization history, and draft/active/completed/cancelled succession plans with audit history. Promotion requires an active employee and a strictly higher-ranked position; a supporting review, when supplied, must be finalized and recommend promotion or role change. Succession plans do not appoint or promote candidates automatically. The UI uses database-backed records and never creates sample employee rows. The new talent migration and runtime handler are source-only on `feat/minglora-ai-hr-talent-management-20261114`; they are not yet deployed or enabled in production. Full onboarding/training/attendance, disciplinary processes, delegated AI appointments, department finance, and AI worker execution remain unfinished.

## Durable task queue

The private Supabase database has an applied Phase 6 execution-orchestration migration and the active `minglora-runtime-state` Edge Function exposes dedicated authenticated worker commands. These database objects are currently ahead of the checked-in migration source in this repository; keep the migration source synchronized before treating the database change as a reproducible release. The queue includes owner-scoped tasks, human approvals, append-only task events/history, idempotency, payload/budget limits, supervision-derived approval, lease recovery and `FOR UPDATE SKIP LOCKED` claims.

The worker application code is in this feature branch and is not deployed to production. Runtime controls remain fail-closed by default: globally paused, execution disabled and zero workers. The only current worker adapter is OpenAI. Provider-account/model assignments must be healthy and explicitly activated; AI identities must be active/enabled and possess the task-execution capability and matching allow permission with no deny. A claim additionally requires a due task, approval when required, valid delegation grants, an available lease and a healthy provider route.

The worker records route metadata and either a successful moderated output or a failure/retry; non-empty output and a matching provider/model route are required for the database to accept completion. It does not claim a task succeeded when generation, moderation, heartbeat or completion fails. The worker uses a separate worker-token gateway path and never exposes its credential to task payloads or logs.


## AI category administration

The existing 15 category records are retained. Authorized Minglora moderators can create categories, edit the human-readable display name and description, change sort order, and deactivate/reactivate a category. Category keys are immutable because identity rows reference them; categories are deactivated rather than deleted so existing identities and audit history remain intact. The server routes through a service-role-only RPC. Every create, edit, activation and deactivation is appended to `ai_network.ai_category_audit_logs`; browser roles have no direct schema access.


## Latest verified HR talent release checkpoint — 2026-11-14

This checkpoint supersedes earlier HR talent notes in this document.

- Source implementation merged to `main` through PR #308 (merge commit `a9b07763059cc64e5cb622c318835fcc1e72d043`). Follow-up FK index coverage merged through PR #310 (merge commit `3d8e0fec66a0447d6b15ec98b399113880736e3b`).
- Supabase project `gzycobgbasnqqhnympkr`: the HR talent migration and the 18-index follow-up migration have both been applied. Five new private tables exist: performance reviews, review history, succession plans, succession history and promotions. All have RLS enabled; browser roles have no table SELECT grant, and the HR talent RPC is executable only by `service_role`.
- Direct catalog verification found 21 foreign keys across those five tables and zero uncovered foreign keys. The Supabase performance advisor no longer reports `unindexed_foreign_keys` for these five tables. It reports unused-index INFO notices because the new tables are currently empty and have not yet received workload.
- `public.minglora_ai_hr_talent_command` is SECURITY INVOKER, uses an empty search path, checks the signed-in platform actor against the organization owner, and has EXECUTE granted only to `service_role`. The existing `minglora-runtime-state` Edge Function is ACTIVE at version 124 and contains the private talent command gateway.
- PR #308 CI passed: repository CI, AI Network regression/syntax checks, AI Network browser acceptance using disposable fixtures, and layout visual QA. PR #310 CI and AI Network checks also passed, including the updated index-coverage unit assertion.
- No sample AI identities, employees, appointments, reviews, promotions, succession plans, human Auth accounts or fake engagement metrics were created. Current talent-table row counts remain zero. The single worker-control row remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- **Still pending:** Render workspace selection by the user, inspection of the correct Minglora Render service, deployment/verification of the updated `src/server.js` backend, signed-in owner HTTP/browser/device acceptance, and representative functional tests using real owner-created organization and employee records. Render currently lists only `Creator Hub Creator Network's workspace`; no workspace has been selected because the user must explicitly confirm it before service operations.
- **Scope status:** this is a delivered HR talent-management slice, not completion of the complete AI Bot Network specification. Delegated AI executive appointment authority, training/attendance, disciplinary and succession execution safeguards, workforce budgets, live provider inference and monitoring, bulk generation limits, worker principals/execution, global AI social publishing, distributed storage/partitioning and measured 10-billion-scale benchmarks remain incomplete. The 10-billion figure is a design target, not a measured capacity claim.


## AI email lifecycle

The email API is restricted by the existing designated-owner/MFA gate. It uses the canonical relational email registry, a private message table and service-role-only database RPC. Resend domain verification gates virtual mailbox provisioning; inbound delivery requires a valid signed webhook and authoritative provider message retrieval. No AI Supabase Auth account or separate paid mailbox seat is created.

Routes: `GET /email/status`, `GET /identities/:id/email`, `POST /identities/:id/email/provision`, `GET /identities/:id/email/inbox`, `POST /identities/:id/email/send`, and `POST /identities/:id/email/messages/:messageId`.

The migration remains additive and must be reviewed and approved before production application. Runtime worker execution stays separately paused.
