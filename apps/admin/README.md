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


## Current execution checkpoint — 2026-11-09 10:13 UTC

- **Project:** Minglora Social Network
- **Repository:** `ravaunrichards/Minglora-Social-Network`
- **Assigned task:** Admin Centre member management and service connections, PR #203
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Current head:** `b75cee573631664802db65d9c7fc16478e70cafe`
- **PR state:** Open, draft; 36 commits; GitHub reports mergeable=false.
- **Comparison with main at `2f80e9d997b43e5da6373c385d6ce153ff908e67`:** 36 commits ahead, 1 behind. Diverged; reconciliation remains required.
- **Completion:** 71% verified / 29% remaining. This retains the established original task weighting; the latest code changes are not credited until automated tests and acceptance checks pass.

### Weighted milestone tracker

| Milestone | Weight | Verified credit |
|---|---:|---:|
| User-management interface | 20% | 20% |
| Supabase Auth operations | 25% | 15% |
| Owner/MFA authorization | 15% | 15% |
| Service connections | 15% | 10% |
| Audit and data integrity | 10% | 6% |
| Documentation and recovery records | 5% | 5% |
| Full CI, hosted acceptance and final regression | 10% | 0% |
| **Total** | **100%** | **71%** |

### Changes verified in this continuation

- Edit-member display name now requires at least two characters; edit username is required and constrained to the allowed 3–30 lowercase characters.
- The Edge Function validates edited display names and usernames against those rules before attempting a profile write.
- Username uniqueness checks on both create and edit now use case-insensitive matching. Edit excludes the current member ID; duplicate names return HTTP 409.
- The Admin Centre API wrapper now preserves the server error status and payload. When the server reports a partial update, the edit UI refreshes the selected member and account list, then clearly reports the partial success and failed Auth update.
- Regression cases were added for edit validation, case-insensitive uniqueness and partial-update reporting.

### Source verification

Current branch files were retrieved from GitHub and 13 checks were confirmed for the updated create/edit forms, server validation, case-insensitive preflight lookup, partial-update reporting, and corresponding regression-test assertions. These are source-level checks only. The project test runner has not passed on this head.

### CI and local test execution

- The latest connected GitHub workflow-run and combined-status lookups for this head returned empty results. No fresh CI run or passing status is confirmed.
- The last detailed historical full-suite run remains 706 passed / 32 failed out of 738, on an earlier commit.
- The earlier targeted Admin User and Service Centre tests passed in that historical run, but tests added afterward remain unexecuted.
- A local repository checkout was attempted, but the execution container could not resolve `github.com`; local `npm test` execution was therefore unavailable.

### Current execution order

- **Easy:** Obtain an actual test run against this exact head and fix any test failures.
- **Medium:** Reconcile the one-commit divergence with `main`; complete hosted member CRUD, partial failure, service health and audit acceptance.
- **Hard:** Complete production Supabase Auth integration, session revocation/deletion acceptance and security/data-integrity verification after review and deployment authorization.
- **Final verification:** Full CI, targeted Admin Centre tests, regression checks, service integration checks and protected-owner verification.

### Live deployment and database state

- Render is configured to auto-deploy from `main`; the most recently retrieved live deployment was main commit `2f80e9d`. The feature branch is not deployed.
- Minglora Supabase project was live and healthy when last queried; production `minglora-runtime-state` was active at version 112 and did not contain this branch's new CRUD actions.
- The live database's `profiles` table requires username and display name, has a case-insensitive unique username index, and contains 86 foreign-key references to profiles. No production schema, permission, user or balance changes were made.
- No merge or deployment was performed.

### Exact next action

Run the targeted Admin Centre tests and full CI on commit `b75cee573631664802db65d9c7fc16478e70cafe`. The connected GitHub integration has not exposed a current workflow run, and the local checkout failed because GitHub DNS was unavailable. Continue with source-level checks and other non-production work while this verification dependency is unresolved.
