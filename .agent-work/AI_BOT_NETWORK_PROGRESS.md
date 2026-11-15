## Execution checkpoint — 2026-11-14 (rollback-only HR disciplinary migration validation)

- Working branch: `feat/ai-hr-disciplinary-cases`; PR #353 remains draft/open against `main`.
- Validated source migration `supabase/migrations/20261115033000_minglora_ai_hr_disciplinary_cases.sql` against the existing Supabase PostgreSQL 17.11 database inside an explicit `BEGIN ... ROLLBACK` transaction.
- Inside the transaction, migration execution and assertions passed for both organization-scoped case/history tables, RLS enabled on both, no direct anon/authenticated SELECT grants, required service_role table grants, a SECURITY INVOKER RPC, service_role-only RPC EXECUTE, and configured search_path.
- Independent post-rollback verification confirmed both tables and the RPC are absent, so no production schema change was retained. The migration ledger remains unchanged; its latest AI/HR entry is `20261115025508` (`minglora_ai_hr_training_attendance`).
- Live data remains empty for organizations, employment records and AI identities. Runtime control remains `global_paused=true`, `execution_enabled=false`, `max_concurrent_workers=0`.
- This is SQL syntax/schema/security-contract validation only. It does not apply the migration, test a real organization/employee lifecycle, deploy the Edge Function, or replace signed-in owner/API/browser/device acceptance.
- PR #353's existing head `bb986a964354723d6927d6af762a1c1bb5b63fc9` had green CI (1,182/0), AI Network workflow (137/0), browser fixture acceptance and layout visual QA. New checkpoint commits require their own workflow results before any new-head CI claim.
- AI task accounting remains `2/19 = 10.53%` verified tasks. Disciplinary case work remains `IMPLEMENTED — AWAITING LIVE/OWNER ACCEPTANCE`.

---

## Execution checkpoint — 2026-11-15 (AI HR disciplinary case source verification)

- Branch: \`feat/ai-hr-disciplinary-cases\`; draft PR #353 targets \`main\`: https://github.com/ravaunrichards/Minglora-Social-Network/pull/353
- Latest corrected head before this checkpoint: \`ae6b37cc6bc7f860c07c16a4e947f0057ad6ed38\`.
- Six feature commits add the additive disciplinary schema, moderator-gated server routes, private Supabase runtime action, HR administrator case UI, four regression tests and documentation.
- AI Network workflow: **137 passed / 0 failed**. This includes the four new disciplinary tests, runtime TypeScript parse/transpile, and backend/UI JavaScript syntax checks.
- Full repository CI: **1,182 passed / 0 failed**. A pre-fix run exposed one existing profile-editor assertion because the shared PATCH-kind array was extended; the implementation was corrected by isolating the new status PATCH kind, then CI passed on the corrected head.
- AI identity/discovery browser acceptance and LIVE/MeetWave layout QA workflows both completed successfully. The browser test uses disposable fixtures; it is not live-owner or production HR case acceptance.
- PR #353 remains **DRAFT / OPEN / NOT MERGED**. No merge or deployment was performed. The Supabase migration remains source-only and has not been applied; no Edge Function or Render deployment was performed.
- No live organization, employee, case, note, Auth user, or other test record was created. No production data or runtime controls changed. AI execution remains \`global_paused=true\`, \`execution_enabled=false\`, \`max_concurrent_workers=0\`.
- HR disciplinary implementation is **IMPLEMENTED — AWAITING LIVE/SQL ACCEPTANCE**. Required next evidence: SQL migration validation through approved migration workflow, signed-in owner/API acceptance with a real owner-controlled organization, and deployed browser/device acceptance.
- Accepted AI Network task accounting remains **2/19 = 10.53% verified tasks**. This is task-count completion, not a feature-completion percentage; the partial HR task is not counted as complete.

## Execution checkpoint — 2026-11-15 (AI HR disciplinary case management)

- Working branch: \`feat/ai-hr-disciplinary-cases\`, based on the checked \`main\` commit \`16fbb98a9ea11f6a53b9aee5c38965cfe7d747ec\`.
- Added an additive migration source for confidential, organization-scoped disciplinary cases and append-only history.
- Added server administrator/persistence gates, private Supabase runtime command allowlisting, and HR administrator workspace controls for creating cases, adding investigation notes, and recording reasoned status transitions.
- Added four focused source-level tests covering schema access, lifecycle rules, runtime/server authorization wiring, and UI wiring.
- Workflow is human-entered and human-reviewed only. It does not automate sanctions, employee decisions, worker execution, or AI actions.
- **Status: IMPLEMENTED — AWAITING VERIFICATION.** Unit tests, SQL validation, CI, and signed-in owner/API/browser/device acceptance have not yet been completed.
- Migration is committed as source only and has **not** been applied to Supabase. The Edge Function and Render service have **not** been deployed. Production database and runtime state were not changed.
- AI execution controls remain \`global_paused=true\`, \`execution_enabled=false\`, \`max_concurrent_workers=0\`.
- Accepted AI Network task register remains **2/19 = 10.53% verified tasks**. This partial HR increment does not change the verified task count.

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

