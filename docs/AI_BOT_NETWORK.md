## 10-billion identity scale architecture

The design baseline, routing model, shard/data-plane plan, region consistency rules, migration gates and measurable capacity acceptance criteria are documented in [AI Bot Network Scale Architecture](AI_BOT_NETWORK_SCALE_ARCHITECTURE.md). This is a design document only: it does not assert deployed shards, 10-billion capacity, regional failover, or worker concurrency.

## Latest verified checkpoint — 2026-11-18 (worker-principal source integration)

- Current repository base: `main` at `a480ae2725337541293bd1900fc34e5bd5ab13ac`. The existing AI Network PR #489 branch now reconciles directly on that main commit and is 53 commits ahead / 0 behind. Current source commit for the worker-principal integration: `9f01aa11c2b236479ea324415dbc5e582019f409`.
- Added a source-only worker-principal slice: private worker credentials stored as SHA-256 digests, explicit identity grants, owner/MFA-gated create/list/rotate/revoke endpoints, a separate bearer-authenticated worker runtime API, private Edge RPC actions and worker controls in the existing AI Network command center.
- CI on source commit `9f01aa11c2b236479ea324415dbc5e582019f409`: full repository CI **success**; AI Network syntax/regression **success**; AI Network browser acceptance with disposable fixtures **success**; worker-principal PostgreSQL 17 credential/lease/concurrency integration **success**; identity-batch PostgreSQL 17 migration/retry acceptance **success**. The separate nine-layout visual QA was still running at this checkpoint. Disposable CI evidence is not live signed-in owner acceptance.
- Read-only production Supabase baseline (existing project `gzycobgbasnqqhnympkr`, PostgreSQL 17.11): `ai_network` contains **66 base tables, all 66 RLS-enabled**. Current row counts: 1 identity, 1 separate first/last-name record, 1 profile, 1 email record, 1 provider account, 1 provider model, 1 provider assignment, 1 organization, 20 departments and 15 categories; employment and task queues remain at zero.
- The single production AI identity is the existing Avery Morgan identity. It remains private, status `created`, `enabled=false` and `fully_supervised`. Its email is a reserved `.invalid` placeholder (not a provisioned inbox); its provider account is unconfigured, assignment pending and health unknown (no live inference is claimed).
- The new worker principal, identity-grant and worker-event tables are **not present in production**. The worker migration has **not** been applied. The production task runtime remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No worker credential or live task was created.
- Existing production Render target remains `minglora-social-network-temp`; current Render deployment `dep-dbv09bqjnfac739ej7u0` is LIVE on main commit `a480ae2725337541293bd1900fc34e5bd5ab13ac`; auto-deploy is enabled on main. The worker source changes have **not** been deployed to Render or the existing Edge Function.
- Still open: signed-in owner/MFA acceptance of worker controls, review and coordinated migration approval, Edge/Node coordinated deployment, private provider credentials and verified provider health/inference, a hosted worker poller/executor, real task execution/recovery/multi-session tests, owner-authenticated end-to-end acceptance, and measured scale benchmarks. The 10-billion figure remains a design target and is not demonstrated storage or execution capacity.
- This checkpoint records a code/CI milestone only. It does not declare the Master AI Bot Network complete or authorize production worker execution.

---

## Latest verified checkpoint — 2026-11-15 (AI HR training and attendance release)

- PR #351 merged to `main` as `0fbcdc6a92bf94ac980c2015833f8ea11caaf7a1`; merge request: https://github.com/ravaunrichards/Minglora-Social-Network/pull/351.
- Added six organization-scoped HR development tables: training courses, course history, training enrollments, enrollment history, daily employee attendance and attendance correction history. All six are RLS-enabled, direct anon/authenticated grants are revoked, and the HR development RPC is SECURITY INVOKER with a locked empty search path and service_role-only EXECUTE.
- Applied existing-project migration ledger version `20261115025508`, name `minglora_ai_hr_training_attendance`.
- Rollback-only production SQL contract passed: temporary course create/publish, enrollment/idempotent assignment, start/completion with score/note, listing, human-recorded attendance, same-day duplicate reuse, correction with history, and future-date rejection. Transaction rolled back.
- GitHub checks on corrected PR head `302a6fe8d79c322df38c35debdf6c3fb526ba67d`: full Minglora suite **1,178 passed / 0 failed**; focused AI Network suite **133 passed / 0 failed**; Auth/OAuth, For You navigation, AI Network browser acceptance and LIVE/MeetWave layout workflows passed.
- Existing `minglora-runtime-state` Edge Function is ACTIVE at **v131**, with the existing custom authentication configuration (`verify_jwt=false`) preserved and the HR development command/RPC handler present.
- Existing Render free service deployment `dep-dbshuj2jnfac73cb1mpg` is **LIVE** on the same main SHA. Build reported **0 vulnerabilities**; startup logs confirm port 10000, durable Supabase persistence readiness and LiveKit connectivity. Public /api/ready HTTP validation could not be completed because the external verifier could not access the service hostname.
- Production HR counts remain zero across all six new tables; AI identity count remains zero; runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No sample identities, HR rows, human Auth users, training completions or attendance entries were retained.
- AI task register remains **2/19 verified tasks = 10.53%**. This is checklist task-count progress, not a product feature-completion estimate. Task 7 remains partial pending signed-in owner/browser/device acceptance and the rest of the full HR lifecycle. Task 3 owner identity create/list/get/edit and first real private avatar/cover upload/device acceptance remain open.

**Next action:** continue from the next unverified AI Network requirement; keep workers paused and do not fabricate owner/AI records to bypass live signed-in acceptance.

---

## Live reconciliation checkpoint — 2026-11-14 (current-main and production read-only audit)

- Repository: `ravaunrichards/Minglora-Social-Network`; audited main HEAD: `c0df74f68a1499e5c44095f9a5510f433a5d3a45`. Existing Supabase project only: `gzycobgbasnqqhnympkr` (PostgreSQL 17.11).
- Live `ai_network` schema contains **48 base tables; 48/48 have RLS enabled**. Live role audit: `anon` and `authenticated` have no schema USAGE; `service_role` has schema USAGE. This preserves the backend-only data boundary.
- Live reference data: **15 active AI categories, 20 department templates and 20 position templates**. The inspected identity/profile/name/email/provider/team/task/schedule/memory/employment records are empty; no demo identities or fake Auth users were added.
- Latest live runtime read: `minglora-runtime-state` is ACTIVE at version **129**. AI execution remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`; do not activate workers or providers during this checkpoint.
- Team/delegation implementation and its database authority guard are already merged/deployed in PRs #306/#307, with rollback-only database contract evidence. Signed-in platform-owner/API/device acceptance remains open; this does not complete Task 9.
- Current accepted checklist remains **2/19 = 10.53% by task count**. Task 3 (signed-in owner identity create/list/get/edit and genuine private avatar/cover upload) remains the next active gate. The authorized owner browser session is not available in this execution context; do not bypass it with synthetic accounts or retained test identities.
- The **10-billion identity target is an architectural objective only**. No distributed shard/region rollout, measured database capacity, identity throughput, recovery or simultaneous-worker benchmark has been demonstrated.

This is a read-only reconciliation record. It adds no production rows, changes no runtime controls, and does not claim a feature or acceptance task is complete.

---

## Team membership and AI-to-AI delegation

The additive migration 20261114142000_minglora_ai_teams_and_delegation.sql introduces owner-scoped relational teams, unique memberships, a single active lead per team, and append-only team/delegation audit events. The existing signed-in team form now submits selected bots only after each is linked to a relational AI identity; legacy JSONB team records remain visible in the command center during the transition.

Delegation is an explicit grant from an active team lead to an active member/observer. Organizational grants additionally require the recipient to be the lead's current active direct report. A grant lists permitted task types, permitted action classes, token/cost bounds and an expiry. Only read_only and content task classes can be delegated. Financial, social, external, security and moderation actions are excluded. Every delegated task is linked to the grant and delegating identity and forced into pending_approval with a human approval record. A database trigger revalidates grant activity/expiry, team status, membership roles, identity status, owner approval and organizational reporting authority before any delegated task moves to queued or running; a paused/revoked/expired grant cannot be approved or claimed. Delegation never executes a provider call or external side effect.

The runtime controls remain global_paused=true, execution_enabled=false, and max_concurrent_workers=0. The team/delegation implementation has rollback-only database contract evidence. The additive migration is applied to the existing Minglora Supabase project; the private minglora-runtime-state Edge Function is active at v122 with its existing custom authentication mode preserved; and the merged main commit edc319b85f14eccd92b19157065cc3aa748180d0 is deployed as Render deployment dep-dbs6qg95efls73edb4d0. Render build succeeded and startup logs confirmed Supabase durable persistence readiness and LiveKit connectivity. Public HTTP/API acceptance and a signed-in platform-owner/browser/device walkthrough remain unverified because the public endpoint could not be opened by the available web inspection path. Task 9 therefore remains PARTIAL. No test identities, teams, grants or tasks are retained.

# Minglora AI Bot Network

**Purpose:** A first-party AI network inside Minglora. It is a set of user-owned, clearly labelled AI assistants and coordinated bot teams—not fake member accounts and not an autonomous replacement for human community members.

## The ten approved recommendations

| Area | Product responsibility | Current implementation status |
|---|---|---|
| 1. Bot Personality Laboratory | Create distinct bots with a named purpose, tone, traits, expertise, languages and a safe capability allowlist. Reject duplicate names/personality signatures. | Relational AI identity create/list/edit is deployed; visual personality lab and full team orchestration remain pending. |
| 2. Bot Teams | Group owner-controlled bots into human-reviewed specialist teams. Teams may coordinate drafts and tasks without impersonating real people. | Relational owner-scoped teams, memberships, lead/member roles, membership audit events, limited delegation, and admin-facing grant/task controls are integrated. Production migration, private Edge gateway and Render backend are deployed; authenticated owner/device acceptance and broader operational validation remain pending. |
| 3. Smart Activity Scheduling | Schedule permitted work by time zone and cadence. Keep schedules paused until the bot, provider, safety gate and budget are ready. | Validated schedule records and pause/activation gates implemented; durable scheduler/worker pending. |
| 4. Bot Performance Center | Report actual runs, outcomes, token use, errors, approvals and costs. Never invent activity or engagement. | Real-event aggregation contract implemented; execution telemetry and dashboards pending. |
| 5. Multilingual Intelligence | User-controlled language preferences, language-aware bot profiles and opt-in translation. Preserve original content and identify translations. | BCP 47 language preferences and draft translation task types implemented; provider-backed translation and UI pending. |
| 6. AI Creator Studio | Produce user-requested outlines, captions, titles, translation drafts and content plans; require human review before publication. | Draft-job records implemented; provider generation, editor and approval handoff pending. |
| 7. Bot Security & Trust Center | Capability allowlists, least privilege, human approval, audit events, usage budgets, disclosure and emergency stop. Block financial/admin/security actions from bot delegation. | Server-enforced safety primitives, budget settings, audit events and emergency pause implemented; full policy UI, abuse testing and provider isolation pending. |
| 8. Opt-in AI Friendship & Companionship | Optional, clearly identified AI companions. Explicit consent before activation, visible AI identity and withdrawal/retention controls. | Explicit opt-in/withdrawal and 30-day retention preference implemented; companion conversation/runtime pending. |
| 9. AI Community Events | AI-hosted learning sessions, creator workshops and community activities with human ownership and opt-in invitations. | AI-disclosed draft-event records and opt-in-only invitation mode implemented; event publishing, RSVP and attendance integration pending. |
| 10. Centralized Bot Command Center | One owner dashboard for bots, teams, schedules, approvals, budgets, provider state, performance and emergency pause/recovery. | Owner-scoped command-center API and emergency pause implemented; full responsive workspace and operational controls pending. |

## Mandatory safeguards

1. Every bot is stored as an AI bot identity with a visible AI BOT label; it is never represented as a human member.
2. Different bots require distinct personality signatures. Bot teams do not erase individual identity.
3. High-impact actions require a human approval record. Approval records do not execute the underlying action.
4. Financial, Coin, payout, refund, admin-privilege, account-suspension, security-setting and destructive moderation actions are not delegable to bots.
5. Companionship is disabled by default and requires explicit acknowledgement that the companion is AI. Withdrawal is supported.
6. Schedules and bots begin paused. Emergency pause stops active bots/schedules and marks queued/running work paused without deleting history.
7. The AI Network has per-owner daily token and monthly spend limits. Actual provider usage must be recorded before metrics are displayed.
8. User content and external community material are untrusted inputs. Bots must not treat instructions inside them as authorization to reveal secrets, bypass policy or take actions.
9. AI-generated/translated content is labelled and requires human review before publication or external delivery.
10. No sample bots, simulated activity, fabricated responses or invented performance are seeded.

## Persistence and boundaries

The existing bot, schedule, run, approval, creator-job, companion-consent and community-event collections retain their current durable state adapter. Legacy aiBotTeams rows remain readable for compatibility, while new teams and membership changes use the relational ai_network.ai_teams, ai_team_memberships and ai_team_events records through the private runtime gateway. Server APIs require an authenticated Minglora session and scope all returned/modified records to the requesting owner.

The production compatibility adapter persists the pre-existing social/workspace collections in Minglora's JSONB state record. The existing production Supabase project has a dedicated `ai_network` schema with 62 RLS-enabled relational tables (verified 2026-11-17) and the 15 original categories. AI identity/profile, organization/HR, discovery/following, provider metadata and task-approval operations use server-only RPCs through the existing private `minglora-runtime-state` gateway. Browser roles have no `ai_network` schema access.

## Relational identity layer — deployed in the existing Minglora project

- Original identity migration: `20261114022043_minglora_ai_identity_runtime_api.sql`; additive owner-scoped profile registry/edit migration: `20261114030000_minglora_ai_identity_profile_edit.sql`.
- Existing server commands provide category list, identity list/search, get, create, bounded bulk creation and profile registry/edit.
- The owner-facing individual identity registry exposes database-backed search across username, display name, first name and last name, with bounded 100-record pages, previous/next navigation, result counts and a clear-search action. Requests retain the signed-in owner scope enforced by the existing registry RPC; this is interface pagination, not a 10-billion-row capacity claim.
- Initial individual identity creation now collects the same complete profile data available in the editor: qualifications, education JSON, personality JSON, voice preferences and visibility. The client validates JSON shapes before submission, and new profiles default to private until the owner explicitly chooses another visibility setting.
- Profile editing supports separate first/middle/last names, display name and username; gender/presentation, nationality and origin/current country, administrative location, IANA time zone, biography, introduction, interests, hobbies, skills, qualifications, education, personality, voice preferences, visibility and structured languages.
- The update transaction writes language/location relations plus version snapshot and audit entry. Owner identity is immutable and enforced server-side.
- AI identities are not human Supabase Auth accounts. Email metadata is not an inbox and is not marked provisioned without a real email provider confirmation.
- The migration is applied to the existing project; `minglora-runtime-state` is ACTIVE at v121. New registry/update RPCs are SECURITY INVOKER, have an empty locked search path and grant execute only to `service_role`.
- Live rollback-only integration test exercised registry and update RPCs with actual temporary writes, language/location rows, version and audit entries. Transaction rolled back; no test identity remains.
- AI identity avatar/cover uploads now route to the dedicated `minglora-ai-profile-media` bucket. The `minglora_ai_private_profile_media` migration is applied (Supabase ledger version `20261114130752`); the bucket is created lazily through the Storage API on the first owner-authenticated upload and fails closed if it is not private. Existing shared `minglora-avatars` and `minglora-covers` buckets remain public and unchanged for human profile images. AI media references persist bucket paths only; APIs return short-lived signed URLs and do not persist those URLs. The code and Edge Function v121 are deployed, but the private bucket has not yet been created because there is no owner-authorized upload in this session. A non-owner public-profile media read path governed by `profile_visibility` is not claimed as complete. Signed-in production-owner create/list/get/edit and real avatar/cover upload acceptance remain outstanding.

## Provider status

Provider account references, model catalogue metadata and per-identity assignments are persisted by the private server-only RPC. New account records begin `unconfigured` with health `unknown`; model assignments begin `pending` with health `unknown`. Live rollback-only tests verified idempotent account metadata, model metadata, assignment history and rejection of activation before a real health verifier exists. No provider credentials were added, no external provider connection or inference is verified, and no email inbox, secret-manager adapter or cost reconciliation is live. Runtime execution remains disabled and paused.

## Completion rule

A recommendation is not complete because a table, route or screen exists. Mark it complete only after provider execution where applicable, authorization/privacy tests, persisted state, responsive UI, accessibility, abuse controls, recovery tests and deployment verification all pass.


## Browser acceptance coverage

The browser acceptance suite is tests/e2e/ai-network-workspace.mjs and runs in .github/workflows/ai-network-browser-qa.yml on AI core branch pushes and relevant pull requests. It launches Chromium against the real static Minglora frontend and disposable in-memory API fixtures; it never contacts or writes to Supabase. It checks all 15 original AI categories, 249 country/territory choices, three populations, five gender choices, separate first/last-name submission and profile editing, accurate unverified/unprovisioned email status, combined discovery filters, bulk following, saved discovery groups, same-origin API calls, and responsive viewport geometry. This is UI acceptance evidence only; it does not replace authenticated live-Supabase, provider, upload or production-device acceptance.

## Owner-managed per-identity memory (limited release)

Each existing AI identity may have one `ai_memory_settings` row and zero or more `ai_memory_entries` in the private `ai_network` schema. Memory is off by default. Enabling memory requires an owner-authenticated action; long-term memory requires a separate opt-in. Short-term retention is constrained to 1–90 days, long-term retention to 30–3650 days, and the per-identity entry cap is constrained to 1–5000. Expired rows are purged during memory list/create/configure operations. Disabling memory clears its entries and resets long-term consent.

The service-only RPC `public.minglora_ai_memory_command(text, uuid, jsonb)` supports settings, listing, creation, editing and deletion. It verifies that the actor is an existing Minglora profile and the AI identity belongs to that actor, rejects credential-like keys, enforces idempotency, serializes writes by locking the identity row, and writes metadata-only audit events. Both memory tables have RLS enabled; direct anon/authenticated access and RPC execution are denied. The existing Edge Function gateway exposes the command using the same custom hashed API-key authentication as other private runtime actions.

Owner API routes:
- `GET /api/ai-network/identities/:identityId/memory`
- `PATCH /api/ai-network/identities/:identityId/memory/settings`
- `POST /api/ai-network/identities/:identityId/memory`
- `PATCH /api/ai-network/identities/:identityId/memory/:memoryId`
- `DELETE /api/ai-network/identities/:identityId/memory/:memoryId`

The AI Network owner UI exposes per-identity consent, retention, entry creation, editing, listing and deletion. Stored entries are owner-entered/managed. This release does **not** implement automatic conversation capture, provider-side inference, memory retrieval/injection into model prompts, embeddings/vector search or autonomous AI memory writes. Do not describe those behaviors as available until separately implemented and verified.


## Current verified production checkpoint — 2026-11-14

This checkpoint supersedes the earlier 34-table / v117 references above.

- Repository main and `feat/minglora-ai-bot-network-core` are synchronized at `56d968f184359bbf2f87e30632f111be0bbbdf4f`.
- Existing Supabase project `gzycobgbasnqqhnympkr` is healthy on PostgreSQL 17.11. The private `ai_network` schema contains **36 tables; 36/36 have RLS enabled**. Catalog checks confirm schema USAGE is denied to `anon` and `authenticated`, and granted to `service_role`.
- The existing `minglora-runtime-state` Edge Function is ACTIVE at **v120**. No second Supabase project, new infrastructure, worker activation, or provider activation was performed.
- Live reference data: 15 active original AI categories, 20 active department templates, and 20 active position templates.
- Live AI operational data remains empty: 0 registered AI identities, names, profiles, email identities, provider accounts/models/assignments, organizations, departments, positions, employment records, follows, queued tasks, and approvals. These zero counts are intentional; no synthetic identities, fake employees, human Auth users, or fake engagement were created.
- The single runtime-control row remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. This is a mandatory safety boundary until worker principals, per-worker authorization, budget enforcement, escalation, approval, and recovery have passed end-to-end tests.
- GitHub Actions for the current main commit report repository CI run **43593411675: success** and Minglora AI Network checks run **43593411652: success**. The AI Network Chromium browser suite passes with disposable local fixtures, not with a signed-in production owner session.
- **Still incomplete:** signed-in owner create/list/edit through the deployed HTTP/API path; real avatar/cover upload acceptance to the existing Storage buckets; actual mobile/device acceptance; real email mailbox provisioning; provider secret-manager integration, health checks and inference; organization/HR owner workflows; worker authentication and execution; AI social publishing; real provider usage/budget telemetry; and distributed capacity design/benchmarking.
- The 10-billion figure remains a design target only. No partition/shard rollout, regional failover, throughput, storage, or concurrent-execution benchmark has been completed, so no capacity claim is made.
- Security advisor review continues to show expected informational “RLS enabled without policy” findings for the private `ai_network` schema. Separate project-wide findings include the existing `public.minglora_list_my_mfa_factors()` SECURITY DEFINER RPC being executable by `authenticated` and leaked-password protection being disabled. Those unrelated Auth/MFA controls were not changed as part of this AI Network checkpoint.

The feature is not considered complete until the remaining authenticated, integration, security, recovery, deployment and capacity acceptance gates pass.


## HR talent management extension — 2026-11-14 (feature branch source only)

Branch: `feat/minglora-ai-hr-talent-management-20261114`.

The branch adds a private additive Supabase migration for AI employee performance reviews, review history, succession plans, succession history and promotion records. A service-role-only HR talent RPC supports owner-scoped review submission/finalization, succession plan creation/status transitions, promotion listing and audited promotions. The private Edge Function gateway, platform-admin-only server API routes, Minglora HR UI and focused unit tests are updated in the branch.

Promotion requires an active employee and a higher-level destination position, records the outgoing and replacement employment relationships and uses the existing transfer workflow. Optional supporting performance reviews must be finalized and recommend promotion or role change. Performance ratings and narratives are explicitly human-authored rather than fabricated model metrics. Succession plans remain administrative planning records and never make an appointment or promotion automatically.

**Not yet production-active:** this branch has not been merged; its HR talent migration has not been applied; the Edge Function has not been redeployed; automated CI and signed-in owner/device acceptance remain pending. No production identities or employees were created and the global AI worker runtime remains paused/disabled. The 10-billion identity target remains an unbenchmarked design objective, not a demonstrated storage or execution capacity.


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



## Current live AI Network reconciliation — 2026-11-14

This section supersedes older live-count and runtime-version snapshots above; historical checkpoint entries are retained as history.

- Repository inspected: `ravaunrichards/Minglora-Social-Network`; main HEAD at audit time: `6de92a83e16a664a2e3124476de682bd96c65d79`.
- Supabase target is the existing Minglora project `gzycobgbasnqqhnympkr`; no project or infrastructure was duplicated.
- Current `ai_network` base-table inventory: **48 total; 48/48 have PostgreSQL RLS enabled**. The AI schema remains a backend-only data boundary.
- Current reference templates: **15 active AI categories, 20 active department templates and 20 active position templates**.
- Live record counts are **zero** for identities, profiles, emails, provider accounts, provider models, provider assignments, organizations, departments, employment records, teams, task queue and durable schedules. No fake identities, employees, provider accounts, mailbox or test Auth users were created.
- The single AI task-runtime control remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. The private `minglora-runtime-state` Edge Function is ACTIVE at v129 with its existing custom authentication gateway unchanged.
- The private `minglora-ai-profile-media` Storage bucket is still absent (not lazily provisioned until the first real owner-authenticated upload). Owner-only avatar/cover code exists, but signed-in owner upload and non-owner visibility/follower media reads are not accepted.
- **Task 3 remains PARTIAL / ACTIVE / external acceptance blocker**: a real signed-in Minglora owner session is needed for create/list/get/edit, real private upload and device acceptance. Do not create sample users or test identities to bypass this.
- Email addresses remain metadata only without a connected mailbox provider. Provider/model records are unconfigured metadata without a secret-manager integration, verified health checks, inference or fallback execution.
- Organizational templates and HR/teams/delegation schema exist, but the actual organization, department, employee and team tables have no live records; owner-authenticated management remains to be accepted.
- **10-billion identities remain a design objective only**. Distributed partitioning/sharding, region routing, throughput/storage/write benchmarks, recovery and simultaneous execution capacity are not implemented or measured.
- Current accepted checklist remains **2/19 = 10.53% by task count**; this is not a percent-complete claim for the entire product.

## AI profile media visibility

The dedicated private AI avatar/cover bucket remains private. The owner-scoped media-read route delegates authorization to `minglora_ai_identity_media_access`, which checks identity lifecycle state, `profile_visibility`, an active AI follow for follower-only profiles, and blocks in either direction. It returns only a verified attached/ready media path; the Node server signs the URL for five minutes. The additive migration extends the existing media registry bucket constraint to accept this private AI bucket without changing the public status of existing human-media buckets. Public/follower read behavior is implemented in source but remains unverified against real owner, follower, non-follower and blocked-member sessions until the migration is reviewed, applied and deployed API/device checks pass.

## Latest verification — AI profile media visibility (2026-11-15)

PR #350 is merged and deployed. The existing private AI media bucket remains private; the new service-only access RPC applies profile visibility, active follower approval and mutual blocks. The media registry constraint has been extended and validated. The SQL behavior contract passed in a rollback-only transaction, Edge Function v130 is active and Render deployment `dep-dbshks6q1p3s73erkklg` is LIVE. Direct public HTTP acceptance and real signed-in owner upload/device acceptance remain open. No production AI identities or AI media assets were created.

## AI HR training and attendance — implementation in review

The additive HR development slice includes owner-scoped training courses, draft-to-published course controls, employee enrolments, bounded status transitions/history, daily human-recorded attendance and correction history. Only published courses can be assigned, and eligible employees must be onboarding, active or restricted. Attendance entries are limited to current employment dates and past/current dates. The HR workspace now exposes an inline correction form on each attendance record; it reuses the audited attendance write path, requires a correction reason of at least ten characters, and creates the existing correction-history event. UI correction acceptance is covered by the focused unit test. Signed-in owner/device acceptance remains outstanding.


## Owner-initiated bot conversation continuation — 2026-11-16

- A clean continuation branch, `feat/minglora-ai-network-owner-chat-20261116`, was created from current `main`; stale 178–572-commit-behind AI branches were not merged or deployed.
- The branch adds an owner/MFA-protected conversation endpoint for bots already linked to their canonical relational AI identity, an OpenAI-only server adapter with input/output moderation, no provider-side storage (`store:false`), no tools, no external-action authority, owner-scoped conversation records, idempotent request retries, measured token usage and a responsive conversation panel.
- A successful send now clears its browser request ID so the next message gets a new idempotency key; failed sends retain their key for a safe retry. The current server process serializes one active chat per owner to reduce budget races.
- Conversation/message/request/usage records currently use the existing runtime-state compatibility document; the server persistence layer revision-checks and queues writes in one process. This is **not** the required normalized/partitioned conversation data plane or a distributed lock. Dedicated transactional tables, atomic shared budget reservations, distributed leases and multi-instance tests remain mandatory before public or large-scale traffic.
- The chat path does not use or write the separate AI memory service; it sends only a bounded recent conversation history. OpenAI is the only adapter in this slice; no live credential, production inference, email mailbox or model health result has been verified.
- New service/provider tests and desktop/mobile styling are on the branch. CI and live signed-in owner acceptance are pending. No production migration, AI identity creation, worker activation, provider setting change, deployment or production data mutation has occurred.
- Runtime controls remain unchanged and paused: `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. Current production identity/profile/email/provider assignment counts remain zero. The accepted master checklist remains **2/19 = 10.53% by task count** until actual production acceptance; this is not an overall product-completion estimate.
- Detailed endpoint, security and storage boundaries: [AI Bot Conversation Runtime](AI_BOT_CHAT_RUNTIME.md).


## Current live production checkpoint — 2026-11-18

This checkpoint supersedes older deployment-target, runtime-version and live-count statements earlier in this document; prior entries remain historical.

- The owner confirmed the existing Render service `minglora-social-network-temp` as the production deployment target. It is attached to `main` with automatic deploy-on-commit enabled. Current deployment `dep-dbujetui0phs73b41lu0` is **LIVE** on commit `b7e692edd6a35bb804a3b478c8fe454dda7651b8`; startup logs show Supabase persistence durable/ready and LiveKit connected.
- The existing Supabase project `gzycobgbasnqqhnympkr` is ACTIVE_HEALTHY. The `minglora-runtime-state` Edge Function is ACTIVE at version 135.
- Production schema audit: 62/62 `ai_network` tables have RLS enabled. Browser roles have no schema USAGE or direct AI table access; service-role-only backend RPCs are the intended access path. Zero policy rows for this private schema are intentional and do not justify adding browser grants.
- Live data: 15 active AI categories; 0 AI identities/names/profiles/email records/provider accounts/models/assignments; 1 organization; 20 departments; 0 employees; 0 bot conversations/messages; 0 task rows or pending approvals. Empty data is not a missing table or missing migration.
- Deployed source includes the owner-initiated OpenAI bot-chat adapter and Creator Studio draft adapter. The live server still reports provider `not_configured`, no credentials, bot chat unavailable and Creator Studio generation unavailable. First human-initiated OpenAI requests require `OPENAI_API_KEY`, `OPENAI_DEFAULT_MODEL` and the read-only provider probe. Provider-account/model-assignment metadata is optional for this first path.
- Runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. This is an intentional autonomous-worker gate, not a blocker for identity/profile, category, organization/HR, memory, provider metadata or approval-workflow configuration.
- Private AI avatar/cover bucket is created on the first genuine owner-authorized upload; its absence does not block text-only identity/profile creation. Owner/MFA upload, browser/device acceptance and provider inference still require real owner/provider actions.
- Existing free-plan Render service is retained for the current stage. Before production worker pools or large-volume operation, complete worker-principal authentication, normalized repositories for remaining JSONB-backed state, backup/recovery, concurrency and representative capacity/region benchmarks. The 10-billion objective remains unbenchmarked.


## AI email provisioning

Minglora AI email is implemented as an app-managed virtual inbox per AI identity. It reuses the canonical `ai_network.ai_emails` record and stores messages in a private identity-scoped table. Provisioning is blocked until Resend confirms a Minglora-owned domain is verified for sending and receiving and the signed inbound webhook is active. For identities that already have a reserved `.invalid` placeholder, the provisioning RPC converts that same row instead of creating a duplicate email identity.

This does not create a Supabase Auth user or a separate paid Google Workspace/Microsoft 365 mailbox. Address-level verification remains separate from domain verification. Production activation requires an approved migration, private provider credentials, verified DNS/domain capabilities, webhook verification, a deployment to the existing service, and owner-session live send/receive acceptance.

See [AI Email Provisioning](AI_EMAIL_PROVISIONING.md) for setup and acceptance gates.
