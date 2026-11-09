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

- `auth_config_read` for GET `/v1/projects/{ref}/config/auth`.
- `auth_config_write` and `project_admin_write` for PATCH `/v1/projects/{ref}/config/auth`.

Official current documentation: [GET Auth service config](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [PATCH Auth service config](https://supabase.com/docs/reference/api/v1-update-auth-service-config), and [Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens).

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