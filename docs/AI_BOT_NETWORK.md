# Minglora AI Bot Network

**Purpose:** A first-party AI network inside Minglora. It is a set of user-owned, clearly labelled AI assistants and coordinated bot teams—not fake member accounts and not an autonomous replacement for human community members.

## The ten approved recommendations

| Area | Product responsibility | Current implementation status |
|---|---|---|
| 1. Bot Personality Laboratory | Create distinct bots with a named purpose, tone, traits, expertise, languages and a safe capability allowlist. Reject duplicate names/personality signatures. | Backend profile creation and duplicate checks implemented; visual lab and editing flow pending. |
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

The production compatibility adapter persists those pre-existing social/workspace collections in Minglora's JSONB state record. In parallel, the existing production Supabase project now has a dedicated `ai_network` schema with relational AI identity/profile/name/email/provider/ownership/permission/status/version/audit tables and the 15 original categories. The new identity layer is being connected through a server-only RPC and the existing private `minglora-runtime-state` gateway. The schema remains private to server-side `service_role`; it is not exposed to browser roles.

## Relational identity layer — staged, not deployed

- Migration source: `supabase/migrations/20261113100000_minglora_ai_identity_runtime_api.sql`.
- Owner-scoped server commands: category list, identity list/search, get, create and batches of 1–100 identities.
- Every identity receives its own UUID, first name, last name, username, profile identifier, population, category, owner, status, supervision level, profile, audit entry and version snapshot.
- Profile inputs include gender, gender presentation, nationality, separate origin/current ISO country codes, state/province, parish/county, district, city, town, time zone, biography, introduction, profession, interests, hobbies, skills and language records.
- The registration form provides a searchable browser country picker backed by 249 ISO 3166-1 country/territory codes.
- Creation uses owner-scoped idempotency. AI identities are not Supabase Auth users.
- Optional email metadata is saved as `unverified` / `not_requested`; it is not an inbox and is not presented as a provisioned mailbox.
- The staged authenticated Node routes call the existing private runtime gateway; that gateway calls the service-role-only RPC. No provider secret is sent to the browser.
- Database behavior was exercised inside explicit rollback transactions: create/get/list, separate names, profile/gender, languages, origin/current locations, retry reuse, category listing and bounded bulk creation. Every test transaction was rolled back.
- Production deployment is still pending. At the recorded checkpoint the live identity count remains zero; the migration indexes and RPC were absent after rollback. The currently deployed runtime function is version 112, and the feature branch is behind main, so runtime source must be reconciled before any deployment. Do not deploy the old feature-branch copy over the newer production function.

Normalized identity records are therefore an additive foundation, not proof that discovery, provider execution, workforce operations or the 10-billion target is live. Transaction-safe worker claims, multi-instance job delivery and distributed scaling remain future work and must use reviewed migrations and independently verified authorization.

## Provider status

Provider configuration is read only from server environment variables (MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL, MINGLORA_AI_API_KEY). Only a safe readiness summary is returned; secrets are never returned to clients. The provider adapter is not yet implemented or verified, so executionEnabled is deliberately false. A configured key alone does not enable execution.

## Completion rule

A recommendation is not complete because a table, route or screen exists. Mark it complete only after provider execution where applicable, authorization/privacy tests, persisted state, responsive UI, accessibility, abuse controls, recovery tests and deployment verification all pass.
