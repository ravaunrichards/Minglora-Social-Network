# Minglora Personal AI Bots Network — implementation status

## Product boundary

The Personal AI Bots Network belongs inside **Minglora Social Network**. It uses the existing repository, designated owner-only Admin Centre, existing Minglora Supabase project and existing runtime gateway. It is not a separate social network and must not create a second Supabase project or independent human-account system.

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

The 10-billion identity target is stored as an aspirational identity-design envelope, not a provisioned account count, service-level promise, or concurrent execution claim. The system distinguishes registered, enabled, recently active and currently executing bot identities. Actual concurrent work must be bounded by worker capacity, provider quotas, latency, spend limits, rate limits and abuse protections.

No arbitrary product-level ceiling is imposed on the eventual identity namespace. The current Minglora state adapter remains a single JSONB compatibility document and is not a horizontally scalable bot data plane. The normalized identity schema and durable task queue are staged on this feature branch, but no horizontal scaling or large-scale capacity has been measured.

## Implemented foundation on the feature branch

- Private owner-only API behind Minglora's designated administrator identity and MFA-verified session.
- Same-origin verification for write requests.
- Fifteen built-in categories and custom categories.
- Unique AI-only username namespace (ai_...), visible AI disclosure metadata, biography, personality, interests, hobbies and language preferences.
- AI identity records carry separate first, middle and last name fields plus a full-name value; creation requires first and last names (or a multi-part display name), and editing exposes all three fields.
- The staged normalized identity schema includes profile/name/email/provider/model/location/language/capability/permission/owner/lifecycle/version/audit tables, batch upsert and paginated list RPCs. The owner API calls these through the existing server-secret-protected Supabase runtime gateway when Supabase persistence is active; the Admin Centre displays returned canonical PostgreSQL identity rows.
- Per-bot enable, disable and pause state.
- Global network and hybrid switches.
- Per-category enable/disable and rename/description editing.
- Per-bot personality/profile editing and administrator instructions.
- Administrator-controlled, human-approval and restricted-hybrid modes; switching out of hybrid clears autonomous permissions.
- Hybrid allowlist limited to read-only analytics, moderation flags for human review, content drafts, translation and FAQ drafts.
- Per-bot schedule configuration (timezone, days, active hours and daily task cap). This is configuration only until a scheduler worker is connected.
- Per-bot task intake limits: at most 20 new instructions in a rolling 15-minute window and 50 open tasks for that bot.
- Per-bot instructions and an approval/cancellation queue.
- Central Following Manager with selected-bot batches (1–10 bots per target in a rolling 24-hour window), separate approval records, duplicate prevention, the existing owner-authorized Supabase member lookup, account-status and block checks, and AI-only relationship accounting; execution remains disabled.
- Owner-managed Bot Teams: create, rename, describe, enable/pause/disable and assign/remove up to 100 selected bot identities per request. Membership is unique per team and does not activate bots.
- Bulk enable/disable/pause of explicitly selected bots, up to 100 per operation.
- Emergency shutdown: disables network switches, pauses enabled bots and cancels open instruction records.
- Administrator audit history for bot and category changes.
- Capacity settings for concurrent execution and daily task budgets. A zero execution limit keeps work dispatch disabled.
- Durable PostgreSQL task queue migration staged with stable idempotency keys, bounded attempts, retry backoff, lease tokens/expiry, heartbeats, expired-lease recovery, dead-letter status, owner-scoped RPCs, and transactional SKIP LOCKED claims.
- Task submission, bulk-follow instruction, approval, cancellation and emergency shutdown now mirror to the durable queue through the existing owner-only runtime gateway. The Admin Centre reads durable queue records and real queue statistics when Supabase persistence is active.
- Task records persist their parent AI identity before insert, preserving the canonical identity foreign key for previously created bot records. Network enabled/hybrid/capacity/budget/automatic-suspension settings are synchronized to the PostgreSQL singleton settings row; emergency shutdown closes this database dispatch gate before task cancellation sync.
- A separate worker core and npm run worker:personal-ai-bots entry point are staged. It is disabled by default, requires a verified server-side provider adapter and Supabase persistence, only accepts four low-impact text task types, has no tools or external-action permissions, and saves results as human-review drafts. It cannot publish, follow, message, react, join groups, attend events or execute live actions.
- Queue dispatch requires two independent database-only controls, execution_enabled=false and provider_ready=false, to be explicitly provisioned by a reviewed backend release; the ordinary admin settings API cannot toggle either gate. The network switch, a human approval and provider health are independent controls.
- AI bot state is stored in dedicated bot collections, not the human users collection, so these records do not become human accounts or human engagement.

## Mandatory operating safeguards

- All new bots start disabled and administrator-controlled.
- AI identities and AI-produced content must remain clearly labeled.
- AI followers, views, reactions, comments and other activity must be reported separately and never blended into human popularity counts, social proof, rankings or recommendation signals.
- Do not fabricate activity to make a bot or human account appear popular.
- The Following Manager supports selected-bot follow/unfollow instruction batches of 1–10 bots per target in a rolling 24-hour window. Every bot receives a separate owner-approval task; duplicate bot/target/operation tasks are rejected, Minglora relationship-blocks are checked, per-bot task limits apply, and AI relationships remain outside human follower counts. No batch is executed by the current release; any future worker must re-check target privacy and blocks immediately before execution.
- Publishing, media sharing, reels, comments, replies, reactions, group participation, messages, events and live broadcasts are high-impact tasks and never autonomous permissions.
- A queued instruction is not executed. An approved task stays in approved_waiting_for_worker with worker_not_configured.
- A future worker must re-check the network, category, bot status, administrator approval, target account privacy, blocks, member status, current rate limits, idempotency and separate AI-statistics accounting immediately before execution.
- Secrets and model credentials must remain server-side.
- Human members must be able to block, report and identify AI accounts as AI.

## Still not implemented

| Phase/system | Current state |
|---|---|
| Canonical AI identity records (names, profile and core metadata) | Migration and service-role-only batch/list RPCs are staged on this feature branch; owner API reads/writes through the existing runtime gateway when enabled. Not production-deployed or live-verified. Bot task/team/settings state still uses the existing JSONB compatibility adapter. |
| Durable PostgreSQL task queue, lease/retry RPCs and worker core | Implemented and tested on the feature branch; not production-deployed. Worker remains disabled and has no provider adapter. |
| Email identity management and real email provisioning | `ai_emails` schema supports separate address, provider, verification and provisioning states. No email provider is connected and no mailbox is provisioned. |
| Provider/model assignment and real AI inference | Canonical assignment tables, owner Admin API/UI, server-only provider discovery/health RPCs and model-gated task claims are staged and tested. The worker preflights server-side adapters and secrets and marks assignments unavailable when no adapter/credential is present. No actual provider adapter module, credential, successful health check or inference request is connected. |
| Real public AI bot profile pages, profile photos and profile-media uploads | Not implemented |
| Dedicated AI followers/following relationship service and target-account manager | Not implemented |
| Safe follow/unfollow execution, private-account approval workflow and exclusion manager | Selected-bot instructions are queued with duplicate, block and rate-limit checks; no follow executor, private-account approval flow or exclusion editor exists yet. |
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

## State persistence boundary

The following bot configuration collections remain inside the legacy `minglora_runtime_state` JSONB compatibility document:

- personalAiBotCategories
- personalAiBots
- personalAiBotTasks (legacy compatibility copy; task lifecycle writes are mirrored to public.minglora_ai_bot_tasks when Supabase persistence is active)
- personalAiBotAudit
- personalAiBotSettings (network settings are also synchronized to public.minglora_ai_bot_settings; provider/worker dispatch gates remain database-only and fail closed)
- personalAiBotFollows (reserved; not an executing relationship store)
- personalAiBotTeams
- personalAiBotTeamMembers
- personalAiBotSchedules (reserved; current schedules are stored on bot records)

The normalized `ai_*` tables are a separate canonical identity store. The durable task queue is normalized in public.minglora_ai_bot_tasks, and its owner-controlled network settings are stored in public.minglora_ai_bot_settings; bot/category/team/schedule/audit configuration still retains the JSONB compatibility representation. Task writes first upsert the referenced canonical AI identity, then persist the queue row. If canonical identity, task or network-settings persistence fails, the Admin API returns an error rather than reporting success. A full normalized migration of bot profiles, schedules, teams, departments and HR records remains future work.

## Database migration and rollout status

The migrations `supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql`, `supabase/migrations/20261109200000_minglora_ai_bot_durable_task_queue.sql`, `supabase/migrations/20261109213000_minglora_ai_provider_assignment_rpcs.sql` and `supabase/migrations/20261109220000_minglora_ai_email_identity_rpcs.sql` stage bot-control tables, canonical AI identity data areas, the durable approval-gated task queue, provider/model assignment and health RPCs, and AI email identity RPCs: `ai_identities`, `ai_names`, `ai_profiles`, `ai_emails`, `ai_provider_accounts`, `ai_provider_models`, `ai_provider_assignments`, `ai_identity_locations`, `ai_identity_languages`, `ai_identity_capabilities`, `ai_identity_permissions`, `ai_identity_owners`, `ai_identity_status_history`, `ai_identity_versions` and `ai_identity_audit_logs`.

The create/update and 1–100 record batch upsert functions write identity, separate first/middle/last name fields, profile, languages, ownership, lifecycle history, configuration version and audit rows transactionally. A paginated list function supplies the owner-only Admin Centre table. Functions use `SECURITY INVOKER`, an empty `search_path`, and execute grants only for `service_role`; tables have RLS enabled and are revoked from `PUBLIC`, `anon` and `authenticated`. The existing server-secret-protected runtime gateway validates the designated owner and allows only an explicit identity field list.

**Production state: not deployed.** The existing Minglora Supabase project was inspected and these AI identity/queue tables were absent. None of these migrations has been applied and the Edge Function changes have not been deployed. A read-only live Supabase query confirmed `to_regclass` returns NULL for `ai_identities`, `ai_emails`, `ai_provider_accounts`, `ai_provider_models`, `ai_provider_assignments` and `minglora_ai_bot_tasks`; the live migration ledger also has not advanced to the staged AI migration versions. Until these are deployed, canonical identity, task queue, settings and provider-assignment database reads/writes fail closed rather than claiming the new PostgreSQL storage works. Do not run the migrations or deploy the function without production authorization and release verification.

This bridge persists canonical core identity rows. Child-table workflows for email addresses, provider/model assignments, locations, capabilities, permissions and related data are not yet connected to the Admin API. No email mailbox or AI provider service is connected. Provider assignment records can be configured, but no actual provider adapter module, credential or successful health check is present. Email addresses can be recorded but remain not_verified/not_provisioned. The worker code is staged but not deployed or enabled; no AI inference, worker health or task execution is claimed as operational.

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

The dedicated Personal AI Bots CI now uses Node 24 and checks the standalone worker, server adapter, gateway and bot module syntax, plus admin API lifecycle, identity/provider/email schema, queue/worker safeguards and UI tests. Latest verified run #199: 98 passed, 0 failed, on commit `061475c9226c6dc003d63e4e5885548dc027424a`. The complete repository CI also runs, but its currently known failures remain in unrelated existing UI/navigation/profile/service-worker/theme tests. The draft PR must remain unmerged and un-deployed until review.

Recommended local release gate:

    npm ci
    npm run check:repo
    npm test

End-to-end verification still needs the designated owner account with a valid MFA session and the hosted Minglora environment. The new owner-only UI has not yet been exercised in a real browser session, and the normalized migration remains unapplied.
