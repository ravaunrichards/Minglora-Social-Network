# MINGLORA Resume Checkpoint

Updated: 2026-11-09
Project scope: **Minglora Social Network only**
Repository: https://github.com/ravaunrichards/Minglora-Social-Network
Active branch: `feat/personal-ai-bots-network-control-center`
Latest verified branch checkpoint: `1319977d72fd256ccefdcc67b39f143509dab841`
Draft PR: https://github.com/ravaunrichards/Minglora-Social-Network/pull/202
Existing Supabase project: `gzycobgbasnqqhnympkr`

## Original objective

Continue and complete the Minglora AI Bot Network master specification using the existing Minglora repository, branch, backend, Supabase project and services. Preserve all current Minglora functionality and user data. Do not create a second project, repository, Supabase project, fake user accounts, fake AI population, static demo data, or unverified provider/mail capacity. The 10-billion identity figure remains an architectural design objective, not a registered-identity or execution-capacity claim.

The complete master spec remains in force: three distinct AI populations; complete canonical AI identity/profile/email/provider records; 15 categories; worldwide discovery and AI social relationships; organizational governance/HR/finance; supervised and bounded autonomous execution; AI teams and collaboration; all ten specialized systems; twelve administration centres; actual analytics; and evidence-based distributed scaling.

## Completed on the feature branch (not production deployed)

### Existing Personal AI Bots foundation
- Owner-only admin API, designated MFA-verified owner gate, same-origin writes.
- All 15 original AI categories and custom category controls.
- Independent AI profile fields, separate first/middle/last names, distinct AI disclosure, disabled-by-default creation.
- Bot/team/category/network controls, allowed low-risk permissions, approvals, schedules as configuration, budgets, audit history and emergency shutdown.
- AI follow/unfollow instructions remain separate, owner-approved queue records; no autonomous social executor is enabled.
- AI activity is not counted as human popularity or human engagement.

### Canonical AI identity database foundation
- Staged migration: `supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql`.
- Tables: `ai_identities`, `ai_profiles`, `ai_names`, `ai_emails`, `ai_provider_accounts`, `ai_provider_models`, `ai_provider_assignments`, locations, languages, capabilities, permissions, owners, status history, versions and audit logs.
- First, middle and last names persist separately. AI identities do not create Supabase Auth users.
- Owner-scoped batch upsert/list through the existing server-secret gateway; service-role-only functions/RLS are staged.
- Repaired truncated capability persistence SQL; capabilities insert as disabled/unverified and have no checked timestamp until actual verification.
- Owner relationships are inserted into `ai_identity_owners`.
- Parish/county location field and index consistency repair is included.
- Identity target is exactly 10,000,000,000 in code/docs/tests; this is not live capacity.

### Durable queue and supervised worker foundation
- Staged migration: `supabase/migrations/20261109200000_minglora_ai_bot_durable_task_queue.sql`.
- Idempotency, bounded retries/backoff, lease tokens/expiry/heartbeats, missing-lease recovery, dead-letter states and `FOR UPDATE SKIP LOCKED`.
- Concurrent claims serialize on the singleton settings row; daily budget includes failed attempts.
- Owner-scoped RPCs for task upsert/claim/heartbeat/complete/fail/list/stats.
- Task creation, batch follow instructions, approvals, cancellation, queue readback and emergency shutdown mirror to PostgreSQL when deployed.
- Parent AI identity rows are persisted before child task rows.
- Network settings persist to PostgreSQL; emergency shutdown closes the database dispatch gate before cancellation.
- Separate worker core and `npm run worker:personal-ai-bots`. Worker is disabled by default, only permits four low-risk text task types, has no tools/external action permissions, and saves human-review drafts.

### Provider/model assignments and runtime gating
- Staged migration: `supabase/migrations/20261109213000_minglora_ai_provider_assignment_rpcs.sql`.
- Owner-only provider/model assignment Admin API and controls.
- Secret reference only, in the form `env:MINGLORA_AI_PROVIDER_...`; no raw keys accepted or stored.
- Provider assignments start `configured/unknown`. Server-side health checks are audited and can recover after a successful re-check.
- Queue claims require a healthy active provider and text model assignment, an available credential reference, and zero tool permissions. A healthy primary is preferred; healthy secondary assignments are eligible for fallback.
- Worker reads referenced secrets from its server environment, calls the adapter `healthCheck()`, and binds each task to its exact provider/model assignment.
- No provider adapter module, provider secret, successful health check or inference request exists yet. Runtime remains disabled.

### Email identity records
- Staged migration: `supabase/migrations/20261109220000_minglora_ai_email_identity_rpcs.sql`.
- Owner-only email address upsert/list RPC, gateway, backend API and Admin Centre panel.
- Address records are normalized/unique, with one primary per AI identity.
- New records remain `not_verified` and `not_provisioned`; clients cannot self-declare verification/provisioning or provide passwords, API keys or other secrets.
- No inbox/mailbox provider or email sending is connected.

### AI member following and saved discovery groups
- Staged migration: `supabase/migrations/20261109240000_minglora_ai_social_follow_and_saved_searches.sql`.
- Separate `ai_identity_followers` table records signed-in Minglora members following public AI identities. It is RLS-enabled and service-role only; it does not write to `public.user_follows` and is excluded from human follow counts.
- Owner/public lookup and follow-set/list RPCs support idempotent follow/unfollow, AI follower counts and per-member follow state. A follow can only be added while the AI profile is active, explicitly public and listed in discovery; existing follows can be removed even if the profile later becomes private.
- Authenticated server routes `POST/GET /api/ai/follows` use the current member session, check the existing Minglora account-block graph before following and strip internal owner identifiers from follow-list responses.
- Saved discovery searches are stored in `ai_discovery_saved_searches`, scoped to the authenticated member ID, RLS-enabled/service-role-only, with unique names, validated filter fields and a 50-search per-member cap.
- Server routes `GET/POST /api/ai/discovery/saved-searches` and `DELETE /api/ai/discovery/saved-searches/:id` call the user-scoped gateway RPCs. Discovery UI now supports follow/unfollow buttons, a followed-AI list, save/apply/delete search groups and an explicit note that these relationships never affect human follower counts.
- This is a manual member-follow feature only. AI-owned autonomous following, private-account follow requests and AI-to-member follow approval are not enabled.

### AI public profile visibility and worldwide discovery
- Staged migration: `supabase/migrations/20261109230000_minglora_ai_identity_discovery.sql`.
- Public discovery RPC supports authenticated, combined filters for gender, nationality, country of origin/current country, ISO country code, state/province, parish/county, city, language, category, profession, personality, interests and verified capabilities.
- Only AI profiles with lifecycle `active`, explicit `public_profile_enabled=true`, and profile visibility `public` can be discovered. Private and Friends profiles never appear in this public search.
- Discovery route: authenticated `GET /api/ai/discover`, using the existing server-secret runtime gateway and PostgreSQL RPC.
- Public AI profile opt-in controls added to the owner bot cards. Turning visibility down to Friends/Private automatically turns off public discovery.
- `/ai-discover.html` added and linked from the Minglora sidebar as **AI Members**.
- Discovery page provides combined multi-select filters, sorting, pagination, result cards and expandable profile details.
- Country selector uses the 249 ISO 3166-1 country/territory entries and browser-localized country names.
- Popularity/engagement ordering is not fabricated; discovery sorts only by newest/recently updated.
- AI-to-user follows, follow approvals, saved searches/groups, and direct public AI profile routes are not yet finished.

## Verification evidence

- Latest Personal AI Bots Network CI: workflow run **#249**, **110 passed / 0 failed**, Node 24, checkpoint commit `368ab70ad1820364d38d7a919ef6c11f3dcbbe48`.
- Tests include AI identity, profile fields and capability persistence; queue and worker safeguards; provider secret/health gating; email records; public profile privacy opt-in; discovery SQL/gateway/server route; worldwide country catalogue; and UI integration.
- The full repository CI has previously reported unrelated existing UI/navigation/profile/service-worker/theme failures. Those have not been suppressed; inspect the newest full CI run before any merge.
- Existing live Minglora Supabase schema was read-only inspected previously: new AI identity/provider/email/task tables were absent and the AI migration ledger had not advanced.
- None of the new AI migrations is applied to production. The runtime Edge Function is not deployed. The worker is not deployed or enabled.
- No provider adapter/credential, provider health confirmation, mailbox, production AI inference, public live profile count, load test or 10-billion capacity result is claimed.

## Remaining work — continue in this order

1. AI user-follow graph and saved discovery searches/groups, including blocks/privacy and separate AI-only counts. Do not enable AI autonomous following or message sending.
2. Public AI profile detail pages and interaction controls, with report/block and audience privacy enforcement.
3. Complete AI identity editing for all demographic/location/profile fields through the Admin API UI and verify full round-trip persistence.
4. Email provider integration and actual mailbox provisioning, only after a provider/service account is available.
5. Actual model adapter/provider integration and operational health, only after a valid provider secret/service account is available.
6. Personality Laboratory, Teams, Smart Scheduling, Performance Centre, Multilingual Intelligence, Creator Studio, Trust Centre, Companion/Friendship, Community Events and Command Centre.
7. Corporate AI board/executives, 20 departments, org charts, recruitment, appointments, HR lifecycle, delegation and permissions.
8. Finance/resource controls, model spend attribution, security/compliance, real analytics and twelve management centres.
9. Distributed scaling architecture, measured storage/query/write capacity, concurrent workers, recovery, security and desktop/mobile/production testing.

## Exact next action

Implement the AI-to-member follow graph for public AI identities, with user-authenticated follow/unfollow requests, AI-specific counts, idempotency and block/privacy checks. Add saved discovery search groups to the signed-in user. Keep autonomous bot-to-user follow execution disabled. Use existing Minglora Auth/session, existing Supabase project and the current feature branch only.

## Recovery and release constraints

On reconnection, inspect the current branch head, newest CI, actual migration files and this checkpoint. Trust live repository/database/CI state over this note. Resume the first unfinished item; do not repeat completed work. Keep PR #202 draft. Production database migrations, Edge Function deployment and worker deployment/enablement remain blocked until the required release authorization and verification are available.
