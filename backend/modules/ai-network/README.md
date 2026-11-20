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
- PATCH /api/ai-network/provider-accounts/:accountId/status
- GET /api/ai-network/provider-accounts/:accountId/health
- POST /api/ai-network/provider-health
- GET /api/ai-network/provider-models
- POST /api/ai-network/provider-models (manual metadata)
- POST /api/ai-network/provider-models/sync (OpenAI, Anthropic, Gemini live discovery)
- GET /api/ai-network/provider-assignments
- POST /api/ai-network/provider-assignments
- PATCH /api/ai-network/provider-assignments/:assignmentId/status
- GET /api/ai-network/tasks
- POST /api/ai-network/tasks
- PATCH /api/ai-network/tasks/:taskId/approval
- POST /api/ai-network/tasks/:taskId/cancel
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

MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL and MINGLORA_AI_API_KEY are read only on the server. The first supported human-initiated path uses the deployed OpenAI bot-chat and Creator Studio adapters with `OPENAI_API_KEY` and `OPENAI_DEFAULT_MODEL` (or the explicitly selected legacy OpenAI key/model triplet). Both paths run behind the designated-owner/MFA gate, check provider access, moderate their input/output, enforce the shared owner/day token budget and do not expose tools or external actions. Provider-account and model-assignment records remain metadata for future routing; they are not prerequisites for this first human-initiated path. Autonomous workers and schedules remain disabled until worker identity/authentication, claim, heartbeat, completion, failure recovery and operational acceptance are implemented.

Provider environment slots, the OpenAI bot-chat/Creator Studio setup and the non-routable ChatGPT guest-session boundary are documented in [AI Provider Configuration](../../../docs/AI_PROVIDER_CONFIGURATION.md). Provider-specific credential presence is reported without exposing values; it does not mark a provider connected or enable execution.

## Provider model discovery and assignment checks

The provider model synchronization endpoint authenticates against the selected provider using private server environment credentials and imports only model IDs returned by the provider's live model-list API. It does not accept a credential in the request body. The import is bounded and idempotent against the existing provider/model/version catalogue key.

Before an assignment is written, Minglora re-checks the primary and optional fallback model against the live provider list for the three implemented providers. Missing, inactive, deprecated, retired, and shutdown models are rejected. Provider-list visibility is not an inference test; new assignments remain pending and execution remains independently disabled.

## Persistence note

The existing durable store adapter still keeps some legacy bot/team/schedule state in one JSONB row, so that subset needs normalized repositories before multi-instance worker execution. AI identities, profiles, bot conversations, messages, token budgets, task approvals, organizations and HR records already use the private relational `ai_network` schema with service-role-only access. Keep autonomous workers disabled until every remaining state domain has transaction-safe claims and multi-instance concurrency acceptance.

## Corporate governance foundation

The feature branch now includes an owner-scoped corporate workspace backed by the additive `ai_network` organization migration. It exposes department and position templates, organization creation, and per-organization department/position provisioning through the existing authenticated Supabase runtime gateway. The UI reports only records returned by the database; it does not create employees or assert that positions are filled.

The organization/workforce and HR SQL migrations and runtime Edge Function handlers are source-only until reviewed and deployed. All organization/HR write routes require the existing authenticated platform-staff authorization check and forward to the private service-role runtime; clients never access `ai_network` directly. The API deliberately reports the center unavailable when the required migration or runtime action is missing.

The feature branch includes source for owner-scoped organization creation, 20 department templates, position templates, vacancy drafts/status, AI candidate applications/review, approval-gated appointment into onboarding, employment status transitions, manager hierarchy/cycle checks and transfer history. The HR talent extension adds promotion records linked to the existing role-transfer history, human-authored performance reviews with separate finalization history, and draft/active/completed/cancelled succession plans with audit history. Promotion requires an active employee and a strictly higher-ranked position; a supporting review, when supplied, must be finalized and recommend promotion or role change. Succession plans do not appoint or promote candidates automatically. The UI uses database-backed records and never creates sample employee rows. The new talent migration and runtime handler are source-only on `feat/minglora-ai-hr-talent-management-20261114`; they are not yet deployed or enabled in production. Full onboarding/training/attendance, disciplinary processes, delegated AI appointments, department finance, and AI worker execution remain unfinished.

## Durable task queue

The feature branch includes an additive private queue migration with owner-scoped tasks, approval requests, append-only task events, idempotency, payload/budget limits, supervision-derived approval, and database-side worker leases with `FOR UPDATE SKIP LOCKED`. The current runtime control row defaults to globally paused, execution disabled and zero workers. The Minglora workspace displays the persisted control row and real task records, and permits authorized administrators to create, approve/reject and cancel tasks.

Worker claim, heartbeat, completion and failure commands are not exposed by the runtime gateway and are explicitly rejected in the SQL command until a separate worker identity/credential path exists. The queue is durable task management only; no AI model call or external side effect is executed. The task migration and updated Edge Function are source-only pending review and deployment.


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
