# Minglora Personal AI Bots Network

## Scope

The Personal AI Bots Network is a feature inside Minglora Social Network. It uses the existing Minglora repository, account model, Admin Centre and persistence adapter. It is not a separate social network.

## Initial categories

Assistant Bots, Moderation Bots, Customer Service Bots, Automation Bots, Analytics Bots, Companion Bots, Creators, Influencers, Friends, News, Entertainers, Musicians, Community Hosts, Supports and Live Hosts.

Additional categories can be created by the designated administrator.

## Owner controls

The dedicated private page is \`/personal-ai-bots.html\`, linked from the existing Admin Centre. All API operations require the designated Creator Hub owner identity and an MFA-verified owner session. Writes also require same-origin requests.

The control plane supports:
- Global network enable/disable.
- Per-category enable/disable.
- Per-bot enable/disable/pause.
- Individual bot creation and a one-per-category starter set.
- Custom categories.
- Per-bot administrator-controlled or restricted-hybrid mode.
- Per-bot low-risk hybrid permissions.
- Instructions, approval/cancellation queue and audit history.
- Lookup of real active Minglora members as potential follow/unfollow targets.

## Default operating rules

- Network starts disabled.
- New bots start disabled.
- Default bot mode is administrator-controlled.
- No bot has autonomous permissions by default.
- Every instruction is stored for administrator approval.
- Publishing, following, unfollowing, member messaging, automated customer responses and live broadcasting are high-impact and are never enabled as autonomous actions.
- Hybrid allowlist is restricted to read-only analytics, moderation flags for human review, content drafts, translations and FAQ drafts. A specific administrator instruction is still required.
- Approval changes a task to \`approved_waiting_for_worker\`; it does not execute it.
- No AI provider or bot execution worker is connected in this initial control-plane release.
- AI bot identities are separate from human accounts. Starter bots do not create human profiles, posts, follows, likes, comments, messages or fabricated engagement.

## Current implementation boundary

This first stage implements owner-protected bot configuration, category/bot controls, instruction intake, approval state, and administrative audit history using Minglora's existing runtime-state adapter. It does not yet connect a model provider, persistent worker queue, social-action executor, profile publishing, follow edge creation, messaging, live broadcasting, scheduler, analytics pipeline, team manager, personality laboratory, Creator Studio, multilingual runtime, or member-facing companion sessions.

Those features must be added in further phases. Every worker must re-check global, category and bot enablement, the current administrator-approved task, permissions, target account eligibility, rate limits and idempotency immediately before an action. A global shutdown must cancel or reject pending dispatches. No approval may be treated as blanket authorization for future tasks.

## Data collections

The existing state adapter has been extended with:
- \`personalAiBotCategories\`
- \`personalAiBots\`
- \`personalAiBotTasks\`
- \`personalAiBotAudit\`
- \`personalAiBotSettings\`
- \`personalAiBotFollows\`
- \`personalAiBotTeams\`
- \`personalAiBotTeamMembers\`
- \`personalAiBotSchedules\`

These collections are stored within the existing Minglora runtime state. No new Supabase project, production database migration, or deployment is required for this stage.

## Verify before release

Run:

\`\`\`bash
npm test
npm run check:repo
\`\`\`

Before merge/deploy, verify owner/MFA access, non-owner denial, global/category/bot controls, instruction approval and cancellation, persistence across reloads, mobile layout, no autonomous social actions, and clean regression tests for existing Minglora functionality.
