# Minglora Admin RBAC — Initial Route and Runtime Action Audit
Date: 2026-11-19 UTC
Scope: existing Minglora Admin APIs and the `minglora-runtime-state` gateway. This is an audit of the current implementation, not a new permission grant.

## Audit result
- `src/server.js`: 35 Admin route clauses identified and reviewed for their visible server-side guard.
- `minglora-runtime-state/index.ts`: 34 Admin-scoped action keys identified. Eleven related action handlers and their server/Edge/DB guard path were reviewed in this pass. Twenty-three action handlers still require complete end-to-end authorization tracing.
- Combined inventory: 69 route/action entries; 46 reviewed in this initial pass = 66.7%. This is the measured progress for the “audit every admin route/action” work item only; it is not an overall RBAC or Admin Center completion percentage.
- Current protection is predominantly designated-owner/MFA. The general business roles in `minglora_admin_role_permissions` are not yet enforced across these routes. Do not interpret a role catalogue entry or assignment as route access.
- `/api/admin/access` has an existing narrow Brand-role exception using Brand-specific permissions and MFA. That mechanism is not a general role-permission gateway.

## The 35 Admin API route clauses in `src/server.js`

| Route family / clause | Existing authorization boundary | Delegated business-role enforcement |
|---|---|---|
| `/api/admin/finance/attachments/*` parent | Designated Creator Hub owner + moderator/MFA + active reviewer session; Supabase persistence required | Not implemented |
| `GET /api/admin/finance/attachments/download` | Inherits parent guard; validates attachment kind/id and returns a short-lived signed URL | Not implemented |
| `POST /api/admin/finance/attachments/prepare` and `/complete` | Inherit parent guard; same-origin writes; Edge validates private bucket/path/file properties | Not implemented |
| `GET/POST /api/admin/finance` | Designated owner + moderator/MFA + active reviewer session; Supabase persistence; same-origin POST; prevents forged connection, auto-renewal, approval or paid states | Not implemented |
| `GET/POST /api/admin/rbac` | Designated owner + moderator/MFA + active reviewer session; same-origin grant/revoke; email-confirmed account validation | Owner-only by design |
| `GET /api/admin/access` | Designated owner/MFA, or a narrow Brand-only session with `brand:read`/`brand:manage` | Finance/Technical/Security/Content/Creator/Support/Auditor roles not yet admitted |
| `GET/PATCH /api/admin/auth-providers` | Designated owner + MFA; requires Supabase provider and configured server-side Management token | Not implemented |
| `GET /api/admin/users` | Designated owner + MFA; Supabase Auth account listing | Not implemented |
| `POST /api/admin/users/:id/ban|unban` | Same-origin write + designated owner + MFA; owner account protected | Not implemented |
| `GET /api/admin/audit-log` | Designated owner + MFA | Not implemented |
| `GET /api/admin/internal-activity` | Designated owner + MFA | Not implemented |
| `GET /api/admin/creator-earnings` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `PUT /api/admin/platform-payout-account` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/platform-payouts` | Exact Creator Hub owner ID/email/platform-owner role + MFA; existing payout reservation and PayPal confirmation flow | Not implemented |
| `/api/admin/live-pro/*` parent | `canManageLivePro()`: designated Creator Hub owner + MFA + active reviewer session | Not implemented |
| `GET /api/admin/live-pro/members` | Inherits Live Pro parent guard | Not implemented |
| `GET /api/admin/live-pro/grants` | Inherits Live Pro parent guard | Not implemented |
| `POST /api/admin/live-pro/grants` | Inherits Live Pro parent guard; validates target, duration and member status | Not implemented |
| `DELETE /api/admin/live-pro/grants/:id` | Inherits Live Pro parent guard | Not implemented |
| `POST /api/admin/coins/owner-issuance` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/paypal-readiness` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/promotional-gift-fund` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/promotional-gift-fund/orders` | Exact Creator Hub owner ID/email/platform-owner role + MFA; PayPal order creation | Not implemented |
| `GET /api/admin/promotional-gift-fund/capture` | Exact Creator Hub owner ID/email/platform-owner role + MFA; verifies PayPal capture before credit | Not implemented |
| `GET /api/admin/coins/campaign-wallet` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/coins/member-promotions` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/coins/member-promotions/history` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/coins/member-promotions/members` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/marketing/budget` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/marketing/funding` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/marketing/grants` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `GET /api/admin/badge-controls/members` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/profile-verification/set` | Exact Creator Hub owner ID/email/platform-owner role + MFA; verification audit event recorded | Not implemented |
| `GET /api/admin/gifter-badges/status` | Exact Creator Hub owner ID/email/platform-owner role + MFA | Not implemented |
| `POST /api/admin/gifter-badges/manage` | Exact Creator Hub owner ID/email/platform-owner role + MFA; override/audit workflow | Not implemented |

> The 35 count is route-condition clauses, including parent route gates and nested action clauses; it is not a count of 35 unique URL paths.

## Admin-scoped Edge action keys

The runtime action inventory contains 34 actual Admin-scoped keys after excluding non-action identifiers/field tokens. Reviewed in this pass:
- `admin_rbac_command`: exact owner ID + explicit MFA boolean; database RPC independently validates owner, active staff row, owner permission and confirmed Auth identity.
- `admin_users_list` and `admin_user_set_ban`: exact owner ID at Edge; Node route adds owner/MFA gate.
- `admin_finance_command`: exact owner ID at Edge; Node route adds owner/MFA gate; SQL finance command remains owner-only.
- `admin_finance_attachment_prepare` and `admin_finance_attachment_complete`: Node route adds owner/MFA gate; Edge validates private bucket, path, type and size.
- `admin_brand_command`, `admin_brand_upload_prepare`, `admin_brand_upload_complete`, `admin_brand_asset_url`: use the separate Brand runtime handler, require MFA and delegate permission validation to Brand-specific database commands.
- `admin_audit_log`: exact owner ID at Edge; Node route adds owner/MFA gate.

Remaining Admin-scoped Edge action keys to fully trace through Node route, gateway handler and database RPC include attachment download, campaign Coin wallet/allocation/ledger actions, promotional gift wallet/fund actions, economy-admin creator earnings/member search/credit/payout actions, and profile-verification admin list/queue/review/set actions.

## Security conclusion
- No existing owner/MFA check is removed by PR #539.
- No delegated role is currently authorized to call the above route families simply because it appears in the role catalogue.
- Marketplace Manager remains non-assignable in source until the back-office Marketplace endpoints exist and enforce `marketplace:read` / `marketplace:manage`.
- Payment execution remains a separate high-risk permission and is not granted by Marketplace Manager.
- Remaining audit work is to complete every Edge action/RPC trace, define the approved per-route permission mapping, add a trusted server-side permission-check boundary, and add positive/negative tests for each role before any delegated role is activated.
