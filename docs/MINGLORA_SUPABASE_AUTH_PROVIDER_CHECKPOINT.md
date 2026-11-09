# Minglora Supabase Auth Provider Controls — Recovery Checkpoint

**Project:** Minglora Social Network  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch:** `main`  
**Supabase project:** `gzycobgbasnqqhnympkr`  
**Render service:** `minglora-social-network`  
**Production URL:** https://minglora-social-network.onrender.com  
**Checkpoint date:** 2026-11-09  
**Latest verified implementation/test commit:** `d3e3fe5a253eba37f415a87cc657834f4dcc309d`  
**Previous checkpoint commit:** `1bfc0275f27b9e15161498cf21c584cd4815c2b7`

## Progress

**Previous verified completion:** 60%  
**Current verified completion:** 78%  
**Remaining:** 22%  
**Progress since previous checkpoint:** +18 percentage points  
**Recovery confidence:** CONFIRMED for repository, source, isolated Auth CI, and latest Render deployment; PARTIALLY RECOVERED for live Supabase Management API configuration; UNKNOWN for the Render `SUPABASE_ACCESS_TOKEN` value/presence and provider-issued credentials.

Weighted milestones (weights total 100%; original weighting preserved):

| Milestone | Weight | Verified credit | Evidence / limitation |
|---|---:|---:|---|
| Recover and preserve the original provider-label correction | 15% | 15% | Provider name appears once; visible action button text is only Enable or Disable. |
| Correct provider actions and expose setup instead of disabling Enable | 15% | 15% | Enable opens setup for incomplete providers; Save and Enable submits credentials; admin standalone page loads the provider script after access initialization. Latest Render source lineage is live. |
| Secure credential configuration and enable/disable API | 25% | 18% | Protected server-side allowlisted credential patch, readiness checks, no secret response, minimum-one-sign-in-method guard, Management API GET/PATCH and post-write read-back are implemented and covered by dedicated acceptance tests. Actual live Management API write/read remains untested. |
| Supabase callback and Minglora redirect-route controls | 20% | 15% | Displays/copies Supabase provider callback, Site URL, and Minglora OAuth return route; route-sync preserves existing redirects and verifies the resulting config. Production route sync has not been executed. |
| Status refresh, access restrictions, and regression safeguards | 10% | 8% | MFA/designated-owner gate, same-origin protection, secure secret handling, Auth Read/Auth Write diagnostics, status refresh, and at-least-one-provider guard pass static and targeted checks. Browser interaction under the actual owner session remains unverified. |
| End-to-end external provider sign-in acceptance | 15% | 7% | Enabled OAuth provider discovery, login buttons, PKCE start/callback, signed short-lived HttpOnly state cookie, server-side exchange, account restriction checks, Minglora session creation and MFA continuation are implemented. Tests mock Supabase; no real third-party provider login has completed. |

## Recovered previous work

The previous checkpoint at 60% contained the corrected provider-label UI, provider setup forms, Supabase Management API writer, callback/redirect controls, and preliminary tests/deployment. All valid changes were preserved. The original 60% milestone weighting remains unchanged.

## Current implementation

Files changed:

- `public/auth-providers-admin.js`
  - Provider name appears once; button text is only Enable or Disable.
  - Missing credentials open the provider-specific setup form instead of disabling Enable.
  - OAuth credential and SMS gateway setup forms submit to the protected server route.
  - Credentials are not returned to the browser.
  - Shows/copies Supabase callback, Minglora Site URL, and Minglora OAuth return route.
  - Connect / repair routes invokes the protected route-sync operation.

- `public/auth-providers-admin.css`
  - Responsive provider setup forms, route details, and action controls.

- `public/admin-centre.html`
  - Loads the provider stylesheet and provider script after `admin-centre.js`.
  - Provides the `#admin-centre-root` used by the mount routine.

- `public/admin-centre.js`
  - Verifies `/api/admin/access`, sets `window.__mingloraAdminAccess`, then builds the settings section.
  - The provider panel's MutationObserver mounts after the settings section is inserted.

- `src/server.js`
  - Keeps the MFA-verified designated-owner permission gate.
  - Uses server-only `SUPABASE_ACCESS_TOKEN` to call the Supabase Management API auth configuration endpoint.
  - Validates allowlisted flags/credential fields, checks provider readiness, protects against disabling the last active sign-in method, verifies post-write state, and never returns provider secrets.
  - Exposes only enabled OAuth provider names to the public sign-in screen.
  - Adds OAuth start/callback routes, PKCE challenge generation, signed short-lived HttpOnly state cookie, server-side code exchange, account restriction checks, Minglora session creation, and MFA handoff.
  - Route sync sets the Site URL and appends the homepage and Minglora OAuth callback route while preserving existing allowed redirects.
  - Permission diagnostics use Supabase's documented Auth Read/Auth Write terminology.

- `src/supabase-auth.js`
  - Adds PKCE code exchange and public Auth settings lookup.

- `public/index.html`, `public/auth-login.js`, `public/auth-oauth.css`
  - Adds responsive social sign-in area.
  - Loads only providers Supabase reports as enabled.
  - Buttons navigate through Minglora's OAuth start route.
  - Handles OAuth errors and MFA continuation.

- `public/sw.js`
  - Includes the versioned OAuth login script and stylesheet in the offline app shell and updates its cache generation.

- `tests/supabase-auth.test.js`
  - Tests PKCE exchange, malformed-input rejection, and public Auth settings lookup.

- `tests/unit/auth-oauth-flow.test.js`
  - Tests OAuth start/callback, signed state, PKCE, MFA, enabled provider discovery, admin credential-write safeguards, route repair, login/offline assets, and standalone Admin Centre script mounting.

- `tests/unit/auth-email-link-handoff.test.js` and `tests/unit/share-thoughts-and-messenger-routes.test.js`
  - Updated stale login asset-version references and corrected the cache-version regex assertion.

- `.github/workflows/ci.yml`
  - Adds a dedicated Supabase Auth provider acceptance job independent of the broader repository jobs.

## Verification evidence

**Dedicated Auth CI:** PASS  
Workflow run: `42678536542`  
Job: `129366415603` — `Supabase Auth provider acceptance`  
Result: **34 tests, 34 passed, 0 failed**  
Includes:
- Supabase environment alias tests.
- Password recovery error and redirect tests.
- PKCE exchange with mocked Supabase Auth response.
- Malformed PKCE rejection before network call.
- Public Auth settings lookup.
- Email verification handoff and login/registration form handling.
- OAuth start/callback, signed state, MFA continuation, live enabled-provider filtering, credential-write safeguard, and redirect route synchronization source-contract tests.
- Admin Centre mount test verifying root element, provider script/style links, script order, owner access initialization, and mutation observer.
- Node syntax checks for server, Supabase Auth helpers, login/admin scripts, service worker, and OAuth-flow tests.

**General repository CI:** FAIL  
The broad workflow still reports unrelated existing profile/layout/story/navigation/persistence/theme and For You assertion failures. The dedicated Auth job passed within the same run. Do not report the general repository CI as passing.

**Render deployment:** DEPLOYED AND VERIFIED  
Latest commit `d3e3fe5a253eba37f415a87cc657834f4dcc309d` — deploy `dep-dbp1elcs728c73bhf0l0` — status `live`.  
Render logs at 2026-11-09 18:57 UTC show:
- Build started and completed successfully.
- `npm start` and `node src/server.js` launched.
- `Minglora listening on port 10000`.
- Readiness: `authProvider=supabase`, `authConfigured=true`, `persistenceDriver=supabase`, `persistenceDurable=true`, `persistenceReady=true`.
- LiveKit verification: configured and connected.
- Render emitted `Your service is live` and the primary URL.

**Live admin endpoint usage:** UNVERIFIED  
Render request logs for `/api/admin/auth-providers`, `/api/auth/providers`, and `/auth/oauth/*` were empty in the inspected request window. No authenticated owner or member browser interaction was observed during this execution.

## Unverified / blocked requirements

1. Render service metadata does not expose environment-variable values. Whether `SUPABASE_ACCESS_TOKEN` exists and is valid for the Minglora Supabase project is UNKNOWN. The protected admin API was not invoked in an authenticated owner session.
2. The route-sync action has not been executed with the designated MFA-verified owner account. The live Supabase `site_url` and `uri_allow_list` therefore remain unverified.
3. Apple, Google, Facebook and other OAuth providers require provider-issued Client IDs and Client Secrets. No provider credential pairs were supplied or created during this work. Do not invent placeholders.
4. No real production provider enable/disable transaction or member OAuth login/callback/session has been completed.
5. Phone SMS OTP and Web3 wallet providers are configured as distinct Supabase auth methods, not regular OAuth buttons. The current public sign-in list exposes OAuth providers; dedicated phone OTP and wallet sign-in UI flows are not part of the current OAuth implementation.
6. SAML 2.0 SSO remains plan-restricted on the current Supabase plan.
7. The broader repository CI is still failing on unrelated existing product tests. These should remain distinct from the passing Auth suite.

## Remaining work — easiest first

### Easy
- Open the deployed Admin Centre using the designated MFA-verified owner account and refresh provider state.
- Click Connect / repair routes and verify the panel reports `redirectReady: true`.
- If the panel reports missing token or permission, securely configure Render `SUPABASE_ACCESS_TOKEN` with Supabase Auth Read and Auth Write access as applicable.

### Medium
- Enter one real provider-issued Client ID/Secret through the setup form and Save and Enable.
- Refresh provider state and verify Supabase retained the credentials/configuration without exposing them.
- Disable that provider and confirm only its enabled flag changes; confirm at least one sign-in method remains enabled.

### Hard / final acceptance
- Complete a real provider sign-in through the external provider and back through Minglora's `/auth/oauth/callback` to a valid signed-in Minglora session.
- Verify MFA continuation for an MFA-protected account if configured.
- Add separate member-facing phone OTP and Web3 wallet sign-in flows if those Supabase provider toggles are intended to be offered as login methods.
- Run broader regression tests and resolve only failures within the assigned task scope; continue reporting unrelated existing suite failures separately.

## Exact next action

Use the designated MFA-verified owner account in the deployed standalone Admin Centre: refresh provider status, click **Connect / repair routes**, and confirm `redirectReady`. If the endpoint reports a missing token or permission, add `SUPABASE_ACCESS_TOKEN` in the Minglora Render environment using the secure Supabase token flow. Then enter real provider credentials through the setup form and verify an enable/disable round trip. Never paste credentials into chat or Git.
