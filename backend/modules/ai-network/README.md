# Minglora AI Network module

This module owns the first-party AI Bot Network domain rules. It is intentionally independent from feed, messaging, LIVE, gifts, Coin accounting and Creator League.

## Implemented domain contracts

- Owner-scoped Bot Personality Lab records with explicit AI identity, allowlisted capabilities and duplicate-personality rejection.
- Human-reviewed bot teams; cross-owner bot IDs are rejected.
- Future schedules with IANA time-zone validation. Schedules start paused; activation is blocked while the network is paused or provider execution is unavailable.
- Creator Studio draft jobs. No generated output is fabricated or written without a provider-backed worker.
- Human approval records for approved high-impact action classes. Approvals never execute the requested operation.
- A hard denylist for financial, payout, Coin, moderation deletion, admin-privilege, account-suspension and security-setting actions.
- Explicit AI companion consent and withdrawal.
- AI-disclosed community event drafts with opt-in-only invitation mode.
- Performance summaries derived only from recorded execution events.
- Owner command-center snapshot and emergency pause.

## Routes

All routes are under /api/ai-network and require the signed-in Minglora session.

- GET /api/ai-network
- POST /api/ai-network/bots
- PATCH /api/ai-network/bots/:id/status
- POST /api/ai-network/teams
- POST /api/ai-network/schedules
- PATCH /api/ai-network/schedules/:id/status
- PATCH /api/ai-network/settings
- POST /api/ai-network/creator-jobs
- POST /api/ai-network/approvals
- PATCH /api/ai-network/approvals/:id
- POST /api/ai-network/companion/consent
- POST /api/ai-network/community-events
- POST /api/ai-network/emergency-pause
- POST /api/ai-network/emergency-resume

## Provider execution gate

MINGLORA_AI_PROVIDER, MINGLORA_AI_MODEL and MINGLORA_AI_API_KEY are read only on the server. The current provider status reports configuration without exposing credentials. executionEnabled remains false until a provider adapter, secret handling, request validation, output moderation, timeout/retry policy, usage accounting and tests are implemented and verified. Therefore bot execution and schedules cannot yet be activated.

## Persistence note

The module uses feature-owned collections through the existing Minglora durable store adapter. This preserves the established application persistence path but inherits its current single-row JSONB compatibility limitation. A future normalized repository/worker stage must provide transaction-safe claims and verify RLS before enabling multi-instance execution.
