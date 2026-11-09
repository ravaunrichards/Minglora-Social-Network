# Minglora Supabase Auth Provider Controls — Recovery Checkpoint

**Project:** Minglora Social Network  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch:** `main`  
**Current source head:** `99b106b8dedd95bca04235e42a10e6946bfec8d8`  
**Supabase project:** `gzycobgbasnqqhnympkr`  
**Render service:** `minglora-social-network` (`srv-dbi3gvqfngtc73c6hi4g`)  
**Production URL:** https://minglora-social-network.onrender.com  
**Checkpoint date:** 2026-11-09  
**Latest verified deployment:** `dep-dbp2ptip08gs73a4f600` — LIVE  
**Latest Auth acceptance job:** `129418492158` — PASS (34/34)  
**Latest broad test job:** `129418492096` — FAIL (733/753; 20 failures)  
**Latest For You job:** `129418492679` — FAIL (13/15; 2 failures)

## Progress

**Previous verified completion:** 78%  
**Current verified completion:** 78%  
**Remaining:** 22%  
**Progress since previous checkpoint:** 0 percentage points  
**Why no percentage increase:** the current changes repaired app-shell cache integrity and the associated regression test, but did not complete the remaining production Management API write, route-sync, provider-credential, or real external OAuth acceptance requirements. These are not double-counted as new completion.

Original milestone weighting is preserved (weights total 100):

| Milestone | Weight | Verified credit | Current evidence / limitation |
|---|---:|---:|---|
| Recover and preserve the provider-label correction | 15% | 15% | Provider label appears once; action button text is only Enable or Disable. |
| Provider actions and setup UI | 15% | 15% | Missing credentials open setup forms; OAuth and SMS setup forms exist; standalone Admin Centre loads the controls after access initialization. Static acceptance passes. |
| Secure credential configuration and enable/disable API | 25% | 18% | MFA/designated-owner gate, server-side allowlisted Management API GET/PATCH, readiness checks, no-secret response, minimum-one-login guard, and read-back verification are implemented and tested. No live Management API transaction was observed or completed. |
| Supabase callback and Minglora redirect-route controls | 20% | 15% | Displays/copies callback, Site URL, and app return route; route sync preserves allow-list entries and checks read-back. Production route sync was not executed. |
| Status, access restrictions, and regression safeguards | 10% | 8% | Owner/MFA checks, same-origin and secret-handling safeguards, provider refresh, route validation, and Admin Centre shell/cache checks pass static or CI verification. No actual owner browser session was exercised. |
| End-to-end external provider sign-in acceptance | 15% | 7% | Provider discovery, PKCE, signed short-lived HttpOnly state cookie, server-side exchange, account restrictions, session creation, and MFA continuation are implemented with mocked acceptance tests. No real identity-provider sign-in has completed. |
| **Total** | **100%** | **78%** | **22% remains unverified or externally blocked.** |

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

### New verified OAuth state-cookie work

- `src/oauth-flow-state.js` now owns OAuth flow cookie creation, parsing, HMAC verification, expiry validation, and scoped cleanup.
- `src/server.js` delegates OAuth cookie creation/read/cleanup to that module while retaining the existing session secret and production Secure-cookie behavior.
- `tests/unit/oauth-flow-state.test.js` adds six direct behavioral tests: round-trip, HttpOnly/SameSite/Secure attributes, tampered payload/signature rejection, expiry/future/malformed rejection, weak secret/invalid verifier rejection, and scoped cleanup.
- `.github/workflows/ci.yml` runs the new module syntax check and tests in the dedicated Auth job.
- `tests/unit/auth-oauth-flow.test.js` was updated to assert the extracted helper rather than the removed inline cookie string.
- Latest Auth CI run: 40 tests, 40 passed, 0 failed. This strengthens PKCE state handling but does not count as live third-party sign-in.

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

Current source head: [`99b106b8dedd95bca04235e42a10e6946bfec8d8`](https://github.com/ravaunrichards/Minglora-Social-Network/commit/99b106b8dedd95bca04235e42a10e6946bfec8d8).

- Dedicated **Supabase Auth provider acceptance** job `129418492158`: PASS — 34 tests, 34 passed, 0 failed. Includes provider-route safeguards, PKCE helper, login-shell order, standalone Admin Centre mount, password recovery, and registration regression cases.
- Broad **test** job `129418492096`: FAIL — 753 tests, 733 passed, 20 failed. Examples include Admin withdrawal tracking, Clock Centre navigation, People/profile layout and actions, Stories, For You layout, wallet navigation, background feed sync, responsive stacking/logout, persistence retry mocks, and theme preview assertions. The Admin Centre app-shell/service-worker asset test is PASS in this run.
- **For You functional navigation** job `129418492679`: FAIL — 15 tests, 13 passed, 2 failed (For You header/search spacing and Stories viewer assertions).
- Do not describe the repository-wide workflow as passing. The failures above are separate from the dedicated Auth acceptance job; the broader suite remains a regression limitation.

### Render

- Service is connected to this repository and `main`, auto-deploys from commits, and is on Render Free.
- Deploy `dep-dbp2ptip08gs73a4f600` for commit `99b106b8dedd95bca04235e42a10e6946bfec8d8` is **LIVE** (finished 2026-11-09T20:30:03Z).
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

**Last confirmed action:** extracted OAuth flow cookie state into `src/oauth-flow-state.js`; server now uses the helper; six direct behavior tests pass for valid round-trip, HttpOnly/SameSite/Secure attributes, tampering, expiry/future timestamps, malformed input, weak secrets, and scoped cleanup. Dedicated Auth CI passes 40/40; Render deploy `dep-dbp310navr4c73e6eckg` is LIVE; Supabase project is ACTIVE_HEALTHY.

**Exact next action:** the designated owner must open the deployed standalone Admin Centre with an MFA-verified session, refresh provider status, and run **Connect / repair routes**. The response will establish whether `SUPABASE_ACCESS_TOKEN` is present and has Auth Read/Auth Write permissions. Then configure one real external provider and perform an actual provider sign-in.

**Do not declare 100% until AUTH-05 through AUTH-12 and AUTH-16 through AUTH-18 have the required live acceptance evidence, and all in-scope regression failures are resolved.**
