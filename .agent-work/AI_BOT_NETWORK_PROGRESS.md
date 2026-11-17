## Execution checkpoint — 2026-11-15 (AI HR attendance correction UI)

- Added inline correction controls to each persisted attendance record in `public/ai-network.js`. The form reuses the existing moderator-authenticated `POST /organizations/:id/attendance` path and existing SQL idempotency/correction-history logic; it preloads the recorded employee/date/status/check-in/check-out values.
- Correction reason is required in the UI with a 10-character minimum, matching the database correction invariant. Each form receives a fresh idempotency key on submit through the existing handler.
- Added focused regression assertions in `tests/unit/ai-network-hr-development.test.js` and updated `docs/AI_BOT_NETWORK.md`.
- Branch: `feat/ai-hr-attendance-corrections-ui`; PR #352: https://github.com/ravaunrichards/Minglora-Social-Network/pull/352.
- Commits before this checkpoint: `8b872f69fc73266c132f612de0c4ea60e10dae06`, `7d8cd737fb35921f35c02e14a286cf1c985adf53`, `708bdd194364f72b04f505b0c6cca7d82a4a3875`.
- Verification so far: browser script syntax parse **PASS**; focused source assertions **4/4 PASS**. GitHub CI has not yet reported a run/status for this PR; merge and deployment are therefore pending. No production database, runtime control, AI identity, or user data was changed.
- This is a UI implementation checkpoint only; signed-in owner/device acceptance and the broader HR lifecycle remain outstanding. Overall verified acceptance remains 2/19 (10.53%) until the master checklist is formally advanced by verified acceptance.

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

## Latest verified checkpoint — 2026-11-15 (private AI profile media visibility)

- PR #350 merged to `main` as `e5fd5329f79dbecbaf4f9ae2f7b236ac72f772ff`.
- Existing Supabase project `gzycobgbasnqqhnympkr`: migration version `20261115023503`, name `minglora_ai_identity_media_visibility`, successfully applied.
- `public.minglora_ai_identity_media_access(uuid,uuid,text)` is present as SECURITY INVOKER with locked empty search_path. Execute is denied to `anon` and `authenticated`, granted to `service_role`. It verifies owner, identity lifecycle, profile visibility, active follower approval, mutual block state and attached/ready media metadata.
- The existing `public.media_assets_storage_bucket_check` constraint is validated and now includes `minglora-ai-profile-media`; all prior bucket values remain. Existing 57 media records were preserved; 0 AI media asset rows and 0 AI identities remain. The AI Storage bucket is still absent pending a real owner-authenticated upload; no public bucket was created.
- Rollback-only production SQL contract passed owner/public/follower/non-follower/block/private/hidden/disabled cases. The test transaction rolled back; no identities, follows, blocks, media objects or asset rows were retained.
- Existing `minglora-runtime-state` Edge Function is ACTIVE at v130 with `verify_jwt=false` preserved; deployed source contains the `ai_identity_media_access` handler.
- Existing Render free service `minglora-social-network-temp` deployment `dep-dbshks6q1p3s73erkklg` is LIVE on the same main SHA. Startup logs verify port 10000, Supabase durable persistence ready and LiveKit connected. The available HTTP verifier could not resolve the service hostname, so a direct public readiness/API response and signed-in end-user acceptance are not claimed.
- CI on PR head `483d2ecc6f87ffc9284e5fa18d58766de6c7fd4d`: full repository suite 1,172 passed / 0 failed; focused AI Network suite 127 passed / 0 failed; Supabase Auth/OAuth, For You navigation and LIVE/MeetWave layout-independence workflows all passed.
- Task 3 remains PARTIAL / ACTIVE: actual owner browser create/list/get/edit, first real private avatar/cover upload, follower/non-follower/block device acceptance still require an authorized signed-in owner session. Do not create sample identities, fake Auth users or retained test records to bypass this.
- Overall acceptance remains **2/19 = 10.53% verified tasks**. This is task-count progress, not an overall feature-completion percentage or a capacity claim. The 10-billion identity objective remains unbenchmarked.

**Next action:** complete Task 3's signed-in owner and real Storage/device acceptance when the owner session is available, then advance to the next dependency-ordered task. The worker runtime remains globally paused, execution disabled and max workers zero.

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

## AI identity memory implementation and release checkpoint — 2026-11-14 12:05 UTC

**Memory feature branch**
- Feature branch: `feat/minglora-ai-bot-network-core`; code revision under verification: `5ce03fda5ad36d7228b2090da18e33e7a847c93a`.
- Added an owner-scoped memory API, UI and gateway to the existing identity registry: per-identity opt-in settings, separate long-term opt-in, configurable short/long retention, maximum-entry limit, entry create/edit/delete, idempotency, expiry cleanup, owner checks, row locking, secret-key rejection and audit events.
- Browser QA covers disabled-by-default consent, long-term consent, create/edit/delete, disabling memory and phone/tablet/desktop layouts using disposable local fixtures. This does not create production test identities.
- Memory is explicitly owner-entered storage. Automatic conversation capture, model recall/injection, embeddings/vector search, provider inference, or autonomous memory writing are NOT implemented.

**Production Supabase and Edge Function**
- Applied migration `20261114120000_minglora_ai_identity_memory.sql`; Supabase recorded migration version `20261114115906` under name `minglora_ai_identity_memory`.
- Verified in the existing project: `ai_memory_settings` (10 columns), `ai_memory_entries` (12 columns), RLS enabled on both, no SELECT for anon/authenticated, service_role CRUD privileges, unique identity/idempotency index, owner/type index and expiry index.
- `public.minglora_ai_memory_command(text,uuid,jsonb)` is SECURITY INVOKER, uses an empty locked search_path, denies anonymous/authenticated EXECUTE and grants EXECUTE only to service_role. The identity owner and signed-in profile are validated by the RPC.
- Deployed the existing `minglora-runtime-state` function as ACTIVE v120 with the prior custom hashed API-key verification intact (`verify_jwt=false` preserved because the function performs its own authentication). No key or credential value was read or exposed.
- No AI identity, memory entry, Auth user, email inbox, provider account or model credential was created. The task runtime remains globally paused with execution disabled and zero workers.

**Checks on the memory implementation**
- Full repository CI #11478: passed.
- Minglora AI Network checks #166: passed (Edge TypeScript parse/transpile, backend/UI syntax and unit/regression tests).
- Chromium browser acceptance #22: passed (memory lifecycle plus existing AI registry/discovery flows).
- These tests use isolated fixtures; they do not substitute for signed-in owner acceptance against production or real model/provider inference.

**Release boundary and remaining work**
- Render `minglora-social-network-temp` remains attached to `main`; the AI Network application changes are still on the feature branch pending PR/release checks and have not been deployed by Render.
- The 10-billion target has not been benchmarked. No measured identity write throughput, distributed partitioning, regional failover or simultaneous execution capacity is claimed.
- Provider inference, secret-manager references, actual email provisioning, worker identities/authentication, autonomous execution, social/creator publishing, full workforce/finance/admin integrations and production device acceptance remain incomplete or blocked by missing provider/runtime/user acceptance evidence.
- This checkpoint supersedes the earlier 11:29 UTC note's statement that no production migration had been applied. No existing production AI data was deleted or overwritten.

---

## Execution continuation checkpoint — 2026-11-14 11:29 UTC

**Repository and branch reconciliation**
- Canonical repository: `ravaunrichards/Minglora-Social-Network`; existing Supabase project only: `gzycobgbasnqqhnympkr`.
- Reconciled `feat/minglora-ai-bot-network-core` with current released `main` using two-parent merge `39f6de5048db7eca46d18d6c2b546e5a10a8a76a` (main parent `c945e1de458b734a66021a01387f353136201765`, prior feature parent `88ba0f96ca1cdb4c30a38e1258782b651518245d`). The resulting tree is exactly the main tree; compare reports 0 behind and no file differences. No force-push was used.
- Render remains attached to `main`; no service source, infrastructure, environment variable or deployment setting was changed.

**Checks on the reconciled feature-branch head**
- GitHub CI run #11458: passed (automated repository tests, repository checks, syntax, dependency audit, Auth/OAuth, and For You navigation jobs).
- Minglora AI Network checks #148: passed (Supabase Edge Function TypeScript parse/transpile on Deno 2.9.8, backend/UI syntax, AI Network unit tests).
- Minglora AI Network browser acceptance #18: passed (Chromium UI acceptance against disposable local in-memory API fixtures).
- These browser checks do not authenticate a real owner, call production Supabase, provision a mailbox/provider, or execute model/worker actions.

**Direct live Supabase catalog verification**
- `ai_network`: 34 base tables; 34/34 RLS-enabled (catalog/security inventory); 0 uncovered foreign-key indexes.
- Active original AI categories: 15; department templates: 20; position templates: 20.
- Production rows are currently zero for AI identities, names, profiles, email identities, provider accounts/models/assignments, follows, organizations, departments, positions, employment/recruitment history, task queue and approvals. One runtime-control row exists.
- `anon` and `authenticated` have no `ai_network` schema USAGE/CREATE; `service_role` has USAGE and no CREATE.
- All 15 public AI RPCs checked are SECURITY INVOKER with an empty locked search path; EXECUTE is denied to anon/authenticated and granted to service_role.
- Runtime control remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No worker activation, provider connection, test identity, email inbox, or fake engagement was created.
- No production DDL, migration, or row mutation was performed in this execution.

**Deployment and acceptance boundary**
- Existing Render service `minglora-social-network-temp` remains LIVE on main commit `c945e1de458b734a66021a01387f353136201765`, deployment `dep-dbs0kle417fc73evlg30`.
- The external HTTP verifier could not open the public Render health or AI API URLs. Platform LIVE status is deployment evidence only; signed-in owner acceptance and Android/desktop/mobile acceptance remain outstanding.
- Continue using the stage table above as the implementation tracker. Stages 2–10 remain partial or not complete; no 10-billion capacity or simultaneous-execution claim is supported by measurements.

---

## Latest verified live checkpoint — 2026-11-14 07:08 UTC

**Canonical Minglora release**
- Repository: `ravaunrichards/Minglora-Social-Network`; latest main commit: `b60ef07bd5307239fd543099170c9fca7cd31e1b`.
- PR #293 merged as `74bd9aadff2a692723ebeeab9443c555ad735deb`: Bot Personality Laboratory now creates and links each bot to its own private relational AI identity using the existing service-role-only identity RPC. Separate first/middle/last names, a persisted category, personality, traits, skills and language records are supplied. Owner-scoped idempotency and deterministic bot IDs allow retries to reuse the same identity. Bots remain drafts; no provider is called and no human Supabase Auth account is created.
- PR #294 merged as `b60ef07bd5307239fd543099170c9fca7cd31e1b`: 31 audited AI Network foreign-key indexes were added with an additive, retry-safe migration.
- Existing Supabase project only: `gzycobgbasnqqhnympkr`. Index migration ledger version: `20261114070550`, name `minglora_ai_network_foreign_key_indexes`. No new Supabase project, billable development branch, Render service or paid infrastructure was created.
- Live database catalog verifies 0 uncovered foreign keys in `ai_network` (31/31 added), 34/34 AI tables still RLS-enabled, and all 31 index definitions valid. The Supabase performance advisor now has 0 findings in `ai_network`; 38 unindexed foreign-key findings remain in other existing Minglora schemas and were left untouched.
- AI schema still has the 15 original active categories and 20 department plus 20 position templates. Identity, profile, name, email, provider, organization, workforce and task row counts are not being inflated with fixtures or fake registrations.
- Profile schema audit confirms separate first/middle/last name fields; gender and gender presentation; nationality, origin/current country; state/province, parish/county, district, city, town and time zone; personality, interests, hobbies, education, qualifications, profession, skills, voice preferences, avatar/cover storage references and visibility. Email records distinguish unverified/not-requested from provisioned mailboxes. Provider accounts/models/assignments are metadata until a protected credential reference and live health check exist.
- Existing Render free service `minglora-social-network-temp` is LIVE at `https://minglora-social-network-temp.onrender.com` on main commit `b60ef07`. Deployment `dep-dbs0gh68bjmc73e0e680` completed successfully at `2026-11-14T07:07:14Z`; logs show the app listening on port 10000, Supabase persistence ready and LiveKit connected. Build audit reported 0 dependency vulnerabilities.
- Latest PR #294 release verification: full suite 1,087 passed / 0 failed / 0 skipped; focused AI Network tests 102 passed / 0 failed / 0 skipped; Supabase Auth acceptance, For You navigation, and seven-plus-two layout QA passed. PR #293 full suite had 1,084 passed; focused AI tests 99 passed.
- **Test boundary:** AI Network browser acceptance still uses disposable in-memory fixtures, not a signed-in production owner or live AI/provider account. The external browser verifier could not independently open the public Render URL. Render deployment status and runtime logs are evidence of platform deployment/startup, not authenticated end-user acceptance.
- Worker claims/heartbeat/complete/fail remain deliberately disabled until independent worker authentication and per-worker authorization exist. No provider adapter/credential connection is confirmed. Do not activate provider or workers. Production controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- No email inbox provisioning, real external model inference, 10-billion identity capacity or concurrent execution benchmark is claimed.

**Current execution position**
- Stage 1 foundation/private runtime: COMPLETED; 31 missing AI foreign-key indexes now hardened.
- Stage 2 identity/profile: PARTIAL; subtask 2.A Bot Lab-to-relational-identity integration merged and deployed. Signed-in owner create/get/edit/upload verification and device acceptance remain.
- Stages 3–10 remain partial or not complete as recorded in the queue below. Continue from verified outstanding work; do not rebuild completed migrations.
- Conservative whole-program progress remains 1/10 fully completed stage gates = 10%; the partial Stage 2 work does not count as a completed stage.


# Minglora AI Bot Network — Recovery & Progress

## Historical live checkpoint — before PR #293 and PR #294 (superseded by the current checkpoint above)

**Canonical release**
- Product/repository: Minglora Social Network only — `ravaunrichards/Minglora-Social-Network`.
- AI identity profile-media implementation merge: `678ea82bd3460e0558e2199bec210ae141a8f152` (PR #282); AI browser acceptance merge: `bf7965d5062078a898e84e974e2f77cd51aa4b89` (PR #284); audited category administration merge: `8297214f08da128980a4d156c0efee602751bcc4` (PR #286); corrected/least-privilege SQL migration merge and current main: `b88ac94846405e03bc4f8e3c86cd8feea41b2e83` (PR #288).
- Existing Supabase project: `gzycobgbasnqqhnympkr`. No new repository, Supabase project, Render service or paid infrastructure was created.
- Additive AI migrations are applied in the existing Supabase project, including profile media (version `20261114041952`) and audited AI category administration (version `20261114053137`). The category migration was source-reviewed and verified for complete key validation, serialized writes, SECURITY INVOKER, empty locked search path, RLS and least-privilege service-role grants before application.
- Existing `minglora-runtime-state` Edge Function is ACTIVE at v119; the deployment includes the category-command gateway, and its existing custom runtime authentication setting remains unchanged (`verify_jwt=false`). Supabase logs show 8 requests served by v119 with HTTP 200.
- Existing free Render service `minglora-social-network-temp` is LIVE on main commit `b88ac94846405e03bc4f8e3c86cd8feea41b2e83`; deployment `dep-dbrv4bh5efls73e5s1j0` completed at `2026-11-14T05:33:01Z`. No new service or paid plan was created.
- PR #282 added owner-scoped AI avatar/cover upload and signed-read routes, workspace rendering fixes, a service-role-only audited media-reference RPC and regression coverage. Media stays in existing avatar/cover buckets under owner/AI-identity paths; no old media objects are deleted.
- PR #282 checks passed on the reviewed head: AI Network syntax/regression workflow, full Minglora CI (including Auth/OAuth and For You navigation), Chromium profile visual matrix, and LIVE/MeetWave layout independence matrix.
- Supabase logs after the category release show 8 requests reaching Edge Function v119, all returning HTTP 200. The direct public Render URL could not be independently opened by the available external browser/network verifier; signed-in owner acceptance and mobile/device testing remain outstanding.


## Audited AI category administration release — 2026-11-14

- PR #286 merged as `8297214f08da128980a4d156c0efee602751bcc4`; PR #288 corrected the migration and least-privilege grants, merged as `b88ac94846405e03bc4f8e3c86cd8feea41b2e83`.
- Added moderator-only category list/create/edit/activate/deactivate API routes and controls in the existing AI Network workspace. Category keys remain immutable because identity records reference them; deactivation is reversible and categories are never deleted.
- Migration `minglora_ai_category_management` is applied to existing project `gzycobgbasnqqhnympkr` as version `20261114053137`. It adds `ai_network.ai_category_audit_logs` and service-role-only RPC `public.minglora_ai_category_command(text,uuid,jsonb)`.
- Verified the RPC is SECURITY INVOKER with `search_path=""`; anon/authenticated cannot execute it. The audit table has RLS; service_role can SELECT/INSERT but not UPDATE/DELETE. For the category table service_role can SELECT/INSERT/UPDATE but not DELETE; anon/authenticated cannot SELECT.
- Rollback-only live DB integration: category create, display-name update and deactivation succeeded and wrote 3 audit events inside a transaction; rollback then verified 0 probe category rows and 0 probe audit rows. Production still has exactly 15 original categories and 0 AI identities, 0 AI profiles and 0 AI email records.
- Browser acceptance verified category create/edit/deactivate in the real Minglora UI shell using disposable in-memory API fixtures. It is not authenticated production-owner UI acceptance.
- CI, AI Network checks, Chromium browser acceptance and seven-plus-two layout QA passed on the reviewed heads before the PR merges.
- Edge Function v119 ACTIVE; Render deployment `dep-dbrv4bh5efls73e5s1j0` LIVE. Render's public URL could not be independently opened by the available external browser verifier; no signed-in owner browser session was available.
- AI runtime stays paused: `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.

## Browser acceptance checkpoint — 2026-11-14

- PR #284, **Add browser acceptance coverage for Minglora AI Network**, merged normally by squash as `bf7965d5062078a898e84e974e2f77cd51aa4b89`.
- Added `tests/e2e/ai-network-workspace.mjs` and `.github/workflows/ai-network-browser-qa.yml`.
- Chromium workflow #1 passed on reviewed head `126af02310db6993f000260fbed03a9c78f768fa`; full Minglora CI #11343 and LIVE/MeetWave layout independence matrix #152 also passed.
- Browser report verified: 15 AI categories; 249 unique country/territory options; 3 populations; 5 gender choices; one create request; one profile-edit request; six combined discovery requests; one bulk-follow request; one saved discovery group; four viewport sizes; four screenshots; zero external API requests.
- Evidence artifact: [minglora-ai-network-browser-evidence](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/43558528592/artifacts/14098404618) (2,788,695 bytes, five files).
- **Test boundary:** the browser suite runs the real Minglora app shell and AI Network UI against disposable local HTTP fixtures kept in memory. It does not call production Supabase, authenticate a real owner, upload media to Storage, create a production identity, or verify provider/email execution. It is browser contract/visual evidence, not live authenticated acceptance.
- Stage 2 remains **PARTIAL**. Production AI identity/profile/email/provider tables still have no registered identity records; real owner create/edit/upload acceptance and device verification remain outstanding.
- Runtime safety remains unchanged: `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.

**Security and database**
- Existing `ai_network` schema: 34/34 tables have RLS enabled. `anon` and `authenticated` have no schema access; privileged operations stay behind the existing server runtime.
- AI profile media RPC `public.minglora_ai_identity_profile_media_update(uuid,uuid,text,text)` exists, uses `SECURITY INVOKER` and an empty locked search path, and grants execute only to `service_role`. Verified: anon=false, authenticated=false, service_role=true.
- Existing media assets table still has RLS enabled. Existing `minglora-avatars` and `minglora-covers` buckets and owner-folder policies are reused; no new buckets or credentials were created.
- Existing 15 AI categories remain intact. No sample identities, human Auth accounts, email inboxes, credentials, provider connections or fake engagement were created.
- Production checks found zero AI identities, zero AI media assets, zero identity versions and zero AI identity audit rows after deployment. No test identity or media record was retained.
- All rollback-only integration tests from the previous checkpoint remain valid; all test transactions were rolled back.

**Fresh live schema / performance audit — 2026-11-14**
- Live inventory confirms 34 AI Network base tables; 34/34 have RLS enabled. Schema USAGE is denied to anon/authenticated and allowed to service_role. The Supabase advisor's RLS-enabled/no-policy INFO findings are expected for this private schema and are not a reason to grant browser access.
- Current estimated row counts: 15 AI categories, 20 department templates, 20 position templates and one runtime-control row. Identity, profile, name, email, provider, organization, workforce, recruitment, follow and task records are currently estimated empty. These are database statistics snapshots, not a measured capacity benchmark.
- Performance advisor reports 69 unindexed foreign keys across the full database, including 31 in the AI Network schema across departments, employment, follows, organizations, positions, provider history, recruitment and task records. These are a performance backlog; no index DDL was executed during this audit. Prepare a reviewed additive migration and validate it on a safe database branch before production application.
- AI email rows do not establish an inbox; provider/model metadata does not establish a connected model or operational inference. Runtime remains globally paused, execution disabled and worker count zero.

**Verified rollback-only integration tests**
- Identity profile: created/read/edited a temporary identity; separate first/last names, profile fields, languages and locations persisted; version and audit records were written.
- Discovery/following: combined filters, individual and bulk follow, duplicate suppression, private-account follow request/approval, unfollow and saved discovery-group create/list/delete passed.
- Corporate/HR: department and position templates, candidate applications, review approvals, gated appointments, onboarding/active transitions, manager hierarchy, transfers/history, suspension/termination and cross-owner isolation passed.
- Tasks: fully supervised financial task required approval, idempotent retry reused it, approval queued it, cancellation worked, restricted-observation task stayed observation-only, and worker claim was rejected. Runtime remained paused/disabled with zero workers.
- Provider metadata: account remained unconfigured/unknown, model metadata and pending assignment persisted, unverified activation was rejected and assignment history was written.
- Each prior integration test ran inside an explicit transaction and rolled back; no production test records remain.
- New PR #282 media tests and repository/browser CI passed. Strict full-file `deno check` on the shared Edge Function remains blocked by 37 pre-existing TypeScript diagnostics outside the new media handler; its TypeScript syntax/transpile check passes. The duplicate `minglora-sounds` object key is present in the old main baseline too, not introduced by PR #282.

**Ten-stage status (partial stages are not counted complete)**

| Stage | Status | Verified work | Remaining |
|---|---|---|---|
| 1. Foundation and private runtime | **COMPLETED** | Private AI schema, RLS/security boundary, existing RPC gateway and categories verified. | Preserve isolation during future integration. |
| 2. AI identities and profiles | **PARTIAL — CURRENT** | Identity create/read/bulk foundation, separate names, email metadata, profile registry/edit, language/location, version/audit, owner-scoped avatar/cover media routes/RPC, audited category admin CRUD/status and service-only RPC deployed; Edge v119 active; PR #284 Chromium UI contract and PR #286 category-management browser checks passed. | Signed-in owner browser/API create/get/edit/upload/category-management acceptance, actual per-owner record verification, true Storage upload and Android/desktop/mobile owner-session acceptance. |
| 3. Discovery and following | **PARTIAL** | Combined filters, follow/unfollow, bulk duplicate suppression, privacy approval and saved-group lifecycle passed live rollback tests. | Authenticated UI, complete device and real-user acceptance. |
| 4. Corporate governance and HR | **PARTIAL** | Organization/departments/positions, application review, gated appointment, employment transitions, hierarchy, transfer/history and owner isolation passed rollback tests. | Delegated authority, training, attendance, performance, discipline, succession and UI/device tests. |
| 5. Supervision, teams and workers | **PARTIAL — EXECUTION PAUSED** | Task approval, observation-only mode, idempotency and cancellation passed. | Worker credentials, real scheduler/worker pool, team orchestration, recovery and load tests. |
| 6. Social, creator and community | **NOT COMPLETE** | Existing draft surfaces only. | Real AI-labelled posts, messaging, groups, stories, LIVE, Creator Studio publishing and events integration. |
| 7. Providers, memory and finance | **PARTIAL — METADATA ONLY** | Unconfigured provider/model metadata, pending assignment and health-gated activation passed. | Secret-manager adapter, real provider health/inference, email service, memory runtime, cost/budget metering and reconciliation. |
| 8. Admin, security operations and analytics | **PARTIAL** | RLS, owner-scoped RPCs, audit/version records and pause controls verified. | Full admin/security centers, alerts, live operational analytics and reports. |
| 9. Distributed architecture / 10-billion target | **NOT STARTED** | No capacity claim made. | Distributed partitioning, storage/query/write/recovery and concurrent-execution benchmarks. |
| 10. Production/device acceptance | **PARTIAL** | PR #286/#288 checks passed; Supabase migration version `20261114053137`, Edge v119 ACTIVE, Render deployment `dep-dbrv4bh5efls73e5s1j0` LIVE; rollback-only create/update/deactivate/audit integration test passed with no retained test rows. | Signed-in production owner acceptance, independently verified public route, Android/desktop/mobile owner-session tests and disaster-recovery acceptance. |

**Conservative progress: 1/10 fully completed stage gates = 10%.** Stage 2 remains current; category administration is a completed subtask, not completion of the full identity/profile/discovery stage. Partial stages do not count as complete. The 10-billion identity target, external model inference, email inbox provisioning and simultaneous execution capacity have not been achieved or measured.

**Deployment limitation:** Render and Supabase report healthy deployment/runtime behavior, but the available external browser/network verifier could not directly open the public Render URL. No authenticated owner session was available for real create/edit/upload E2E tests.

**Safety gate:** keep `global_paused=true`, `execution_enabled=false`, and `max_concurrent_workers=0` until independent worker authentication, provider health, protected secrets, per-owner budgets, human approvals, audits, monitoring and recovery are verified.


## Historical checkpoints (retained for audit; superseded by the current checkpoint above)

## Project identity

- Canonical product: Minglora Social Network.
- AI feature: first-party Minglora AI Bot Network, built as an isolated Minglora feature.
- Repository: ravaunrichards/Minglora-Social-Network.
- Base verified before this work: main commit d7515fdd16db69f307143ab0235f704970e5ec03.
- Working branch: feat/minglora-ai-bot-network-core.
- This work does not use the separate Nexora, ZUNO or other repositories.

## Recovery checkpoint

- Current phase: AI-NETWORK-FOUNDATION — IN PROGRESS.
- Latest implementation areas: domain service, owner-scoped API routes, dedicated store collections, service tests and feature documentation.
- Provider execution remains deliberately disabled.
- No live AI provider credentials have been added, changed or exposed.
- No user records, social posts, Coin balances, gifts, LIVE sessions or production settings have been changed.
- No fake bots, fake runs, fake performance metrics or sample community activity have been seeded.

## Relational identity checkpoint — 2026-11-13

- [x] Confirmed the existing Minglora Supabase `ai_network` schema and 15 seeded AI categories.
- [x] Confirmed the existing identity/profile/name/email/provider/owner/permission/status/version/audit tables are RLS-enabled and browser roles have no schema access.
- [x] Confirmed the production identity table contained zero registered AI identities before implementation; no fake/sample identities were inserted.
- [x] Added the additive server-only RPC migration source at `supabase/migrations/20261113100000_minglora_ai_identity_runtime_api.sql`.
- [x] Added AI-only foreign-key indexes to the migration source; no unrelated Minglora schemas are changed.
- [x] Added owner-scoped relational identity commands for categories, list/search, get, create and bounded bulk create (maximum 100 per batch).
- [x] Added required first/last-name separation, username validation, idempotency, ownership checks, profile/gender, language/location, audit/version/status and optional email identity records.
- [x] Email identity rows remain `unverified` and `not_requested`; no Supabase Auth account or inbox is automatically created.
- [x] Added the `ai_identity_command` action to the existing runtime gateway source and authenticated Minglora API routes for categories and identity CRUD/bulk create.
- [x] Added a relational identity registry, individual creation form and controlled 1–100 JSON bulk-import form to the existing AI Network workspace; it reads actual database results and labels AI/email state honestly.
- [x] Added searchable country-of-origin/current-country inputs for 249 unique ISO 3166-1 country and territory codes, plus profile location, nationality, profession, interests, hobbies, skills, gender presentation, biography, introduction and primary-language inputs.
- [x] Verified the relational GET response returns two language records (one primary) and separate origin/current location records in a rollback-only transaction.
- [x] Verified bulk idempotency counters in rollback-only testing: first submission reports 1 created; identical retry reports 1 reused, 0 created and 0 failed.
- [x] Selectively reconciled the runtime Edge Function source with current `main`; removing only the added AI handler and AI collection group produces an exact match to current `main`, preserving newer video playlist/channel runtime entries.
- [x] Added static regression tests at `tests/unit/ai-network-relational.test.js` and focused GitHub Actions workflow `.github/workflows/ai-network-checks.yml`.
- [x] Verified migration/function behavior in a transaction that was explicitly rolled back: 15 categories, create/get/list, separated names, gender/profile, retry reuse and 1/1 bulk create with zero failures.
- [x] Verified production remained unchanged after rollback: 0 persisted identities, 0 migration indexes and no deployed RPC function.
- [x] Verified source-level JavaScript syntax and seven focused static regression checks.
- [ ] Apply the additive SQL migration to production after migration review/approval; not deployed by this checkpoint.
- [ ] Deploy the reviewed RPC migration and the reconciled Edge Function source. Production still runs `minglora-runtime-state` version 112; deployment has not occurred.
- [ ] Verify live authenticated HTTP create/list/get/bulk flows and database rows after the two deployment steps.
- [ ] GitHub Actions run status is not yet confirmed; the latest combined commit status returned no checks.
- [ ] Full profile editing/media uploads, global discovery filters and saved discovery groups, following workflows, provider assignment workflows and remaining Phase 2 capabilities are still unfinished.

## Master specification phase crosswalk — 2026-11-13

- **Phase 1 — Foundation:** Existing 16-table `ai_network` schema and 15 category records verified. Additive server-only identity RPC/API source, identity UI and tests are committed to the feature branch and rollback-tested. Production database migration remains unapplied.
- **Phase 2 — Identity/profile/discovery:** Individual and bounded bulk identity creation, separate first/last names, population/category, gender, 249 country/territory options, profile/location/language basics and owner-scoped list/get are staged. Profile editing/media, worldwide discovery filters/saved groups, following, social engagement and provider/model assignment management remain unfinished.
- **Phase 3 — Corporate governance/workforce:** PARTIALLY IMPLEMENTED ON FEATURE BRANCH. Added an additive private-schema migration source for owner-scoped organizations, 20 department templates, position templates, departments, positions, employment records and history; added a server-only organization RPC and runtime gateway handler; and wired authenticated Node API plus AI workspace forms for organization creation and template provisioning. The SQL and Edge Function are not deployed. Recruitment, appointments, employee status changes, reporting-chain operations, succession planning and complete workforce management remain unfinished.
- **Phase 4 — Supervision/autonomy/collaboration:** Only the safe starting defaults and existing legacy approval/pause primitives exist. Hierarchical delegation, identity permission management, task queue/leases, worker execution and multi-agent teamwork are not verified.
- **Phase 5 — Social/creator integration:** Existing AI workspace has draft/team/schedule/event records, but relational AI identity profiles are not yet connected to Minglora social posts, messaging, groups, LIVE or Creator Studio end-to-end.
- **Phase 6 — Finance/resources/security:** Identity-layer credential separation and service-role boundary are staged; corporate budgets, actual resource metering, procurement, reconciliation and full security operations are not implemented.
- **Phase 7 — Intelligence/analytics:** Profile language fields and legacy draft/performance contracts exist; production provider routing, memory lifecycle, multilingual execution, creator generation and actual runtime analytics are not verified.
- **Phase 8 — Scale/production:** Not started. No 10-billion capacity claim, distributed deployment or concurrent-execution benchmark has been made. Production migration/runtime deployment, device testing and disaster-recovery tests remain pending.

## Deployment safety boundary

The relational migration, authenticated Node API, AI workspace and reconciled Edge Function changes are committed only to `feat/minglora-ai-bot-network-core`. Corporate routes require existing platform-staff authorization, including MFA-verified owner sessions. The production Supabase schema and deployed Edge Function were not changed. Full CI passed at branch commit `54a9648cbbd4736e4523bb92b9e4d571d60a9826`; AI Network checks passed at the same commit. Keep provider execution disabled until provider account/model health, secret custody, budgets and the execution adapter are independently verified. Do not merge this branch wholesale: it remains materially diverged from `main`. The Edge Function source was selectively synchronized with `main`, but the rest of the feature branch remains divergent; compare and reconcile before any release.

## Verified implementation so far

- [x] Confirmed AI assistant/creation was marked missing in the existing Minglora feature catalog.
- [x] Confirmed no AI/Bot module existed in the latest repository tree before this branch.
- [x] Recovered the ten approved recommendations: Personality Lab, Bot Teams, Smart Scheduling, Performance Center, Multilingual Intelligence, AI Creator Studio, Security & Trust Center, opt-in AI companionship, AI Community Events and central Bot Command Center.
- [x] Documented mandatory safeguards and scope in docs/AI_BOT_NETWORK.md.
- [x] Added backend/modules/ai-network/service.js with owner-scoped domain rules.
- [x] Added isolated AI-owned collections to the existing store collection registry.
- [x] Added authenticated /api/ai-network route family.
- [x] Added an initial service regression suite in tests/unit/ai-network.test.js.
- [x] Bot records carry an AI identity label and begin as drafts.
- [x] Schedules and the global network begin paused.
- [x] High-impact approval records never execute their underlying action.
- [x] Financial, Coin, admin, account, security and destructive moderation actions are not delegable.
- [x] Companion opt-in requires explicit AI-identity acknowledgement and can be withdrawn.
- [x] Performance counts are derived only from actual stored run events.
- [x] Emergency pause preserves history while pausing bots, schedules and queued/running records.

## Not yet verified / unfinished

- [x] Run the AI Network workflow and full repository CI; fixed the real 91-collection registry mismatch and aligned Supabase persistence fixtures. Latest full CI run 11186 and AI Network run 40 both passed.
- [ ] Add the responsive AI Network workspace and navigation entry.
- [ ] Add the provider adapter; keep execution disabled until it passes security and integration tests.
- [ ] Add durable scheduler/worker claims, retries, idempotency, and per-owner budget reservation.
- [ ] Add measured performance telemetry and actual cost/token accounting.
- [ ] Add multilingual provider execution and original/translated content labelling.
- [ ] Add Creator Studio output generation and required human review/publish handoff.
- [ ] Add bot team orchestration without duplicate actions or hidden human impersonation.
- [ ] Add companion conversation sessions, retention enforcement and deletion/withdrawal flow.
- [ ] Integrate opt-in events with Minglora Events/RSVP and moderation.
- [ ] Add adversarial prompt-injection tests, authorization/RLS tests, rate-limit tests and audit review.
- [ ] Verify responsive behavior, accessibility, provider-disabled/error states and recovery.
- [ ] Verify deployed runtime and update the canonical feature catalogue.
- [ ] Complete normalized transactional storage and multi-instance readiness before enabling production scale.

## Completion reporting

Do not report a percentage until every requirement is decomposed and weighted. A route or UI shell alone is not completion. Keep each recommendation status in AI_BOT_NETWORK_STAGE_QUEUE.md and mark it complete only after the corresponding acceptance tests and deployed checks pass.

## Corporate governance wiring checkpoint — 2026-11-13

- [x] Added owner-authenticated Node API routes for department/position templates, organization listing and creation, and organization department/position listing and provisioning.
- [x] Routed corporate commands through the existing private Minglora Supabase runtime gateway; clients do not receive direct access to `ai_network`.
- [x] Added AI workspace organization creation, department provisioning and position preparation forms with idempotency keys and database-derived counts.
- [x] Added focused regression coverage for private grants, owner-scoped commands, all 20 department templates, runtime allowlisting and UI/API wiring.
- [x] Updated the AI Network workflow to run for the corporate migration.
- [ ] Production migration and Edge Function deployment remain unapplied; the workspace correctly reports the staged corporate foundation as unavailable until both are deployed.
- [ ] Recruitment, candidate applications, appointments, employee lifecycle operations, reporting-chain validation and succession planning remain incomplete.
- [ ] No organization, department, position, employee, or AI identity data was inserted into production during this checkpoint.
## HR recruitment and employment workflow checkpoint — 2026-11-13

- [x] Added additive source migration for owner-scoped recruitment vacancies, AI candidate applications and recruitment event history.
- [x] Added idempotent vacancy/application and appointment creation with database uniqueness constraints.
- [x] Added application review and approval gate; appointment creates employment in onboarding state.
- [x] Added explicit employment status transition matrix with required reason and immutable history records.
- [x] Added reporting-manager hierarchy checks and recursive cycle prevention.
- [x] Added transfer workflow that retains previous and replacement employment records with linked audit history.
- [x] Added server-only HR RPC and explicit Edge Function command allowlist.
- [x] Added authenticated platform-staff Node API endpoints and data-backed workspace forms for vacancies, applications, reviews, appointments, employee statuses, managers and transfers.
- [x] Added responsive HR workspace styles and focused regression checks.
- [x] Run final CI after HR source, test and migration-retry hardening commits: full CI run #11205 and AI Network check #59 passed on commit `08ed07d95fee367e7cfa398bbc78821fd7e68820`.
- [ ] Production identity runtime, organization/HR migrations and updated runtime Edge Function handlers remain undeployed; live Supabase tables and workflows are not active. The live project still reports 0 AI identities, 0 profiles, 0 emails and 0 provider assignments.
- [ ] Onboarding/training completion, attendance, performance reviews, disciplinary processes, promotions, succession, delegated AI appointments, department budgets and the remaining employment lifecycle are not yet implemented.
- [ ] No vacancy, application, organization or employee records were inserted into production.

## Provider catalogue and model assignment checkpoint — 2026-11-13

- [x] Inspected live provider account, model and assignment columns, constraints, secret-reference validation and service-role table privileges before writing the feature.
- [x] Added a source-only server-role RPC for provider account references, model catalogue metadata, per-identity assignments and assignment status history.
- [x] Provider account records are always created as unconfigured with a null credential reference; API keys, passwords, tokens and secret references are rejected from request payloads.
- [x] Provider model catalogue metadata is separately stored from real provider health; no connection is claimed by creating a model record.
- [x] New assignments are owner-checked, capability/language constrained, idempotent, pending and health unknown. This API cannot activate an assignment.
- [x] Added explicit Edge Function allowlist, authenticated platform-staff Node routes and data-backed desktop/mobile workspace forms.
- [x] Added responsive styles and focused regression tests; AI Network check #73 and full CI #11219 both passed on commit `3bab198c1d6d2485890d3416957daa6629e97aa7`.
- [ ] A real secrets-manager integration, provider health probe, model runtime adapter, fallback routing and usage/billing accounting remain blocked/not implemented.
- [ ] The provider migration and updated runtime Edge Function remain undeployed; live provider counts are unchanged.

## Final live-state verification — 2026-11-13

- [x] Confirmed working branch: `feat/minglora-ai-bot-network-core`; all work remains scoped to the existing Minglora repository.
- [x] Confirmed latest feature-branch commit: `3bab198c1d6d2485890d3416957daa6629e97aa7`.
- [x] Confirmed AI Network checks #90 and full repository CI #11236 passed against the current task-queue commit.
- [x] Read-only Supabase verification confirms the live project still has only the two original AI identity foundation migrations; the new identity runtime, corporate/HR and provider catalogue/assignment migrations have not been applied.
- [x] Read-only counts: 0 AI identities, 0 AI profiles, 0 AI emails, 0 provider accounts, 0 provider models, 0 provider assignments and 15 existing categories.
- [x] Live `minglora-runtime-state` Edge Function remains on deployed version 115; the feature-branch HR/provider gateway handlers are not deployed.
- [x] No production migration, Edge Function deployment, AI record creation, human Auth creation, credential creation or destructive operation was performed.

## Durable task queue and human approval checkpoint — 2026-11-13

- [x] Added private relational task, approval, runtime-control and task-event tables with RLS and service-role-only access.
- [x] Runtime controls initialize globally paused, execution disabled and worker limit zero.
- [x] Added owner-scoped identity-bound task creation, payload/budget limits, idempotency and secret-key rejection.
- [x] Approval requirements are derived from the AI identity's stored supervision level and task action class; observation-only tasks cannot execute.
- [x] Added administrator approval/rejection/cancellation and immutable event history.
- [x] Added database worker lease/recovery/concurrency source with skip-locked claims and verified identity/provider health checks.
- [x] Worker lease operations are deliberately blocked in the SQL until a separate worker identity and credential system exists; worker commands are not runtime-gateway-allowlisted.
- [x] Added authenticated task queue API, Minglora workspace controls and focused regression tests.
- [x] Run AI Network check #90 and full Minglora CI #11236; both passed on commit `69700cbeef5d269c72000cf5837f324ef383c2bb`.
- [ ] Task migration and updated Edge Function are source-only; no task tables or controls have been deployed to production.
- [ ] No task/approval records, worker credentials, model calls or external operations have been created or executed.



## Consent-gated AI memory recall — 2026-11-17 (source implementation checkpoint)

- Based on current main `6bc424c5951d0a38ad95d830e09a230eefc4496b`, branch `feat/minglora-ai-consented-memory-recall-20261117`.
- Implemented read-only memory recall in the owner-initiated bot conversation path. Only summaries from an AI identity with an explicit memory opt-in and recorded consent timestamp are eligible. Long-term summaries require the additional long-term opt-in.
- The provider adapter bounds recall to six summaries / 3,600 aggregate characters, excludes credential-like summaries, treats memory as untrusted context, and never writes memory automatically.
- The daily chat token reservation estimate includes recalled summary characters.
- Focused tests and documentation were added. CI is pending; live owner/MFA acceptance, deployed relational chat migration/gateway, live provider credential and inference remain unverified.
- No production schema, data, memory settings, identity, human Auth account, provider credential, worker control, Edge Function or Render deployment changed. Runtime flags remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- Historic accepted task count remains `2/19`; this code slice does not claim a weighted completion percentage or 10-billion-scale capacity.


### Verification update — consent-gated AI memory recall PR #470

- Repair commit: `9540a412662e564c030ce2460029c01cc863fe67`.
- Full repository automated suite: **1,301 passed / 0 failed**.
- AI Network syntax and regression suite: **156 passed / 0 failed**.
- Supabase Auth provider acceptance: passed.
- For You functional navigation: passed.
- LIVE/MeetWave visual matrix: **9 layouts**, **3 viewports**, **54 crop comparisons**, **54 occupied-seat checks**, **27 MeetWave empty-seat checks**, **27 matching geometries**; passed.
- PR #470 is draft/open/mergeable and not merged. The first CI attempt exposed one stale expected-text assertion; it was corrected and all rerun checks passed.
- No production schema/data/memory settings, provider credentials, AI identities, Auth users, workers or deployment targets were modified. Runtime controls remain paused.


## Member-facing AI discovery — 2026-11-17 (source implementation checkpoint)

- Branch `feat/minglora-public-ai-discovery-20261117`, ported onto current main `ad0873b0bc317ab881b0175100b1c7de66cf5fff` including owner-merged PR #469 RBAC foundation and PR #470 consent-gated memory recall.
- Implemented a distinct signed-in member API for public AI discovery, follow/unfollow, max-100 bulk follow, saved groups, and approvals for follow requests on AI identities owned by the signed-in member.
- Added a responsive standalone Discover AI page with a searchable 249-code country/territory multiselect, combinable filters, AI-labelled profile cards, true Minglora-member follow counts, following list and saved groups.
- Owner/MFA-only AI Network management remains separate. The RPC still returns only active, enabled, public profiles and no email/provider-secret records.
- Unit and Playwright browser coverage added; CI pending. No migrations/deployments or production data writes. Workers remain paused.


### Verification checkpoint — current-main member-facing AI discovery continuation

- Original PR #472 verification commit: `4a46221a567a849bcae386a62726a7b546e5c4d0`; source branch is superseded by this current-main continuation.
- Previous source-head full repository suite: **1,314 passed, 0 failed**; fresh current-main run pending.
- Previous source-head AI Network regression suite: **156 passed, 0 failed**; fresh current-main run pending.
- Previous source-head public discovery Playwright browser acceptance: passed — 249 country/territory options, 2 disposable profile fixtures, 4 combined-filter submissions, follow/unfollow, bulk follow, saved search creation/application, follow-request approval, desktop/mobile screenshots, and no page errors.
- Supabase Auth provider acceptance: passed. For You functional navigation: passed.
- LIVE and MeetWave nine-layout visual matrix: passed.
- Previous source-head profile layout matrix completed successfully (run #451). Fresh current-main profile and browser matrices are pending.
- No live database/schema/data, AI identities, user accounts, emails or followers were changed. No production migrations/deployments. Production worker controls remain paused, execution disabled and max workers zero.


## Owner direction — remove duplicate standalone Discover AI (2026-11-17)

- Removed the standalone member-facing `/ai-discovery.html` page and `/api/ai-discovery` route because they duplicated the existing Minglora AI Network experience.
- Preserved the owner/MFA-gated `/api/ai-network` management route, Minglora AI Network navigation/workspace, private identity/discovery RPCs, database schema and records.
- No Supabase migration, identity/profile/follow data deletion, provider configuration, or worker/runtime control change was made.
- Removed standalone discovery page assets and member-facing browser tests; the AI Network browser acceptance workflow remains active.


## Relational AI bot chat production foundation — 2026-11-17

- Index repair PR #481 merged to `main` as commit `518be0c48f1a0bc2872600dd46c6245c1a9c6e5c` after green checks: full CI run #14603, AI Network checks #454, and nine-layout visual QA #835. The AI Network regression suite, full automated tests, Auth provider acceptance, For You navigation and visual QA all passed.
- Applied additive migration `minglora_ai_bot_conversations` to existing Supabase project `gzycobgbasnqqhnympkr`. Supabase recorded version `20261117101442` / `minglora_ai_bot_conversations`.
- Live verification: six new chat tables exist in `ai_network`; all have RLS enabled; `anon` and `authenticated` have no direct SELECT access; `service_role` has required table privileges. The RPC is SECURITY INVOKER with an empty search path and is executable only by `service_role`.
- All 19 foreign keys across the six new tables have covering indexes (zero unindexed); all six chat tables currently contain zero rows. No fixture identities, human Auth users, mailboxes, provider credentials, conversations or usage rows were created.
- Deployed the existing `minglora-runtime-state` Edge Function as ACTIVE version 132 from merged `main`. The existing custom `x-minglora-api-key` guard and `verify_jwt=false` configuration were preserved; bot-chat command allowlist and handler are present in the deployed source.
- Runtime safety remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No worker, schedule or autonomous execution was enabled.
- **Still blocked/pending:** existing Render workspace/service confirmation and Node API release; designated owner MFA/reviewer desktop/mobile acceptance; actual deployed-RPC concurrency/idempotency/lease/budget/owner-isolation tests; real provider credential/health/inference; shared Creator Studio budget migration; full capacity/load/recovery benchmarks. No 10-billion or multi-region capacity is claimed.


## AI bot conversation message-order repair — 2026-11-17

- A rollback-only live database test before the repair found **2 of the 10 returned exchange pairs out of order**. Both messages in an exchange shared a timestamp, and the read query broke ties by random UUID. All 20 synthetic exchanges were rolled back; production chat tables remained empty.
- Added and applied migration `20261117102355_minglora_ai_bot_message_order` in the existing Supabase project. `ai_bot_conversation_messages.sequence_no` is backfilled, positive and unique within each conversation; the RPC allocates consecutive user/assistant positions from the locked conversation's `message_count` and reads history by sequence.
- After the repair, a rollback-only 20-round-trip stress test returned the latest 20 messages in sequence order 21–40 with **0 out-of-order pairs** and conversation message_count 40.
- The same test verified completed-request retry reuse, 280 synthetic measured tokens with zero reservations remaining, over-budget request rejection, expired-lease recovery to attempt 2, owner isolation and non-billable failure cleanup. All synthetic identity/profile/message/request/budget/usage/audit rows were rolled back.
- Production chat tables remain empty; no AI identity, human Auth user, provider credential or external inference was created. The existing Edge Function remains ACTIVE v132; workers remain paused, execution disabled and max worker count zero.
- Render Node API deployment, designated owner MFA/reviewer desktop/mobile acceptance, real provider health/inference, shared Creator Studio budget integration and scale/load benchmarks remain outstanding. No 10-billion or multi-region capacity is claimed.

 
## Deployed AI bot chat RPC rollback acceptance — 2026-11-17

- PR #482 was merged to `main` as `a204bb1631e2980bec599c44c630a523dc4531d6`; post-merge full CI, Supabase Auth provider acceptance and For You navigation all passed. This checkpoint branch is based on the then-current `main` head `d86357cbea8bfc81aeb7e9b5f6de6a305a48dcdd`.
- Read back deployed `minglora-runtime-state`: ACTIVE v132, `verify_jwt=false`, original hashed `x-minglora-api-key` guard preserved, and the `ai_bot_chat_command` gateway action/handler present.
- Live SQL catalogs confirm all 60 `ai_network` tables have RLS; the private schema is not usable by `anon` or `authenticated`; chat-table SELECT and RPC EXECUTE are service-role-only; all 19 chat-table foreign keys have valid covering indexes.
- Executed the deployed chat RPC under `SET LOCAL ROLE service_role` in an explicit rollback-only transaction. Sequential assertions passed for reservation, moderated completion, 60-token settlement, idempotent duplicate reuse, expired-lease retry (attempt 2), failure release, over-budget rejection (SQLSTATE `54000`), and cross-owner denial.
- Verified post-rollback residue is zero: AI identities, chat requests, conversations, messages, daily budget rows, token reservations and usage events all remain at 0. No human Auth account or persistent AI identity was created.
- Not yet covered: truly concurrent independent sessions, billable provider-failure recording, signed-in owner/MFA desktop/mobile HTTP acceptance, real provider inference, and Render Node API release. Runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- Next engineering gate: migrate Creator Studio to the same atomic owner/day token-budget ledger. Deployment remains blocked pending confirmation of the correct existing Minglora Render workspace/service; do not create a new service or deploy to an unconfirmed workspace.

## Creator Studio shared AI token budget — merged source checkpoint (2026-11-17)

- PR #485 merged to `main` as `724309f1b3037fda0655220f8bdae15bbc6b6f70`.
- The existing Creator Studio manual draft endpoint now uses the relational shared owner/UTC-day token budget when Supabase persistence is active. Chat and Creator Studio reserve and settle against one budget lock; measured provider output and billable failed usage are accounted, non-billable failures release reservations, and leases are bounded/recoverable. Local JSON-only mode remains supported.
- The additive migration creates two private Creator Studio reservation/usage tables and extends the existing service-role-only budget RPC. The runtime gateway action allowlist and Node API route are updated in source.
- Candidate migration plus RPC contract executed successfully as one rollback-only transaction in the existing Supabase project. Assertions covered reserve, idempotency, settlement, billable failure, release, lease recovery, cross-owner isolation and cross-feature shared budget enforcement. After rollback, new tables remained absent and existing AI/chat/test record counts remained zero.
- Latest PR checks: repository test suite **1,331/1,331 passed**, AI Network regression passed, Auth passed, For You navigation passed, nine-layout visual matrix passed. A retry-accounting test failure from the first CI run was diagnosed and repaired by preserving both ledgered and unledgered token history with correct accounting markers.
- Production state is unchanged: migration not applied, Edge Function not redeployed (still ACTIVE v132), no Render Node deployment, no provider credentials/inference, no identities or usage records added. Runtime remains globally paused, execution disabled and zero workers.
- Remaining release gates: concurrent independent DB sessions; signed-in owner/MFA desktop/mobile acceptance; billable failure and live-provider inference with a provisioned provider; confirmation of the actual Minglora Render service/workspace; approved production migration/deployment; production/readiness/capacity and recovery benchmarking. No 10-billion capacity claim is made.

## Two-session shared AI budget concurrency — verified CI checkpoint (2026-11-17)

- Status: **VERIFIED — merged source plus real two-session PostgreSQL CI**.
- PR #487 merged into `main` as `75eccd2cf1c3470c1e502e5cec0f180e616330a6`.
- Added a reusable GitHub Actions workflow using a disposable PostgreSQL 17 service. It applies the actual Minglora relational chat, message-order and Creator Studio shared-budget migrations in the isolated CI database and uses two independent PostgreSQL sessions.
- All 3 concurrency tests passed, 0 failed: competing Creator Studio reservations serialize on the same owner/UTC-day budget row; a Creator Studio hold blocks an over-budget bot-chat request; a bot-chat hold blocks an over-budget Creator Studio request. Each case verified the second backend was genuinely waiting on a database lock before the first transaction committed, then received SQLSTATE `54000`.
- Post-merge main CI completed: full repository suite **1,331 passed / 0 failed**; two-session PostgreSQL tests **3 passed / 0 failed**; Supabase Auth provider acceptance passed; For You navigation passed. Pre-merge nine-layout LIVE/MeetWave visual matrix also passed.
- This verifies database locking in disposable PostgreSQL using the actual merged migrations. It is not a production Supabase concurrency test, provider inference test, or capacity/load benchmark.
- Production state remains unchanged: migration `20261117104500_minglora_creator_studio_shared_budget` is merged but **not applied**; Creator Studio reservation and usage tables remain absent; deployed Edge Function remains ACTIVE v132 and has not been updated with the Creator Studio RPC actions; Node API/Render deployment not performed.
- Runtime safety remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`. No identities, Auth users, messages, budget rows, reservations or usage events were added to production.
- Remaining release gates: signed-in owner/MFA desktop and mobile acceptance; actual provider credential, provider health and inference; confirm the correct existing Minglora Render workspace/service (the currently connected Render workspace is named Creator Hub and is not assumed to be Minglora); approved, coordinated production migration and Edge/Node deployment; production verification; capacity, recovery and regional scaling benchmarks. No 10-billion identity or simultaneous execution capacity has been claimed.
- **Next execution step:** complete owner/MFA and provider readiness, establish the approved Minglora deployment target, then prepare a coordinated release plan for the merged migration and source changes. Do not enable workers or apply production migrations without the appropriate release authorization.


## Creator Studio shared AI budget — production migration and live RPC acceptance (2026-11-17)

- Status: **VERIFIED — additive production schema and private Edge Function integration deployed; runtime execution remains paused**.
- PR #485 merged into main as commit 724309f1b3037fda0655220f8bdae15bbc6b6f70. The merged source includes Creator Studio reservation and usage-event tables, owner/day budget RPC actions, backend lifecycle integration and retry-accounting regression fixes.
- Applied the additive migration to the existing Minglora Supabase project gzycobgbasnqqhnympkr. Supabase recorded migration version 20261117111426, name minglora_creator_studio_shared_budget. It adds only ai_creator_studio_daily_token_reservations and ai_creator_studio_usage_events and replaces the existing private budget RPC; it does not create identities, Auth users, mailboxes, provider credentials or synthetic usage.
- Live catalog verification: both new tables have RLS enabled; anon and authenticated have no direct SELECT privileges; service_role has the required table privileges. The shared RPC is SECURITY INVOKER, uses an empty search_path, denies anon/authenticated EXECUTE and permits service_role EXECUTE. The deployed minglora-runtime-state Edge Function is ACTIVE v133; the previous verify_jwt=false setting and existing custom hashed API-key authorization guard are preserved, and Creator Studio actions are in the gateway allowlist/handler.
- Rollback-only live Supabase RPC acceptance passed: Creator Studio reservation, duplicate request reuse, measured completion settlement (45 tokens), completion idempotency, non-billable failure release, billable failed-provider usage recording (30 tokens), aggregate usage (75 tokens / zero reservations), over-budget rejection (SQLSTATE 54000), and cross-owner denial. The transaction was rolled back.
- Post-rollback readback confirmed zero rows in Creator Studio reservations, Creator Studio usage events, daily token budgets and AI identities. No fixture data remains.
- Two-session PostgreSQL CI from PR #487 passed all 3/3 concurrency tests using the actual migrations in a disposable PostgreSQL 17 database: competing Creator Studio reservations serialize on the shared owner/day row; a Creator Studio hold blocks an over-budget chat request; and a chat hold blocks an over-budget Creator Studio request. This is CI concurrency evidence, not a production multi-session load test.
- Repository validation after merge: full suite 1,331 passed / 0 failed; AI Network checks passed; Supabase Auth acceptance passed; For You navigation passed; nine-layout LIVE/MeetWave visual QA passed.
- The main merge also triggered the existing Render auto-deploy. The linked service minglora-social-network-temp deployed commit a81df905963bde92ae7f5c85740a2a6ffab9202e successfully. Logs confirm Node started on port 10000, Supabase durable persistence was ready and LiveKit connectivity was verified. This is a temporary/free-plan service in the connected Creator Hub workspace, not a confirmed production target. No new Render service was created and no separate production Render target was asserted.
- Runtime controls remain global_paused=true, execution_enabled=false, max_concurrent_workers=0. No bot workers, schedules or autonomous execution were enabled.
- Supabase advisor notes for the new private tables are informational: RLS is enabled with no browser policies by design because direct browser privileges are revoked; two secondary indexes are currently unused because the new tables are empty. No missing foreign-key index finding was returned for the new tables. Existing project-wide advisor findings were not changed as part of this task.
- Remaining release/acceptance gates: confirm the intended production Render workspace/service; perform signed-in designated-owner/MFA desktop and mobile HTTP acceptance; configure and verify a real provider credential/model and moderated inference; run production multi-session/load, backup and recovery tests; verify memory recall behavior on devices; benchmark real storage/query/write and regional failover limits. No 10-billion identity capacity or simultaneous execution capacity is claimed.
- Next action: resolve the production Render target and owner/MFA/provider acceptance; retain the global pause until those independent safety gates are complete.

## Authenticated AI worker principals — source and PostgreSQL CI checkpoint (2026-11-17)

- Status: **SOURCE IMPLEMENTED; DISPOSABLE POSTGRES ACCEPTANCE PASSED; production rollout pending.**
- Work is on the existing feat/minglora-ai-network-bulk-retry-20261117 branch and open PR #489. Latest verified source commit: 6d243b97a056a73a7b44358e6d594e63ccbbb2fc.
- Added additive source migration 20261117130000_minglora_ai_worker_principals.sql: private worker principals, one-way SHA-256 credential digests, expiry/version/revocation, explicit per-identity grants, owner-scoped audit events, and service-role-only RPCs for create/list/rotate/revoke and claim/heartbeat/complete/fail.
- Worker claims are separately authenticated from human task commands. Claims check the global pause, global/per-worker concurrency, granted active identities, bounded action classes (read_only / content), and an active healthy provider account owned by the same tenant. Queue claiming uses FOR UPDATE SKIP LOCKED; callback tokens and leases are checked; rotation and revocation release leases. The production task runtime control row was not changed.
- Added private Edge gateway actions, owner + MFA-gated Node admin routes, bearer-authenticated worker API, one-time credential display, and worker-principal controls in the existing AI Task Queue Center. The raw credential is generated server-side, hashed before persistence, and returned once; it is never sent to Supabase as the raw token.
- Added unit coverage and a disposable PostgreSQL 17 lifecycle workflow. On current commit, AI Network syntax/regression tests passed; PostgreSQL worker lifecycle passed; browser acceptance passed; full repository CI passed 1,338/1,338; dependency audit found 0 vulnerabilities; Supabase Auth and For You navigation checks passed. Nine-layout visual QA was still running at this checkpoint.
- No production migration was applied and no Edge Function or Node/Render deployment was performed for this worker slice. Live catalog readback confirms the three worker tables are absent. Live counts remain zero for AI identities, provider assignments, email identity records, organizations, departments and queued tasks. Runtime control remains global_paused=true, execution_enabled=false, max_concurrent_workers=0.
- Not verified: actual worker service deployment/poll loop, real provider credentials and inference, signed-in designated-owner/MFA HTTP acceptance, mailbox provisioning, provider-health-to-runtime acceptance in production, capacity/load/recovery, or 10-billion identity scale. This worker-principal source slice does not complete the wider Master AI Bot Network specification.
- Next gate: review the source migration with the designated owner, verify the correct existing Minglora Render target and secret manager, then coordinate an approved migration + Edge/Node release and real owner/MFA/provider acceptance. Keep global execution paused until all gates pass.

## Worker principal cross-tenant verification — latest head 8241ac6575c6387cb86c58d9e551ac88ebd39901 (2026-11-17)

- The PostgreSQL 17 integration fixture was expanded to test that a worker cannot be created with an AI identity owned by another Minglora account and cannot claim a task whose provider account belongs to another tenant. Both controls are enforced by the SQL runtime; the cross-tenant integration assertions passed.
- Latest tested source head 8241ac6575c6387cb86c58d9e551ac88ebd39901: worker principal PostgreSQL 17 integration **SUCCESS** (run 44171136083); AI Network syntax and regression tests **SUCCESS** (run 44171136009); full repository CI **SUCCESS, 1,338 passed / 0 failed** (run 44171136249); AI identity/discovery browser acceptance **SUCCESS** against disposable fixtures (run 44171136160); nine-layout visual QA **SUCCESS** (run 44171136062). The earlier 6d243 checkpoint's test count is superseded by this verification.
- PR #489 remains open and unmerged. No source migration from this worker slice has been applied to production, and no Edge Function or Node/Render deployment has been performed for it.
- Live Supabase readback remains unchanged: no worker-principal tables exist yet; AI identities, provider assignments, email identity records, organizations, departments and task queue rows remain zero. Runtime still global_paused=true, execution_enabled=false, max_concurrent_workers=0.
- This verifies bounded worker identity and task leasing only. No worker polling service, autonomous provider execution, real provider credentials/inference, real mailbox provisioning, 10-billion capacity benchmark, or production owner/MFA and device acceptance is claimed.


## Worker principal admission and credential-lifecycle hardening — 2026-11-17

- Latest source commit: `809166248295df98286ffb88d52131c2ee25555e` on the existing feature branch and open PR #489.
- Fixed expired worker credential handling: the private runtime RPC now records `status='expired'`, clears the credential digest and appends the expiry audit event before returning an explicit unauthenticated result. The Node worker endpoint maps that result to HTTP 401. Returning normally is required so PostgreSQL commits the revocation/audit changes instead of rolling them back with an exception.
- Fixed global worker-cap admission: worker claims now take an exclusive lock on the single persisted runtime-control row before checking active leases. This serializes claims from different worker principals so they cannot both observe and consume the same final global concurrency slot.
- Added PostgreSQL 17 two-session integration coverage. The test holds the first worker's lease transaction open, verifies the second backend is waiting on the runtime-control lock, commits the first lease and confirms the second claim is rejected with `global_worker_limit_reached` when the global cap is one. Added expiry persistence/audit assertions as a separate regression test.
- Latest verified checks on this commit: AI Network syntax/regression workflow **SUCCESS** (run 500); worker principal PostgreSQL 17 lifecycle + global concurrency workflow **SUCCESS** (run 13); full repository CI **SUCCESS** (run 14826); Supabase Auth acceptance **SUCCESS**; For You functional navigation **SUCCESS**.
- Latest AI identity/discovery browser acceptance **SUCCESS** (run 525) and nine-layout crop-reference visual QA **SUCCESS** (run 895); the nine-layout comparison passed across mobile, tablet and desktop, with screenshot/geometry evidence uploaded.
- No production worker migration, Edge Function or Node/Render deployment was performed. Live worker tables remain absent. Live runtime controls remain `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- This source/test checkpoint does not verify signed-in owner/MFA HTTP acceptance, real provider credentials/inference, worker poll-loop hosting, email mailbox provisioning, production multi-session traffic, backup/restore, distributed storage or 10-billion identity capacity. PR #489 remains open and unmerged.

## Tenant-aware identity shard routing primitive — source checkpoint (2026-11-17)

- Added `backend/modules/ai-network/identity-shard-routing.js` on existing branch `feat/minglora-ai-network-bulk-retry-20261117` / open PR #489.
- Added tenant-and-identity-derived logical partition IDs (default 4,096 virtual buckets), deterministic weighted rendezvous planning over active candidate shards, and a resolver that trusts only an explicitly supplied persisted directory record.
- Existing mappings remain stable across shard-catalog changes. Tenant/identity mismatch, stale directory version, unknown physical shard, home-region mismatch, invalid lifecycle status, offline/disabled shard and writes to draining shards are rejected. Draining-shard reads remain allowed.
- Added focused unit coverage in `tests/unit/ai-network-shard-routing.test.js`; CI verification for the new tests is pending at this checkpoint.
- This is source-only and dormant. There is no durable identity-directory table/service, shard registry, physical shard database, data movement, regional replication/failover, discovery projection, production route integration or capacity benchmark.
- No Supabase SQL/migration, production data, identity, Auth user, provider credential, mailbox, worker record, Edge Function or runtime control was changed by this slice. Runtime remains globally paused, execution disabled and worker cap zero.
- Keep the 10-billion registered identity target and simultaneous execution capacity explicitly unverified. The next gates are CI verification, durable mapping persistence, repository integration and isolated measured load/recovery tests.
