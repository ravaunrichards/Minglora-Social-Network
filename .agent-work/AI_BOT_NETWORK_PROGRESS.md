# Minglora AI Bot Network — Recovery & Progress

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

