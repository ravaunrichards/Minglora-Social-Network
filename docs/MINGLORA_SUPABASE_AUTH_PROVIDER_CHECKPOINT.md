# Minglora Supabase Auth Provider Controls — Recovery Checkpoint

**Project:** Minglora Social Network  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch:** `main`  
**Supabase project:** `gzycobgbasnqqhnympkr`  
**Render service:** `minglora-social-network`  
**Production URL:** https://minglora-social-network.onrender.com  
**Checkpoint date:** 2026-11-09  
**Latest relevant deployed commit at checkpoint:** `4e18912a8e97abe5518c8f97ac3290c3be58ef00`  
**Additional CI safeguard commit:** `a7db90fe6b30ea0dfa94ebd38ec6485f47e268fb`

## Progress

**Previous verified completion:** 25%  
**Current verified completion:** 60%  
**Remaining:** 40%  
**Progress since previous checkpoint:** +35 percentage points  
**Recovery confidence:** CONFIRMED for repository and deployment state; PARTIALLY RECOVERED for live Supabase configuration because the admin browser session and provider credentials are not available to this execution.

Weighted milestones (weights total 100%):

| Milestone | Weight | Verified credit | Evidence / limitation |
|---|---:|---:|---|
| Recover and preserve the original provider-label correction | 15% | 15% | Existing UI fix present in `public/auth-providers-admin.js` and deployed in the history |
| Correct provider actions and expose setup instead of disabling Enable | 15% | 15% | Buttons show only Enable/Disable; unconfigured Enable opens setup form; JS syntax checked; current UI commit deployed |
| Secure credential configuration and enable/disable API | 25% | 12% | Server-side allowlisted credential patches, readiness validation, last-sign-in-method protection, and post-write read-back implemented and syntax checked; live Management API write not exercised |
| Supabase callback and Minglora redirect-route controls | 20% | 12% | Callback URL display/copy and route-sync endpoint implemented; existing allow-list entries are preserved in code; route sync has not yet been executed against production |
| Status refresh, access restrictions, and regression safeguards | 10% | 6% | MFA/owner gate and server checks preserved; code inspected; full interaction/regression verification outstanding |
| End-to-end external provider sign-in acceptance | 15% | 0% | Requires live owner session, Management API token permissions, provider-issued credentials, and a member-facing OAuth sign-in/callback session test |

## Recovered previous work

The original duplicated provider label / inactive setup action problem was confirmed in the existing source. The old UI used a switch and disabled it for providers whose credentials were not configured. The label fix was preserved; the provider action now displays only **Enable** or **Disable**.

## Current implementation

Files changed:

- `public/auth-providers-admin.js`
  - Provider rows show the provider name once.
  - Enable/Disable action buttons are active for unconfigured providers.
  - Enable opens an inline configuration form when credentials are missing.
  - OAuth fields and supported SMS gateway credential forms are submitted to the authenticated server route.
  - Provider callback and Minglora return URLs are displayed and copyable.
  - A Connect / repair routes action invokes the route sync operation.

- `public/auth-providers-admin.css`
  - Responsive setup forms, route details, and action controls.

- `src/server.js`
  - Keeps the MFA-verified designated owner restriction.
  - Reads and updates the Supabase Auth service configuration using the server-only Management API token.
  - Validates provider IDs, credential allow-lists, input lengths, and HTTPS issuer URLs.
  - Saves credentials and enables the requested provider in the same update.
  - Does not send provider secrets back to the browser.
  - Preserves the protection against disabling the final enabled sign-in method.
  - Adds the Supabase provider callback URL and the Minglora redirect route sync operation.
  - Route sync appends the Minglora redirect to the existing allow-list rather than replacing existing entries.

- `.github/workflows/ci.yml`
  - Added `node --check public/auth-providers-admin.js` so future CI checks syntax of the new provider admin script.

## Deployment and tests

**Render deployment:** The latest provider UI commit `4e18912a8e97abe5518c8f97ac3290c3be58ef00` was reported as `live`; Render build and deploy events both ended successfully at approximately 2026-11-09 18:03 UTC.

**Static verification:**  
- `public/auth-providers-admin.js` passed a JavaScript syntax parse.
- `src/server.js` passed a module-adjusted syntax parse (the import declarations were stripped and `import.meta.url` substituted for the syntax-only check).
- Read-back confirmed route sync, credential setup, callback URL, and Enable/Disable code is present.

**Repository CI:** The latest available run for the UI commit (`42670388786`) completed with failure. The failing tests reported unrelated existing profile, layout, service-worker/cache, persistence-retry, theme, and For You assertions. The For You functional job also failed two assertions expecting an older app.js version. No current evidence ties those failures to the Auth provider changes. Do not report the full repository test suite as passing.

## Unverified / blocked items

1. The authenticated Admin Centre has not been exercised in a browser under the user's MFA-verified owner session.
2. Whether Render currently has `SUPABASE_ACCESS_TOKEN` configured and whether that token has `auth_config_read`, `auth_config_write`, and `project_admin_write` permissions is unknown from the available read-only service metadata.
3. The production `Connect / repair routes` action has not yet been run; therefore do not claim Supabase's live Site URL or redirect allow-list has been updated.
4. No external provider Client ID/Secret was supplied. OAuth credentials must be created in the respective provider's developer console; do not invent or fabricate them.
5. No actual Enable, Disable, OAuth callback, or member sign-in transaction has been verified against the live Supabase Management/Auth endpoints.
6. The current member login page is still email/password-oriented. The work above configures Supabase provider settings and redirect routes; it does not yet prove member-facing social login buttons and the OAuth callback-to-Minglora-session handoff are implemented.

## Remaining work — easiest first

### Easy
- Verify the new CI syntax check is included in the newest workflow run.
- Sign in to the deployed Admin Centre with the designated owner account and inspect that all provider rows show active Enable/Disable actions and correct setup forms.
- Use **Connect / repair routes**, then refresh and verify the route status changes to connected.

### Medium
- Verify the Render Management token is present and has the precise Supabase Auth configuration permissions.
- Configure one real provider using valid provider-issued credentials; enable it and verify read-back in the provider list.
- Verify Disable changes only the provider enabled flag, refreshes the state, and continues blocking disabling the final sign-in method.

### Hard / final acceptance
- Implement or verify member-facing OAuth entry buttons and OAuth callback/session handoff, if social sign-in is required in the main Minglora login flow.
- Complete an actual provider sign-in from Minglora through the external provider and back to a valid Minglora session.
- Run targeted Auth provider tests plus the relevant full regression suite; separate and resolve unrelated pre-existing CI failures without modifying unrelated product behavior.

## Exact next action

Open the deployed Minglora Admin Centre using the MFA-verified designated owner account. Check whether the provider panel reports a Management API connection; then click **Connect / repair routes** and refresh. Record the returned routeReady state and any precise token-permission error. Do not paste provider client secrets into chat or commit them to Git.
