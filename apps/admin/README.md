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
