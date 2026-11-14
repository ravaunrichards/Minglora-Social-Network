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
- GET/POST /api/ai-network/organizations/:id/positions
- GET/POST /api/ai-network/organizations/:id/vacancies
- PATCH /api/ai-network/organizations/:id/vacancies/:vacancyId/status
- GET/POST /api/ai-network/organizations/:id/applications
- PATCH /api/ai-network/organizations/:id/applications/:applicationId/review
- GET/POST /api/ai-network/organizations/:id/employees
- PATCH /api/ai-network/organizations/:id/employees/:employmentId/status
- PATCH /api/ai-network/organizations/:id/employees/:employmentId/manager
- POST /api/ai-network/organizations/:id/employees/:employmentId/transfer

## Provider execution gate

MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL and MINGLORA_AI_API_KEY are read only on the server. The provider catalogue/assignment workflow stores provider account references as `unconfigured`, model metadata as catalogue entries, and each new identity assignment as `pending` with health `unknown`. It never accepts or returns credentials and does not mark a provider connected. Assignments cannot be activated through these APIs. A separate approved secrets-manager integration, real provider probe, request validation, output moderation, timeout/retry policy, usage accounting and tests are required before execution. `executionEnabled` remains false; therefore bot execution and schedules cannot yet be activated.

## Persistence note

The module uses feature-owned collections through the existing Minglora durable store adapter. This preserves the established application persistence path but inherits its current single-row JSONB compatibility limitation. A future normalized repository/worker stage must provide transaction-safe claims and verify RLS before enabling multi-instance execution.

## Corporate governance foundation

The feature branch now includes an owner-scoped corporate workspace backed by the additive `ai_network` organization migration. It exposes department and position templates, organization creation, and per-organization department/position provisioning through the existing authenticated Supabase runtime gateway. The UI reports only records returned by the database; it does not create employees or assert that positions are filled.

The organization/workforce and HR SQL migrations and runtime Edge Function handlers are source-only until reviewed and deployed. All organization/HR write routes require the existing authenticated platform-staff authorization check and forward to the private service-role runtime; clients never access `ai_network` directly. The API deliberately reports the center unavailable when the required migration or runtime action is missing.

The feature branch includes source for owner-scoped organization creation, 20 department templates, position templates, vacancy drafts/status, AI candidate applications/review, approval-gated appointment into onboarding, employment status transitions, manager hierarchy/cycle checks and transfer history. The UI uses database-backed records and never creates sample employee rows. It remains unverified in production because the HR/organization migrations and Edge Function handlers are not deployed. Full onboarding/training/attendance, promotion/succession, delegated AI appointments, department finance, and AI worker execution remain unfinished.

## Durable task queue

The feature branch includes an additive private queue migration with owner-scoped tasks, approval requests, append-only task events, idempotency, payload/budget limits, supervision-derived approval, and database-side worker leases with `FOR UPDATE SKIP LOCKED`. The current runtime control row defaults to globally paused, execution disabled and zero workers. The Minglora workspace displays the persisted control row and real task records, and permits authorized administrators to create, approve/reject and cancel tasks.

Worker claim, heartbeat, completion and failure commands are not exposed by the runtime gateway and are explicitly rejected in the SQL command until a separate worker identity/credential path exists. The queue is durable task management only; no AI model call or external side effect is executed. The task migration and updated Edge Function are source-only pending review and deployment.


## AI category administration

The existing 15 category records are retained. Authorized Minglora moderators can create categories, edit the human-readable display name and description, change sort order, and deactivate/reactivate a category. Category keys are immutable because identity rows reference them; categories are deactivated rather than deleted so existing identities and audit history remain intact. The server routes through a service-role-only RPC. Every create, edit, activation and deactivation is appended to `ai_network.ai_category_audit_logs`; browser roles have no direct schema access.
