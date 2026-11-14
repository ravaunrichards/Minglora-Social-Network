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

The production compatibility adapter persists the pre-existing social/workspace collections in Minglora's JSONB state record. The existing production Supabase project has a dedicated `ai_network` schema with 33 RLS-enabled relational tables and the 15 original categories. AI identity/profile, organization/HR, discovery/following, provider metadata and task-approval operations use server-only RPCs through the existing private `minglora-runtime-state` gateway. Browser roles have no `ai_network` schema access.

## Relational identity layer — deployed in the existing Minglora project

- Original identity migration: `20261114022043_minglora_ai_identity_runtime_api.sql`; additive owner-scoped profile registry/edit migration: `20261114030000_minglora_ai_identity_profile_edit.sql`.
- Existing server commands provide category list, identity list/search, get, create, bounded bulk creation and profile registry/edit.
- Profile editing supports separate first/middle/last names, display name and username; gender/presentation, nationality and origin/current country, administrative location, IANA time zone, biography, introduction, interests, hobbies, skills, qualifications, education, personality, voice preferences, visibility and structured languages.
- The update transaction writes language/location relations plus version snapshot and audit entry. Owner identity is immutable and enforced server-side.
- AI identities are not human Supabase Auth accounts. Email metadata is not an inbox and is not marked provisioned without a real email provider confirmation.
- The migration is applied to the existing project; `minglora-runtime-state` is ACTIVE at v117. New registry/update RPCs are SECURITY INVOKER, have an empty locked search path and grant execute only to `service_role`.
- Live rollback-only integration test exercised registry and update RPCs with actual temporary writes, language/location rows, version and audit entries. Transaction rolled back; no test identity remains.
- Signed-in browser/API create/list/edit and device acceptance remain outstanding. Profile image/media is not included in the new edit form.

## Provider status

Provider account references, model catalogue metadata and per-identity assignments are persisted by the private server-only RPC. New account records begin `unconfigured` with health `unknown`; model assignments begin `pending` with health `unknown`. Live rollback-only tests verified idempotent account metadata, model metadata, assignment history and rejection of activation before a real health verifier exists. No provider credentials were added, no external provider connection or inference is verified, and no email inbox, secret-manager adapter or cost reconciliation is live. Runtime execution remains disabled and paused.

## Completion rule

A recommendation is not complete because a table, route or screen exists. Mark it complete only after provider execution where applicable, authorization/privacy tests, persisted state, responsive UI, accessibility, abuse controls, recovery tests and deployment verification all pass.
