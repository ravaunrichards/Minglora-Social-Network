# Minglora Standalone Rankings — Execution Checkpoint

**Checkpoint date:** 2026-11-17 (Jamaica time)  
**Project:** Minglora Social Network only  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Default branch:** `main`  
**Continuation branch:** `feat/minglora-ranking-reference-inventory-mainline-20261117`  
**Current main SHA at port:** `f214a42abd6edfddca59a68fe5ddecf86e712968`  
**Mission status:** The eight-frame Daily Ranking inventory and focused regression coverage have been ported onto current main. New-branch CI is required before merge.

## Scope guard

This workstream documents reference assets for the separate member-facing **Rankings** page. Keep it distinct from Creator Leagues, Gifter Progression, the embedded LIVE Top Gifters panel, and LIVE Match Power-Ups. Ranking scores continue to use unique, confirmed LIVE gifts only; refunded, failed, duplicate, member-context and non-LIVE gifts must not be counted. Do not modify Coin balances, wallets, gift transactions, League scores, Gifter progression, user records, or supplied reference artwork in this task.

## Verified merged Rankings foundation

| Task | Status | Evidence |
|---|---|---|
| Source-matched Ranking podium and Top 100 / Top 20 badges | VERIFIED — MERGED | PR #452, merge `02f723fe09ed80ed9e968f75e94fcf8c3dc9b335` |
| Separate TikTok-style member Rankings destination | VERIFIED — MERGED | PR #460, merge `4a80bdbb5bf21a2a87d69e8789883f039a673c7f` |
| Standalone Rankings podium asset path correction | VERIFIED — MERGED | PR #461, merge `d5a6df186fb7a1fe7c3fd41c5205a15d41f0ab93` |
| Existing Today / This week / This month / All time wiring | PRESERVED IN MAIN | `public/rankings.js` uses the authenticated LIVE top-gifters API |
| Ranking scoring/refund/deduplication safeguards | PRESERVED IN MAIN | Existing Gifter progression and ranking service/tests |
| Eight Daily Ranking source-frame classification | IN PROGRESS — THIS BRANCH | Six established numbered mappings; two unnumbered flame crops remain source-only |

## Daily Ranking reference classification

The canonical folder is `assets/Crop References/Daily Ranking Badge/` and contains eight unique PNG reference frames.

**Existing runtime assignments — unchanged**
- `Screenshot_20261112_021224_TikTok(1).png`: first-place podium.
- `Screenshot_20261112_021224_TikTok(2).png`: second-place podium.
- `Screenshot_20261112_021309_TikTok(1).png`: third-place podium.
- `Screenshot_20261112_021309_TikTok(2).png`: first-place Top Gifters avatar.
- `Screenshot_20261112_021333_TikTok(1).png`: second-place Top Gifters avatar.
- `Screenshot_20261112_021343_TikTok(1).png`: third-place Top Gifters avatar.

**Source-only — do not assign without an approved reference meaning**
- `Screenshot_20261112_021355_TikTok(1).png`: blue/white flame frame.
- `Screenshot_20261112_021407_TikTok(1).png`: blue/white flame frame.

The two unnumbered frames must remain unassigned: no invented rank, route, Top Gifters slot, or service-worker cache entry. No image is copied, recolored, stretched, recropped, or replaced.

## Reference inventory validation

The full canonical crop inventory is 30 unique PNGs: six Gifter milestone overlays, six Gifter level-range sheets, eight Daily Ranking frames, nine Guest Layout previews, and the ENIGMA default profile image. The updated shared crop test checks the source-file count and uniqueness. A new Ranking-focused test checks all eight files, documents all names, preserves the six established runtime mappings, and keeps the two unnumbered files out of server routes and service-worker cache.

## Branch recovery and current-main synchronization

- Original PR #462 used branch `feat/minglora-ranking-reference-inventory-20261117`, based on old main SHA `4e83b5f18fa799f22eb3f5ad52308927505ff347`.
- That branch had diverged from current main (two commits ahead and ten behind); it was not force-pushed or reset.
- The work was ported as a clean branch from current main SHA `f214a42abd6edfddca59a68fe5ddecf86e712968`.
- Main's newer crop-test changes were preserved, including the current cache-version assertions.
- The previously reported missing `Guests Layout/Full Screen.png` failure belonged to the old baseline. The file is present in the current main tree, and the full CI run #14447 on the current-main port preceding this inventory change passed. The new ranking-specific and full CI runs still need to pass on this branch.

## Verification status

- Original PR #462 CI run #14273: failed on the old base with `ENOENT: assets/Crop References/Guests Layout/Full Screen.png`; the separate visual run #746 passed. This is retained as historical evidence, not treated as a current-main failure.
- Current mainline full CI run #14447: passed on the source tree immediately before this Ranking inventory port.
- Current continuation branch: focused Ranking tests, full CI and current visual acceptance are pending.
- No UI, server routing, scoring, source image, wallet, Coin, gift transaction, member data or database changes are included in this continuation.

## Deployment boundary

A prior 2026-11-16 checkpoint recorded Render service `minglora-social-network-temp` and deployment commit `4e83b5f18fa799f22eb3f5ad52308927505ff347`; that snapshot is historical and has not been revalidated here. No manual deployment was triggered in this continuation. Render workspace selection is not configured in this session, so service/deploy inspection is blocked until the correct workspace is selected; do not choose a workspace implicitly.

## Exact next actions

1. Wait for the current branch's Ranking-focused test, full CI and layout visual workflows.
2. Repair only confirmed test/inventory defects; keep the two unnumbered frames source-only.
3. Merge the replacement PR only after all required checks pass.
4. Verify the latest main commit and, after the Render workspace is selected, inspect the automatic deployment and deployed commit before claiming deployment complete.

**Checkpoint rule:** Preserve the merged Rankings implementation and all existing rank mappings. Do not recreate the member Rankings page or redo PRs #452, #460 or #461.