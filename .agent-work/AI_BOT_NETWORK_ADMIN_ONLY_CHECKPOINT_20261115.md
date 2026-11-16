# Minglora AI Network — designated administrator access checkpoint

Date: 2026-11-15
Project: `ravaunrichards/Minglora-Social-Network`
Branch: `fix/ai-network-designated-admin-only-20261115`
Pull request: #355 — [WIP] Restrict Minglora AI Network to designated administrator
Target: `main`
Scope: AI Network visibility and access enforcement; preserve other Minglora social features and existing Admin Centre controls.

## Requirement

The complete Minglora AI Network feature is visible and usable only by the designated Creator Hub administrator in an active MFA-verified session. Ordinary members must not see its navigation entry or access its page/data APIs. Administrative controls elsewhere in Minglora remain within the existing protected Admin Centre and must not leak into ordinary member interfaces.

## Implemented on this branch

- The entire `/api/ai-network` route family now requires all three server-side checks: `isDesignatedCreatorHubAdmin(user)`, `isModerator(user, req)`, and `hasActiveReviewerSession(user)`. This also closes the previous ordinary-member discovery/following API access.
- The AI Network sidebar entry is hidden by default and shown only when the existing `/api/admin/access` endpoint returns `canAccess: true`.
- The general Menu AI Network entry is hidden by default, excluded from search results for non-admins, and guarded against click-through unless `canAccess: true`.
- The AI Network page checks `/api/admin/access` before fetching workspace data and again before refreshing.
- Menu/sidebar cache-busting and service-worker cache version were updated.
- The E2E browser fixture verifies both states: ordinary member sees no AI Network navigation and is denied a direct page render; the designated admin session reveals navigation and opens the existing workspace.
- Existing Admin Centre setup visibility is preserved for its setup-required flow. Existing owner/MFA checks on Admin Centre APIs and administrative modules were inspected and left unchanged.

## Files changed

- `src/server.js`
- `public/ai-network.js`
- `public/index.html`
- `public/sidebar-features.js`
- `public/minglora-menu.js`
- `public/sw.js`
- `tests/e2e/ai-network-workspace.mjs`
- `tests/unit/ai-network-discovery.test.js`
- `tests/unit/ai-network-ui.test.js`
- `tests/unit/minglora-menu.test.js`
- `tests/unit/admin-platform-overview.test.js`
- `tests/unit/navigation-3d-icons.test.js`

## Verification evidence on code head

Latest implementation/test head before this documentation checkpoint:
`31ef8232c6ee1f9411fdf29b979d9f285d92e20e`

Successful GitHub Actions runs on that head:
- Full repository CI: run `43688763831` — all jobs completed successfully, including the general automated test suite and Auth/OAuth acceptance.
- Minglora AI Network syntax/regression: run `43688763839` — success.
- AI Network browser acceptance: run `43688763844` — success.
- LIVE/MeetWave seven-plus-two layout QA: run `43688763833` — success.
- Profile visual QA: run `43688763826` was still running its Chromium matrix at checkpoint time; do not count it as passed until GitHub reports success.

The previous CI attempt exposed stale cache-bust expectations in three navigation/admin unit test files. The expectations were corrected without reverting the access restriction. The next full CI run on the corrected code head passed.

## Git and release state at checkpoint

- Branch was ahead of `main` by 14 commits and 0 behind, with merge base equal to the inspected main head `7dc6999b70bc54746ade6cb19406b6c42f5fb405`.
- PR #355 was open and draft; not merged.
- No production migration, Supabase data change, credential change, Render deployment, or runtime worker activation was performed.
- Do not claim production deployment until the PR is merged and the existing Render service's deployment/health is verified.

## AI Network master progress

The existing accepted AI Network checklist remains 2/19 verified tasks (10.53%) as recorded in the master progress register. This access-control correction is a scoped security/navigation hardening checkpoint; it does not complete or inflate any of the 10-billion identity project phases. The 10-billion target remains an architectural objective, not a measured capacity claim.

## Next action

Check the pending profile visual QA status for the code head, re-check PR head and branch synchronization after this checkpoint commit, then mark the PR ready for review and merge only after all required checks are green. Verify the resulting main commit and the existing Render service deployment separately.