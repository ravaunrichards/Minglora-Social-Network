# Minglora Master Stage Queue

Queue basis: the Minglora master Admin Center specification and the repository roadmap, feature catalog, parity audit, platform coverage and repository map.

Statuses: NOT STARTED · READY · IN PROGRESS · VERIFYING · COMPLETED · BLOCKED · FAILED.

## Execution and identity

### MS-IDENTITY-00 — Verify repository identity
- Objective: lock work to the selected Minglora repository.
- Acceptance: repository URL, default branch and main tree are verified; no other repository is used for implementation.
- Status: COMPLETED.

### MS-QUEUE-00 — Establish recovery and master backlog
- Objective: maintain repository-local progress, blocker, decision and stage records.
- Acceptance: five checkpoint records exist and reflect merged main state.
- Status: COMPLETED.

## Profile identity workstream

### MS-PROFILE-01 — Unique original Gifter badge on member identity surfaces
- Objective: show each member's earned Level's original badge on profile and identity surfaces.
- Acceptance: original artwork mapping, responsive placement, preservation of other recognition markers, focused tests and merge.
- Result: PR #224 merged on 2026-11-11, merge commit 8a496d54df8daca5f543e9571c494e9d4354a158.
- Status: COMPLETED.

### MS-PROFILE-02 — Profile identity and badge edge-case verification
- Objective: verify absent badge, Level 1, Level 50, malformed/legacy level values, admin-awarded status, LIVE-entry marker, NEW GIFTER, Creator League and verified/LIVE Pro coexistence.
- Requirements: no false badge; safe value handling; preview parity; non-overlapping layout; keyboard/alt text; responsive browser verification.
- Status: NOT STARTED.

## Admin Center workstream — current master objective

### MS-ADMIN-FINANCE-01 — Company Finance foundation and audit history
- Objective: provide persistent company provider, subscription, budget, invoice, expense and finance audit registers with secure owner-only operations.
- Implementation slices merged: six finance tables and RLS; service-role RPC; owner/MFA API guard; Finance UI; 42 unregistered provider candidates; private attachment workflow source; Supabase-specific connection-test source; configurable budget alert thresholds; read-only audit-history display and CSV export.
- Verification: post-merge main CI passed in run 43638100531. Finance tables, ACL and role privileges were inspected on the live Supabase project.
- Operational acceptance still required: owner/MFA browser exercise, Supabase provider probe through the UI, first private attachment upload/download, and actual service/deployment health.
- Do not add sample subscriptions, budgets, invoices or expenses to make the dashboard appear populated.
- Status: VERIFYING — implementation merged; live operational acceptance pending.

### MS-ADMIN-RBAC-02 — Role-based access control and delegated administrators
- Objective: implement the nine specified Admin Center roles with permission-scoped pages and server-side actions.
- Roles: Super Administrator; Finance Administrator; Technical Administrator; Security Administrator; Content Administrator; Creator Manager; Marketplace Manager; Support Administrator; Read-only Auditor.
- Tasks: audit every admin route/action; establish a canonical permission catalog; migrate staff-role data safely; require MFA for sensitive access; implement server-side authorization on every route/RPC; add assignment, revocation, audit history and recovery-admin controls; require dual approval for configurable high-value financial actions; keep normal member access separate.
- Acceptance: positive and negative route tests for every role, least-privilege data access, audit coverage, MFA enforcement, recovery and no unauthorized escalation. No role may be assigned to an unverified account.
- Current evidence: the live catalogue contains the original seven assignable business roles, reserved Super Administrator and six separate Brand roles; RBAC grant/revoke is owner/MFA protected. Existing application routes remain owner-restricted until each route/action is migrated to server-side permission checks.
- Current source slice: branch `feat/minglora-admin-marketplace-manager-rbac-20261119` adds the Marketplace Manager role plus `marketplace:read` and `marketplace:manage` permissions. The role is explicitly non-assignable until every private back-office Marketplace route/action enforces those permissions. The migration preserves all existing staff-role values and does not change any staff assignment or enable the retired consumer-facing Marketplace.
- Production state: source only; the new migration has not been applied and no staff assignment has been granted or revoked by this slice.
- Remaining acceptance: exhaustive route/action permission coverage; positive and negative tests for every role; recovery-admin controls; configurable dual approval for high-value financial actions; owner/MFA browser acceptance; production migration and deployment verification.
- Status: IN PROGRESS — additive Marketplace Manager RBAC source and regression coverage are under review; route-level permission enforcement and production acceptance remain incomplete.

### MS-ADMIN-BUSINESS-03 — Business and company management
- Objective: manage verified company identity, documents, legal records, contracts, responsible staff, company assets and important business dates.
- Tasks: company profile and registration records; Companies Office/JIPO/TAJ references; contracts and policy versioning; masked banking references; document access control and audit.
- Acceptance: every company fact has a source or owner-entered record; private documents are protected; no invented registration or tax identifiers.
- Status: NOT STARTED.

### MS-ADMIN-SERVICES-04 — Service provider and subscription operations
- Objective: turn the provider candidate directory into an accurate register of actual services used by Minglora.
- Tasks: verify actual provider account ownership; connect supported OAuth/API integrations; record package, allowance, usage, fee, tax, billing currency, renewal and cancellation terms; synchronize only from approved APIs; support manual invoices and provider portal links.
- Acceptance: no service is marked connected without a completed live test; no plan, usage, price or renewal date is guessed; duplicate functionality is identified before subscribing.
- Status: IN PROGRESS — directory exists; live provider account connections and subscription records remain unverified.

### MS-ADMIN-PAYMENTS-05 — Company invoice payment and reconciliation
- Objective: securely pay approved company obligations and reconcile provider confirmations.
- Tasks: provider-hosted billing portal first where direct APIs are not supported; authorized payment vault/token references where available; idempotent payment requests; webhook signature verification; MFA and approval limits; immutable audit; receipts and invoice reconciliation; no creator/seller fund mixing.
- Acceptance: sandbox and live provider confirmations, duplicate-charge protection, negative authorization tests, reconciliation and receipt evidence.
- Dependency: verified company payment provider, merchant account and approved funding method.
- Status: BLOCKED — no company bank/card/payment vault/provider billing connection is verified. Existing API is manual-provider-action-required and has no company pay-now action.

### MS-ADMIN-INFRA-06 — Domain, website, hosting, database and storage management
- Objective: display true status and supported controls for domain/DNS/SSL, hosting, database, storage, media and deployments.
- Tasks: verify minglora.com registration and nameservers; integrate Cloudflare/registrar status if actually connected; connect existing Render service and deployment history; monitor Supabase health and storage usage; keep CDN/media services distinct; build renewal warnings.
- Acceptance: live provider evidence for domain ownership, deployment and service state; test alerts; no unconfigured subdomains or invented deployment state.
- Status: BLOCKED for Render service controls — connected Creator Hub workspace query returned no services. Supabase project is healthy; other provider accounts remain unverified.

### MS-ADMIN-REVENUE-07 — Revenue, creator, seller, refund and tax operations
- Objective: report gross revenue, fees, liabilities, refunds, tax and company share without mixing separate ledgers.
- Tasks: define revenue recognition; configurable 50/50 eligible gift share; creator/seller statements; marketplace admin-only order/dispute operations where applicable; payout approval and provider confirmation; monthly reconciliation.
- Acceptance: ledger reconciliation, no unpaid liability counted as profit, transparent statements and verified payout events.
- Status: NOT STARTED for this master Admin Center workstream.
- Scope guard: administrator Marketplace controls do not reactivate the retired consumer-facing Marketplace without separate approval.

### MS-ADMIN-APPSTORE-08 — Android and Apple publishing management
- Objective: track actual developer memberships, app identifiers, signing, releases, reviews and store performance.
- Tasks: connect Google Play Console and Apple Developer/App Store Connect where available; maintain release records, testing tracks, crash reports, privacy disclosures and renewal costs; keep private signing keys outside Admin Centre.
- Acceptance: real account connection, build provenance and release status; no fake store submission or release state.
- Status: NOT STARTED.

### MS-ADMIN-OPS-09 — Security, backup, support, alerts and business reporting
- Objective: centralize security events, backup monitoring, recovery, support, notifications, forecasts and exports.
- Tasks: MFA and session reviews; dependency monitoring; backup inventory and restore drill; budget thresholds; 30/90/180/365-day forecasts; renewal, outage, quota and failed backup alerts; monthly operational reports.
- Acceptance: successful test alerts, verified restore, auditable incident workflow and reproducible reports.
- Status: IN PROGRESS — finance budget thresholds and audit-history slice exist; the wider operational center remains unbuilt.

### MS-ADMIN-INTEGRATION-10 — Admin Center integration and final acceptance
- Objective: integrate the specified Admin Center departments into one secure operational workspace.
- Tasks: implement the 35 logical menu departments, permissions, activity history, settings, mobile/desktop layouts, export paths and truthful provider/manual-action states; reconcile reports; verify live deployment.
- Acceptance: every control tested; no fake data; all permissions exercised; live integrations verified; critical security/financial tests pass; production health and recovery demonstrated.
- Status: NOT STARTED.

## Core social-network roadmap workstreams

### MS-CORE-01 — Reliable core, authentication and persistence
- Objective: harden auth/session boundaries, transactional persistence, throttling, migrations, backups and restore.
- Acceptance: route authorization tests, transactional persistence checks, verified backup/restore and operations documentation.
- Status: NOT STARTED.

### MS-PRIVACY-02 — Relationships and privacy enforcement
- Objective: complete friends/follows/blocks/mutes/restrictions and enforce profile/content visibility consistently.
- Acceptance: cross-route tests for owner, friend, follower, blocked and public viewers with no unauthorized data leakage.
- Status: NOT STARTED.

### MS-CONTENT-03 — Content, media and communities
- Objective: complete post/comment lifecycle, secure media processing, Groups/Pages roles, Stories, albums, photo tagging, Events and check-ins.
- Acceptance: end-to-end authorization, durable media records, upload retry, moderation and responsive tests.
- Status: NOT STARTED.

### MS-MESSAGING-04 — Messaging, realtime and discovery
- Objective: harden private/group membership authorization, realtime fan-out, attachments/read state, search, notifications and retryable jobs.
- Acceptance: multi-user authorization, reconnect/retry, deduplication, delivery and privacy-filtered search tests.
- Status: NOT STARTED.

### MS-SAFETY-05 — Safety, scale and operations
- Objective: reports/moderation, audit, export/deletion, accessibility/performance, backups, restore drills, monitoring and multi-instance readiness.
- Acceptance: privacy/security review, restore exercise, performance/accessibility checks and runbooks.
- Status: NOT STARTED.

### MS-ADVANCED-06 — Advanced and configuration-dependent social features
- Objective: complete LIVE, calls, creator monetization and advertising only where end-to-end providers, permissions and safety controls exist.
- Acceptance: real provider health, access-control, ledger, payout and moderation tests.
- Status: BLOCKED for provider-dependent slices. The repository's consumer Marketplace remains retired unless its product scope is separately approved.

### MS-PLATFORMS-07 — Platform client delivery
- Objective: distinguish current browser runtime from planned Android, iOS, desktop and TV applications.
- Acceptance: tested build/release pipeline and feature coverage statement for each client; planned clients are never represented as implemented.
- Status: NOT STARTED.

### MS-DOCS-08 — Documentation and final integration audit
- Objective: keep implementation status, architecture, security and deployment records synchronized.
- Acceptance: no stale status claims, all stage records reconciled, CI green, migrations and deployment verified.
- Status: IN PROGRESS — this checkpoint updates the prior stale progress records; future stages remain.

## Queue maintenance rules

- Reverify the main branch head before every new implementation branch.
- Decompose each stage into files, APIs, data, UI, security and acceptance tests before coding.
- Use incremental changes; no destructive data/schema operations without backup and approval.
- Do not mark a stage complete from a screen, folder or static example alone.
- Preserve all completed work and do not silently remove queue items.
- Do not invent user counts, service connections, prices, invoices, payments, deployments or activity.
 
### MS-ADMIN-APPROVAL-CENTER-11 — Central administrator approval notifications
- Objective: show genuine pending administrative decisions in one protected inbox with an in-app notification count and explicit Approve/Reject actions.
- First connected sources: owner/MFA-protected AI high-impact approvals and relational AI task approvals.
- Safety: preserve existing decision endpoints, audit records, owner/MFA checks, reason requirements for task approvals, and independent worker/provider execution gates; do not seed demo requests or execute work on approval.
- Acceptance: live owner-session smoke test for real request discovery, Approve and Reject, audit result, polling, mobile layout and no-duplicate decisions. External push/email delivery and additional department producers remain separate work.
- Status: IMPLEMENTED IN BRANCH — site-wide in-app notifications and Approval Center actions; automated CI and production owner-session acceptance pending.
