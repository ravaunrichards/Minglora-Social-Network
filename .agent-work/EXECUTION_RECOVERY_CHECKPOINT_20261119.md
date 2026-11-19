# Minglora Execution Recovery Checkpoint — 2026-11-19

## Scope lock
- Project: Minglora Social Network only.
- Repository: https://github.com/ravaunrichards/Minglora-Social-Network
- Production branch: `main`
- Supabase project: `gzycobgbasnqqhnympkr`
- Render workspace: Creator Hub Creator Network (`tea-dbphlfk9v7es73bu7amg`)
- Render service: `minglora-social-network-temp` (`srv-dbphq63rjlhs73fviegg`)
- Do not mix this repository with ZUNO, LINKA or any other project.
- Keep the retired consumer-facing Marketplace and Jobs disabled. Admin-only Marketplace controls do not reactivate them.

## Current live production checkpoint
- GitHub `main`: `8f0a6a4f65955e5b3da0ac03d960b41b8158f4f4` — “Update Audio LIVE test for versioned co-host split bundle”.
- Render service `minglora-social-network-temp` is LIVE on that commit; latest verified deployment: `dep-dbv7i67trrvc73bd7jg0`.
- Supabase project `gzycobgbasnqqhnympkr` is `ACTIVE_HEALTHY`, PostgreSQL 17.
- `minglora-runtime-state` Edge Function is ACTIVE, version 142.
- Do not use the 2026-11-18 checkpoint's old main SHA, Edge Function v139 or old Render notes as current.
- Current main CI run `44457780374` is failing on two unrelated existing tests: “Accepted LIVE speaker requests open the guest panel and require an explicit stage join” and “Ranking badge art remains visible around a compact centered member photo on desktop and mobile”. Do not claim main CI is green.

## Admin Center workstream — active task
- Current task: `MS-ADMIN-RBAC-02` — Role-based access control and delegated administrators.
- Full task detail, original eight work items and evidence-based progress are in `.agent-work/STAGE_QUEUE.md`.
- Active-task progress estimate: 55.3% across the eight original task bullets with equal weighting. This is not an overall Admin Center or Minglora completion percentage.
- Six of 35 identified `src/server.js` Admin API route clauses have been inspected (17.1%). Full permission mapping is not complete.
- Canonical role/permission catalogue and safe source migration are implemented; all role-scoped server authorization is not yet enforced.
- RBAC assignment, revocation and append-only permission audit exist. Recovery-admin control and configurable high-value dual approval are not complete.
- Sensitive MFA is verified for owner grant/revoke; broad delegated route enforcement is not complete.

## Company Finance implementation and operational state
- Existing finance source includes six company finance tables, RLS/browser-role denial, service-role RPC, owner/MFA API guard, Finance UI, 42 provider-candidate entries, private attachments, Supabase connection probe, configurable budget thresholds, read-only audit history and CSV export.
- Live finance counts: 0 subscriptions, 0 budgets, 0 invoices, 0 operating expenses and 0 company finance audit events. No demo records are permitted.
- Provider candidates are not proof of provider accounts. All inspected candidates remain not registered/not connected unless a real provider test proves otherwise.
- No company bank balance, payment vault or provider billing connection is verified. Direct company payment execution is not implemented.
- Creator/seller balances remain separate from company operating funds.
- The finance implementation slice remains source-implemented/CI-verified with owner/MFA operational acceptance and first private attachment upload/download still pending.

## Current RBAC source branch and PR
- Branch: `feat/minglora-admin-marketplace-manager-rbac-20261119`
- Latest branch head: `fc52261e5830fed04952006fdd9647bb29e8e53c`
- PR #539: https://github.com/ravaunrichards/Minglora-Social-Network/pull/539 (draft; mergeable; not merged).
- Branch compare at last inspection: ahead 10, behind 0 relative to `main`.
- Added migration `supabase/migrations/20261119043000_minglora_admin_marketplace_manager_role.sql`, separate `marketplace:read` / `marketplace:manage` permissions, and a Marketplace Manager role that remains non-assignable until private back-office route permission enforcement is complete.
- The role does not restore the consumer Marketplace and does not grant payment execution.
- Existing brand role constraint values remain preserved.
- No production migration, staff assignment, provider connection, payment, or account change has occurred through this source slice.

## Exact-head verification at checkpoint
- RBAC unit test file has eight cases; all 8 passed on code commit `5fdd24b2369777e9b9ac10f09c4a60950d44b751`. Later commits on the feature branch changed only progress/checkpoint documentation.
- Latest PR CI on head `fc52261e5830fed04952006fdd9647bb29e8e53c`: Supabase Auth provider acceptance passed; For You functional navigation passed; full test job failed on the same two failing tests present on current main.
- Nine-layout visual QA run `44459696029` was still in progress at checkpoint time; do not claim it passed until the run is complete.
- PR remains draft because the complete role-permission routing work is not done and base CI is currently red. Do not merge solely to bypass the unrelated failing checks.

## Immediate resume procedure
1. Re-fetch current `main`, Render live deployment, Supabase project state and Edge Function version before edits.
2. Read `.agent-work/STAGE_QUEUE.md`, this checkpoint, and `.agent-work/ADMIN_RBAC_EXECUTION_CHECKPOINT_20261119.md`.
3. Continue `MS-ADMIN-RBAC-02` without duplicating completed RBAC code or tests.
4. Complete an exhaustive Admin API/RPC route and permission matrix; preserve the existing owner/MFA override while introducing only verified least-privilege delegated access.
5. Do not make Marketplace Manager assignable until every private back-office Marketplace action has server-side permission enforcement and positive/negative tests.
6. Implement the remaining recovery-admin and high-value dual-approval controls.
7. Keep the branch non-force synchronized with current `main`; never overwrite unrelated work.
8. Apply production migration and deploy only after route safeguards, exact-head checks and safety review; verify live schema/permissions afterward.
9. Keep implementation, automated tests, production migration, browser acceptance and Render deployment as distinct statuses.
10. Do not claim overall Minglora/Admin Center completion; full project completion is not currently measurable.

## Related checkpoint files
- `.agent-work/ADMIN_RBAC_EXECUTION_CHECKPOINT_20261119.md` — detailed Marketplace Manager RBAC slice and progress.
- `.agent-work/STAGE_QUEUE.md` — current Admin Center workstream/task register.
- `.agent-work/BLOCKERS.md` — outstanding operational and verification blockers.
