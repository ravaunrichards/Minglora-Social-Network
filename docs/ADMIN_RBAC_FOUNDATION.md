# Minglora owner-controlled administrator RBAC

## Scope
This change introduces the first implementation slice for delegated administrator permissions. Creator Hub (UUID `5b998c21-86b5-4621-ab37-e0808a2657b1`) remains the only platform owner. No new owner is assignable.

## Safety properties
- The migrations expand the existing staff-role constraint and seed role/permission catalogues; they do not create, promote, deactivate or revoke any existing `minglora_platform_staff` assignment.
- Only the exact Creator Hub owner, with an MFA-verified server session, can call the management API.
- Grants require an existing Minglora profile and an email-confirmed Supabase Auth account. No account is created.
- `super_administrator` is reserved and unassignable.
- Delegated assignments always require MFA.
- Grant/revoke actions record old/new state and a reason in an RLS-protected audit table.
- Revocation deactivates the assignment and clears its permissions; it does not delete the account.
- Existing application routes remain owner-restricted until each route/action is separately migrated to permission-scoped server-side authorization.
- The Marketplace Manager role is for private Admin Centre back-office operations only. It does not restore, publish or enable the retired consumer-facing Marketplace.
- Marketplace Manager remains non-assignable until every relevant back-office route and action enforces its dedicated `marketplace:read` or `marketplace:manage` permission. Its manage permission does not authorize company payment execution.

## Roles
The nine roles specified for the Admin Centre are represented by the role catalogue:
- Finance Administrator, Technical Administrator, Security Administrator, Content Administrator, Creator Manager, Support Administrator and Read-only Auditor are assignable through the owner/MFA-protected workflow.
- Super Administrator is a reserved system role and cannot be granted while Creator Hub remains the sole platform owner.
- Marketplace Manager is catalogued with separate read/manage permissions, but is reserved and non-assignable until permission checks cover all private back-office Marketplace operations.
- Brand-specific roles remain separate, narrowly scoped roles and do not grant general platform administration.

## Deployment status
The Marketplace Manager addition is source-only until its exact-head CI checks pass and the production migration is reviewed and applied. Do not apply the migration or deploy the Edge Function as part of this source change. Existing production staff assignments, public consumer Marketplace state and AI runtime safety settings remain unchanged.
