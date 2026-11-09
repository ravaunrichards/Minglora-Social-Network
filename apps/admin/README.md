# Minglora Admin Control Centre

The private admin workspace is implemented in `public/admin-centre.html`, `public/admin-centre.js` and `public/admin-centre.css`.

Owner-only controls include:
- MFA-protected account search and Supabase Auth ban/unban actions.
- Account ban duration, moderation reason and restoration of the pre-ban status.
- A dedicated audit history for account bans and restores, searchable by reason, user ID and action type.
- Audit entries showing the acting administrator, affected account, timestamp, ban duration, expiry and reported session-revocation outcome.
- Existing live internal activity journal, moderation reports, support inbox and operational controls.

Account-management and audit APIs check the designated owner identity and MFA-verified session on the server. The audit-history query returns selected audit metadata and profile labels only; it does not expose passwords, access tokens, private messages or payment credentials.


## Complete platform overview

The owner-only overview includes a live inventory of all 77 active runtime collections grouped into accounts and relationships, publishing and media, messaging and communities, pages and events, LIVE, calls and MeetWave, creator economy, moderation and support, and sounds. It reports counts only; private message bodies, credentials, tokens, media URLs and payment secrets are not exposed by the inventory. The internal activity feed also reports active sessions and platform record totals. The Supabase runtime gateway supports the owner audit-log action consumed by the dashboard.

## Supabase-style user and service management

The User Management workspace reads directly from Minglora Supabase Auth and the matching `public.profiles` records. It provides paginated account search, account details and identity-provider metadata, account creation, profile/contact edits, email and phone confirmation, password replacement, session revocation, account bans/restores, and an audited permanent-delete action. The designated Creator Hub owner account is read-only and protected from ban, edit, session-revoke, and delete operations. New account passwords are write-only and never returned to the browser or written to audit metadata.

Member list, detail, create, update, delete, and session-revocation requests are protected by the designated owner check, moderator authorization, an active MFA-verified reviewer session, and same-origin write validation. Auth administration is performed inside the Supabase Edge Function using its server-only privileged client; privileged Supabase credentials are not sent to Render's browser responses. Account changes write metadata-only entries to `public.audit_log`.

The Service Connections workspace reports Minglora's actual services: Supabase, Render, GitHub, LiveKit, PayPal, Tenor, SIX Group's ISO currency directory, Frankfurter exchange rates, browser Web Push, and Supabase Auth email delivery. It shows direct provider dashboards where available. Runtime health checks do not return provider API keys, client secrets, passwords, or session tokens. Email delivery is managed in Supabase Auth; the current app does not expose a separate SMTP provider's health check.

Automated coverage for owner protections, the CRUD gateway, account form controls, and the service registry lives in `tests/unit/admin-user-and-service-centre.test.js`.

## Continuation checkpoint — 2026-11-09

- **Project:** Minglora Social Network
- **Repository:** `ravaunrichards/Minglora-Social-Network`
- **Task:** Admin Centre user management and service connections (PR #203)
- **Working branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Latest checkpoint commit:** `7ca80b8439331ec27908e26d19bba0b39c968526`
- **Production status:** Not merged or deployed. Render continues to deploy from `main`.

### Verified since the previous checkpoint

- The live Minglora Supabase project is active and healthy; its PostgreSQL database is version 17.
- The live `public.profiles` schema requires both `username` and `display_name`; neither column has a default. The username validation and create form previously allowed an empty username, and the display-name input did not enforce the database's two-character minimum.
- The Admin Centre create form now requires a username and a display name of at least two characters.
- The runtime Edge Function now rejects a missing username or too-short display name before calling Supabase Auth `createUser`.
- A focused regression assertion was added to `tests/unit/admin-user-and-service-centre.test.js`.
- The earlier brittle runtime-action assertion was corrected in `tests/unit/admin-platform-overview.test.js`.

### Outstanding verification

- The earlier CI run on the previous commit failed: 738 tests, 706 passing and 32 failing. Its results predate the corrective commits.
- A new successful CI result for the latest commit has not been retrieved; do not count the new assertions as passing until the test runner reports success.
- The production `minglora-runtime-state` Edge Function is still version 112 and does not contain the new account create/update/delete operations from this branch.
- The feature branch still needs reconciliation with the current `main` history and full CI acceptance before merge.
- Account create/edit/delete/session-revocation and service health checks still need hosted end-to-end verification.

### Next action

Obtain a fresh CI run for the current branch, then address the remaining Admin Centre-specific failures. Do not merge or deploy the production Edge Function until review, CI, and authorization are complete.


## Continuation addendum — 2026-11-09

**Progress checkpoint:** 71% verified implementation credit / 29% remaining. No percentage increase is claimed because the new account-creation safeguards have not yet passed the project test runner or hosted acceptance tests.

### Additional project-verified correction

Live database inspection confirmed the case-insensitive unique index `profiles_username_lower_uq` on `lower(username)`. The account-creation path now:
- Requires a display name of at least two characters and a non-empty username in the form.
- Enforces the same requirements in the Edge Function before creating an Auth identity.
- Checks whether the normalized username is already present and returns HTTP 409 before `createUser`; the database unique index remains the final protection against concurrent duplicate requests.
- Includes a regression assertion that checks the required fields and that the availability lookup precedes Auth user creation.

Relevant commits:
- `a2d5d22` — require username in the create form
- `352ac5e` — validate required identity fields server-side
- `0d1591b` — enforce the display-name minimum in the form
- `7ca80b8` — add required-field regression assertions
- `f138e29` — check username availability before Auth creation
- `6d51932` — test username preflight ordering and conflict handling

### Current branch and CI state

- Current feature-branch head at this addendum: `6d5193296ef90bf6709a398ae5f31d696b80c017`.
- Comparison against current `main` head `2f80e9d`: feature branch is 27 commits ahead and 1 commit behind; it is divergent and still requires careful reconciliation.
- The connected GitHub status/run lookup returned no CI status or workflow-run record for this latest commit. This is **not** evidence of a passing run.
- The previously observed 738-test run remains the last detailed CI result: 706 passed, 32 failed, before these corrections.

### Live deployment state

- Render's Minglora service is configured to auto-deploy from `main`; its latest observed live deploy is commit `2f80e9d`.
- The production `minglora-runtime-state` function remains active at version 112; the new account-create/update/delete implementation has not been deployed.
- No merge, production deployment, schema change, or member-data mutation was performed.

### Next action

Obtain an actual CI run on the current branch and verify the Admin Centre-specific checks. Then reconcile the single missing `main` commit and perform hosted account-management acceptance testing after the required review and deployment authorization.


## Continuation addendum 2 — 2026-11-09

**Progress remains 71% / 29% remaining.** The recent source corrections are saved and independently checked against the branch files, but they remain uncounted until the project test runner and hosted behavior are verified.

### Additional corrections saved

- Account creation now checks required display-name and username fields against the live `public.profiles` NOT NULL schema.
- Username availability is checked against the existing lowercase unique username invariant before Supabase Auth `createUser` is called; duplicates return HTTP 409.
- Admin Centre now displays a warning if account creation, session revocation, or deletion succeeds but its audit entry cannot be confirmed.
- Regression assertions cover the schema-required fields, username lookup ordering, duplicate handling, and audit-warning messages.

At this snapshot the feature branch head is `b8dd41c22bcc34f1e77b665143c274462bd86608`. Source-level checks against the saved branch files confirmed these guards and UI messages are present. The project unit test runner has **not** been executed on this head.

### Supabase security-advisor review

Live advisors were retrieved on 2026-11-09 at approximately 09:55 UTC:
- Health advisors returned no lints.
- Security advisors reported 36 RLS-enabled tables without policies, including `audit_log` and internal runtime tables. Those tables are intended for server-side service-role access; no public policy or permission change was made.
- The advisor also flagged `public.minglora_list_my_mfa_factors()`. Its live definition uses `SECURITY DEFINER`, an empty search path, filters factors by `auth.uid()`, and its ACL grants execution to `authenticated` and `service_role`, not `PUBLIC`. The inspected definition appears scoped to the caller's own MFA factors; no change was made.

### Remaining acceptance work

- A fresh full CI run is still unavailable through the connected GitHub status/run lookup.
- The branch remains divergent from current `main` by one commit; do not merge without reconciling and reviewing it.
- Production Render remains on `main`; the production Supabase Edge Function remains version 112 and does not include this branch's new CRUD actions.
- Real account CRUD, deletion constraint handling, global session revocation, audit failure behavior, and service checks still require hosted acceptance testing after deployment is authorized.

## Current execution checkpoint — 2026-11-09 10:45 UTC

- **Project:** Minglora Social Network
- **Repository:** `ravaunrichards/Minglora-Social-Network`
- **Assigned task:** Admin Centre member management and service connections, PR #203
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Branch tip at this checkpoint:** `efb033d98a296457b4bc877212d13b8c482fc96c`
- **Latest functional code change:** `159d2113f46c27460350754efa9d06fe6431ebf8`
- **Latest functional test change:** `20269121d8cd9f4a135976b61407bbaab7392c2b`
- **PR state:** Open, draft; 64 commits; 15 changed files; `mergeable=false`, `mergeable_state=dirty`.
- **Comparison with current main snapshot:** 64 commits ahead and 1 behind commit `2f80e9d997b43e5da6373c385d6ce153ff908e67`.
- **Completion:** 73% verified / 27% remaining. The tracker and original milestone weights remain unchanged.

### Weighted milestone tracker

| Milestone | Weight | Verified credit |
|---|---:|---:|
| User-management interface | 20% | 20% |
| Supabase Auth operations | 25% | 15% |
| Owner/MFA authorization | 15% | 15% |
| Service connections | 15% | 10% |
| Audit and data integrity | 10% | 6% |
| Documentation and recovery records | 5% | 5% |
| Full CI, hosted acceptance and final regression | 10% | 2% |
| **Total** | **100%** | **73%** |

### Verified implementation

- Account create/edit forms and the Edge Function enforce required username and display-name rules from the live Minglora profile schema; duplicate usernames are checked before Auth creation/update.
- Contact phone and profile field length/format checks align with the live database constraints.
- Partial-update state is preserved through Supabase persistence, Node API and browser UI; the selected account and result list refresh and the partial result is explicitly shown.
- Create, session-revocation and delete actions disclose when audit confirmation is missing.
- When no target Supabase access token exists, session revocation is audited as application-only and explicitly marks provider refresh-token revocation as false.
- Supabase Auth deletion is audited only after the delete result: failed deletion uses `account.delete_failed` / `outcome: "rejected"`; successful deletion uses `account.delete` / `outcome: "deleted"`.
- The provider manager is included; PATCH changes require same-origin, designated owner, moderator and active MFA reviewer checks. Management tokens remain server-only.
- CI syntax-checks the provider manager script. The current Admin Centre asset/cache test expectations match the current HTML and service-worker versions.

### Latest CI evidence

Latest completed workflow run on branch tip `efb033d`:
- Run: [42603375700](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42603375700)
- General test suite: **746 tests, 716 passed, 30 failed**.
- For You functional-navigation suite: **15 tests, 13 passed, 2 failed**.
- All Admin Centre-targeted tests passed, including the new deletion-audit ordering test, local-only session audit, member create/edit validation, username uniqueness, partial updates, profile constraints, protected owner/MFA routes, Auth provider same-origin gate, service-connection secret-safety and Admin Centre shell assets.
- JavaScript syntax check passed, including `node --check public/auth-providers-admin.js`.
- Dependency audit reported **0 vulnerable packages**.
- Repository structure and required path checks passed.
- The remaining 30 general-suite failures match the current-main baseline failure set after the stale Admin Centre withdrawal asset assertion was corrected. The 2 For You/Home Stories failures also reproduce on main. They remain failed; none is counted as passing.

### Dirty-merge overlap recovered

The missing main commit adds the Auth provider manager, which the feature branch also contains:
- `public/auth-providers-admin.js` and `public/auth-providers-admin.css` have identical blob contents on main and this branch.
- `src/server.js` differs: the feature branch retains the provider route with the same-origin PATCH guard and includes member-management API routes.
- `public/admin-centre.html` differs in the Admin Centre JS/CSS asset versions; both versions include the provider manager assets.
- `public/sw.js` differs in cache version and provider assets; the feature branch has the updated v257 cache and auth-provider assets.
GitHub marks the PR dirty. These exact overlap points are identified; no merge or rebase was performed.

### Live infrastructure status

Latest direct service reads around 2026-11-09 10:34 UTC:
- Supabase Minglora project `gzycobgbasnqqhnympkr`: `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state` Edge Function: active version 112; the branch's new member CRUD actions are not deployed.
- Render Minglora service: auto-deploys from `main`; latest observed live deployment uses main commit `2f80e9d`.
- No production database, Auth settings, provider settings, user accounts, balances, permissions, merge or deployment changes were made.

### Remaining work and blockers

- **Easy:** No remaining Admin Centre-specific test failure is known from the latest run.
- **Medium:** Reconcile the dirty PR/main overlap after authorization; verify hosted CRUD, bans, session revocation, account deletion, audit behavior and provider/service health with the necessary owner/MFA access.
- **Hard:** Deploy the updated Supabase Edge Function after merge/deployment approval and complete real Auth lifecycle, session, deletion integrity, provider Management API and secret-handling acceptance.
- **Final verification:** The full suite remains red at 30 failures and the separate For You suite has 2 failures. They require resolution or explicit acceptance outside this Admin Centre PR.

### Last confirmed action

The latest functional addition audits deletion outcomes only after Supabase Auth returns the actual result. The deletion-audit test passes in workflow run `42603375700`.

### Exact next action

Keep PR #203 open and draft. Do not merge or rebase without authorization. The next authorized step is reviewed reconciliation of the known `src/server.js`, `public/admin-centre.html` and `public/sw.js` overlap, followed by hosted acceptance after deployment approval.

## Continuation addendum — 2026-11-09 10:47 UTC

**Canonical verified progress remains 73% / 27% remaining.** This retains the previously recorded weighted milestone credits; no hosted Auth CRUD or provider-management operation has yet been executed successfully against production. A provisional higher chat estimate is superseded by this durable evidence-based checkpoint.

### Latest branch and CI snapshot

- **Branch tip:** `891925730f17390c3b297a295e7cf15924435880`.
- **PR #203:** open draft; GitHub reports `mergeable=false`, `mergeable_state=dirty`; 66 commits, 15 changed files.
- **Comparison:** feature branch is 66 commits ahead and one commit behind `main` (`2f80e9d997b43e5da6373c385d6ce153ff908e67`).
- **Latest completed workflow:** [run #8293](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42603739693).
- **General suite:** 746 tests, 716 passed, 30 failed.
- **For You functional navigation:** 15 tests, 13 passed, 2 failed (For You header/search layout and Home Stories layout).
- Admin Centre-focused tests pass, including member CRUD authorization, deletion audit ordering, local-only session-revocation audit, Auth-provider same-origin/MFA checks, service cards and secret-safety assertions.
- JavaScript syntax, dependency audit (0 reported vulnerable packages), repository-structure and required-path checks pass. The overall workflow remains failed due the unrelated 30-test and 2-test groups; these are not counted as passes.

### Provider Management API configuration

The Admin Centre's Supabase Auth provider panel uses `SUPABASE_ACCESS_TOKEN` on the Minglora Render service to call the Supabase Management API. Configure a project-scoped Personal Access Token with the least required permissions:

- **Auth Config — Read** for GET `/v1/projects/{ref}/config/auth`.
- **Auth Config — Read-write** plus **Project Settings — Read-write** for PATCH `/v1/projects/{ref}/config/auth`.

These are the current permission names in Supabase's Personal Access Token permission matrix. Scoped PATs are in public alpha and may not be available to every account yet. Prefer a token scoped to this one project and only the permissions above; classic PATs have broad account-level access, so do not place one in Render without a separate security review.

Official documentation: [GET Auth service config](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [PATCH Auth service config](https://supabase.com/docs/reference/api/v1-update-auth-service-config), and [Personal Access Tokens and permission scopes](https://supabase.com/docs/guides/platform/personal-access-tokens).

The token must be stored only in Render's server-side environment; it is never sent to the browser or written to source control. No token was supplied or verified in this execution, and the connected Render tool does not reveal secret environment values. The provider panel therefore remains **configured in code but not end-to-end verified** until a scoped token and provider-side client credentials are present.

### Latest live infrastructure verification

Direct service reads on 2026-11-09 during this continuation confirmed:

- Supabase project `gzycobgbasnqqhnympkr` is `ACTIVE_HEALTHY`, with PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state` remains `ACTIVE`, version 112. This production function does not yet contain the feature branch's member CRUD actions.
- Render service `minglora-social-network` is active, configured for auto-deploy from `main`, and its latest listed live deployment is commit `2f80e9d997b43e5da6373c385d6ce153ff908e67` (status `live`).
- No production Auth settings, provider settings, member accounts, balances, database schema, permissions, merge or deployment were changed.

### PR reconciliation state

The branch contains the Supabase Auth provider manager introduced by the newer `main` commit. The Auth-provider JS file has the same Git blob SHA on `main` and the feature branch. The dirty merge overlaps are `src/server.js`, `public/admin-centre.html`, and `public/sw.js`: the feature branch includes the owner/MFA-protected provider route and member routes, updated asset versions, and cache v257. GitHub still marks PR #203 dirty, so manual/reviewed reconciliation is required. No merge or rebase has been performed.

### Remaining work and exact next action

- **Easy:** No known Admin Centre-specific CI failure remains; preserve the existing focused regression coverage.
- **Medium:** Obtain authorization for a reviewed reconciliation of `src/server.js`, `public/admin-centre.html`, and `public/sw.js`; then test hosted owner/MFA user CRUD, partial failures, audit outcomes, ban/unban and session revocation.
- **Hard:** Configure the scoped Supabase Management token, verify real provider GET/PATCH requests, merge only after authorized review, deploy the Edge Function and complete hosted acceptance.
- **Final:** Resolve or formally accept the 30 full-suite and 2 For You failures; verify the live application before declaring completion.

**Next action:** request authorization to reconcile the feature branch with the newer `main` commit. Until that authorization is given, keep PR #203 in draft and leave production unchanged.
## Continuation addendum — 2026-11-09 11:34 UTC

**Current verified progress: 74% / 26% remaining.** The previous durable verified checkpoint was 73%. One additional percentage point is credited to audit/data-integrity after the failed Supabase provider-session-revocation path and its Admin Centre disclosure were implemented and passed the focused CI regression test. No credit is assigned for hosted or production behavior that has not been exercised.

### Weighted milestone tracker

| Milestone | Weight | Verified credit |
|---|---:|---:|
| User-management interface | 20% | 20% |
| Supabase Auth operations | 25% | 15% |
| Owner/MFA authorization | 15% | 15% |
| Service connections | 15% | 10% |
| Audit and data integrity | 10% | 7% |
| Documentation and recovery records | 5% | 5% |
| Full CI, hosted acceptance and final regression | 10% | 2% |
| **Total** | **100%** | **74%** |

### Verified changes since the 10:47 UTC checkpoint

- Failed permanent account deletion attempts are recorded as `account.delete_failed` only after Supabase Auth rejects the operation; successful deletion is recorded as `account.delete` only after the Auth delete succeeds. The UI reports whether the failure audit was recorded.
- When there is no current member access token, known Minglora application sessions can be cleared and the runtime records an `application_only` revocation with `providerRefreshTokensRevoked: false`. The UI does not claim provider refresh-token sessions were revoked.
- When Supabase Auth rejects a global `signOut` attempt, the Edge Function now records `account.sessions_revoke_failed` with `scope: "global"`, `outcome: "rejected"`, and a non-sensitive reason code. The response returns `auditRecorded`; the selected-account UI explicitly distinguishes an audit write failure from a confirmed audit record.
- The failed-deletion UI message was corrected to exactly match the assertion and accurately state that a failed attempt was recorded. Its regression test now passes.

### Latest completed CI evidence

- Latest workflow: [GitHub Actions run #8348](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42609940529), commit `afa1f77067a2edd09ad55ec52fe5381e4e39f5de`.
- Repository suite: **748 tests, 718 passed, 30 failed**.
- For You navigation: **15 tests, 13 passed, 2 failed** (the same For You header/search and Home Stories layout cases that reproduce on the main-branch baseline).
- All seven focused Admin Centre checks passed, including member manager, deletion audit-warning disclosure, successful/failed deletion audit ordering, local-only session-revocation audit, failed provider session-revocation audit/UI disclosure, Auth provider owner/MFA/same-origin gates, and service-connection secret-safety checks.
- Dependency audit, zero-vulnerability gate, repository-structure check, JavaScript syntax check, and generated-gift-assets step passed. The overall workflow remains red because of the 30 general-suite failures and two For You failures; they remain unresolved and are not counted as passing.

### Current branch and PR state

- **Repository:** `ravaunrichards/Minglora-Social-Network`.
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`.
- **Latest verified source/test head:** `afa1f77067a2edd09ad55ec52fe5381e4e39f5de`.
- **PR #203:** open draft; 75 commits, 15 changed files; GitHub currently reports `mergeable=false` / `dirty`.
- **Current `main`:** `2f80e9d997b43e5da6373c385d6ce153ff908e67`; the feature branch is 75 commits ahead and one behind. The known overlap remains `src/server.js`, `public/admin-centre.html`, and `public/sw.js`. The Auth-provider JS/CSS contents match main. No merge or rebase was performed.

### Live infrastructure evidence

Live service reads during this continuation reconfirmed:

- Minglora Supabase project `gzycobgbasnqqhnympkr`: `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state`: active version 112; the new feature-branch member-management actions are not deployed.
- Render `minglora-social-network`: active free web service, auto-deploy configured to `main`; latest listed live deploy remains main commit `2f80e9d997b43e5da6373c385d6ce153ff908e67`.
- No production Edge Function, Auth/provider configuration, database schema, account, balance, role, merge or deployment operation was changed.

### Remaining work and blockers

- **Easy:** No known focused Admin Centre test failure remains in run #8348.
- **Medium:** Reconcile PR #203's dirty ancestry against the latest main commit after authorized review; test the member CRUD, bans/restores, session revocation, deletion, audit failure, and service-health routes in a hosted owner/MFA session.
- **Hard:** Supply a least-privilege, project-scoped Supabase Management API token to Render as `SUPABASE_ACCESS_TOKEN`; verify provider GET/PATCH operations; merge and deploy the Edge Function only after explicit authorization; complete hosted account lifecycle and security acceptance.
- **Final verification:** Resolve or formally accept the 30 general-suite and 2 For You failures, then run the complete integration/regression acceptance.

### Exact next action

Keep PR #203 in draft and production unchanged. Obtain authorization for the reviewed reconciliation of `src/server.js`, `public/admin-centre.html`, and `public/sw.js`; hosted acceptance and deployment remain blocked until that review and the required token setup are available.
## Continuation addendum — 2026-11-09 11:36 UTC

**Verified progress remains 73% / 27% remaining.** The weighted milestone tracker is unchanged because the Supabase Management API health card is implemented but its new focused assertion and hosted endpoint response still need verification.

### Service inventory and new health check

The Admin Centre service inventory now also checks the Supabase Management API endpoint used by the Auth-provider manager: `GET https://api.supabase.com/v1/projects/gzycobgbasnqqhnympkr/config/auth`. The check runs only when `SUPABASE_ACCESS_TOKEN` is present on the server, uses a 4.5-second timeout, and returns only the HTTP outcome and a safe status message; the token and Auth config response are never sent to the dashboard. The card distinguishes missing token, HTTP 401, HTTP 403, network failure, and successful authenticated read.

The active provider inventory remains Supabase (including Auth, database, Storage and Edge Functions), Supabase Management API, Render, GitHub, LiveKit, PayPal, Tenor, SIX Group, Frankfurter, and browser Web Push. Google, Apple and other social login providers remain managed under the separate Supabase Auth provider panel.

SMTP, Resend, SendGrid, Sentry and OTLP variables in `.env.example` are not active connections in the current server implementation or dependency list. They must not be shown as connected services. The Auth email card explicitly says this runtime does not test SMTP delivery.

### Current tests and CI

- Previous completed workflow run [#8350](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42610272786) reported **748 tests, 718 passed, 30 failed**; the separate For You suite reported **13 passed, 2 failed**.
- The Admin Centre tests passed in that run. The new test that checks the Supabase Management API card, scoped server token usage, endpoint and secret-safety is on the current branch and was included in the next workflow run; its result was pending at this checkpoint.
- The 30 full-suite and 2 For You failures remain unrelated existing tests in other areas and are not counted as passes.

### Current branch snapshot

- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`.
- **Head:** `a57886e6ec4b8b708ded3c975bfe48537df7b401`.
- **PR #203:** open draft; GitHub reports `mergeable=false` / `dirty`.
- The PR remains one commit behind `main`; do not merge or rebase without authorization.
- Production Supabase Edge Function and Render deployment remain on `main`; no production change was made.

### Remaining

- **Easy:** Confirm the new Supabase Management API test passes on the current head; update this checkpoint with that run.
- **Medium:** Obtain authorization to reconcile the known PR/main overlap; verify hosted account management and provider service cards with the required owner/MFA session.
- **Hard:** Configure a project-scoped `SUPABASE_ACCESS_TOKEN` in Render, then verify actual Management API GET and PATCH permissions. Do not enable/disable Auth providers without explicit user approval.
- **Final:** Complete hosted CRUD, audit, revocation and service checks; resolve or formally accept the 30+2 existing repository failures before a 100% claim.

**Exact next action:** review the latest CI run for the new Management API health-card test, then re-check live Supabase/Render state. Keep the PR in draft and production unchanged.
## Continuation addendum — 2026-11-09 11:37 UTC

**Verified completion remains 74% / 26% remaining.** No extra service-integration credit is claimed yet: the Supabase Management API health check is implemented and its static regression test passes, but the real Management API request still depends on a configured server-side token and has not been exercised in the hosted application.

### Latest owner-authored Service Connections improvement

- Commit `3dbbdcbddf37e436d156beef0e0ca4fffeb8faee` adds a dedicated **Supabase Management API** card to the owner-only `/api/admin/integrations` response.
- The server reads `SUPABASE_ACCESS_TOKEN` only from its server environment and makes a GET request to `https://api.supabase.com/v1/projects/gzycobgbasnqqhnympkr/config/auth` with a bearer header. It stores only the HTTP success/status result; it does not read or return the Auth configuration body or token.
- The service card distinguishes `not-configured`, `connected`, and `attention` states, with separate guidance for HTTP 401, HTTP 403, connectivity failures and other status codes.
- The existing Auth email-delivery card was clarified: Supabase Auth manages the email flow, but the current runtime does not verify SMTP provider readiness or actual message delivery.
- Commit `a57886e6ec4b8b708ded3c975bfe48537df7b401` adds regression assertions for the new provider card, endpoint, server-only token handling and scope guidance.

### Current official Supabase permission requirements

- GET `/v1/projects/{ref}/config/auth`: **Auth Config — Read**.
- PATCH `/v1/projects/{ref}/config/auth`: **Auth Config — Read-write** plus **Project Settings — Read-write**.
- These are the permission labels in the current Supabase PAT permission matrix. Scoped PATs are in public alpha and may not yet be available to every account. Prefer a project-scoped token with only the required permissions. Classic PATs are broad across the account's organizations/projects and must not be placed in Render without a separate security review.
- Sources, retrieved 2026-11-09: [GET Auth config](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [PATCH Auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config), and [PAT permission matrix](https://supabase.com/docs/guides/platform/personal-access-tokens).

No `SUPABASE_ACCESS_TOKEN` value was supplied or confirmed in Render. The management health card can therefore only report `not-configured` until the owner configures the scoped token in the Render service environment. Never put the token in the repo, client, logs or progress report.

### Latest test evidence

- Latest completed source/test workflow: [run #8351](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42610335262), on commit `a57886e6ec4b8b708ded3c975bfe48537df7b401`.
- General suite: **748 tests, 718 passed, 30 failed**.
- For You job: **15 tests, 13 passed, 2 failed** (the For You header/search layout and Home Stories layout failures).
- All seven focused Admin Centre tests passed, including the new Supabase Management API health-card/token-secrecy test, failed session-revocation audit, failed-deletion audit, local-only session audit, owner/MFA route, and service connections checks.
- Dependency audit, zero-vulnerability gate, repository structure, JavaScript syntax and asset generation steps passed. Workflow conclusion remains failure due the 30 general-suite and 2 For You failures.

### Current branch state and deployment

- **Current branch head at this checkpoint:** `a57886e6ec4b8b708ded3c975bfe48537df7b401`.
- **PR #203:** open draft; 78 commits, 15 changed files; GitHub reports `mergeable=false` / `dirty`.
- **Main head:** `2f80e9d997b43e5da6373c385d6ce153ff908e67`; feature branch is 78 commits ahead and one behind.
- The PR overlap remains in `src/server.js`, `public/admin-centre.html`, and `public/sw.js`. Auth-provider JS/CSS files match main. No merge/rebase has been done.
- Production Supabase `minglora-runtime-state` remains active at version 112; new member CRUD actions are not deployed. Render remains configured to deploy from `main`; latest listed live deploy remains commit `2f80e9d997b43e5da6373c385d6ce153ff908e67`.
- No production Auth setting, database schema, account, balance, role, merge, or deployment was changed.

### Remaining work and next action

- **Easy:** No known focused Admin Centre test failure remains in run #8351.
- **Medium:** Resolve PR #203's dirty history through reviewed reconciliation after authorization; test hosted CRUD, account protection, bans/restores, session revocation, deletion and service-health states in an owner/MFA session.
- **Hard:** Configure the scoped `SUPABASE_ACCESS_TOKEN` in Render; validate the Management API GET/PATCH against the live project; merge and deploy only after explicit authorization; complete hosted Edge Function and account lifecycle acceptance.
- **Final:** Resolve or formally accept the 30 full-suite failures and two For You failures; run complete regression and live acceptance checks.

**Exact next action:** obtain authorization for reviewed reconciliation of `src/server.js`, `public/admin-centre.html` and `public/sw.js`. Keep PR #203 draft and production unchanged until then.
## Continuation checkpoint — 2026-11-09 11:44 UTC

**Canonical verified completion: 74% | remaining: 26%.** The existing weighted progress baseline is retained. No extra credit is claimed for source changes until the related focused test or hosted acceptance passes.

### Latest verified implementation and changes

- Supabase-style member management remains integrated into the existing Admin Centre: paginated Auth user search, detailed account records, create/edit, profile/contact management, email/phone confirmation, password replacement, ban/unban, session revocation, and permanent deletion with exact-ID confirmation.
- Member and provider routes are guarded by the designated Creator Hub owner identity, moderator/MFA reviewer authorization, and same-origin checks for writes. The owner Auth account is protected from edit, ban, revoke and delete.
- Failed and successful member deletion outcomes are audited separately. Before deletion, the Node API reads the selected member's sealed server-side session, uses Minglora's session manager to refresh a near-expiry token where possible, and passes the access token only to the protected runtime gateway. The Edge Function attempts `admin.auth.admin.signOut(targetJwt, "global")` before `admin.auth.admin.deleteUser(userId)`.
- The deletion audit records whether provider refresh-token revocation succeeded. If no current token exists or the sign-out request fails, the response explicitly discloses that provider sessions were not globally revoked. Existing Supabase access JWTs can remain valid until expiry.
- A rejected Supabase deletion is logged as `account.delete_failed`, returns HTTP 409 through the Node route, and is not reported to the UI as a successful deletion. The UI displays the session-revocation and audit outcome warnings.
- The Service Connections API includes the Supabase Management API read-only health check, alongside the active provider cards. It never returns the Management token or the Auth config body.

### Latest CI verification

- Latest completed workflow run: [run #8362](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42611344015), on branch head `9af4031e9993d07e0d14fd22452fa0505da0b01d`.
- Repository test job: **750 tests, 720 passed, 30 failed**.
- Separate For You functional-navigation job: **15 tests, 13 passed, 2 failed** (For You header/search layout and Home Stories layout).
- All targeted Admin Centre tests passed, including failed session-revocation audit, failed deletion disclosure, deletion audit ordering, local-only session audit, service-connection Management API card/token secrecy, member manager and MFA/provider gates.
- The workflow remains failed due the 30 non-Admin repository tests and 2 For You tests. They are not being represented as passes or counted as completed work.

### Branch, PR and deployment status

- **Project:** Minglora Social Network.
- **Repository:** `ravaunrichards/Minglora-Social-Network`.
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`.
- **Latest verified branch head at this checkpoint:** `9af4031e9993d07e0d14fd22452fa0505da0b01d`.
- **PR #203:** open draft, 89 commits at latest retrieval, `mergeable=false`, `mergeable_state=dirty`; the feature branch is divergent and one commit behind main. The known overlap remains `src/server.js`, `public/admin-centre.html`, and `public/sw.js`. No merge or rebase was performed.
- **Live Supabase:** project `gzycobgbasnqqhnympkr` returned `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- **Production Edge Function:** `minglora-runtime-state` remains active at version 112; the feature branch's new member CRUD and deletion/session logic are not deployed.
- **Live Render:** Minglora service remains on `main`, with latest listed live deployment at `2f80e9d997b43e5da6373c385d6ce153ff908e67`. The Management API token was not supplied or verified; the Render integration tool does not expose secret values.
- No production Auth settings, service credentials, user accounts, balances, database schema, permissions, merge or deployment were changed.

### Accurate Supabase Management API permissions

- GET Auth config: **Auth Config — Read**.
- PATCH Auth config: **Auth Config — Read-write** plus **Project Settings — Read-write**.
- Supabase scoped PATs are in public alpha and may not be visible to every account. Use a token scoped to the Minglora project with only these permissions when possible. Classic PATs grant broad account-wide access and require a separate security review before use in Render.
- Official references: [GET Auth config](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [PATCH Auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [PAT permissions](https://supabase.com/docs/guides/platform/personal-access-tokens).

### Remaining work

- **Easy:** Keep the latest deletion/session warning behavior and test expectations aligned if the owner makes further source changes.
- **Medium:** Obtain authorization for a reviewed reconciliation of PR #203 with the newer main history; then run hosted create/edit/ban/unban/revoke/delete and service-status acceptance under the owner/MFA session.
- **Hard:** Have the owner configure `SUPABASE_ACCESS_TOKEN` directly in Render's server environment using a properly scoped token; verify real Management API GET and PATCH after authorization; merge and deploy the Edge Function only with explicit authorization.
- **Final:** Resolve or formally accept the 30 general-suite and 2 For You failures, verify hosted user lifecycle/session behavior and all live service connections.

**Exact next action:** obtain explicit authorization for reviewed branch reconciliation. Until then keep PR #203 in draft and production on the current `main` deployment.
## Continuation addendum — 2026-11-09 11:44 UTC

**Current verified progress: 75% / 25% remaining.** Previous durable verified completion was 74%. One additional point is credited to audit/data integrity because failed Supabase Auth account deletions now produce an HTTP failure response, the Admin Centre displays the session/audit outcome, local user/session records are retained unless deletion actually succeeds, and the focused regression tests passed in CI.

### Weighted milestone tracker

| Milestone | Weight | Verified credit |
|---|---:|---:|
| User-management interface | 20% | 20% |
| Supabase Auth operations | 25% | 15% |
| Owner/MFA authorization | 15% | 15% |
| Service connections | 15% | 10% |
| Audit and data integrity | 10% | 8% |
| Documentation and recovery records | 5% | 5% |
| Full CI, hosted acceptance and final regression | 10% | 2% |
| **Total** | **100%** | **75%** |

### Verified account-deletion lifecycle correction

Previous implementation defect: the Supabase Edge Function could return `{ error, auditRecorded, sessionRevoked, warning }` when deletion failed, but the Node DELETE route always returned HTTP 200. The browser's `adminCentreApi` therefore did not throw, and the deletion UI could display a success message even though the Auth identity was not deleted.

Corrected implementation:
- `src/server.js` now returns HTTP 200 only when `result.deleted` is true; otherwise it returns HTTP 409 with the original result payload.
- Local `db.users`, `db.sessions`, and `db.pendingAuth` collections are changed only after a confirmed `result.deleted === true` response.
- The Edge Function's failed-delete result now always describes session revocation: previously revoked before deletion rejection, revocation failed, or no current provider access token was available.
- `public/admin-centre.js` displays both the audit-record outcome and the session-revocation warning when the DELETE API returns an error.
- Regression test asserts the DELETE route maps a failed Supabase Auth deletion to HTTP 409, only calls `saveStore()` after confirmed deletion, and the UI consumes the session warning.

Files updated: `src/server.js`, `supabase/functions/minglora-runtime-state/index.ts`, `public/admin-centre.js`, and `tests/unit/admin-user-and-service-centre.test.js`.

### Latest CI evidence

- Latest completed workflow: [run #8362](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42611344015), commit `9af4031e9993d07e0d14fd22452fa0505da0b01d`.
- Repository suite: **750 tests, 720 passed, 30 failed**.
- For You navigation suite: **15 tests, 13 passed, 2 failed** (For You header/search layout and Home Stories layout).
- Focused Admin Centre tests passed, including: failed account deletion status mapping; failed deletion audit/session disclosure; session revocation before deletion; successful/failed deletion audit ordering; local-only session-revocation audit; provider-session-revocation failure audit; owner/MFA restrictions; Auth-provider same-origin checks; and service-connection secret handling.
- Dependency audit and zero-vulnerability gate, repository structure, JavaScript syntax and generated gift assets passed. Overall CI remains failed due the 30 general-suite failures and two For You failures; they are still not counted as passing.

### Current repository state

- **Repository:** `ravaunrichards/Minglora-Social-Network`.
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`.
- **Latest verified branch head:** `9af4031e9993d07e0d14fd22452fa0505da0b01d`.
- **PR #203:** open draft; 89 commits, 15 changed files; GitHub reports `mergeable=false`, `mergeable_state=dirty`.
- **Main:** `2f80e9d997b43e5da6373c385d6ce153ff908e67`; branch compares 89 commits ahead and 1 behind. The known overlapping files remain `src/server.js`, `public/admin-centre.html`, and `public/sw.js`. No merge or rebase was performed.

### Latest live infrastructure verification

Direct service reads during this continuation confirmed:
- Minglora Supabase project `gzycobgbasnqqhnympkr` is `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state` remains active at version 112. The feature branch's new user-management actions are not deployed.
- Render `minglora-social-network` remains an active Free web service configured for auto-deploy from `main`. Its latest listed live deployment uses `2f80e9d997b43e5da6373c385d6ce153ff908e67` and remains `live`.
- The Supabase Management API health card and provider manager require `SUPABASE_ACCESS_TOKEN`; no such value was supplied or verified in Render. The production token/environment was not changed.
- No production database, Auth/provider configuration, account, balance, permissions, merge, or deployment was changed.

### Remaining work and blockers

- **Easy:** No known Admin Centre-specific test failure remains from run #8362.
- **Medium:** Obtain authorization for reviewed reconciliation of PR #203's dirty history; run hosted owner/MFA acceptance for create/edit/ban/restore/delete/session revocation, audit outcomes and service connections.
- **Hard:** Configure a least-privilege, project-scoped Supabase Management token in Render; verify actual Management API GET/PATCH; merge and deploy the Edge Function only after explicit authorization; complete hosted account lifecycle and security acceptance.
- **Final verification:** Resolve or formally accept the 30 full-suite and two For You failures, then complete end-to-end and regression acceptance.

**Exact next action:** obtain authorization for reviewed reconciliation of `src/server.js`, `public/admin-centre.html`, and `public/sw.js`. Keep PR #203 in draft and leave production unchanged until then.
## Continuation addendum — 2026-11-09 11:46 UTC (latest state)

**Canonical verified completion: 75% | remaining: 25%.** This supersedes older branch-tip and PR-count references in earlier checkpoint paragraphs. The original milestone weights remain unchanged; audit/data-integrity verified credit is now 8% of its 10% weight.

### Latest branch and CI state

- **Current branch tip:** `7f1f2e5f9835e2969ba9e2d34f3be3df6ec4489d`.
- **PR #203:** open draft; 91 commits, 15 changed files; GitHub reports `mergeable=false`, `mergeable_state=dirty`.
- **Main:** `2f80e9d997b43e5da6373c385d6ce153ff908e67`; feature branch compares 91 commits ahead and 1 behind. The merge base is `b4a624f72cf961d0dfa9a1b6233dd2b1787c869e`.
- **Latest completed workflow:** [run #8364](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42611567011), at current checkpoint head `7f1f2e5`.
- General repository tests: **750 total, 720 passed, 30 failed**.
- For You job: **15 tests, 13 passed, 2 failed** (For You header/search layout and Home Stories layout).
- Focused Admin Centre tests passed, including the DELETE API 409 mapping on rejected Auth deletion, failed-deletion session/audit disclosure, failed provider session-revocation audit, deletion audit ordering, member manager, owner/MFA provider checks and service connection/secret-safety tests.
- Dependency audit, repository structure, JavaScript syntax and generated assets steps passed. Overall CI remains failed because of the 30 general-suite and 2 For You failures; do not call the full suite green.

### Latest deletion failure safeguard

The Node DELETE route now returns HTTP 200 only for `result.deleted === true`, otherwise HTTP 409. It deletes local `db.users`, `db.sessions` and `db.pendingAuth` records and saves local state only after successful Supabase Auth deletion. The Edge Function's HTTP 409 payload discloses whether provider refresh-token sessions had been revoked before the deletion failed, whether revocation itself failed, or whether no current token was available. The browser's `adminCentreApi` now throws on that 409 and the selected-account UI displays both the audit result and the session warning instead of displaying a false success message.

Relevant commits: `4bcbd04` (session warnings in Edge response), `073db20` (UI disclosure), `65060ea` (session/audit outcome regression), `48a5c5c` (HTTP 409 response mapping), `9af4031` (HTTP status/UI test), and checkpoint `7f1f2e5`.

### Live service state, re-queried during this continuation

- Minglora Supabase `gzycobgbasnqqhnympkr`: `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state`: still active at version 112. The new branch's member CRUD and deletion/session code is not deployed.
- Render `minglora-social-network`: active Free web service, auto-deploy from `main`; latest listed live deploy is still `2f80e9d997b43e5da6373c385d6ce153ff908e67`.
- `SUPABASE_ACCESS_TOKEN` remains unavailable/unverified in Render; no secret value was supplied or exposed. Management API GET/PATCH therefore remains unverified in the hosted environment.
- No production schema, Auth configuration, provider settings, user, balance, role, merge or deployment was changed.

### Remaining work and exact next step

- **Easy:** No known in-scope focused Admin Centre test failure remains in run #8364.
- **Medium:** Obtain authorization to reconcile the known dirty PR overlap in `src/server.js`, `public/admin-centre.html`, and `public/sw.js`; then run hosted owner/MFA account lifecycle and service-health acceptance.
- **Hard:** Configure the least-privilege project-scoped `SUPABASE_ACCESS_TOKEN` directly in Render; verify live Management API GET/PATCH; merge and deploy the updated Edge Function only after explicit authorization.
- **Final:** Resolve or formally accept the 30 general-suite and two For You failures; finish hosted CRUD, audit, session and provider acceptance before claiming 100%.

**Next action:** obtain explicit authorization for reviewed branch reconciliation. Until then keep PR #203 in draft and leave production on its current `main` deployment.
## Continuation addendum — 2026-11-09 11:47 UTC

**Verified completion remains 75% | remaining 25%.** No progress increase is claimed for the read-only database/security checks in this continuation.

### Live audit-schema acceptance

Read-only SQL inspection of the live Minglora Supabase project `gzycobgbasnqqhnympkr` at approximately 2026-11-09 11:46:36 UTC confirmed that the new Edge Function audit insert matches `public.audit_log`:

- `actor_id`: nullable UUID referencing `public.profiles(id)`.
- `action` and `target_type`: required text fields.
- `target_id` and `request_id`: nullable text fields.
- `metadata`: required JSONB with `{}` default.
- `id`: UUID with `gen_random_uuid()` default; `created_at` has `now()` default.
- Live counts at inspection: **7 `auth.users`, 7 `public.profiles`, 15 `public.audit_log` rows**.

No audit rows or member records were inserted, changed or deleted during this check.

### MFA and Supabase security-advisor review

The live Supabase security advisor reported 36 RLS-enabled tables without policies, including `public.audit_log`, `public.minglora_platform_staff`, `public.minglora_runtime_api_secrets`, and `public.minglora_runtime_state`. These sensitive internal records are intended for the trusted server/Edge Function service-role gateway; no broad policy or RLS-disable change was made. The account-management runtime must continue using only its server-side privileged client and must not expose these tables directly to browser users.

The advisor also flagged `public.minglora_list_my_mfa_factors()` as a `SECURITY DEFINER` function executable by authenticated users. Live definition/ACL inspection confirmed:

- `SECURITY DEFINER` is enabled and `search_path` is set to the empty string.
- The query filters MFA factor rows by `(select auth.uid())`, so an authenticated caller only receives their own factor rows.
- The explicit ACL grants `EXECUTE` to `authenticated` and `service_role`; `anon` cannot execute it and the ACL does not grant `PUBLIC` execution.

This remains a recorded advisor warning requiring a separate MFA/security review; it was not modified as part of this Admin Centre task. The advisor also reports that leaked-password protection is disabled in Auth. No Auth security setting was changed.

### Latest CI at current checkpoint

- Current checkpoint branch tip: `e639e2ec4d91e241db1845e5e0e221c69bd46aca`.
- Latest completed workflow: [run #8365](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42611755916).
- General suite: **750 tests, 720 passed, 30 failed**.
- For You navigation: **15 tests, 13 passed, 2 failed**.
- Focused Admin Centre tests pass, including failed account-delete HTTP status mapping, session-revocation-before-delete ordering, deletion/session/audit warnings, audit ordering, provider gates, and service connection/token secrecy. The overall workflow remains red due the 30 general-suite failures and two For You failures.

### Current deployment and blockers

- Supabase project remains `ACTIVE_HEALTHY` (PostgreSQL 17.11.0.003); production `minglora-runtime-state` remains active at version 112.
- Render continues to deploy from `main`; latest live deployment remains commit `2f80e9d997b43e5da6373c385d6ce153ff908e67`.
- `SUPABASE_ACCESS_TOKEN` remains unavailable/unverified in the Render environment, so live Supabase Management API GET/PATCH acceptance is blocked.
- PR #203 remains draft and dirty/diverged (one commit behind main). No merge, rebase, deployment, production Auth setting change, or user-data mutation was performed.

**Next action:** keep PR #203 in draft and obtain explicit authorization for the reviewed branch reconciliation; after that, run hosted account-management and service acceptance with owner/MFA access and a project-scoped Management token.

## Continuation checkpoint — 2026-11-09 12:23 UTC

- **Project:** Minglora Social Network
- **Repository:** `ravaunrichards/Minglora-Social-Network`
- **Assigned task:** Admin Centre member management, service connections and responsive no-overlap layout, PR #203
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Tested implementation head:** `a7747b7cfcffcc56fc9c7688e8d6f0de0272e9b2`
- **PR:** open, draft; 15 changed files; GitHub reports `mergeable=false`.
- **Branch/main status:** PR #203 remains divergent/dirty against `main`; its overlapping `src/server.js`, `public/admin-centre.html` and `public/sw.js` changes remain unreconciled. No merge or rebase was performed.
- **Previous verified completion:** 75%.
- **Current verified completion:** 76%.
- **Progress since last checkpoint:** +1 percentage point, credited only to passing responsive-layout regression coverage. This does not include browser screenshot/viewport acceptance or any hosted/production operation.
- **Remaining:** 24%.

### Weighted milestone tracker

| Milestone | Weight | Verified credit |
|---|---:|---:|
| User-management interface | 20% | 20% |
| Supabase Auth operations | 25% | 15% |
| Owner/MFA authorization | 15% | 15% |
| Service connections | 15% | 10% |
| Audit and data integrity | 10% | 8% |
| Documentation and recovery records | 5% | 5% |
| Full CI, hosted acceptance and final regression | 10% | 3% |
| **Total** | **100%** | **76%** |

### Responsive layout audit and fixes

Source audit found that the Admin Centre had two constrained nested scroll areas, member identities that were ellipsized, legacy sticky/scrolling navigation declarations, and content-grid items that could be auto-placed in the sidebar column. The following scoped fixes are now in the feature branch:

- Internal operations activity feed and Admin Campaign promotional gift-fund history now expand in normal document flow; their fixed max-heights and inner scrollbars were removed.
- Admin Centre navigation is static, not sticky, and does not use a horizontal hidden/scrolling container. At widths up to 900px the navigation reflows into a two-column grid; at widths up to 560px it becomes one column.
- The moderation/support shortcut tile grid is explicitly placed in the content column on desktop and the single content column on smaller screens.
- Main panel and section grid items use `min-width:0`, `max-width:100%` and visible overflow. Inputs, buttons and links are constrained to the panel width.
- Member names and email/username lines now wrap instead of truncating with ellipses.
- Admin status badges, activity timestamps and long labels can wrap instead of forcing one-line overflow.
- Supabase Auth provider cards already have a one-column layout at widths up to 620px; this responsive rule is now included in the regression test.
- The 42px member avatar still uses `overflow:hidden` only to crop the image into its circular avatar; it does not clip text or controls.
- The Create member account and permanent Delete account forms remain deliberately expandable safety disclosures. They are not clipped behind a panel or inaccessible due to overflow.

### Regression and CI evidence

The latest checkpoint workflow ran on commit `d1976e49eda6ac0bba867f58d47a37550617a9d0`:
- Run: [42616953685](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42616953685)
- General repository suite: **751 tests, 721 passed, 30 failed**.
- For You functional-navigation suite: **15 tests, 13 passed, 2 failed**.
- All targeted Admin Centre tests passed, including the new responsive/no-clipping regression assertion. No Admin Centre-specific test failures were reported.
- CI JavaScript syntax check, repository structure check, original gift-asset generation and zero-vulnerability dependency audit passed.
- The overall workflow remains failed. The general failures are distributed across unrelated email-link, Clock Centre, service-worker cache, profile, Stories, utility rail, theme and Supabase persistence tests. The persistence retry tests include an existing expectation of two saves while the current path performs three. The separate For You failures are stale `app.js` service-worker asset-version assertions.
- These unrelated failures are recorded, not counted as passing, and are not being changed as part of this Admin Centre task.
- Earlier tested implementation commit `a7747b7cfcffcc56fc9c7688e8d6f0de0272e9b2` had the same 751/721/30 and 15/13/2 summary; the newest run confirms there has been no CI improvement or regression in the overall counts.

### Browser-level verification limitation

- `package.json` exposes the Node unit-test runner; it has no Playwright, Puppeteer, jsdom or similar browser-test dependency.
- `tests/e2e/README.md` contains a browser-test scope description only; there are no executable E2E test files.
- Therefore this checkpoint confirms source-level responsive CSS rules and passing CI regression assertions, **not a real browser rendering/screenshot at desktop, tablet and phone widths**. A browser-level visual check remains outstanding.

### Current live/production and review state

Last live Supabase and Render reads in the previous checkpoint were around 2026-11-09 11:46 UTC:
- Supabase Minglora project `gzycobgbasnqqhnympkr` was `ACTIVE_HEALTHY`; production `minglora-runtime-state` remained active at version 112.
- Render's `minglora-social-network` service was still configured to auto-deploy from `main`, with production on commit `2f80e9d`.
- The production Edge Function does not yet contain the feature-branch member CRUD/session operations.
- `SUPABASE_ACCESS_TOKEN` remained unavailable/unverified in Render; hosted Management API GET/PATCH acceptance is blocked.
- No production merge, rebase, deployment, user mutation, provider setting change, permission change or database change was performed in this continuation.

### Remaining work

- **Easy:** No known Admin Centre-specific CSS/layout regression remains from the source-level checks and current targeted CI. Browser visual verification is not available in the current repository toolchain.
- **Medium:** Obtain explicit authorization for reviewed reconciliation of the overlapping `src/server.js`, `public/admin-centre.html` and `public/sw.js` changes against `main`; complete hosted owner/MFA account-management and service checks afterward.
- **Hard:** Add/run a real browser viewport verification path, verify the server-side Supabase Management API with the required least-privilege project token, and complete hosted account/session/deletion acceptance after merge/deployment authorization.
- **Final:** Resolve or formally accept the 30 full-suite failures and 2 For You failures; obtain passing required checks and hosted integration evidence.

### Last confirmed action

Commit `a7747b7cfcffcc56fc9c7688e8d6f0de0272e9b2` adds regression assertions that long Admin Centre status labels wrap. The corresponding CI run passed the layout test and all Admin Centre-targeted checks. The one-point progress increase is only for this newly verified layout regression coverage.

### Exact next action

Keep PR #203 in draft and production unchanged. The next task is browser-level verification at desktop/tablet/phone widths once a real browser runner is available, while preserving the current 76% tracker. Reconciliation with `main` still requires explicit authorization.


## Continuation recovery — browser viewport harness

- **Checkpoint timestamp:** 2026-11-09 17:01 UTC (latest code/workflow commit timestamp)
- **Project / repository / task:** Minglora Social Network; `ravaunrichards/Minglora-Social-Network`; Admin Centre member management, service connections and no-hidden/no-overlap responsive layout; PR #203.
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Latest branch head at checkpoint:** `1ed0dbe6b0151022242403c1c27c635902518667`.
- **PR:** open, draft, 107 commits, 16 changed files, `mergeable=false`; no merge, rebase or deployment performed.
- **Previous and current verified completion:** 76% / 76%; **remaining:** 24%; **change:** no percentage increase. Browser-test code and CI wiring are newly saved but have not yet passed a browser run.

### New implementation since the 12:23 UTC checkpoint

- Commit `a6c2ab5af19bfa643952175d3664228989309ec4` strengthens `tests/unit/admin-user-and-service-centre.test.js`: rejects fixed/sticky positioning, text ellipsis and all `overflow:hidden` blocks except the circular member avatar crop; asserts long activity timestamps, withdrawal timestamps, module totals and promotional amounts wrap. These assertions were manually matched against the current stylesheet; this is source inspection, not a CI test result.
- Commit `d024e98a2539ee2548c4b15db4eaafa0e372b35c` adds `tests/e2e/admin-centre-layout.test.js`, an executable Chromium test serving the actual Admin Centre HTML/CSS/JS locally and intercepting API reads with disposable fixture data. It checks 320, 360, 390, 768, 1024 and 1440 CSS-pixel widths; document/panel bounds; direct panel sibling collisions; controls outside the panel; fixed/sticky descendants; browser page errors; and expansion of the explicit Create account and Delete account safety disclosures. All API writes are rejected and asserted absent.
- Commit `1ed0dbe6b0151022242403c1c27c635902518667` adds a separate `admin-centre-viewport` workflow job. It installs pinned Playwright `1.65.0` without changing `package.json` or `package-lock.json`, installs Chromium and system dependencies, and runs only the isolated browser layout test. The main unit-test workflow remains separate.
- Official Playwright documentation confirms Playwright's CI browser-install command and Node 24 support: https://playwright.dev/docs/intro and https://playwright.dev/docs/release-notes (Version 1.65).

### Verification state and limitations

- **Project verified:** the E2E script and CI job are present on the branch head; PR #203 has the new head SHA above and now contains 16 changed files.
- **Manual source validation:** all five newly added no-overlay/no-clipping CSS checks matched the current source stylesheet. The earlier CI run `42616953685` reported all Admin Centre-specific tests passing but did not include the new browser test.
- **Browser execution:** not yet verified. The connected workflow-run lookup and combined commit status did not return a run/status for the new head; that response is not proof that CI passed or that no push-triggered run exists. Do not count browser verification as completed.
- **Last detailed existing CI:** run `42616953685` on prior checkpoint commit `d1976e49`: 721/751 general tests passed (30 failed), For You 13/15 passed (2 failed), no Admin Centre-specific failures; syntax, structure, dependency audit and gift-asset generation passed.
- **Remaining merge blocker:** PR is divergent/dirty against `main`, one main commit behind; overlapping `src/server.js`, `public/admin-centre.html` and `public/sw.js` remain unreconciled. No authorization to rebase/merge.
- **Production blockers:** current production Edge Function was historically observed at version 112 and does not contain this branch's new CRUD actions. Render's Management API access token remains unavailable/unverified. Hosted CRUD/session/deletion/provider acceptance is therefore still outstanding; historic service state was not refreshed in this checkpoint.

### Exact next action

Retrieve and inspect the new `admin-centre-viewport` Chromium job result for head `1ed0dbe6b0151022242403c1c27c635902518667`. If it fails, fix only the measured Admin Centre viewport regression and rerun. If it passes, record the six-viewport browser evidence; keep the 76% tracker until the remaining hosted integration, dirty-branch reconciliation/review and final acceptance criteria are completed with authorization.
