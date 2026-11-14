# Minglora AI Bot Network — Mainline Integration Checkpoint

Updated: 2026-11-13 (America/Jamaica)

## Scope and source control

- Canonical repository: `ravaunrichards/Minglora-Social-Network`.
- Existing Supabase project: `gzycobgbasnqqhnympkr` (`Minglora`).
- Integration base: current `main` at `fc600dfb3a7cd7ff6b7ba4bd1b2fe3830340d1b7`.
- Original AI source: `feat/minglora-ai-bot-network-core` at `b528ee66ccbe8c01ac70d2966ca9bb2e5a382fa1`, draft PR #278.
- The original branch diverged from current main (138 commits ahead, 99 behind). It is not safe to merge wholesale. The integration branch ports only the AI-specific module, routes, UI, runtime commands, migrations and focused tests; unrelated older changes are deliberately excluded.

## Verified production baseline

- Supabase project status: `ACTIVE_HEALTHY`; PostgreSQL 17.11.
- The private `ai_network` schema contains the original relational identity tables and 15 categories.
- `anon` and `authenticated` do not have USAGE on `ai_network`; `service_role` does.
- Current counts: 15 categories; 0 AI identities, profiles, email identity records, provider accounts, models or provider assignments.
- Current production `minglora-runtime-state` Edge Function version: 115.
- No new AI migration was applied, no Edge Function was deployed, and no AI record, human Auth user, provider credential or email inbox was created.

## Integration in this branch

- Additive AI API routes, existing Minglora session authorization and administrator checks.
- AI Network workspace, navigation/render entry, responsive styles and service-worker cache assets.
- AI domain collections in the existing store.
- Six private-schema SQL migrations for identity RPC, organization/positions, HR, provider catalogue/assignments, durable task approvals and discovery/following.
- Edge runtime allowlisting and RPC handlers for those six command groups. The current mainline collection inventory is preserved.
- Nine AI-specific unit/regression test files and a focused GitHub Actions workflow.
- Provider records remain metadata-only until an approved secret manager and provider adapter verify a real connection. Task execution remains fail-closed; worker leases are not enabled.

## Ten-stage implementation tracker

1. **Safe integration and relational foundation** — IN PROGRESS. Existing base identity schema/security verified; mainline integration is being assembled. Later migrations/runtime gateway are not yet deployed.
2. **Identity registry, profiles, bulk creation and email/provider metadata** — SOURCE IMPLEMENTED, NOT LIVE-VERIFIED. No AI records exist in production.
3. **Worldwide discovery and following** — SOURCE IMPLEMENTED, NOT LIVE-VERIFIED.
4. **Corporate hierarchy and HR** — SOURCE IMPLEMENTED, NOT LIVE-VERIFIED.
5. **Supervision, approvals, task queue and collaboration** — PARTIAL. Queue/approval source exists; execution workers remain disabled.
6. **Social, creator, companionship and community activities** — PARTIAL. Draft workflows exist; public publishing and real model execution are not verified.
7. **Provider adapters, budgets, resource metering and memory** — NOT COMPLETE. No provider credentials/health, real inference or cost reconciliation verified.
8. **Security centers, administration and operational analytics** — PARTIAL. Role checks/audit foundations exist; full operational evidence is not complete.
9. **Distributed scaling and device/load validation** — NOT STARTED. No 10-billion capacity or concurrency claim is made.
10. **Production release and deployment verification** — BLOCKED on clean CI/integration review, reviewed migrations, and a reconciled Edge Function deployment.

## Release guardrails

- Do not merge the original divergent PR #278 wholesale.
- Do not apply migrations or deploy the Edge Function until the integrated branch passes CI and the SQL/runtime pair is reviewed together.
- Keep all AI execution disabled until a provider adapter, secret handling, budget reservation, audit, human approvals and worker identity are proven.
- Never claim an email inbox, provider connection, model execution or 10-billion capacity from metadata or design intent alone.
