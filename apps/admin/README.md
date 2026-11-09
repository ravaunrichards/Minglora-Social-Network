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

## Current execution checkpoint — 2026-11-09 10:40 UTC

- **Project:** Minglora Social Network
- **Repository:** `ravaunrichards/Minglora-Social-Network`
- **Assigned task:** Admin Centre member management and service connections, PR #203
- **Working branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **PR tip / checkpoint commit:** `afd2a80001a806adc0f1432cfc9ad521725dbece`
- **Latest code change:** `159d2113f46c27460350754efa9d06fe6431ebf8` (deletion audit outcome is recorded after the actual Supabase delete result)
- **Latest regression-test change:** `20269121d8cd9f4a135976b61407bbaab7392c2b`
- **PR state:** Open, draft; 63 commits; 15 changed files; GitHub reports `mergeable=false`, `mergeable_state=dirty`.
- **Branch comparison:** 63 commits ahead and 1 behind the last retrieved `main` commit `2f80e9d997b43e5da6373c385d6ce153ff908e67`. The branch is diverged; no merge or rebase was performed.
- **Completion:** 73% verified / 27% remaining. Original milestone weighting remains unchanged.

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

### Verified implementation and audit safeguards

- Create and edit forms/server validation enforce the live profile schema requirements for username, display name, contact phone, and location/profile lengths.
- Normalized username availability checks run before Auth account creation and before username edits; they use exact matching and exclude the account being edited.
- Partial profile/Auth update outcomes propagate through Supabase persistence, the Node API and Admin Centre UI. The selected account and results list are refreshed, and partial success is called out explicitly.
- Create, session-revocation and delete actions disclose missing audit confirmation.
- When a target Supabase access token is unavailable, session revocation closes known Minglora app sessions and records a metadata-only audit action with `scope: "application_only"`, `providerRefreshTokensRevoked: false` and `sessionRevoked: false`. The UI does not claim provider refresh-token sessions were revoked.
- Account deletion audit is now outcome-based: the runtime attempts the Auth delete first; failed deletes write `account.delete_failed` with `outcome: "rejected"`, while successful deletes write `account.delete` with `outcome: "deleted"`.
- The restored Supabase Auth provider manager uses the server-only Management token; its PATCH route requires same-origin writes, designated-owner identity, moderator access and an active MFA reviewer session.
- The provider-manager script is explicitly included in CI syntax checking.
- Current Admin Centre script and service-worker cache versions are reflected in the asset regression tests.

### Latest CI evidence

Latest completed workflow run on PR tip `afd2a80`:
- GitHub Actions run: [42602578904](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42602578904)
- General suite: **746 tests, 716 passed, 30 failed**.
- For You functional navigation: **15 tests, 13 passed, 2 failed**.
- All dedicated Admin Centre tests passed, including member create/edit, username uniqueness, partial-update handling, contact/location constraints, local-only session-revocation audit, outcome-based deletion audit, owner/MFA and same-origin protections, Auth provider security, and service-connection secret-safety checks.
- The Admin Centre shell/cache and withdrawal tracker asset-version tests passed.
- CI JavaScript syntax check passed, including `node --check public/auth-providers-admin.js`.
- Dependency audit reported **0 vulnerable packages**.
- Repository structure and required-path checks passed.
- The 30 remaining general-suite failures are the same set as the main-branch baseline, which had 31 failures before the Admin Centre asset-version fixture was corrected. The two For You/Home Stories layout failures also reproduce on main. These remain failed and are not counted as successful acceptance.

### Recovered main/PR overlap

The latest main commit includes the Auth provider manager, which is also present in this branch:
- `public/auth-providers-admin.js` and `public/auth-providers-admin.css` have identical blob content on `main` and the feature branch.
- `src/server.js` differs because the feature branch also contains member-management endpoints and the same-origin provider PATCH guard.
- `public/admin-centre.html` differs in Admin Centre CSS/JS asset versions while both versions load the provider-manager assets.
- `public/sw.js` differs because the feature branch advances the shell cache and includes provider-manager assets.
GitHub marks the PR dirty. These overlaps identify the reconciliation work, but no merge/rebase was performed because it is not authorized.

### Live infrastructure status

Re-queried around 2026-11-09 10:34 UTC:
- Supabase Minglora project `gzycobgbasnqqhnympkr`: `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Production `minglora-runtime-state` Edge Function: active version 112; the new member CRUD actions remain undeployed.
- Render `minglora-social-network`: auto-deploys from `main`; latest observed live deployment still runs main commit `2f80e9d`.
- No production database, provider settings, account records, balances, permissions, merge or deployment were changed.

### Remaining work and blockers

- **Easy:** No outstanding Admin Centre-specific test failures were identified in the latest CI. Keep checking newly surfaced in-scope failures only.
- **Medium:** Reconcile the dirty PR/main overlap after authorization; complete hosted member-management CRUD/ban/unban/session/deletion and service-health acceptance with owner/MFA access.
- **Hard:** Deploy and verify the updated Supabase Edge Function after merge/deployment approval; validate provider Management API permissions, account lifecycle, token/session behavior and deletion restrictions.
- **Final verification:** Resolve or document the 30 general-suite failures and 2 For You failures; obtain accepted checks and hosted integration evidence.

### Last confirmed action

The latest owner-authored code change ensures the deletion audit records success or failure only after the Supabase Auth delete result. Its regression test passed in run `42602578904`.

### Exact next action

Keep PR #203 open and draft. Do not merge, rebase or deploy. The next authorized step is a reviewed reconciliation of the identified `main`/PR overlap, followed by hosted acceptance after the necessary deployment authorization.
