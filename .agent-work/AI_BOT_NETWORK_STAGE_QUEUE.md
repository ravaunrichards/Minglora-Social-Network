## Latest AI profile-media deployment checkpoint — 2026-11-14

This section supersedes the older media and branch checkpoint details retained below.

- PR #301, **Secure AI identity profile images with private Storage**, merged into `main` as commit `e26cb622c6f59878006f85ff80c7da8085919472`. Its CI, AI Network syntax/regression tests, Auth/OAuth acceptance, For You navigation, and LIVE/MeetWave layout matrix all passed. PR #302, **Align private AI media migration checkpoint**, subsequently merged as commit `eb66bfb699d14149ba14cba2cf510739672bf0ab`; its CI, AI Network regression, Auth/OAuth, navigation and layout checks all passed.
- `main` and `feat/minglora-ai-bot-network-core` are synchronized and compare identical at `eb66bfb699d14149ba14cba2cf510739672bf0ab` (post-PR #302).
- The existing Supabase project `gzycobgbasnqqhnympkr` has migration `minglora_ai_private_profile_media_20261114125814` applied in its ledger as version `20261114130752`. The canonical repository migration path is `supabase/migrations/20261114130752_minglora_ai_private_profile_media.sql`; PR #302 aligned the filename to the applied version without changing SQL or re-applying DDL.
- `minglora-runtime-state` is ACTIVE at **v121** with the existing custom gateway authentication setting unchanged (`verify_jwt=false`). The AI profile-media RPC now accepts only `minglora-ai-profile-media`.
- AI avatar/cover upload preparation provisions `minglora-ai-profile-media` through Supabase Storage API as `public=false`, with image MIME restrictions and a 20 MiB bucket ceiling. If an existing bucket is not private or provisioning cannot be verified, the upload fails closed. Completion, deletion and signing allowlists include the private bucket; AI profile media URLs are short-lived signed URLs and are not persisted as canonical references.
- The private bucket is **not yet created** in Storage because creation is lazy and no signed-in owner upload has been performed. `minglora-avatars` and `minglora-covers` remain `public=true` and unchanged for human profile photos. No direct writes to Storage metadata tables were made.
- Live verification after deployment: 36/36 AI tables have RLS; 15 categories, 20 department templates and 20 position templates remain active; AI identity count is zero; private AI media object count is zero; global pause remains true, execution disabled, and max workers zero. No Auth users, providers, workers, identities or test media were created.
- **Task 3 remains PARTIAL / ACTIVE:** authenticated owner create/list/get/edit, actual private avatar/cover upload, and device acceptance still need a real signed-in Minglora owner session. The current private media GET path is owner-scoped; public/follower media serving governed by `profile_visibility` is not claimed complete. Render HTTP acceptance is still unverified because the service workspace/browser session is unavailable and the prior endpoint probe failed DNS resolution.
- Overall task accounting remains **2/19 acceptance tasks complete (10.53% by task count)**. This is checklist progress, not feature-completion or 10-billion capacity evidence.

**Next action:** obtain an authorized signed-in platform-owner browser session for Task 3 acceptance. Do not ask for, store, or expose passwords, access tokens or provider credentials.

---

# Minglora AI Network — Active Ordered Execution Tracker

## Latest verified checkpoint — 2026-11-14

This is the current source of truth. Older checkpoint statements below are retained for traceability and are superseded where they conflict with this section.

- Repository: `ravaunrichards/Minglora-Social-Network`
- Working branch: `feat/minglora-ai-bot-network-core`
- Feature branch head before this checkpoint: `a7288acdfa2bba6da183681b2d6b2c1369b0986b`
- Main head: `6cdbe4e16a322e0e1a9f1d6a66daf63686c18a8c`
- Feature branch comparison at inspection: **20 commits ahead, 0 behind** main. No force push was used.
- Task 1 tracker reconciliation was merged by PR #296 (`2198f26379d36b4c41b6e027433088c53f7e4821`).
- Latest branch verification: full repository CI #11482 **passed**; AI Network checks #170 **passed**; browser acceptance #24 **passed**. Browser acceptance uses disposable in-memory HTTP fixtures and a synthetic local test member; it is not signed-in production-owner acceptance.
- Existing Supabase project: `gzycobgbasnqqhnympkr`, ACTIVE_HEALTHY, PostgreSQL 17. No additional project or repository was created.
- Applied AI migration ledger includes `20261114115906` (`minglora_ai_identity_memory`). `minglora-runtime-state` is ACTIVE at version 120 and its deployed source contains the allowlisted `ai_memory_command` handler, including update.
- Live `ai_network` inventory: 36/36 base tables have RLS enabled; the schema is private to the backend runtime. Memory tables have no SELECT privilege for `anon` or `authenticated`, while `service_role` has the required backend access. Identity/profile and memory RPCs are SECURITY INVOKER, have an empty locked search path, and deny function execution to `anon`/`authenticated`; `service_role` is granted execution.
- Live reference data: all 15 original AI categories are active, 20 department templates and 20 position templates exist, and one AI task-runtime control row exists. The row remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No worker execution was activated.
- Rollback-only production database contract test **passed** for AI identity create, separate first/last name persistence, email metadata (`unverified` / `not_requested`, no inbox claim), identity get, idempotent retry, owner-scoped profile update/versioning, list/search, and a two-record bulk create. The test ran inside a rollback-only subtransaction; post-test counts are zero for identities, names, profiles, emails, identity audit rows and identity versions. No test identity or fake data was retained.
- Live memory verification: settings and entry tables exist with RLS; the memory RPC is service-role-only; settings, entry and memory audit row counts remain zero. Memory is owner-managed storage only; automatic model recall and conversation capture are not connected.
- Worldwide country selector contains 249 unique country/territory codes and is covered by the unit/browser checks.
- Security advisor findings remain for follow-up: AI tables are intentionally RLS-enabled with no direct client policies and server-only grants; project-wide advisor warnings also include leaked-password protection disabled. No unrelated Auth setting or existing public-table policy was changed here.

## Active task and verified accounting

| # | Dependency-ordered task | Status | Current evidence / remaining acceptance |
|---:|---|---|---|
| 1 | Reconcile the execution tracker with the current branch, migration ledger, live schema, runtime safety controls and test evidence | **COMPLETED** | Tracker PR #296 merged to `main`; latest branch CI verifies current tracker source. |
| 2 | Relational foundation and private runtime boundary | **COMPLETED** | 36/36 tables RLS-enabled; server-only schema/function grants and identity/memory RPC security verified. |
| 3 | Individual AI identity creation, names, profile and safe bulk lifecycle | **PARTIAL — ACTIVE / EXTERNAL ACCEPTANCE BLOCKER** | Real Supabase RPC create/get/list/edit/idempotency/bulk contract passed inside a rollback-only transaction. The signed-in HTTP/API path through Minglora's real authenticated session, durable user-approved registration, real Storage avatar/cover upload, and actual device acceptance remain unverified. No authenticated owner session is available in this execution context; do not create a demo identity or artificial Auth user to bypass this. |
| 4 | AI email identity records and genuine mailbox provisioning | **PARTIAL — METADATA ONLY** | Email identity metadata is persisted as unverified/not-requested. Genuine mailbox provisioning and verification still require a connected email provider. |
| 5 | Provider accounts, model catalogues, assignments, secret custody, health and routing | **PARTIAL — METADATA ONLY** | Catalogues/assignments exist; secret-manager integration, provider health probes, inference, fallback routing and actual usage reconciliation remain unverified. |
| 6 | Worldwide AI discovery, saved groups, following and privacy approval | **PARTIAL** | Combined discovery/following has CI and fixture-browser evidence; signed-in production-owner acceptance remains open. |
| 7 | Corporate governance, departments, positions, recruitment and employment lifecycle | **PARTIAL** | Schema and 20/20 templates exist; live organization/workforce rows are empty and owner-authenticated operations remain unverified. |
| 8 | Supervision levels, task approvals, delegation boundaries and durable task queue | **PARTIAL — SAFE/PAUSED** | Task/approval schema and API guards exist; workers remain paused/disabled. |
| 9 | AI teams, cross-department collaboration and authorized AI-to-AI delegation | **NOT COMPLETE** | Enforced membership, delegation, isolation and escalation need end-to-end implementation and tests. |
| 10 | Smart scheduling, worker identity, leases, retries and crash recovery | **NOT COMPLETE — EXECUTION DISABLED** | Scheduling/worker infrastructure must remain off until worker principals, per-worker authorization, budgets, pause and recovery tests pass. |
| 11 | AI social participation: posts, comments, reactions, groups, messaging, stories and LIVE | **NOT COMPLETE** | Integration with real Minglora social systems and user privacy needs end-to-end implementation and tests. |
| 12 | AI Creator Studio and community events with human review | **PARTIAL** | Draft contracts exist; provider-backed generation, publish handoff, RSVP and moderation are not verified end-to-end. |
| 13 | Individual memory, knowledge retrieval, multilingual intelligence and model capabilities | **PARTIAL** | Owner-managed memory CRUD, retention and consent revocation are deployed; automatic recall/capture, knowledge retrieval, provider-backed translation/voice/vision and behavioral evaluation remain unverified. |
| 14 | Security, trust, lifecycle, moderation and emergency governance | **PARTIAL** | Private RPC and pause guards exist; full prompt-injection/abuse testing, credential isolation, retention and administrative controls remain. |
| 15 | Finance, budgets, compute/storage metering and resource management | **NOT COMPLETE** | Actual resource usage events, budgets and reporting remain to be implemented; agents may not authorize real-money transfers. |
| 16 | Twelve administration centers, real analytics, alerts and downloadable reports | **PARTIAL** | Some command-center/governance primitives exist; complete operational metrics must be event-backed, never placeholders. |
| 17 | Distributed capacity architecture for the 10-billion registered-identity design target | **NOT STARTED** | Partitioning/sharding, region routing, distributed queues, caching, recovery and measured capacity/load benchmarks remain. |
| 18 | Cross-device accessibility, security, regression and production acceptance | **PARTIAL** | CI and local fixture-browser suites pass; signed-in owner, deployed API, Android, desktop and real mobile acceptance remain open. |
| 19 | Final integration, operational runbooks, release and evidence-based completion report | **NOT STARTED** | Must follow all prior acceptance gates, full CI, deployed E2E, security, recovery and capacity tests. |

**Task accounting:** 2/19 tasks completed (**10.53%**); 1/19 task active/partially accepted (**5.26%**); 16/19 tasks not started (**84.21%**). Overall verified task completion remains **10.53%**. Incomplete work is 17/19 (**89.47%**) when the active partial task is included. This is a checklist count, not a claim that the product is 10.53% feature-complete.

**Next task:** Continue Task 3 only: complete the signed-in Minglora owner HTTP/API and real profile-media acceptance using an authorized owner session; then commit and close Task 3 before starting Task 4. Do not create demo identities, artificial Supabase Auth users, or fabricated provider/email records.

---

## Current verified checkpoint — 2026-11-14

This section supersedes older status statements retained below for historical traceability. Work remains exclusively in the existing Minglora Social Network repository and existing Minglora Supabase project.

- Repository: `ravaunrichards/Minglora-Social-Network`
- Working branch: `feat/minglora-ai-bot-network-core`
- Branch head before this tracker commit: `01b98163f5ae952cf176098a0cd73532b7bf0068`
- Released `main` at inspection: `c945e1de458b734a66021a01387f353136201765`
- The feature branch contains the released `main` tree plus its execution checkpoint; no unrelated projects or infrastructure are in scope.
- Supabase project: `gzycobgbasnqqhnympkr` (ACTIVE_HEALTHY, PostgreSQL 17).
- Applied AI migration ledger through `20261114070550` (`minglora_ai_network_foreign_key_indexes`).
- Live `ai_network` inventory: 34 base tables; all 34 have RLS enabled; schema access remains server-only; 14 public AI RPCs are SECURITY INVOKER with an empty locked search path and execution denied to `anon`/`authenticated`, granted to `service_role`.
- Current live data: 15 original active categories, 20 department templates, 20 position templates, one runtime-control row; zero AI identities, names, profiles, emails, provider accounts/models/assignments, organizations, employees, follows, tasks or approvals. Empty identity/workforce tables are intentional; no demo records were inserted.
- The live runtime-control row remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. Worker execution must remain disabled until independent worker identity/authentication and authorization boundaries are implemented and tested.
- Existing `minglora-runtime-state` Edge Function is ACTIVE at version 119. Provider catalogue/assignment records are metadata only; there is no verified provider secret-manager adapter, provider health connection, model inference, or email inbox provisioning.
- Latest observed repository CI for the immediately preceding branch checkpoint: run #11459 completed successfully. The earlier AI Network and browser workflow evidence is documented below; browser acceptance used disposable local fixtures, not a signed-in production owner.
- Render deployment status and logs are not a substitute for a successful authenticated public HTTP/API check. Signed-in owner acceptance and actual Android/desktop/mobile device acceptance remain open.
- No production database mutation, AI registration, human Auth account creation, credential change, worker activation, provider activation, or email provisioning was performed during this inspection.

## Ordered checklist and real task accounting

One task is active at a time. A task is complete only when its own acceptance evidence is verified. Parent phases that remain partial are not counted as completed tasks.

| # | Dependency-ordered task | Status | Acceptance boundary |
|---:|---|---|---|
| 1 | Reconcile the execution tracker with the current branch, migration ledger, live schema, runtime safety controls and test evidence | **COMPLETED** | This checkpoint was committed to the existing AI feature branch; older conflicting status notes are explicitly historical. |
| 2 | Relational foundation and private runtime boundary | **COMPLETED** | 34/34 AI tables RLS-enabled; private schema privileges, 14 service-only RPC grants and AI foreign-key index coverage verified; existing 15 categories and templates retained. |
| 3 | Individual AI identity creation, names, profile and safe bulk lifecycle | **PARTIAL** | Source and database RPC/UI exist; separate first/last names and idempotent 1–100 batch path are implemented. Signed-in owner create/list/get/edit/bulk and real profile persistence acceptance remains. |
| 4 | AI email identity records and genuine mailbox provisioning | **PARTIAL — METADATA ONLY** | Email metadata schema exists. Records must remain unverified/not-requested until a connected email provider confirms a real mailbox; no inbox is currently claimed. |
| 5 | Provider accounts, model catalogues, assignments, secret custody, health and routing | **PARTIAL — METADATA ONLY** | Catalogues/assignments and activation guards exist. Secret-manager integration, provider health probes, inference, fallback routing and actual usage reconciliation remain unverified. |
| 6 | Worldwide AI discovery, saved groups, following and privacy approval | **PARTIAL** | Combined discovery and follow workflows have rollback-only test evidence; authenticated production-owner and device acceptance remains. |
| 7 | Corporate governance, departments, positions, recruitment and employment lifecycle | **PARTIAL** | Live schema/migrations and templates are present; actual organization/workforce tables are empty. Complete owner-authenticated operational acceptance and missing lifecycle coverage remain. |
| 8 | Supervision levels, task approvals, delegation boundaries and durable task queue | **PARTIAL — SAFE/PAUSED** | Task/approval schema and APIs exist; human approval and observation-only guards were tested. Worker claims and execution remain blocked. |
| 9 | AI teams, cross-department collaboration and authorized AI-to-AI delegation | **NOT COMPLETE** | Team records/coordination UI and enforced membership/delegation, isolation and escalation need end-to-end implementation and tests. |
| 10 | Smart scheduling, worker identity, leases, retries and crash recovery | **NOT COMPLETE — EXECUTION DISABLED** | Scheduling/worker infrastructure must not run jobs until independently authenticated worker principals, per-worker authorization, budgets, pause and recovery tests pass. |
| 11 | AI social participation: posts, comments, reactions, groups, messaging, stories and LIVE | **NOT COMPLETE** | Must integrate with existing Minglora social systems, keep AI disclosures visible and enforce member privacy; no human engagement may be fabricated. |
| 12 | AI Creator Studio and community events with human review | **PARTIAL** | Draft records/contracts exist; provider-backed generation, edit/version workflows, publish handoff, RSVP and event moderation are not verified end-to-end. |
| 13 | Individual memory, knowledge retrieval, multilingual intelligence and model capabilities | **NOT COMPLETE** | Implement consent-aware memory update/export/deletion, source-grounded retrieval, language preferences and provider-backed translation/voice/vision only where configured. |
| 14 | Security, trust, lifecycle, moderation and emergency governance | **PARTIAL** | Core private RPC, owner isolation, audit/version and pause guards exist; credential isolation, prompt-injection/abuse testing, retention and full administrative operations remain. |
| 15 | Finance, budgets, compute/storage metering and resource management | **NOT COMPLETE** | Implement traceable budgets and actual usage events; AI agents must never independently authorize real-money transfers. |
| 16 | Twelve administration centers, real analytics, alerts and downloadable reports | **PARTIAL** | Some command-center and governance primitives exist; operational metrics must come from real identity/task/provider/resource events, never placeholders. |
| 17 | Distributed capacity architecture for the 10-billion registered-identity design target | **NOT STARTED** | Design partitioning/sharding, region routing, indexing, queue/worker pools, caching, recovery and measured storage/query/write/concurrency limits. No capacity claim before load testing. |
| 18 | Cross-device accessibility, security, regression and production acceptance | **PARTIAL** | Existing automated tests passed at recorded checkpoints; signed-in owner, real Storage upload, API, Android, desktop and mobile acceptance remains. |
| 19 | Final integration, operational runbooks, release and evidence-based completion report | **NOT STARTED** | All prior tasks must meet their exit criteria; then run full CI, security/advisor checks, deployed E2E, recovery and capacity tests before any completion claim. |

**Task accounting after this checkpoint:** 2/19 completed (**10.53%**); 0/19 currently in progress at checkpoint close; 17/19 incomplete (**89.47%**). This is task-count progress, not a claim that the overall product is 10.53% functionally complete. The broader ten-stage acceptance gate remains 1/10 fully complete where the evidence below says so.

**Next task:** Task 3 — Individual AI identity creation, names, profile and safe bulk lifecycle. Work on that task only, beginning with source/API/test inspection and authenticated acceptance gaps. Do not create sample identities to make acceptance appear complete.

---

## Current production verification override — 2026-11-14 (after PR #293 and PR #294)

Canonical release: Minglora only; main `b60ef07bd5307239fd543099170c9fca7cd31e1b`.

| Stage | Current status | Latest evidence / remaining exit criteria |
|---|---|---|
| 1. Relational foundation and private runtime | **COMPLETED** | 34/34 AI tables have RLS; anon/authenticated have no `ai_network` schema access; service-only RPCs and 15 active categories verified. PR #294 added the 31 audited missing FK indexes; live catalog now reports 0 uncovered AI foreign keys. |
| 2. AI identities and profiles | **PARTIAL — CURRENT** | PR #293 merged and Render-deployed: Bot Personality Lab creates a private relational AI identity with separate names, category, profile/personality and idempotent bot link. Name/profile/email/provider schema exists. Signed-in owner create/get/edit/upload acceptance, actual production identity records and device acceptance remain. |
| 3. Discovery and following | **PARTIAL** | Combined filters, follow/unfollow, bulk duplicate suppression, privacy approval and saved-group lifecycle passed rollback tests. Authenticated UI/device acceptance remains. |
| 4. Corporate governance and HR | **PARTIAL** | 20 department and 20 position templates; application review, gated appointment, employment transitions, management hierarchy, transfer/history and owner isolation passed rollback tests. Additional HR/UI/device tests remain. |
| 5. Supervision, task queue and teams | **PARTIAL — EXECUTION PAUSED** | Approval queue, observation-only mode, idempotency and cancellation tested. Worker execution is intentionally unavailable until worker identities/credentials and per-worker authorization are implemented and verified; team orchestration remains. |
| 6. Social/creator/community | **NOT COMPLETE** | Real AI-labelled posts, messages, groups, stories, LIVE, Creator Studio publishing and events integration are not verified end-to-end. |
| 7. Providers, memory and finance | **PARTIAL — METADATA ONLY** | Provider account/model metadata and pending assignments exist; no live provider inference, protected provider secret reference, inbox provisioning, memory runtime or cost reconciliation is verified. |
| 8. Admin/security/analytics | **PARTIAL** | RLS, owner-scoped RPCs, version/audit and emergency pause controls verified; full admin centers, alerts and operational analytics remain. |
| 9. Distributed architecture / ten-billion target | **NOT STARTED** | No distributed-shard, storage/query/write/recovery or simultaneous-execution benchmark supports a 10-billion capacity claim. |
| 10. Production/device acceptance | **PARTIAL** | PR #293 and #294 checks passed; Supabase migration version `20261114070550` applied; Render deployment `dep-dbs0gh68bjmc73e0e680` LIVE on `b60ef07`; Render logs show server startup, Supabase persistence ready and LiveKit connected. Signed-in owner acceptance and Android/desktop/mobile tests remain. |

### Latest merged changes — 2026-11-14
- PR #293 merged as `74bd9aadff2a692723ebeeab9443c555ad735deb`: Bot Personality Laboratory now creates a canonical private relational AI identity and links it to the owner-scoped bot record. It does not create a human Auth user, provision an email inbox or enable model execution.
- PR #294 merged as `b60ef07bd5307239fd543099170c9fca7cd31e1b`: added 31 missing AI Network foreign-key indexes. Full suite 1,087/1,087 passed; focused AI Network 102/102 passed; Auth, For You navigation and layout QA passed.
- Supabase migration name `minglora_ai_network_foreign_key_indexes`, ledger version `20261114070550`; exact live catalog check returns 0 missing AI Network FK indexes. 34/34 AI tables retain RLS. Advisor has 0 `ai_network` unindexed-FK findings; 38 remaining findings are outside the AI schema and were not changed.
- Existing project/service only: Supabase `gzycobgbasnqqhnympkr`; Render `minglora-social-network-temp`. No new paid infrastructure or development database branch created.
- Worker queue claim/heartbeat/complete/fail remain blocked by an explicit authentication guard. Provider layer is metadata-only with no verified provider adapter or configured credentials. Keep `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- Browser acceptance uses local in-memory fixtures; it is not proof of signed-in owner production acceptance. External public URL access and mobile/desktop owner-session testing remain outstanding.

### AI category administration — deployed 2026-11-14
- PR #286 merged as `8297214f08da128980a4d156c0efee602751bcc4`; PR #288 SQL repair/privilege hardening merged as `b88ac94846405e03bc4f8e3c86cd8feea41b2e83`.
- Moderator-only API/UI supports category list, create, edit display name/description/sort order, activate/deactivate. Keys are stable and categories are never deleted.
- Applied migration `20261114053137_minglora_ai_category_management`; private SECURITY INVOKER RPC, empty search path, audit RLS and least-privilege grants verified.
- Rollback-only database create/update/deactivate test wrote three audit events, then rollback verified no probe category/audit rows remained. Production retains 15 original categories; AI identity/email/profile records remain zero.
- AI Network regression, repository CI, Chromium browser acceptance and layout matrix passed. Browser tests use disposable in-memory fixtures, not authenticated production owner sessions.
- Edge v119 ACTIVE; Render deployment `dep-dbrv4bh5efls73e5s1j0` LIVE. Runtime stays globally paused/disabled with zero workers.
- Overall 1/10 fully completed stage gates = 10%; Stage 2 remains partial because the owner-authenticated identity/profile/device acceptance criteria are outstanding.

### AI Network foreign-key indexing — deployed 2026-11-14
- Before the migration, live catalog audit identified 31 AI Network foreign keys without a covering child-side index.
- PR #294 merged the additive, retry-safe index migration as `b60ef07bd5307239fd543099170c9fca7cd31e1b`; Supabase ledger version `20261114070550`.
- Rollback-only preflight temporarily created all 31 indexes, verified zero missing FK indexes inside the transaction, and rolled back; a second query confirmed the original 31 were still absent before permanent application.
- After migration application, live catalog reports 0 missing AI Network FK indexes; all 31 new indexes are present and valid; 34/34 AI tables remain RLS-enabled.
- Supabase performance advisor now reports zero unindexed foreign-key findings in `ai_network`. 38 remaining project-wide findings are in other Minglora schemas and were not changed.

### Live evidence and hard safety gates
- Earlier implementation merge: PR #280 `2f736e7145e62cf8c2df786d26ac48a61fb4b355`; latest release main: PR #288 `b88ac94846405e03bc4f8e3c86cd8feea41b2e83` (following category feature PR #286 `8297214f08da128980a4d156c0efee602751bcc4`).
- Tested PR head: `d0e818c34cfc42b69ed63940469186dc8b58ef97`; focused AI run 43550189796 passed (81/81); full CI run 43550189822 passed; visual QA run 43550189846 passed.
- Existing Supabase project: `gzycobgbasnqqhnympkr`; identity/profile/media/category migrations applied; `minglora-runtime-state` Edge Function ACTIVE at v119 with custom auth setting preserved (`verify_jwt=false`). Category migration ledger version is `20261114053137`.
- Existing free Render service URL: `https://minglora-social-network-temp.onrender.com`; deployment `dep-dbrv4bh5efls73e5s1j0` is LIVE on main `b88ac94846405e03bc4f8e3c86cd8feea41b2e83`. The external browser verifier could not open the URL independently; treat platform status/logs as deployment evidence, not public-browser acceptance.
- Rollback-only transactions verified identity-profile edits, discovery/following, corporate/HR, tasks/approvals and provider metadata/activation guard. Every transaction rolled back; no test rows were retained.
- Both new RPCs are SECURITY INVOKER with locked empty search path; only service_role can execute. All 34 AI tables remain RLS-enabled.
- Post-rollback counts are zero for all tested identity, follow, workforce, task and provider tables.
- Runtime remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`; worker claims are rejected.
- No fake identities, human Auth accounts, provisioned inboxes, connected-provider claims or fabricated capacity metrics.
- Public URL access through the external browser and signed-in UI/device tests remain unverified.

**Conservative progress: 1/10 full stage gates complete = 10%.** Stage 2 is current; partial stages do not count complete. PR #284 adds local-fixture browser coverage only and does not close Stage 2.

## AI-NETWORK-00 — Scope and identity recovery
**Status:** COMPLETED
- Verify canonical Minglora repository and branch.
- Recover all ten approved recommendations.
- Document safeguards and existing implementation gaps.

## AI-NETWORK-01 — Domain foundation and owner security
**Status:** VERIFYING
- Bot Personality Lab records and distinct personality rules.
- Owner-only bot/team/schedule/job/event/approval records.
- AI identity and capability allowlist.
- Hard denylist for financial, account, admin, security and destructive actions.
- Mandatory approval records for high-impact operations.
- Dedicated store collections and authenticated API routes.
- Unit/regression tests.
**Acceptance:** all tests pass; cross-owner access is rejected; no live actions or generated responses are fabricated.

## AI-NETWORK-01A — Relational AI identity persistence
**Status:** PARTIAL — identity persistence deployed; signed-in owner acceptance remains outstanding
- Existing `ai_network` schema and 15 categories verified in the existing Minglora Supabase project.
- Server-only RPC source supports owner-scoped category listing, paged list/search, get, one-at-a-time create, and batches up to 100.
- Separate first/last names, unique username/profile identifier, idempotency, identity ownership, profile/gender, language/location, audit/version/status records and optional email identity metadata.
- No Supabase Auth user is created for an AI identity.
- Email metadata is recorded as unverified / not requested until a connected email provider confirms provisioning.
- Service-role-only grants; browser roles retain no access to the private `ai_network` schema.
- PR #294 applied 31 audited child-side indexes; live AI Network FK coverage now has 0 missing relationships. See the latest checkpoint at the top.
- Authenticated Node API and private runtime-gateway source added; actual UI identity registry reads live API results.
- Rollback-only database tests passed create/get/list/search/idempotent retry, bounded bulk create, two primary/non-primary language records and separate origin/current location records; transactions rolled back and production row count remains zero.
- PR #293 full repository CI: 1,084 tests passed; PR #294 full repository CI: 1,087 tests passed and focused AI Network tests: 102 passed; Auth, navigation and layout workflows passed.
**Acceptance before COMPLETED:** signed-in owner create/get/list/bulk/edit/upload tests, verify the individual row relationships through Supabase, then verify desktop/mobile UI and real Storage upload. Discovery filters/saved groups, following and provider assignments remain separate Phase 2 work.
**Runtime reconciliation:** the feature-branch Edge Function is now current `main` plus the AI gateway handler and AI collection group; an exact normalized comparison confirmed all other runtime source is preserved, including newer video playlist/channel entries.
**Safety boundary:** identity/profile/category/media foundation is deployed. Worker/provider execution remains closed; no inbox or provider is claimed connected. Runtime controls stay globally paused, execution disabled and worker count zero.

## AI-NETWORK-02 — Central AI Bot Command Center
**Status:** READY
- Responsive workspace and navigation entry.
- Provider readiness, pause state, budget and safety indicators.
- Bot/team/schedule lists, approval queue, creator drafts and event drafts.
- Emergency pause and explicit recovery controls.
**Acceptance:** keyboard/mobile/desktop tests; no hidden controls; owner-scoped data only.

## AI-NETWORK-03 — Personality Laboratory and Bot Teams
**Status:** IN PROGRESS
- Create/edit/archive bots and preview personality.
- Distinct bot behavior profiles and role assignment.
- Team membership and reviewed coordination plans.
**Acceptance:** no duplicate personality signatures; team membership is owner-authorized; every action labelled as AI.

## AI-NETWORK-04 — Smart Scheduling and execution workers
**Status:** NOT STARTED
- IANA timezone and cadence scheduling.
- Queue claim/lease, idempotency, retries, concurrency bounds and crash recovery.
- Per-owner and per-bot budget reservations.
- Emergency pause must prevent new work and safely stop in-flight work.
**Acceptance:** multi-worker concurrency tests, retry tests, duplicate suppression, and pause/recovery drills.

## AI-NETWORK-05 — Performance Center and budgets
**Status:** IN PROGRESS
- Actual run outcomes, latency, provider errors, token usage and costs.
- Daily token/monthly spend limits, alerts and hard stops.
- Never count draft records as completed work.
**Acceptance:** metrics trace to real provider/run IDs and reconcile to usage records.

## AI-NETWORK-06 — Multilingual Intelligence
**Status:** IN PROGRESS
- Language settings and user-controlled translation preferences.
- Detect/translate only with provider and user permission.
- Preserve original text; label translated content.
**Acceptance:** supported-language tests, refusal/fallback handling and no automatic translation when disabled.

## AI-NETWORK-07 — AI Creator Studio
**Status:** IN PROGRESS
- Outlines, captions, titles, calendars and translation drafts.
- Draft workspace, version history, regenerate/edit controls.
- Human review before posting, publishing, messaging or external sharing.
**Acceptance:** output is labelled AI-generated; nothing publishes without human confirmation.

## AI-NETWORK-08 — Security & Trust Center
**Status:** IN PROGRESS
- Permissions/scopes, prompt-injection boundaries and untrusted-source labels.
- Human approval queue, immutable audit records and abuse/rate-limit controls.
- Secret isolation, data retention/export/deletion, emergency stop.
**Acceptance:** authorization, adversarial prompt, privacy, audit and recovery tests.

## AI-NETWORK-09 — Opt-in AI companionship
**Status:** IN PROGRESS
- Explicit activation, disclosure, user boundaries and withdrawal.
- Conversation memory controls, retention, export and deletion.
- Never impersonate a human, pressure the member or enable unapproved outreach.
**Acceptance:** consent tests, deletion tests, age/safety policy checks and no default activation.

## AI-NETWORK-10 — AI Community Events
**Status:** IN PROGRESS
- AI-labelled event drafts and user-approved event publishing.
- RSVP, attendance, event moderation and opt-in invitations.
- Human event owner and clear moderation boundaries.
**Acceptance:** existing Minglora event/privacy rules are enforced; no unsolicited mass invitations.

## AI-NETWORK-11 — Provider adapter and production execution
**Status:** BLOCKED until configuration and adapter verification
- Server-side provider adapter, secret rotation and timeouts.
- Input/output validation, safety checks, budget reservation, metering and audit.
- Provider-disabled behavior must remain clear and functional.
**Acceptance:** integration, load, abuse, privacy and provider-failure tests pass; no provider secret reaches clients.

## AI-NETWORK-12 — Final integration and release
**Status:** NOT STARTED
- Full CI and cross-feature regression tests.
- Responsive/accessibility/device checks.
- Deployed health and provider configuration verification.
- Update docs/features and publish a real task-weighted completion report.
**Acceptance:** all ten recommendations are end-to-end verified; no unresolved critical/high blockers.

## Master specification extensions

## AI-NETWORK-13 — Corporate governance and HR
**Status:** PARTIALLY IMPLEMENTED — organization/department/position foundation, HR source workflows and workspace wiring committed; CI green; production deployment pending
- Organizations, board/executive hierarchy and reporting relationships.
- Twenty department templates, organization-scoped departments, positions and job descriptions.
- Recruitment, vacancies, appointments, onboarding, promotions, transfers, suspension, termination and employment history.
- Delegated appointments with explicit authority and audit history.
**Live schema finding:** a read-only inventory of the production `ai_network` schema still has no organization, department, position, employment, vacancy or HR-history tables. Feature-branch source now defines these tables and RPCs, but it is not deployed.
**Implemented on feature branch:** organization CRUD foundation, 20 departments and position templates; vacancy drafts/status; owner-controlled AI candidate applications; application review; approval-gated appointments; onboarding records; status transitions with reasons/history; manager hierarchy and cycle prevention; and transfer records with old/new history.
**Remaining:** onboarding/training, attendance, performance, disciplinary processes, succession planning, delegated authority, vacancies management lifecycle and production integration/verification.
**Acceptance:** owner-scoped CRUD, hierarchical integrity, appointment authorization, complete history and cross-organization isolation tests must pass in CI and then in deployed integration testing.

## AI-NETWORK-14 — Workforce, tasks and collaboration
**Status:** NOT STARTED
- Persistent tasks, team memberships, schedules, workload allocation and manager escalation.
- Queue claims/leases, idempotent execution, retries, crash recovery and safe pause/resume.
- Human, supervisor and executive approval gates for high-impact operations.
**Acceptance:** concurrent worker tests, duplicate suppression, owner/organization isolation and emergency pause drills.

## AI-NETWORK-15 — Finance, resources and performance
**Status:** NOT STARTED
- Department/identity budgets, model spend, CPU/GPU/storage usage, procurement references and cost forecasting.
- Immutable usage events, actual model token/cost reconciliation and department performance analytics.
- No AI-authorized real-money transfers.
**Acceptance:** every metric traces to actual usage/task/provider records; reconciliations and budget hard stops pass.

## AI-NETWORK-16 — Discovery, following and social integration
**Status:** IN PROGRESS — creation/profile basics only
- Global searchable filters, saved discovery groups, AI profile editing, approved public visibility and follow/friend relationships.
- AI-labelled posts, media, messaging, groups, stories, LIVE and creator participation.
**Acceptance:** every filter and follow relationship persists, visibility/privacy rules pass and no engagement metrics are fabricated.

## AI-NETWORK-17 — Ten-billion scale architecture
**Status:** NOT STARTED
- Distributed identity storage/partitioning, region-aware routing, worker pools, queues, caching and connection pooling.
- Benchmarks for identity registration, queries, failover/recovery and simultaneous execution.
- Separate registered identity count from concurrent execution capacity.
**Acceptance:** documented load-test evidence and infrastructure limits; no 10-billion claim before measured proof.
