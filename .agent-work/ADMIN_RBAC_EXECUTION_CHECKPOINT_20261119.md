# Minglora Admin Center — RBAC Execution Checkpoint
Date: 2026-11-19 UTC
Scope: Minglora Social Network only.

## Recovery identity
- Repository: https://github.com/ravaunrichards/Minglora-Social-Network
- Production branch at inspection: `main`
- Main commit at inspection: `8f0a6a4f65955e5b3da0ac03d960b41b8158f4f4`
- Feature branch: `feat/minglora-admin-marketplace-manager-rbac-20261119`
- Feature head at last verified source commit: `5fdd24b2369777e9b9ac10f09c4a60950d44b751`
- Draft PR: #539 — https://github.com/ravaunrichards/Minglora-Social-Network/pull/539
- Feature branch is synchronized with main: compare reported ahead 6, behind 0; only four intended tracked files differ.
- The feature branch was synchronized with a two-parent merge commit, with main as first parent and the prior feature head as second parent. No force-push was used.

## Existing platform state inspected
- Supabase project `gzycobgbasnqqhnympkr`: ACTIVE_HEALTHY; PostgreSQL 17.
- `minglora-runtime-state` Edge Function: ACTIVE version 142.
- Render service: `minglora-social-network-temp`.
- Render latest live deployment at inspection: commit `8f0a6a4f65955e5b3da0ac03d960b41b8158f4f4`, deployment `dep-dbv7i67trrvc73bd7jg0`.
- Existing company finance foundation: provider directory, subscription/budget/invoice/expense registers, secure finance server gateway, attachment workflow source, budget threshold configuration, audit history and CSV export.
- Live finance counts at inspection: subscriptions 0, budgets 0, invoices 0, expenses 0 and finance audit events 0. The provider directory contains 42 candidate records; candidate records are not verified provider connections.
- All inspected finance/RBAC tables have RLS enabled and no direct browser policies. Privileged access is through server-side service-role RPC gateways.
- Existing finance payments are not enabled: no verified company bank account, card/payment vault or provider billing API; direct company payment execution is not implemented.

## MS-ADMIN-RBAC-02 — exact work state
The original eight work items from `.agent-work/STAGE_QUEUE.md` are preserved and expanded there with statuses and percentages.

1. Audit every admin route/action: partial, 66.7% (35/35 server route clauses inventoried plus 11/34 Admin-scoped Edge actions traced; 46/69 total identified entries). A complete role-to-route permission matrix and 23 remaining Edge action traces are still required.
2. Establish canonical permission catalogue: implemented in source (100%). Existing role definitions are retained. The new additive migration creates `marketplace:read` and `marketplace:manage`.
3. Migrate staff-role data safely: implemented in source (100%). The migration extends the role constraint while preserving existing role values and does not insert/update/deactivate/revoke any existing staff row. Production application of this new migration is pending.
4. Require MFA for sensitive access: partial (50%). The designated-owner grant/revoke endpoint is MFA-verified and delegated assignments are stored with `mfa_required=true`; the required MFA session check is not yet enforced across every delegated route/action.
5. Implement server-side authorization on every route/RPC: 0% for delegated role-permission enforcement. Existing admin controls remain owner/MFA protected until a route is migrated; no blanket delegated access is implied.
6. Add assignment, revocation, audit history and recovery-admin controls: 75%. Existing grant, revoke and append-only audit workflows are present; a second recovery-administrator workflow is missing.
7. Require dual approval for configurable high-value financial actions: 0%.
8. Keep normal member access separate: 100%. Role grants require an existing profile and email-confirmed Auth user; no normal-member elevation is introduced.

Equal-weight implementation estimate over those eight original bullets: 61.5%. This is not overall Admin Center completion or production acceptance.

## PR #539 changes
- Added `supabase/migrations/20261119043000_minglora_admin_marketplace_manager_role.sql`.
- Added role key `marketplace_manager` and separate permissions `marketplace:read` and `marketplace:manage`.
- Marketplace Manager is deliberately `assignable=false` until all private back-office Marketplace routes/actions enforce the permissions.
- The role is strictly for Admin Centre back-office operations. It does not restore or enable the retired consumer-facing Marketplace and grants no company payment execution permission.
- Existing six Brand roles are retained in the staff-role check constraint.
- Updated `tests/unit/admin-centre-rbac.test.js`, `docs/ADMIN_RBAC_FOUNDATION.md` and the existing `.agent-work/STAGE_QUEUE.md` RBAC section.
- No production staff assignments, Marketplace transactions, orders, payments, seller balances or financial records were changed.

## Verification evidence
- RBAC unit tests: 8/8 passed on PR head `5fdd24b2369777e9b9ac10f09c4a60950d44b751`.
- Supabase Auth provider acceptance: passed.
- For You functional navigation: passed.
- Full CI test job: failed because two unrelated tests also fail on current main:
  - `Accepted LIVE speaker requests open the guest panel and require an explicit stage join`
  - `Ranking badge art remains visible around a compact centered member photo on desktop and mobile`
- Current main CI run `44457780374` independently reproduces those same two failures. They are not caused by PR #539; do not change unrelated LIVE or Rankings behavior as part of this Admin Center task.
- PR nine-layout visual QA run `44458855939` was still in progress at checkpoint time.
- PR #539 remains a draft. Do not merge or apply the new production migration until the required route permission safeguards and acceptance tests are complete.

## Next verified actions
- Complete a full inventory and authorization matrix for every Admin API route/action and relevant RPC.
- Implement permission checks on the Admin Centre entry gate, page navigation and relevant server routes, starting with bounded read-only/least-privilege scopes; preserve owner override and MFA.
- Do not make Marketplace Manager assignable until all private Marketplace admin routes/actions enforce its permissions.
- Add/verify recovery-admin controls and configurable dual approval for high-value financial operations.
- Add positive and negative route tests for each role.
- Verify the owner/MFA UI workflows in an actual authenticated browser session.
- Keep the PR draft while unrelated base-branch CI remains red; rerun exact-head tests and visual QA.
- Apply the Marketplace role migration only after review and after route permission safeguards are in place. Verify migration ledger, role catalogue and staff rows before/after.
- Do not claim Admin Center, Finance or overall Minglora completion from this checkpoint.
