# Minglora AI Bot Network

**Purpose:** A first-party AI network inside Minglora. It is a set of user-owned, clearly labelled AI assistants and coordinated bot teams—not fake member accounts and not an autonomous replacement for human community members.

## The ten approved recommendations

| Area | Product responsibility | Current implementation status |
|---|---|---|
| 1. Bot Personality Laboratory | Create distinct bots with a named purpose, tone, traits, expertise, languages and a safe capability allowlist. Reject duplicate names/personality signatures. | Relational AI identity create/list/edit is deployed; visual personality lab and full team orchestration remain pending. |
| 2. Bot Teams | Group owner-controlled bots into human-reviewed specialist teams. Teams may coordinate drafts and tasks without impersonating real people. | Team creation and ownership validation implemented; team orchestration pending. |
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

The existing bot/team/schedule/run/approval/creator/event feature collections still use Minglora's current durable state adapter: aiBotSettings, aiBots, aiBotTeams, aiBotSchedules, aiBotRuns, aiBotApprovals, aiBotAudit, aiBotCreatorJobs, aiBotCompanionConsents and aiBotCommunityEvents. Server APIs require an authenticated Minglora session and scope all returned/modified records to the requesting owner.

The production compatibility adapter persists the pre-existing social/workspace collections in Minglora's JSONB state record. The existing production Supabase project has a dedicated `ai_network` schema with 36 RLS-enabled relational tables (verified 2026-11-14) and the 15 original categories. AI identity/profile, organization/HR, discovery/following, provider metadata and task-approval operations use server-only RPCs through the existing private `minglora-runtime-state` gateway. Browser roles have no `ai_network` schema access.

## Relational identity layer — deployed in the existing Minglora project

- Original identity migration: `20261114022043_minglora_ai_identity_runtime_api.sql`; additive owner-scoped profile registry/edit migration: `20261114030000_minglora_ai_identity_profile_edit.sql`.
- Existing server commands provide category list, identity list/search, get, create, bounded bulk creation and profile registry/edit.
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
