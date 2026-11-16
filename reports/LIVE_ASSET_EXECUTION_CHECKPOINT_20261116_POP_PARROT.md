# Minglora LIVE asset execution checkpoint — Pop Parrot — 2026-11-16

## Task identity
- Project: Minglora Social Network only.
- Task ID: LIVE-ASSET-1B — Pop Parrot bespoke model, art, motion and synthesized sound integration.
- Source work: PR #428, branch `feat/minglora-live-pop-parrot-asset-20261116`.
- Current integration branch: `feat/live-pop-parrot-mainline-20261116`.
- Base at branch creation: `f98f03acc63ee8322109611db3e36e7488d93389`.
- Scope is a single original canonical gift; no unrelated projects or production economy changes.

## Source and integration
- Added `assets/3d-assets/gift-models/pop-parrot-model.mjs` with `createPopParrotModel()` and `design-review-pending` provenance.
- `scripts/generate-minglora-gifts.mjs` routes the canonical code `pop-parrot-alp4e8` to the dedicated GLTF model and unique SVG/icon artwork.
- `scripts/generate-live-gift-motion-index.mjs` maps `pop-parrot-alp4e8` to `parrot-swoop`.
- `public/gift-effects.js` includes parrot entrance/banking/settle frames and a subject-specific locally synthesized Web Audio whistle/chirp.
- Asset manifest generator records the sound profile as synthesized and not mastered.
- `public/index.html` effects cache key and `public/sw.js` shell cache version are advanced; provider SVGs, Rose animation, League Arena and latest Gifter references are retained.

## Canonical catalogue preservation
- Gift ID: `pop-parrot-alp4e8`.
- Category: Animals.
- Source catalogue value: 400 Coins.
- Source `active=true` flag remains unchanged in repository data.
- No production gift activation, price update, wallet balance, purchase, ledger, earnings, payout or Supabase production data change was performed.

## Verification criteria
- Unit coverage: custom source export, geometry groups, mirrored eye placement, hooked beak, GLTF metadata, finite bounds, generated artwork, motion preset and audio trigger/metadata.
- Chromium model matrix now includes Pop Parrot; final renderer count and screenshots must be taken from fresh CI logs on the exact final PR head.
- Build, CI, layout QA and browser renderer remain pending until the exact new head reports success.

## Acceptance boundary
- Automated source/build/render checks do not equal premium human visual approval.
- Textured PBR/KTX2, embedded animation channels, professional mastered/recorded audio, rights review and physical-device QA remain unverified.
- No generated/ignored output is to be claimed as individually human-approved artwork.

## Exact next action
- Add this checkpoint and the remaining documentation blobs to the integration tree, create a current-main-based commit and PR, run unit/build/Chromium 15-model × 3-viewport checks, repair failures, then merge only when clean and all required workflows pass.
