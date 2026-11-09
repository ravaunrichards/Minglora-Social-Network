# MINGLORA Resume Checkpoint

Updated: 2026-11-09
Project scope: **Minglora Social Network only**
Repository: https://github.com/ravaunrichards/Minglora-Social-Network
Active work branch: `feat/personal-ai-bots-network-control-center`
Current branch checkpoint: `f781e5edd7454fe817d53fea233ef96596698fb7`
Draft PR: https://github.com/ravaunrichards/Minglora-Social-Network/pull/202
Supabase project: `gzycobgbasnqqhnympkr` (Minglora)

## Original task and acceptance criteria

Continue and complete the Minglora AI Bot Network from the existing Personal AI Bots feature branch. Preserve the existing Minglora app, repository, Supabase project, services, accounts and user data. Do not create a second app, repository, Supabase project, independent human-account system or duplicate infrastructure.

The master specification remains authoritative: three distinct AI populations; persistent AI-only identities with separate first/middle/last names; individual profiles, email and provider/model assignments; worldwide categories and discovery; 15 original categories; corporate governance/HR/departments; supervised and bounded-autonomous operation; collaboration; finance/resource management; security/governance; the ten specialized AI systems; twelve administration centres; actual analytics; and a scalable 10-billion identity design target with real measured capacity kept separate from registered identity count.

Acceptance is not met by schema-only work. Each feature must have real persistence, backend wiring, working UI controls, security policy and targeted tests. Production rollout, provider health, mailbox provisioning, capacity or execution must never be claimed without direct evidence.

## Repository and deployment state

- Existing repository and branch are confirmed; PR #202 remains **open and draft**.
- Branch checkpoint is `f781e5edd7454fe817d53fea233ef96596698fb7`.
- Existing Supabase project is the supplied Minglora project. It was healthy when inspected.
- The AI identity and durable-queue migrations remain staged only. The live Supabase schema previously inspected did not contain the AI identity/queue tables.
- The existing `minglora-runtime-state` Edge Function changes are staged on the feature branch; they have not been deployed.
- Existing Render Minglora web service is separate from the branch review. No AI worker service has been deployed.
- No email provider/mailbox, AI provider account, model credential reference, provider health check, or real AI inference has been configured or verified.
- Do not apply migrations, deploy the Edge Function, deploy/enable a worker, or change production services without the required release authorization and verification.

## Completed and verified on this feature branch (not production-deployed)

### Existing Personal AI Bots foundation
- Owner-only API protected by the designated MFA-verified Minglora administrator and same-origin write checks.
- Fifteen built-in AI categories plus custom category management.
- AI identities remain separate from human Auth users and human engagement metrics.
- First, middle and last name fields; AI usernames; AI disclosure; profile/personality fields; disabled-by-default bot creation.
- Per-bot/category/network controls, restricted hybrid modes, budgets, schedules as configuration, bulk controls, emergency pause, audit, and team creation/membership.
- Selected-bot follow/unfollow requests remain separate approval records; no follow executor is enabled.
- Bot Teams do not automatically activate member bots.

### Canonical identity foundation
- Staged migration `supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql`.
- Canonical tables cover AI identity, names, profiles, emails, provider accounts/models/assignments, locations, languages, capabilities, permissions, owners, status history, versions and audit logs.
- Separate first/last names persist independently. No artificial Supabase Auth user is created for an AI identity.
- Batch upsert/list RPCs use service-role-only grants; the existing server-secret-protected gateway validates the designated owner and an explicit field allowlist.
- Repaired interrupted identity-table declarations and RLS placement; regression checks now verify all 27 table declarations close without trailing commas and that RLS is applied at the migration end.
- Identity design target is 10,000,000,000. This is a design target, not 10 billion existing identities or a proven live capacity.

### Durable queue, settings and worker
- Staged migration `supabase/migrations/20261109200000_minglora_ai_bot_durable_task_queue.sql`.
- Queue records have stable idempotency keys, retry counters, bounded attempts, backoff, worker leases, lease expiry/heartbeat, expired-lease recovery and dead-letter status.
- Claiming uses transactional row locks and `SKIP LOCKED`; the singleton settings row is locked during claims so multiple workers cannot overrun the concurrency cap.
- Daily execution accounting includes failed attempts, not only successful tasks.
- Owner-only task RPCs support batch upsert, claim, heartbeat, complete, fail, list and stats.
- The server-secret-protected runtime gateway exposes the queue RPCs only to the designated Minglora owner.
- Admin API task submission, bulk-follow instructions, approval/cancellation, queue readback and emergency shutdown are connected to PostgreSQL when Supabase persistence is active.
- Parent canonical AI identity records are persisted before task rows, protecting the AI-identity foreign key for previously-created bot records.
- Owner network settings (network switch, hybrid switch, concurrency, daily budget, auto-suspension and emergency-shutdown timestamp) synchronize to PostgreSQL. Emergency shutdown closes the durable dispatch gate before task/identity cancellation writes.
- Normal Admin API settings cannot toggle the separate database-only `execution_enabled` and `provider_ready` gates; both default to false.
- A separately launched worker core and `npm run worker:personal-ai-bots` entry point are staged. It requires Supabase persistence, an explicitly configured server-side provider adapter and a release-controlled worker flag. It only accepts approved, low-impact text tasks (`assistant_request`, `moderation_review`, `analytics_report`, `translation`), has no tools or external-action permission, and saves human-review drafts. It cannot publish, follow, message, react, join groups, attend events or perform live actions.
- No provider adapter is currently configured; therefore the worker remains disabled and no task is executing.

## CI and verification evidence

- Latest dedicated Personal AI Bots workflow: **run #128, success**, commit `f781e5edd7454fe817d53fea233ef96596698fb7`.
- Dedicated suite: **74 passed, 0 failed**. It includes admin API task/settings lifecycle, identity dependency ordering, migration/schema safeguards, 10-billion target assertion, draft-only worker behavior and UI checks.
- The workflow uses Node 24 and syntax-checks the worker, server entry point, gateway path coverage and bot module.
- Full repository CI on the same commit: **failure** in the general automated-test and For You navigation jobs. The previous run showed broad pre-existing UI/navigation/profile/service-worker/theme failures (28 general-suite failures and 2 For You failures); these are not suppressed and are outside this AI-network implementation. Keep them separate unless a failure is demonstrated to have been introduced by this branch.
- No live DB migration, hosted Edge Function deployment, provider request, worker process execution, mailbox provisioning, owner-browser acceptance, load test or production readiness test has been completed.

## Remaining master requirements

1. Provider/model account management API and real server-side adapters, credential references, model assignment, provider health and failover.
2. Real AI email identity provider and mailbox provisioning; schema-only email records are not operational mailboxes.
3. Public AI profile pages/media, member-facing AI disclosure, block/report and privacy controls.
4. Dedicated AI followers/following and relationship manager; private-account approvals/exclusions and any executor remain gated.
5. Personality Laboratory with live model testing; multilingual provider inference and quality checks.
6. Smart activity scheduler with timezone/DST handling, activation/deactivation and recovery.
7. Performance Centre with real queue/runtime telemetry, provider costs and task outcomes.
8. AI Creator Studio, approved draft/media flows and explicit publication boundaries.
9. Security and Trust Centre, risk/anomaly rules, consent, suspension/appeals, incident recovery and audit exports.
10. Opt-in AI friendship/companion sessions and community events.
11. Corporate AI population: board/executives, 20 departments, org charts, recruitment/appointments, HR lifecycle, delegation and department permissions.
12. Finance/resource management, model spend attribution and approved budget controls.
13. The remaining specialized systems/admin centres and analytics.
14. Real load, multi-worker concurrency, failure/restart, recovery, security, mobile/desktop and production verification.

## Exact next action

Inspect existing Minglora runtime/Render configuration for already-provisioned provider integrations without exposing secret values. Then:
1. If a real provider credential and supported provider service already exist, implement and health-check a server-side adapter that references the secret securely; persist the selected provider/model assignment to the canonical AI tables.
2. If no provider credential/service exists, keep dispatch disabled, build only the provider-adapter/credential-reference contract and record the exact external credential/provider blocker. Do not invent a key or report inference as connected.
3. Add provider routing, failure/fallback and usage-budget tests; keep the worker's no-tools, human-review-only boundary.
4. Update this checkpoint after each verified milestone.
5. Keep PR #202 draft; do not merge or deploy production changes without release authorization.

## Resume rules

On reconnection, inspect the latest branch tip, CI and this checkpoint first. Trust actual repository, CI and database state over this file if they differ. Continue the first unverified requirement, preserve completed work, do not repeat completed steps, stay exclusively on Minglora Social Network, and never claim staged/deployed/operational functionality without evidence.
