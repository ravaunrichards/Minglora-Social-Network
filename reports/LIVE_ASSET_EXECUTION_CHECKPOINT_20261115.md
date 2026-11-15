# Minglora LIVE Asset Mission — Execution Checkpoint

**Date:** 2026-11-15  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Base:** `main` at `ab07a355d988ca5f1f2295036846f617b520259c`  
**Working branch:** `feat/minglora-live-model-viewer-e2e-20261115`  
**Related PR:** [#367 — original gift-model Chromium render QA](https://github.com/ravaunrichards/Minglora-Social-Network/pull/367)  
**Status:** PARTIAL — DO NOT MERGE AS PRODUCTION-READY

## Verified source inventory

- `assets/reference/`: 1,121 screenshots (1,071 Android JPEG, 29 desktop TikTok PNG, 21 desktop Facebook PNG).
- `assets/Gifts/`: 131 gift-capture PNG files plus one reference-sheet JPEG.
- `assets/Artwork/`: 1,509 extracted crops; quarantined for visual and rights review, not approved for production use.
- `assets/Guests Layout/`: 9 supplied layout diagrams.
- `assets/Gifters Badge Levels/`: 71 image files.
- `assets/League/`: 20 reference captures.
- The latest CI raster audit parsed 2,862 of 2,862 source images, with zero unsupported formats and zero parse failures. It records metadata and file hashes; it does not perform human review, pixel-level alpha verification, EXIF-normalized visual comparison, or licensing clearance.

## Existing generated asset pipeline

- Canonical repository catalogue: 1,748 records (1,737 marked active in source, 11 retired).
- Build pipeline generates 1,748 primary SVG artworks, 1,748 transparent SVG icons and 1,748 GLTF model files.
- 1,739 GLTF models use shared procedural category geometry.
- 9 gift-specific model sources have been authored: Rose, Hibiscus, Djembe Master, Palm Breeze, Gamer Otter, LIVE Island, Crystal Crown, Phoenix and Beach Maracas. Their presence is not human visual approval.
- Existing standalone icon packs: 16 LIVE room controls, 22 gift-category icons and 12 LIVE tools shortcuts.
- Existing animation/effects runtime and 1,737 source-catalogue motion profiles are present. These do not establish a complete set of individually authored cinematic gift animations.
- The generated manifest records human visual/licensing review as outstanding for the catalogue artwork and models.

## Audio state

- Dedicated mastered per-gift production sound assets: zero verified in the current mainline asset manifest.
- Separate open draft PR [#243](https://github.com/ravaunrichards/Minglora-Social-Network/pull/243) documents 33 CC0/public-domain source masters and 101 candidate MP3s mapped to 71 source catalogue gift codes. It records zero human approvals. Candidates remain review-only and are not enabled for sent-gift or LIVE playback. The branch is divergent/non-mergeable and has not been merged.

## Current production release gate — read-only verification

Supabase project `gzycobgbasnqqhnympkr` was inspected read-only:

- `public.live_gift_catalog`: 97 rows, RLS enabled.
- Version 1: 87 rows, 0 active.
- Version 2: 10 rows, 0 active.
- Version 3: 0 rows.
- Database constraint `live_gift_catalog_only_approved_assets_active_ck` requires active rows to be version 3 and have non-empty model and image paths.
- Deployed `minglora-runtime-state` Edge Function: ACTIVE v131; its gift-catalogue read filters both `active=true` and `asset_version='3'`.

Therefore the LIVE production gift catalogue is intentionally empty until version-3 artwork, model, rights, price and transaction compatibility review is complete. Do not re-enable v1/v2 rows or publish candidates solely to make the catalogue non-empty. No production rows, prices, balances, transactions or user data were changed in this checkpoint.

## Browser and repository verification

- Latest branch standard CI run: **1,217 tests passed, 0 failed**; For You functional navigation and Supabase Auth acceptance jobs passed.
- Latest independent LIVE/MeetWave layout visual-QA workflow passed. Its four generated images are synthetic layout-seat test evidence, not live video, human visual approval or proof of all device classes.
- Dedicated Chromium gift-model render QA remains **FAILED / BLOCKED**. Chromium's separate capability probe reports WebGL 2.0 available and model-viewer fires its model load event, but the test does not find the internal `canvas#webgl-canvas` in the viewer shadow root within 15 seconds. The test also reports a generic 404 resource request; the failing request URL has not yet been isolated.
- The render workflow has been separated from layout QA so a failed model-render test cannot suppress the independent layout matrix.
- No PR merge, main-branch change, production deployment or production database mutation was performed.

## Work committed on the review branch

- `be931838` — restore/isolate the independent layout-QA workflow.
- `bb8dcf2` — initial headless software-WebGL test configuration.
- `4236411` — create a dedicated gift-model render workflow.
- `cd6ec8c` — correct the initial canvas-selection assumption.
- `5c26a26` — update Chromium software-WebGL flags.
- `74a7c97` — add WebGL capability and renderer diagnostics.
- `79c7f2f` — initialize browser diagnostic collection.
- `cc907ef` — fix the diagnostic error-handler variable reference.

These changes are test/workflow infrastructure only. They do not implement or approve additional production gift artwork. The branch head at this checkpoint is `cc907efc355bb04f3a1f6948b99250080eb73a43`.

## Next execution order

1. Diagnose the exact 404 request and why model-viewer does not attach its WebGL renderer canvas in the Chromium harness; retain the independent layout workflow.
2. Re-run the 9-model × 3-viewport checks and retain screenshots/report only after a verified pass.
3. Continue individual art direction and human visual review; prioritize original Minglora artwork rather than extracted branded reference crops.
4. Complete rights/provenance review before publishing any artwork, badge, model or sound.
5. Produce real gift-specific animation/audio assets and validate playback against server-confirmed gift events.
6. Prepare a version-3 gift publication set only after every candidate has approved art, model/image paths, rights, genuine configured coin price, sound/animation mapping, and transaction compatibility; test without changing live balances or enabling unapproved entries.
7. Complete actual device QA (Android, iPhone, tablet, foldable, desktop/laptop and supported TV) before claiming support.

## Scope and safety

Use supplied third-party screenshots only to understand geometry, hierarchy and interaction. Do not copy third-party company names, logos, trademarks, brand identifiers or proprietary artwork. Use Minglora branding and original or properly licensed artwork. Preserve all source references as read-only. Keep this task limited to Minglora LIVE and the assets directly required by it.
