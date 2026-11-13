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

## Deployment safety boundary

The relational migration, authenticated Node API, AI workspace and reconciled Edge Function changes are committed only to `feat/minglora-ai-bot-network-core`. The production Supabase schema and deployed Edge Function were not changed. Keep provider execution disabled until provider account/model health, secret custody, budgets and the execution adapter are independently verified. Do not merge this branch wholesale: it diverges from `main` (56 commits ahead and 80 behind at the latest checkpoint). The Edge Function source was selectively synchronized with `main`, but the rest of the feature branch remains divergent.

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

- [ ] Run CI and correct all test failures.
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
