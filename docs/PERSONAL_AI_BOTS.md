# Minglora Personal AI Bots Network — implementation status

## Product boundary

The Personal AI Bots Network belongs inside **Minglora Social Network**. It uses the existing repository, designated owner-only Admin Centre and current Minglora state persistence adapter. It is not a separate social network and must not create a second Supabase project or independent human-account system.

## Master category set

1. AI Friends
2. AI Creators
3. AI Influencers
4. AI News
5. AI Musicians
6. AI Entertainers
7. AI Gamers
8. AI Community Hosts
9. AI Live Hosts
10. AI Moderators
11. AI Support
12. AI Educators
13. AI Sports
14. AI Travel
15. AI Business

Administrators can add custom categories, rename built-in or custom categories, edit descriptions, and enable/disable categories without deleting bot or category history.

## Capacity design

The approximately 8.3-billion identity figure is stored as an aspirational identity-design envelope, not a provisioned account count, service-level promise, or concurrent execution claim. The system distinguishes registered, enabled, recently active and currently executing bot identities. Actual concurrent work must be bounded by worker capacity, provider quotas, latency, spend limits, rate limits and abuse protections.

No arbitrary product-level ceiling is imposed on the eventual identity namespace. The current Minglora state adapter is a single JSONB compatibility document and is not a horizontally scalable bot data plane. A normalized relational schema and durable queue/worker migration are prerequisites before claiming large-scale capacity.

## Implemented foundation on the feature branch

- Private owner-only API behind Minglora's designated administrator identity and MFA-verified session.
- Same-origin verification for write requests.
- Fifteen built-in categories and custom categories.
- Unique AI-only username namespace (ai_...), visible AI disclosure metadata, biography, personality, interests, hobbies and language preferences.
- Per-bot enable, disable and pause state.
- Global network and hybrid switches.
- Per-category enable/disable and rename/description editing.
- Per-bot personality/profile editing and administrator instructions.
- Administrator-controlled, human-approval and restricted-hybrid modes; switching out of hybrid clears autonomous permissions.
- Hybrid allowlist limited to read-only analytics, moderation flags for human review, content drafts, translation and FAQ drafts.
- Per-bot schedule configuration (timezone, days, active hours and daily task cap). This is configuration only until a scheduler worker is connected.
- Per-bot task intake limits: at most 20 new instructions in a rolling 15-minute window and 50 open tasks for that bot.
- Per-bot instructions and an approval/cancellation queue.
- Owner-managed Bot Teams: create, rename, describe, enable/pause/disable and assign/remove up to 100 selected bot identities per request. Membership is unique per team and does not activate bots.
- Bulk enable/disable/pause of explicitly selected bots, up to 100 per operation.
- Emergency shutdown: disables network switches, pauses enabled bots and cancels open instruction records.
- Administrator audit history for bot and category changes.
- Capacity settings for concurrent execution and daily task budgets. A zero execution limit keeps work dispatch disabled.
- AI bot state is stored in dedicated bot collections, not the human users collection, so these records do not become human accounts or human engagement.

## Mandatory operating safeguards

- All new bots start disabled and administrator-controlled.
- AI identities and AI-produced content must remain clearly labeled.
- AI followers, views, reactions, comments and other activity must be reported separately and never blended into human popularity counts, social proof, rankings or recommendation signals.
- Do not fabricate activity to make a bot or human account appear popular.
- Bulk follow/engagement-boosting operations against human accounts are not part of this control plane. Single-bot follow/unfollow requests can only enter the owner approval queue; they are not executed by the current release.
- Publishing, media sharing, reels, comments, replies, reactions, group participation, messages, events and live broadcasts are high-impact tasks and never autonomous permissions.
- A queued instruction is not executed. An approved task stays in approved_waiting_for_worker with worker_not_configured.
- A future worker must re-check the network, category, bot status, administrator approval, target account privacy, blocks, member status, current rate limits, idempotency and separate AI-statistics accounting immediately before execution.
- Secrets and model credentials must remain server-side.
- Human members must be able to block, report and identify AI accounts as AI.

## Still not implemented

| Phase/system | Current state |
|---|---|
| Database normalization, dedicated tables and RLS for bot entities | Additive service-role-only migration is staged in `supabase/migrations`; not applied to the live project and not yet wired to the API. Current app persistence still uses the runtime-state adapter. |
| Durable distributed queue and background workers | Not implemented |
| Shared AI/model provider integration and provider failover | Not implemented |
| Real public AI bot profile pages, profile photos and profile-media uploads | Not implemented |
| Dedicated AI followers/following relationship service and target-account manager | Not implemented |
| Safe follow/unfollow execution, private-account approval workflow and exclusion manager | Not implemented; instruction records only |
| Personality Laboratory with live model testing | Profile fields exist; model testing not connected |
| Bot Teams and team membership management | Implemented on the feature branch: owner-scoped team creation, editing, enable/pause/disable, membership assignment and removal; teams do not activate bots. Not production-verified. |
| Smart scheduling and scheduled activation/deactivation execution | Schedule settings stored; no scheduler |
| Performance Centre with live telemetry, error rates and spend attribution | Basic state counters and task/audit records only |
| Multilingual model inference and translation provider | Language preferences stored; no model provider |
| AI Creator Studio graphics/video/media generation | Draft task types only |
| Bot Security and Trust Center, anomaly detection and suspension automation | Basic owner gating, rate limiting, audit and emergency shutdown only |
| Member-facing AI friendship/companion sessions and consent | AI Friends category only |
| Community events, quizzes and competitions execution | Task types only |
| Social interaction execution (posts, reels, comments, messages, reactions, groups, events, live) | Not implemented; no worker connected |
| Horizontal scaling, load/stress testing and recovery drills | Not implemented |

## Data collections added to the existing state model

- personalAiBotCategories
- personalAiBots
- personalAiBotTasks
- personalAiBotAudit
- personalAiBotSettings
- personalAiBotFollows (reserved; not yet an executing relationship store)
- personalAiBotTeams (reserved; team manager not yet implemented)
- personalAiBotTeamMembers (reserved)
- personalAiBotSchedules (reserved; current schedules are stored on bot records)

The current src/store.js adapter serializes runtime state into the existing Minglora Supabase JSONB compatibility document. Do not claim normalized tables, independent row-level policies, a distributed queue or multi-instance writes have been delivered.

## Database migration status

`supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql` stages additive AI-only tables in the existing Minglora public schema. RLS is enabled on each table, and table privileges are limited to `service_role`; no anonymous or authenticated member access is granted. AI follows and AI followers are stored separately from `public.user_follows`, and bot identities are not inserted into `auth.users` or `public.profiles`. The migration has **not** been applied to the live Supabase project. It was executed inside a transaction ending in `ROLLBACK`; the follow-up query confirmed that the new settings, bot, team, task and follow tables are absent from production. The current Node Admin API still reads and writes the existing runtime-state compatibility document; an audited service-role gateway integration and controlled migration application are required before production use.

## Routes

All routes are under /api/admin/personal-ai-bots and are protected by the owner-only MFA authorization check.

- GET / — overview, categories, bots, tasks, audit.
- POST / — create one disabled bot.
- POST /starter-set — create one disabled starter bot per built-in category.
- POST /categories — create a custom category.
- PATCH /categories/:categoryId — edit a category or enable/disable it.
- PUT /network — global network, hybrid and capacity settings.
- POST /emergency-shutdown — pause bots and cancel open tasks.
- POST /bots/bulk — bulk enable, disable or pause selected bot IDs.
- PATCH /bots/:botId — profile, schedule, permissions and status.
- POST /bots/:botId/instructions — create an owner instruction for approval.
- POST /tasks/:taskId/approve — approve only while network, category and bot are enabled; no worker is invoked.
- POST /tasks/:taskId/cancel — cancel an open instruction.

## Verification

CI is configured to run syntax checks for the new bot module/UI/tests, npm run check:repo, dependency audit and npm test. A passing GitHub Actions result is required before marking this phase verified. The draft PR must remain unmerged and un-deployed until review.

Recommended local release gate:

    npm ci
    npm run check:repo
    npm test

End-to-end verification still needs the designated owner account with a valid MFA session and the hosted Minglora environment. The new owner-only UI has not yet been exercised in a real browser session, and the normalized migration remains unapplied.
