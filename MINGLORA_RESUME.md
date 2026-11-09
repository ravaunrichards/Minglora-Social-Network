# MINGLORA Resume Checkpoint

Updated: 2026-11-09 01:55 America/Jamaica
Project scope: **Minglora Social Network only**
Repository: https://github.com/ravaunrichards/Minglora-Social-Network
Active work branch: `feat/personal-ai-bots-network-control-center`
Draft PR: https://github.com/ravaunrichards/Minglora-Social-Network/pull/202
Supabase project: `gzycobgbasnqqhnympkr` (Minglora, us-east-1)

## Original task and acceptance criteria

Continue and complete the existing Minglora Personal AI Bots Network implementation from the current feature branch. Preserve the original product boundary, requirements, existing Minglora account system, data, services and user-facing features. Do not create a second application, Supabase project, human-account system or separate bot social network.

Acceptance requires:
- All 15 built-in AI categories plus non-destructive custom category management.
- Owner-only, MFA-protected Admin Centre and API; same-origin write checks; immutable/auditable administrative controls.
- Clearly labeled AI-only identities, distinct from human Auth users and human social metrics.
- Personality Laboratory, bot teams, smart scheduling, performance centre, multilingual capabilities, AI Creator Studio, AI Security and Trust Centre, opt-in AI companionship, AI community events, and centralized command centre.
- Per-bot controls, human approval, least privilege, usage budgets, emergency pause/recovery, separate AI relationship/accounting and no fabricated engagement.
- Durable, retryable, idempotent background execution with bounded concurrency, spend/provider limits, observability and safe shutdown.
- Real provider/model integration and honest failure states; no simulated or placeholder execution.
- Real public AI profiles and media, dedicated AI relationship/follow controls, privacy/block checks, and member-facing disclosure/report/block controls.
- Tests and verification for implementation; never report staged, un-deployed or untested work as production-complete.

High-impact publishing, media sharing, reels, comments, replies, reactions, follows/unfollows, group participation, messages, events and live broadcasts must never become autonomous permissions. A queued/approved task is not an executed task. Before execution, re-check authorization, approval, bot/network/category state, target privacy, blocks, member status, limits and idempotency.

## Repository and deployment state inspected

- Repository access and push permission confirmed.
- Branch tip at checkpoint: `591348345843f50ba4ff403d79ff93f3913770be`.
- Latest branch commit: `docs(ai): clarify canonical identity integration and production rollout state`.
- Draft PR #202 is open and intentionally remains a draft.
- Branch contains the owner-only Admin API, service layer, control-centre UI, tests, a bot-specific CI workflow and staged migration `supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql`.
- Existing live Supabase project is ACTIVE_HEALTHY. Its applied migration history currently ends at `085_minglora_full_circle_default_avatar`; the AI bot foundation migration is not applied.
- The live project does not yet contain the staged `ai_*` bot identity tables. Do not apply the production migration or deploy the changed Edge Function without a release/production authorization gate and verification.
- Existing Edge Function: `minglora-runtime-state`, active version 112. Feature-branch gateway changes are not production-deployed.
- `backend/workers/README.md` confirms no durable job queue or dedicated worker is connected.
- The branch has no provider account, model request, credential reference, failover, or mailbox provisioning configured. Do not claim inference, email provisioning, or autonomous actions work.

## Completed on this branch (not yet production-verified)

- Owner-only MFA gate and same-origin validation for writes.
- Fifteen built-in categories and custom categories; bot profiles and AI disclosure metadata.
- Disabled-by-default bot creation, per-bot enable/pause state, global/hybrid switches and restrictive hybrid allowlist.
- Owner instruction intake, approval/cancellation queue, rate limits and emergency shutdown.
- Selected-bot follow/unfollow instruction batching with per-bot approvals and duplicate/block/account-status checks; execution remains disabled.
- Owner-managed teams and membership assignment/removal; teams do not activate bots.
- Bulk bot controls, scheduling configuration, capacity/task budgets and audit history.
- Staged canonical PostgreSQL identity schema, batch upsert/list RPCs, server-secret-protected runtime gateway integration, and Admin Centre canonical identity readback. These are staged only and fail closed until release deployment.
- Separate first/middle/last-name fields, languages, identity ownership/lifecycle/version/audit metadata.
- Bot-specific CI run #74 succeeded at checkpoint (commit `591348345843f50ba4ff403d79ff93f3913770be`).

## Remaining requirements (not completed)

1. Durable distributed queue, worker lifecycle, leases, retries, idempotency, dead-letter handling, concurrency limits and recovery.
2. Provider/model account management, secret references, inference adapters, health checks, budgets and provider failover.
3. Real AI email identity-provider integration and mailbox provisioning.
4. Public AI bot profile pages, profile media, upload policies and disclosure/member block/report pathways.
5. Dedicated AI followers/following relationship store, target-account manager, private-account approval and exclusion management; execution remains gated.
6. Smart scheduling with timezone/DST-safe scheduling, activation/deactivation and missed-run recovery.
7. Performance Centre with verified runtime telemetry, queue latency, failures, provider spend attribution and per-bot metrics.
8. Multilingual inference/translation, language quality checks and provider routing.
9. AI Creator Studio for generated drafts/assets with explicit review and publication boundaries.
10. Security and Trust Centre: anomaly detection, consent, risk rules, suspension/appeals, audit exports and incident recovery.
11. Opt-in AI friendship/companion sessions with clear AI identity, consent and member controls.
12. Community events, quizzes and competitions with approval, scheduling and anti-spam limits.
13. Controlled execution of permitted low-impact work; high-impact social interactions remain approval-gated.
14. Load, stress, multi-worker concurrency, failure/restart and recovery drills.

## CI and verification snapshot

- Bot-specific Personal AI Bots CI for the current branch tip: **success** (run 42575605694).
- General repository CI for the same commit: **failure** in the broad automated test suite and the separate For You navigation test job.
- Observed general-suite failures concern existing service-worker cache naming/update checks, profile edit selector, story media structure, story-dialog z-index, top Settings control, auth bootstrap ordering, theme preview checks, and For You header/story navigation checks. These are outside the bot module; compare against `main` before changing unrelated files.
- Dependency audit, repository structure check, JS syntax check and original gift asset generation passed in the general CI run; automated tests failed.
- Bot-specific workflow covers bot module/UI syntax and bot tests, but currently runs Node 22 while the repository engine is Node 24. Review and align toolchain before release verification.
- No production migration, Edge Function deployment, live owner-browser acceptance test, provider execution, or real worker execution has been verified.

## Current work in progress

Resume the Personal AI Bots Network at the highest-priority unfinished dependency: **durable execution infrastructure**. Preserve the current JSONB compatibility collections until normalized queue/tasks/settings/team migrations are safely staged and reconciled. Do not let a new worker execute a task merely because it is present or approved.

## Exact next action

1. Re-fetch the current branch tip, this checkpoint, `docs/PERSONAL_AI_BOTS.md`, the staged AI migration, gateway code and current bot tests.
2. Design and implement the durable queue schema/RPCs and worker around the existing Minglora Supabase runtime gateway, with transactional claiming/lease expiry, idempotency, bounded retries and dead-letter handling.
3. Keep task execution disabled by default until a real approved provider adapter and all preflight authorization checks are configured. Do not write an in-memory-only or fake worker.
4. Add migration/schema and unit/integration tests; run bot CI and general CI; fix regressions caused by this branch without disabling tests.
5. Update this checkpoint at each milestone with commit SHA, files, checks, failures and the next exact action.
6. Keep PR #202 draft and do not merge/deploy production resources unless separately authorized and verified.

## Resume rules

On reconnection, inspect the actual branch and latest commits first, then read this file and `docs/PERSONAL_AI_BOTS.md`. Trust repository/CI/database evidence over this checkpoint if the state has changed. Resume from the first unverified remaining item, do not repeat completed work, and keep all work within Minglora Social Network.
