# Minglora owner-controlled administrator RBAC

## Scope
This change introduces the first implementation slice for delegated administrator permissions. Creator Hub (UUID `5b998c21-86b5-4621-ab37-e0808a2657b1`) remains the only platform owner. No new owner is assignable.

## Safety properties
- The migration expands the existing staff-role constraint and seeds role/permission catalogues; it does not mutate any existing `minglora_platform_staff` row.
- Only the exact Creator Hub owner, with an MFA-verified server session, can call the management API.
- Grants require an existing Minglora profile and an email-confirmed Supabase Auth account. No account is created.
- `super_administrator` is reserved and unassignable.
- Delegated assignments always require MFA.
- Grant/revoke actions record old/new state and a reason in an RLS-protected audit table.
- Revocation deactivates the assignment and clears its permissions; it does not delete the account.
- This initial slice manages assignments and the canonical role catalogue. Existing application routes remain owner-restricted until each route is separately migrated to permission-scoped authorization.

## Roles
Finance Administrator, Technical Administrator, Security Administrator, Content Administrator, Creator Manager, Marketplace Manager, Support Administrator and Read-only Auditor are assignable. Super Administrator is visible as a reserved system role but cannot be granted.

## Deployment status
Source only. The migration and Edge Function changes must pass CI and be reviewed before deployment. Do not apply the migration or deploy the Edge Function as part of this change. Existing production staff assignments and AI runtime safety settings remain unchanged.
