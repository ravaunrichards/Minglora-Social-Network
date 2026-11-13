# Minglora AI Bot Network — Stage Queue

**Goal:** Complete the ten AI Bot Network recommendations as one secure, coherent Minglora feature. Keep the AI Network separate from existing social/LIVE/gift workflows while reusing Minglora authentication, state, privacy, UI and deployment infrastructure.

Statuses: NOT STARTED · READY · IN PROGRESS · VERIFYING · COMPLETED · BLOCKED.

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
**Status:** VERIFYING — source committed; production deployment not applied
- Existing `ai_network` schema and 15 categories verified in the existing Minglora Supabase project.
- Server-only RPC source supports owner-scoped category listing, paged list/search, get, one-at-a-time create, and batches up to 100.
- Separate first/last names, unique username/profile identifier, idempotency, identity ownership, profile/gender, language/location, audit/version/status records and optional email identity metadata.
- No Supabase Auth user is created for an AI identity.
- Email metadata is recorded as unverified / not requested until a connected email provider confirms provisioning.
- Service-role-only grants; browser roles retain no access to the private `ai_network` schema.
- AI-specific foreign-key indexes added to migration source.
- Authenticated Node API and private runtime-gateway source added; actual UI identity registry reads live API results.
- Rollback-only database tests passed create/get/list/search/idempotent retry, bounded bulk create, two primary/non-primary language records and separate origin/current location records; transactions rolled back and production row count remains zero.
- Source-level syntax and static regression checks passed; GitHub Actions result is still unconfirmed.
**Acceptance before COMPLETED:** apply reviewed migration, deploy the reconciled runtime Edge Function, run authenticated create/get/list/bulk tests, verify row-level records and RLS from Supabase, then verify desktop/mobile UI. Discovery filters/saved groups, profile editing/media, following and provider assignments remain separate Phase 2 work.
**Runtime reconciliation:** the feature-branch Edge Function is now current `main` plus the AI gateway handler and AI collection group; an exact normalized comparison confirmed all other runtime source is preserved, including newer video playlist/channel entries.
**Safety boundary:** no production migration or Edge Function deployment has occurred yet. Production still runs runtime function version 112.

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
**Status:** IN PROGRESS — organization/department/position foundation and workspace wiring committed; production deployment pending
- Organizations, board/executive hierarchy and reporting relationships.
- Twenty department templates, organization-scoped departments, positions and job descriptions.
- Recruitment, vacancies, appointments, onboarding, promotions, transfers, suspension, termination and employment history.
- Delegated appointments with explicit authority and audit history.
**Schema finding:** a read-only inventory of the current `ai_network` schema found no organization, department, position, employment, vacancy or HR-history tables.
**Acceptance:** owner-scoped CRUD, hierarchical integrity, appointment authorization, complete history and cross-organization isolation tests.

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
