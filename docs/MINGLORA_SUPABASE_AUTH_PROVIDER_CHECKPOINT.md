# Latest execution — remaining Auth Provider acceptance work (2026-11-09)

## Current state

- Repository: `ravaunrichards/Minglora-Social-Network`
- Branch: `feat/minglora-admin-user-and-service-centre-20261109`
- Latest code commit: `80cae14069bf6b78036eb64451f9cd85b395a156` (exact Management API permissions diagnostic)
- Latest implementation/test verification commit: `cda004b4d6b557e677c5ad994e013b72f7925d16`; all newer branch commits in this checkpoint sequence only update recovery evidence.
- PR #203 remains OPEN and DRAFT; not merged or deployed.
- Verified weighted completion remains **81%**; remaining **19%**; no live acceptance criterion has changed status in this pass.
- New code change: HTTP 403 errors from the Supabase Management API now specify `auth_config_read` for reads and both `auth_config_write` and `project_admin_write` for writes. Added a source acceptance test for these exact diagnostics.
- CI run [42730618991](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42730618991) on the focused-test commit completed: **Supabase Auth provider controls PASS**; **Admin Centre real-browser viewport regression PASS**. Repository-wide `test` and `For You functional navigation` jobs remain FAIL outside this Auth Provider scope. Do not credit this diagnostic-only fix toward original weighted acceptance completion.
- Supabase project `gzycobgbasnqqhnympkr` is `ACTIVE_HEALTHY`. Read-only schema inspection confirmed `auth.custom_oauth_providers` currently has zero records. No secret-bearing fields were selected.
- Public app/Supabase HTTP endpoints could not be fetched through the available web route; this does not establish service downtime.
- No production settings, secrets, redirects or provider toggles have been changed. No deployment or PR merge occurred.

## Remaining 19% — no false credit

| Requirement group | Status | Exact outstanding evidence |
|---|---|---|
| AUTH-05 / AUTH-06 | PARTIAL | Owner-gated Management API GET/PATCH and credential read-back must run against production with a valid `SUPABASE_ACCESS_TOKEN`; verify readiness and minimum-one-provider guard live. |
| AUTH-07 / AUTH-08 | PARTIAL | Designated owner must open Admin Centre with current MFA session and verify real provider status / secret redaction. |
| AUTH-09 | PARTIAL | Run route sync in production and read back `site_url` plus allowed callback/return URLs without removing existing entries. |
| AUTH-10 / AUTH-12 | PARTIAL | Confirm live provider list and complete a real provider login, callback exchange, Minglora session and MFA continuation. |
| AUTH-16 | BLOCKED | No real provider-issued OAuth Client ID/Secret registered or supplied yet. |
| AUTH-17 | BLOCKED | No designated MFA-verified owner session; server Management token presence/validity still unknown. |
| AUTH-18 | BLOCKED | No real external identity-provider login completed. |

## Current dependencies

1. A valid server-side Supabase Management token in the Minglora Render service. The token must have read permission `auth_config_read`; write permission requires `auth_config_write` plus `project_admin_write` under the current Supabase Management API documentation.
2. A designated owner session with active MFA verification to invoke protected controls.
3. A provider-issued Client ID and Client Secret registered against the exact Supabase callback `https://gzycobgbasnqqhnympkr.supabase.co/auth/v1/callback`.
4. Explicit selection of the Render workspace before the Render connector permits session-scoped service/log inspection. The available workspace name is **My Workspace**, but it has not been selected by the user in this conversation.

## Exact next action

After workspace selection, inspect whether `SUPABASE_ACCESS_TOKEN` exists in Render without revealing its value; if absent, ask the owner to add it securely in Render. Then perform the owner/MFA-gated route sync and provider status/read-back, configure one real OAuth provider using provider-issued credentials, and complete the real end-to-end sign-in. Keep completion at 81% until these live criteria pass.

---

# Latest recovery — 2026-11-09

## Current verified state

- **Project:** Minglora Social Network — ravaunrichards/Minglora-Social-Network
- **Branch:** `feat/minglora-admin-user-and-service-centre-20261109`
- **Code commit with the tested implementation:** `ad8ea2c3e1600952238a94715e6d56c4786e7a8b`; subsequent commits on this branch only update this checkpoint.
- **Current branch head (checkpoint-only updates):** `6a0b50a111ecb08d9c5edb928a7c285e4c342470`.
- **PR:** [#203](https://github.com/ravaunrichards/Minglora-Social-Network/pull/203) remains OPEN and DRAFT, not merged; reported mergeable=false.
- **Latest completed CI run:** [42722256534](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/42722256534).
  - **Supabase Auth provider controls:** PASS — job completed successfully; provider source syntax and focused acceptance tests passed (17 tests, per the CI result captured during the prior continuation).
  - **Admin Centre real-browser viewport regression:** PASS.
  - **Repository-wide test job:** FAIL — failures are outside the Auth Provider control scope.
  - **For You functional navigation:** FAIL — failures are outside the Auth Provider control scope.
- **Verified completion:** 81%.
- **Remaining:** 19%.
- **Progress since prior checkpoint:** NO CHANGE. No new live acceptance criterion was verifiably completed in this recovery.
- **Last successful verification:** CI run `42722256534` on tested source commit `ad8ea2c3...`; dedicated Auth Provider and Admin Centre viewport jobs PASS. Checkpoint-only commits do not change implementation code.
- **Production:** no merge, deployment, Supabase configuration write, provider credential write, or production route repair was performed in this continuation. Public HTTP checks were unavailable due DNS resolution failure in the execution environment.
- **External blockers still active:** designated MFA-verified owner session unavailable; Render tool requires the user to explicitly choose a workspace before request-log inspection; existence/validity of `SUPABASE_ACCESS_TOKEN` is unknown; no real external OAuth Client ID/Secret pair has been supplied or registered; no real provider login has been completed.

## Exact next action

Ask the user to explicitly choose the Render **My Workspace** workspace before read-only production request-log inspection. Separately obtain a designated owner MFA-verified Admin Centre session and a valid server-side Supabase Management API token. Then verify provider status, repair the production Site URL/redirect allow-list, configure one real OAuth provider, and complete a live enable/disable round trip. Finally complete a real external OAuth sign-in and verify session/MFA continuation. Do not paste secrets into chat or commit them. Keep the 81% completion credit unchanged until those live acceptance checks pass.

---

# Minglora Supabase Auth Provider Controls — Recovery Checkpoint

## Active continuation — Auth Providers Enable button (2026-11-09 22:42 UTC)

**Latest validation follow-up (2026-11-09 22:44 UTC):** Corrected source commit `ad8ea2c3e1600952238a94715e6d56c4786e7a8b` passed the dedicated Auth Provider controls job (17/17) and Admin Centre real-browser viewport regression. The broad test job no longer reports either Auth Provider failure; 30 failures remain elsewhere in Minglora. For You remains 13/15.

**Current implementation state:** The disabled-switch regression on the Admin Centre working branch has been fixed. The working branch is `feat/minglora-admin-user-and-service-centre-20261109`, with current source head `ad8ea2c3e1600952238a94715e6d56c4786e7a8b`. PR #203 remains open and draft; it has not been merged or deployed.

**Verified branch changes:**
- Restored the full Auth Provider setup UI, including credential forms for OAuth providers and supported SMS gateways. An unconfigured provider's Enable action now opens its setup form instead of rendering an inaccessible disabled switch.
- Restored server-side Supabase Management API setup with provider allow-list validation, same-origin mutation checks, designated-owner and active-MFA authorization, readiness checks, protection against disabling the final enabled sign-in method, and read-back verification.
- Restored safe Site URL / OAuth redirect-route repair. Existing allow-list entries are retained and the operation verifies the resulting configuration.
- Restored separate responsive CSS rules for provider cards and credential fields at phone widths.
- Added focused tests: `tests/unit/auth-providers-admin-ui.test.js`, `tests/unit/auth-provider-credentials.test.js`, and `tests/unit/auth-redirect-routes.test.js`.
- Added the dedicated `auth-provider` CI job to validate the provider helpers, panel, and route behavior.

**Test evidence:**
- Corrected code commit `ad8ea2c3e1600952238a94715e6d56c4786e7a8b`, CI run `42714500786`: Auth Provider job PASS — 17/17 tests, 0 failures; all provider source syntax checks passed.
- Same run: Admin Centre Playwright viewport regression PASS.
- Same run: broad `npm test` FAIL — 741/771 passed, 30 failed. The previous Auth Provider Enable-handler assertion and mobile-grid selector assertion are no longer failures. Remaining failures are outside Auth Provider controls (email handoff, Clock Centre, service-worker cache, People/For You/Stories, LIVE cache, profile UI, navigation, background sync, overlay ordering, logout placement, Supabase persistence-retry mocks, and theme previews).
- Same run: For You functional navigation FAIL — 13/15 passed, 2 failures, unrelated to this Auth Provider repair.
- Do not count the branch checks as production verification.

**Completion accounting:** Remains **81% verified / 19% remaining**. No increase is credited because the fix is not merged/deployed and live Management API changes, production route repair, owner-session operation, provider-issued credentials, and real external OAuth sign-in remain unverified.

**Exact next action:** Auth Provider source acceptance and Admin Centre viewport checks pass on `ad8ea2c`. Do not merge or deploy PR #203 without explicit approval. The remaining in-scope work is live: the designated MFA-verified owner must refresh provider status and run **Connect / repair routes**, confirm `redirectReady: true`, configure one real provider with its issued credentials, and complete a real sign-in.

---

**Project:** Minglora Social Network  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Production branch:** `main`  
**Production source head at prior verified checkpoint:** `a9dceef098d35489ece74cfaa144996a693a17d4`  
**Current working branch:** `feat/minglora-admin-user-and-service-centre-20261109`  
**Current working source head:** `ad8ea2c3e1600952238a94715e6d56c4786e7a8b`  
**Working pull request:** [#203 — Minglora Admin Centre](https://github.com/ravaunrichards/Minglora-Social-Network/pull/203) — open, draft, not merged or deployed  
**Supabase project:** `gzycobgbasnqqhnympkr`  
**Render service:** `minglora-social-network` (`srv-dbi3gvqfngtc73c6hi4g`)  
**Production URL:** https://minglora-social-network.onrender.com  
**Checkpoint date:** 2026-11-09  
**Latest verified deployment:** `dep-dbp3bc83ko5c73eitm6g` — LIVE  
**Latest Auth acceptance job:** `129439164661` — PASS (54/54)  
**Prior production-branch broad test job:** `129439165075` — FAIL (755/773; 18 failures). Current working-branch broad test on `ad8ea2c`: FAIL (741/771; 30 failures), with the Auth Provider and Admin Centre viewport checks passing.  
**Current working-branch For You job:** FAIL (13/15; 2 failures; unrelated to Auth Provider controls).

## Progress

**Previous verified completion:** 79%  
**Current verified completion:** 81%  
**Remaining:** 19%  
**Progress since previous checkpoint:** +2 percentage points  
**Why no percentage increase:** deterministic redirect-route and credential-patch behavior is now directly tested, but production Management API writes, live route-sync, provider credentials, and a real external OAuth sign-in remain unverified. These are not double-counted as new completion.

Original milestone weighting is preserved (weights total 100):

| Milestone | Weight | Verified credit | Current evidence / limitation |
|---|---:|---:|---|
| Recover and preserve the provider-label correction | 15% | 15% | Provider label appears once; action button text is only Enable or Disable. |
| Provider actions and setup UI | 15% | 15% | Missing credentials open setup forms; OAuth and SMS setup forms exist; standalone Admin Centre loads the controls after access initialization. Static acceptance passes. |
| Secure credential configuration and enable/disable API | 25% | 19% | MFA/designated-owner gate, server-side allowlisted Management API GET/PATCH, readiness checks, no-secret response, minimum-one-login guard, and read-back verification are implemented and tested. No live Management API transaction was observed or completed. |
| Supabase callback and Minglora redirect-route controls | 20% | 16% | Displays/copies callback, Site URL, and app return route; route sync preserves allow-list entries and checks read-back. Production route sync was not executed. |
| Status, access restrictions, and regression safeguards | 10% | 8% | Owner/MFA checks, same-origin and secret-handling safeguards, provider refresh, route validation, and Admin Centre shell/cache checks pass static or CI verification. No actual owner browser session was exercised. |
| End-to-end external provider sign-in acceptance | 15% | 8% | Provider discovery, PKCE exchange, signed/expiring HttpOnly state-cookie behavior, server-side exchange, account restrictions, session creation, and MFA continuation have code-level, mocked, and direct cookie behavior tests. No real identity-provider sign-in has completed. |
| **Total** | **100%** | **81%** | **19% remains unverified or externally blocked.** |

## Master acceptance checklist

Statuses are based on the latest repository, workflow, deployment, and log evidence. “Partial” is not counted as complete.

| ID | Acceptance requirement | Priority / dependency | Status | Evidence / remaining work |
|---|---|---|---|---|
| AUTH-01 | Provider names are shown once and the action is clearly Enable or Disable | Easy / none | PASS | `public/auth-providers-admin.js`; prior Auth acceptance coverage. |
| AUTH-02 | Clicking Enable for an unconfigured provider opens its setup form instead of disabling the action | Easy / none | PASS | Provider setup forms and Save and Enable path; Auth acceptance job. |
| AUTH-03 | Standalone Admin Centre loads the provider panel after owner-access initialization | Medium / owner gate | PASS (source/CI) | `public/admin-centre.html`, `public/admin-centre.js`, MutationObserver mount; Auth test “Standalone Admin Centre loads and mounts provider controls after owner access is verified”. Actual owner browser interaction remains untested. |
| AUTH-04 | OAuth and SMS setup input is validated and sent only to the protected server route | Medium / none | PASS (source/CI) | `public/auth-providers-admin.js`; server allow-list and input validation; Auth suite. |
| AUTH-05 | Provider credentials are written only to Supabase Management API and never echoed back to the browser | Hard / valid Management token + Auth Write permission | PARTIAL | Server route and no-secret response are implemented and source-tested. Actual production GET/PATCH and post-write read-back have not run. |
| AUTH-06 | Provider readiness is checked before enable; disabling the final enabled sign-in method is refused | Medium / live config | PARTIAL | Guard and readiness code are covered by Auth acceptance checks. No live enable/disable round trip. |
| AUTH-07 | Owner-only and MFA-verified access is enforced on provider configuration | Hard / owner session | PARTIAL | Protected route and static acceptance tests pass. No designated owner browser session was observed. |
| AUTH-08 | Provider status refresh reflects actual Supabase configuration and exposes no secrets | Medium / Management token | PARTIAL | Status route exists. Production provider state remains unknown because no authenticated admin request was made. |
| AUTH-09 | Supabase callback, production Site URL, and Minglora OAuth return URL are displayed and can be repaired without deleting existing redirects | Medium / Management token + owner session | PARTIAL | Route-sync and read-back implementation are covered in acceptance tests. Production route sync has not been executed; `redirectReady` is unverified. |
| AUTH-10 | Member login lists only enabled standard OAuth providers and starts the correct Minglora OAuth route | Medium / live provider config | PARTIAL | `public/auth-login.js`, `/api/auth/providers`, and OAuth-start route are implemented; Auth suite passes. Live provider flags and a browser click have not been verified. |
| AUTH-11 | OAuth initiation uses PKCE and a signed, short-lived HttpOnly state cookie | Hard / enabled provider | PASS (mock/source acceptance) | Auth flow tests pass; no live identity-provider round trip. |
| AUTH-12 | OAuth callback exchanges the code server-side, validates the user and account restrictions, creates a Minglora session, and preserves MFA continuation | Hard / provider credentials + valid routes | PARTIAL | Callback and MFA logic pass mocked/source acceptance. No real provider sign-in, callback, or session has been verified. |
| AUTH-13 | Current social-login scripts/styles and active app bundle are available from the app shell/service worker | Easy / deploy | PASS | Auth CI 34/34. Admin Centre shell test passes in the broad suite. Current `public/index.html` app bundle URL equals the service-worker precache URL. |
| AUTH-14 | Production deployment starts with Supabase Auth and durable Supabase persistence | Hard / Render deployment | PASS | Render deploy `dep-dbp2e0f4trjc73bn3940` is LIVE. Logs report `authProvider=supabase`, `authConfigured=true`, `persistenceDriver=supabase`, `persistenceDurable=true`, and `persistenceReady=true`. |
| AUTH-15 | Dedicated Auth acceptance and relevant regression tests pass | Final / code and CI | PARTIAL | Dedicated Auth job: 34 tests, 34 passed, 0 failed. Broad job: 746 tests, 716 passed, 30 failed in other Minglora product areas. For You job: 15 tests, 13 passed, 2 failed. The Admin Centre shell/cache test itself now passes. |
| AUTH-16 | Real provider-issued Client ID/Secret is stored, provider enabled, and retained after refresh | Medium / external provider console + owner session | BLOCKED | No real provider credential pair was supplied or created. Do not use placeholders. |
| AUTH-17 | Designated MFA-verified owner performs route repair and a live provider enable/disable round trip | Easy/Medium / owner session + Management token | BLOCKED | No owner browser interaction or request to `/api/admin/auth-providers` is present in the inspected production request-log interval. |
| AUTH-18 | A real external provider login returns through callback and establishes a working Minglora session (including MFA where enabled) | Hard / AUTH-09, AUTH-16, AUTH-17 | BLOCKED | No live request to `/auth/oauth/*` was observed; only mocked tests have passed. |
| AUTH-19 | OAuth state cookie validates signature, state/verifier shape, expiry, HttpOnly/SameSite/Secure scope, and cleanup behavior | Easy / none | PASS | Six direct unit tests in `tests/unit/oauth-flow-state.test.js`; Auth CI 40/40 passed. This is not a substitute for live OAuth acceptance. |
| AUTH-20 | Minglora route repair preserves existing redirects, adds the exact homepage and OAuth callback, normalizes duplicates, and reports readiness accurately | Easy / none | PASS (helper behavior) | Seven direct tests in `tests/unit/auth-redirect-routes.test.js`; route helper is used by `/api/admin/auth-providers`. Production Management API GET/PATCH and `redirectReady` remain unverified. |
| AUTH-21 | Provider credential patches accept only allow-listed fields, preserve saved secrets on blank inputs, enforce HTTPS URL and length rules, and restrict SMS fields to supported gateways | Medium / none | PASS (helper behavior) | Seven direct tests in `tests/unit/auth-provider-credentials.test.js`; server route uses the tested helper. No production Management API write/read-back has run. |

### New verified OAuth state-cookie work

- `src/oauth-flow-state.js` now owns OAuth flow cookie creation, parsing, HMAC verification, expiry validation, and scoped cleanup.
- `src/server.js` delegates OAuth cookie creation/read/cleanup to that module while retaining the existing session secret and production Secure-cookie behavior.
- `tests/unit/oauth-flow-state.test.js` adds six direct behavioral tests: round-trip, HttpOnly/SameSite/Secure attributes, tampered payload/signature rejection, expiry/future/malformed rejection, weak secret/invalid verifier rejection, and scoped cleanup.
- `.github/workflows/ci.yml` runs the new module syntax check and tests in the dedicated Auth job.
- `tests/unit/auth-oauth-flow.test.js` was updated to assert the extracted helper rather than the removed inline cookie string.
- Earlier Auth state-cookie run: 40 tests, 40 passed, 0 failed; latest combined Auth run now passes 54/54 after adding redirect-route and credential-patch tests. Neither substitutes for live third-party sign-in.

### New verified redirect-route and credential-validation work

- `src/auth-redirect-routes.js` now contains the tested parser, readiness calculation, and minimal patch builder used by the protected admin route. The patch preserves unrelated allow-list entries, adds only the homepage and exact OAuth callback, and is idempotent after configuration.
- `tests/unit/auth-redirect-routes.test.js` adds seven direct tests for trimming/deduplication, preserving other redirects, exact route append, idempotence, readiness, missing-callback failure, and invalid origins.
- `src/server.js` now uses `createMingloraAuthRouteState` and `buildMingloraAuthRoutePatch`.
- `src/auth-provider-credentials.js` now owns the allow-listed credential patch builder used by the admin route.
- `tests/unit/auth-provider-credentials.test.js` adds seven direct tests for allow-listed fields, blank-secret preservation, HTTPS URL validation, 4096-character limit, supported SMS gateway fields, invalid gateway rejection, and payload shape.
- `.github/workflows/ci.yml` checks both helper modules and includes both test files in the dedicated Auth job.
- Auth CI on commit `a9dceef`: 54 tests passed, 0 failed. The helper behaviors are verified; the production Management API writes and owner-gated route transaction are still partial.

### Scope notes

- Phone/SMS OTP and Web3 wallet modes are distinct Supabase Auth methods. The Admin Centre can configure their provider toggles/setup, but the current member-facing public provider list and PKCE flow cover standard OAuth providers. Dedicated phone OTP and wallet sign-in UX are not verified as part of this OAuth assignment; if they are required as member-facing login methods, they need separate flows and acceptance criteria.
- SAML 2.0 is plan-restricted in the current project configuration and is intentionally locked in the admin UI.
- The current checkpoint does not count those distinct flows as completed OAuth requirements.

## Latest implementation and correction

The Auth/provider implementation listed in the preceding checkpoint is preserved. Additional verified cache corrections made during this continuation:

- `public/sw.js`: the app-shell precache now uses the exact current `app.js` URL referenced by `public/index.html`.
- `tests/unit/admin-platform-overview.test.js`: the cache test extracts the current app bundle URL from the HTML and asserts that the service worker precaches that exact URL; it no longer assumes that app.js and Admin Centre assets share the same query-version string.
- The later profile-layout app-shell refresh on `main` updated both HTML and service worker to `/app.js?v=20261109-admin-profile-parity-2`. They were independently re-fetched and confirmed to match.
- The Admin Centre shell/cache test passed in the broad CI run after this correction.

## Latest verification evidence

### GitHub Actions

Current source head: [`a9dceef098d35489ece74cfaa144996a693a17d4`](https://github.com/ravaunrichards/Minglora-Social-Network/commit/a9dceef098d35489ece74cfaa144996a693a17d4).

- Dedicated **Supabase Auth provider acceptance** job `129439164661`: PASS — 54 tests, 54 passed, 0 failed. Includes provider controls, six OAuth state-cookie behavior cases, seven redirect-route cases, and seven provider-credential patch cases.
- Broad **test** job `129439165075`: FAIL — 773 tests, 755 passed, 18 failed. Examples include Admin withdrawal tracking, Clock Centre navigation, People/profile layout and actions, Stories, For You layout, wallet navigation, background feed sync, responsive stacking/logout, persistence retry mocks, and theme preview assertions. The Admin Centre app-shell/service-worker asset test is PASS in this run.
- **For You functional navigation** job `129439165372`: FAIL — 15 tests, 13 passed, 2 failed (For You header/search spacing and Stories viewer assertions).
- Do not describe the repository-wide workflow as passing. The failures above are separate from the dedicated Auth acceptance job; the broader suite remains a regression limitation.

### Render

- Service is connected to this repository and `main`, auto-deploys from commits, and is on Render Free.
- Deploy `dep-dbp3bc83ko5c73eitm6g` for commit `a9dceef098d35489ece74cfaa144996a693a17d4` is **LIVE** (finished 2026-11-09T21:07:18Z).
- Runtime logs report the service listening on port 10000; Supabase Auth configured; Supabase persistence durable and ready; LiveKit configured and connected.
- Production request logs for `/api/admin/auth-providers`, `/api/auth/providers`, and `/auth/oauth/*` returned no entries in the inspected window 2026-11-09 20:04–20:34 UTC. Combined with the Auth identity-table results, no production OAuth login or provider-admin operation was independently verified. This is windowed evidence, not proof of permanent absence.

### Supabase

- Project `gzycobgbasnqqhnympkr` is **ACTIVE_HEALTHY**, region `us-east-1`, Postgres 17.11.
- Project URL confirmed as `https://gzycobgbasnqqhnympkr.supabase.co`.
- Publishable and legacy anon keys exist; these are public client keys. This does **not** establish that the server-side `SUPABASE_ACCESS_TOKEN` exists.
- Read-only Auth database inspection: `auth.identities` contains 7 email-provider identities and no OAuth-provider identities; `auth.custom_oauth_providers` contains no configured custom OAuth providers. `auth.instances` has no rows, so it cannot be used here to read Auth runtime flags. These results do not reveal or establish standard external-provider flags, credentials, Site URL, or redirect allow-list.\n- Supabase security advisors also report a warning that leaked-password protection is disabled, 36 informational RLS-enabled/no-policy findings, and anonymous-access policy warnings. No broad RLS or Auth security changes were made under this narrow provider-controls assignment. Review those findings separately before modifying existing access policy.
- The Auth configuration endpoint could not be queried using the available Supabase project tools; the current external-provider flags, site URL, and redirect allow-list remain unknown.

## Remaining work — dependency ordered

### Easy (owner-authorized)
1. Sign in to the deployed standalone Admin Centre using the designated owner account and a current MFA-verified session: https://minglora-social-network.onrender.com/admin-centre.html
2. Refresh provider status and click **Connect / repair routes**. Confirm the response reports `redirectReady: true`.

### Medium (server permission and provider credentials)
1. If the admin route reports a missing token or permission, set `SUPABASE_ACCESS_TOKEN` securely in the Minglora Render environment. The token must have Supabase Management **Auth Read** and **Auth Write** access as required. Do not paste it into chat or commit it.
2. Register the Minglora production callback URL in the selected identity provider console, obtain its real Client ID/Secret, enter them in the provider setup form, and Save and Enable.
3. Refresh state and verify the provider flag and configured state. Then disable/enable it once and verify that the credential values remain saved and at least one sign-in method stays enabled.

### Hard / final acceptance
1. Use a real external account to sign in through the member UI, complete the identity provider consent/login, return to `/auth/oauth/callback`, and verify a Minglora session is established.
2. Verify MFA continuation on an MFA-protected account if applicable.
3. Inspect relevant production logs and rerun the dedicated Auth tests plus relevant regression tests.
4. Address broad product test failures only when those failures are confirmed within the assigned provider-controls scope; keep unrelated failures clearly separated.

## Blockers and unknowns

1. **Owner session unavailable:** no designated MFA-verified owner browser session was available to invoke the protected Admin Centre actions.
2. **Management token unknown:** Render service metadata does not expose environment-variable values, so the existence and validity of `SUPABASE_ACCESS_TOKEN` is UNKNOWN.
3. **Provider-issued credentials unavailable:** no real OAuth Client ID/Secret pair was supplied or registered during this execution.
4. **Live config and callback unknown:** production Supabase external-provider flags, `site_url`, and `uri_allow_list` have not been read back or changed through the Management API.
5. **Real end-to-end sign-in untested:** mocked PKCE/session tests passed, but no third-party identity provider completed a login into Minglora.
6. **Broader CI failures:** 30 general tests and 2 For You tests still fail outside the passing Auth job; the Admin Centre shell-cache check now passes.

## Last action and exact next step

**Last confirmed action:** Repaired Auth Providers on the existing Admin Centre feature branch. Unconfigured providers now expose the credential setup form from Enable; the protected server handler saves only allow-listed fields to Supabase and verifies updates; route repair and mobile layout are covered by focused tests.

**Exact next action:** Verify CI on the corrected branch head `e547c4dfae97cfcac5c870c2046f2f385c363ce5`. The branch remains unmerged and production remains unchanged. After the branch checks pass, get approval before merging/deploying; then complete the live owner-session and external provider acceptance listed above.

**Do not declare 100% until AUTH-05 through AUTH-12 and AUTH-16 through AUTH-18 have the required live acceptance evidence, and all in-scope regression failures are resolved.**
