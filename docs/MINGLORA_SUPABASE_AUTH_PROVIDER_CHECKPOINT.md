# Minglora Supabase Auth Provider Controls — Recovery Checkpoint

**Project:** Minglora Social Network  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch:** `main`  
**Supabase project:** `gzycobgbasnqqhnympkr`  
**Render service:** `minglora-social-network`  
**Production URL:** https://minglora-social-network.onrender.com  
**Checkpoint date:** 2026-11-09  
**Latest verified source commit at checkpoint:** `389d633605f512e747ad2338e9aa46701657b012`  
**Previous checkpoint commit:** `754306fa50e1399ff4342ec4458afcac6320d464`

## Progress

**Previous verified completion:** 60%  
**Current verified completion:** 78%  
**Remaining:** 22%  
**Progress since previous checkpoint:** +18 percentage points  
**Recovery confidence:** CONFIRMED for repository/source/CI and prior Render deployment records; PARTIALLY RECOVERED for production Supabase Management API configuration; UNKNOWN for the actual Render `SUPABASE_ACCESS_TOKEN` value/presence and provider-issued credentials.

Weighted milestones (weights total 100%; same weighting preserved):

| Milestone | Weight | Verified credit | Evidence / limitation |
|---|---:|---:|---|
| Recover and preserve the original provider-label correction | 15% | 15% | Provider name renders once and action text is only Enable/Disable. Original UI fix retained. |
| Correct provider actions and expose setup instead of disabling Enable | 15% | 15% | All listed providers use active Enable/Disable actions; missing credentials open the setup form; Save and Enable is implemented. Provider UI source passed static checks and was included in the deployed source lineage through commit `98f5610`. |
| Secure credential configuration and enable/disable API | 25% | 18% | Server-side allowlisted credential patch, provider readiness checks, no secrets returned to browser, minimum-one-sign-in-method guard, Supabase Management API GET/PATCH and post-write read-back implemented. Dedicated source-contract tests pass. Actual live Management API write/read has not been exercised. |
| Supabase callback and Minglora redirect-route controls | 20% | 15% | Provider callback and Minglora OAuth return route display/copy, route-sync action, preservation of existing redirects, and post-write verification implemented and tested at source-contract level. Production route sync has not been executed. |
| Status refresh, access restrictions, and regression safeguards | 10% | 8% | MFA/owner gate, same-origin checks, server-side secret handling, error diagnostics using documented Auth Read/Auth Write names, minimum-one-provider guard, syntax and isolated CI checks pass. Browser interaction under the real owner session is still unverified. |
| End-to-end external provider sign-in acceptance | 15% | 7% | Member-facing enabled-provider list, dynamic sign-in buttons, PKCE challenge/callback exchange, signed short-lived HttpOnly state cookie, account checks, Minglora session creation and MFA continuation implemented. Unit tests mock Supabase network calls; no real third-party OAuth login has been completed. |

## Recovered previous work

The previous checkpoint at 60% contained the corrected provider-label UI, setup forms, Supabase Management API writer, callback/redirect controls, and initial test/deployment checks. Those changes were retained.

## Current implementation

Files changed:

- `public/auth-providers-admin.js`
  - Provider name appears once and action button text is only Enable or Disable.
  - Unconfigured Enable opens provider-specific setup instead of disabling the action.
  - OAuth credential setup and SMS gateway setup forms submit to the protected server route.
  - Credentials are not returned to the browser.
  - Displays and copies the Supabase provider callback, Minglora Site URL, and Minglora OAuth return/callback route.
  - Connect / repair routes invokes the protected route-sync action.

- `public/auth-providers-admin.css`
  - Responsive provider setup forms, route details, and action controls.

- `src/server.js`
  - Keeps the MFA-verified designated-owner permission gate.
  - Uses the server-only `SUPABASE_ACCESS_TOKEN` to call `PATCH /v1/projects/{ref}/config/auth`.
  - Uses allowlisted provider flags/credential fields, validates inputs and HTTPS issuer URLs, verifies enabled state after writes, and does not return provider secrets.
  - Preserves at least one active sign-in method.
  - Exposes only the currently enabled provider names to the public login screen.
  - Adds OAuth start and callback routes, PKCE state/challenge generation, signed short-lived HttpOnly state cookie, server-side code exchange, account restriction check, Minglora session creation, and MFA handoff.
  - Route sync sets the Site URL and appends the homepage and Minglora OAuth callback route while preserving pre-existing allowed redirects.
  - Error messages use Supabase's documented Auth Read / Auth Write permission terminology.

- `src/supabase-auth.js`
  - Adds PKCE code exchange and public Auth settings lookup.

- `public/index.html`, `public/auth-login.js`, `public/auth-oauth.css`
  - Adds responsive social sign-in section.
  - Loads only providers Supabase reports as enabled.
  - Buttons navigate through Minglora's OAuth start route.
  - Handles OAuth error reporting and MFA continuation.

- `public/sw.js`
  - Includes the versioned OAuth login script and stylesheet in the offline app shell.
  - Updates shell cache generation and records the auth handoff shell refresh.

- `tests/supabase-auth.test.js`
  - Adds tests for PKCE exchange, invalid input rejection, and public Auth settings lookup.

- `tests/unit/auth-oauth-flow.test.js`
  - Adds source-contract tests for OAuth start/callback, signed state, PKCE, MFA, enabled provider list, admin credential writes, route synchronization, and login/offline shell assets.

- `tests/unit/auth-email-link-handoff.test.js`
  - Updated expected auth asset version to the current login bundle.

- `tests/unit/share-thoughts-and-messenger-routes.test.js`
  - Corrected its service-worker cache-version assertion pattern.

- `.github/workflows/ci.yml`
  - Adds a dedicated `Supabase Auth provider acceptance` job separate from the broader existing CI jobs.
  - Syntax-checks the Auth/OAuth files and runs the targeted acceptance suite.

## Verification evidence

**Dedicated Auth CI job:** PASS  
Workflow run: `42677449234`  
Job: `129362564624` — `Supabase Auth provider acceptance`  
Result: **33 tests, 33 passed, 0 failed**  
Evidence includes:
- Supabase environment alias tests.
- Password recovery error and redirect tests.
- PKCE code exchange test with mocked Supabase Auth response.
- Rejection of malformed PKCE parameters before network access.
- Public Auth settings response test.
- Email-link handoff and independent registration/login handler tests.
- OAuth start, callback, signed state, MFA, enabled-provider list, credential-write guard, route-sync, and UI shell source-contract tests.
- Node syntax checks for server, Supabase Auth helpers, login/admin scripts, service worker, and OAuth-flow test.

**General repository CI:** FAIL  
The broader CI jobs still fail on existing, unrelated profile/layout/story/navigation/persistence/theme and For You assertions. The latest available broad run had the dedicated Auth job pass even though other jobs failed. Do not report the whole repository CI as passing.

**Render deployment evidence:** PARTIAL  
- Render service is configured for automatic deploys from `main`.
- Commit `98f56109806596a239dca9d841686308ec6aba98` was independently reported as `live` by Render.
- Commit `8659954faf276bef7dc0759cf899e26a85c86a0c` completed its build successfully and Render app logs showed `npm start`, `Minglora listening on port 10000`, readiness with Supabase Auth configured and durable Supabase persistence ready, and LiveKit verification connected at 2026-11-09 18:41:25 UTC. However, Render's deploy API still reported this deploy as `update_in_progress`, not `live`.
- Latest source commit `389d633605f512e747ad2338e9aa46701657b012` had a queued Render deploy at the latest inspection. A later Render deploy completion has not been confirmed.
- No request logs were present for `/api/admin/auth-providers`, `/api/auth/providers`, or `/auth/oauth/*` during the inspected Render log window. The deployed UI therefore has not been observed being exercised by an authenticated owner or member session.

## Unverified / blocked requirements

1. Render service metadata does not expose environment-variable values. Whether `SUPABASE_ACCESS_TOKEN` is present and valid in the Minglora Render environment is UNKNOWN. No authorized request reached the admin provider configuration route, so this cannot be claimed verified.
2. The protected route-sync action has not been run using the designated MFA-verified owner account. Live Supabase `site_url` and `uri_allow_list` state are therefore unverified.
3. Apple, Google, Facebook and other OAuth providers require real provider-issued Client IDs and Client Secrets. None were supplied or created during this work. Do not invent them or set placeholder credentials.
4. There has been no real provider enable/disable transaction against production Supabase Auth, and no member sign-in has completed through an external provider and returned to a working Minglora browser session.
5. The full repository CI is still failing on unrelated pre-existing product tests; keep this distinction visible.
6. Render reports commit `8659954...` as `update_in_progress` even though app startup/readiness logs were emitted; latest source commit `389d633...` is queued. Verify actual deploy completion before claiming the latest source is live.

## Remaining work — easiest first

### Easy
- Confirm Render has finished deploying commit `389d633605f512e747ad2338e9aa46701657b012` and verify service readiness.
- Open the deployed Minglora Admin Centre as the designated MFA-verified owner and refresh the provider list.
- Run Connect / repair routes and verify Supabase returns `redirectReady: true`.

### Medium
- Confirm that Render `SUPABASE_ACCESS_TOKEN` exists and is authorized for the Minglora Supabase project. Use an account token with Auth Read and Auth Write access as applicable. Do not put the token into chat, Git, or a browser field.
- Configure one real OAuth provider with its issued Client ID and Secret in the Admin Centre setup form.
- Verify the saved provider flag by refreshing the provider list; verify Disable changes only that flag and leaves at least one sign-in option active.

### Hard / final acceptance
- Complete a real provider sign-in from the Minglora login page through the external provider and back through `/auth/oauth/callback` to a valid Minglora session.
- Verify MFA continuation for a protected account if MFA is configured.
- Run final regression checks; report unrelated existing CI failures separately and repair only when the failing requirement is in scope.

## Exact next action

Use the designated MFA-verified owner session at the deployed Minglora Admin Centre. Refresh Supabase Auth providers, click **Connect / repair routes**, and verify `redirectReady`. If the protected route reports a missing token or permission, configure `SUPABASE_ACCESS_TOKEN` in the Minglora Render service environment using the Supabase dashboard's secure token flow. Then configure one actual provider credential pair and verify an enable/disable round trip. No credentials should be pasted into chat.
