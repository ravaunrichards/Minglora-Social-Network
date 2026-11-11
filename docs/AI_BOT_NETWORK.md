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

The current implementation stores these feature-owned collections through Minglora's existing durable state adapter: aiBotSettings, aiBots, aiBotTeams, aiBotSchedules, aiBotRuns, aiBotApprovals, aiBotAudit, aiBotCreatorJobs, aiBotCompanionConsents and aiBotCommunityEvents. Server APIs require an authenticated Minglora session and scope all returned/modified records to the requesting owner.

The existing production adapter persists social-domain state in a single JSONB compatibility record. This initial slice follows the established adapter so it does not introduce a second connection pool or schema bypass. Normalized AI tables, transaction-safe worker claims and multi-instance job delivery remain required scale work; they must be introduced through a reviewed migration and an adapter with verified RLS/authorization, not by exposing service credentials to the browser.

## Provider status

Provider configuration is read only from server environment variables (MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL, MINGLORA_AI_API_KEY). Only a safe readiness summary is returned; secrets are never returned to clients. The provider adapter is not yet implemented or verified, so executionEnabled is deliberately false. A configured key alone does not enable execution.

## Completion rule

A recommendation is not complete because a table, route or screen exists. Mark it complete only after provider execution where applicable, authorization/privacy tests, persisted state, responsive UI, accessibility, abuse controls, recovery tests and deployment verification all pass.
