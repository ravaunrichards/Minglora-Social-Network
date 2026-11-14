# Minglora LIVE — Reference Asset Audit

**Audit date:** 2026-11-14  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Audited source:** `main` at `ab4795df5bf7d21ebb6fd5ad6f085ddd25f18ba9`  
**Continuation branch:** `docs/minglora-live-visual-audit-correction-20261114` (documentation-only; no production asset files changed)

## Reference inventory

| Source | Files | Formats | Total size |
|---|---:|---|---:|
| `assets/reference/android/` | 1,071 | JPEG | 360,192,780 bytes |
| `assets/reference/Laptop PC Web/Minglora TikTok/` | 29 | PNG | 19,050,395 bytes |
| `assets/reference/Laptop PC Web/Minglora Facebook/` | 21 | PNG | 8,577,230 bytes |
| **Reference image total** | **1,121 images** | 1,071 JPEG + 50 PNG | **387,820,405 bytes** (plus one 1-byte `.gitkeep` marker in the folder) |

The root reference Git tree was traversed recursively and was not truncated. The Android folder contains 1,071 JPEGs; the desktop TikTok folder contains 29 PNGs; the desktop Facebook comparison folder contains 21 PNGs. The repository separately contains 131 gift-catalogue capture screenshots in `assets/Gifts/`.

## Machine-readable inventory

The complete file-by-file listing is recorded in `reports/minglora-live-reference-assets.json` (1,121 records). It includes each repository path, filename, format, byte size, Git blob SHA, source group and explicit pending markers for dimensions/transparency/human review.

## Visual samples inspected and corrected attribution

- Android Fan Club join sheet: `assets/reference/android/Screenshot_20261112_015315_TikTok.jpg`. The portrait capture shows the LIVE creator header, Join entry, audience/leaderboard overlays, Fan/SuperFan tabs, benefit illustrations and a fixed bottom action.
- Android SuperFan sheet: `assets/reference/android/Screenshot_20261112_015407_TikTok.jpg`. The capture shows a separate gold-toned SuperFan presentation, an upgraded badge, benefit illustrations and a membership action. Its displayed third-party subscription price is reference context only; it is not a Minglora price source.
- Android League FAQ sample: `assets/reference/android/Screenshot_20261112_020408_TikTok.jpg`. It shows League C/D fragment-rule cards and creator-reward information, with the LIVE host strip visible above the FAQ panel. It is a League/rules reference, not a standalone LIVE room screenshot.
- Desktop For You video/comments page: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-072050.png` (**1363×636**, PNG header dimensions). This is a normal video-feed page with the central media card, action rail and comments panel; it is **not** a LIVE-room reference.
- Desktop creator scheduler: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-074126.png` (**1364×638**, PNG header dimensions). It shows a creator scheduling calendar/empty state; it is **not** a LIVE-room reference.
- Actual desktop LIVE multi-guest room: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-074648.png` (**1366×638**, PNG header dimensions). This shows the LIVE navigation rail, central 2×2 participant stage, a separate viewer roster and a right-hand chat/reaction composer. This is the verified desktop LIVE-room reference for the comparison set.

The nine supplied guest-layout diagrams were each visually inspected:

| Reference file | Visual arrangement |
|---|---|
| `assets/Guests Layout/Full Screen.jpg` | One full-stage participant |
| `assets/Guests Layout/Fluid Panel.jpg` | Large primary panel with small guest overlays |
| `assets/Guests Layout/Fluid Grid.jpg` | One large tile and one smaller tile |
| `assets/Guests Layout/Fixed Grid.jpg` | Equal 3×3 grid |
| `assets/Guests Layout/Fixed Panel.jpg` | Large primary panel with a fixed side stack |
| `assets/Guests Layout/Side by Side.jpg` | Two primary tiles above a smaller guest row |
| `assets/Guests Layout/Spotlight.jpg` | Wide spotlight participant above smaller guests |
| `assets/Guests Layout/Roundtable 1.jpg` | Central host with two vertical guest columns |
| `assets/Guests Layout/Roundtable 2.jpg` | Central host with side guest stacks |

These nine references correspond to the existing implementation's seven host-selectable layouts plus two separately persisted guest-box layouts. The source-level coverage is in `tests/unit/live-layout-panels.test.js` and `tests/unit/live-guest-layout.test.js`; this audit did not run those tests locally.

## Additional LIVE-adjacent references inventoried

- `assets/Guests Layout/`: 9 JPEG layout diagrams (all 9 visually inspected individually).
- `assets/Gifters Badge Levels/`: 71 image files (53 PNG and 18 JPEG); file inventory completed, not a full badge-by-badge visual/rights review.
- `assets/League/`: 20 JPEG reference captures; file inventory completed, with the Android League FAQ sample above visually inspected.
- `assets/Gifts/`: 131 catalogue capture PNGs plus the `Video Gifts/Video Gifts.jpg` reference sheet. The directory contains 132 image files in total.

The path/size/hash inventory is complete for the 1,121 images under `assets/reference/`. A complete image-by-image human visual review and per-image dimension/transparency extraction for all 1,121 references, all 1,509 extracted gift crops and all 71 badge files has **not** been completed. No original reference was altered or copied into a production asset directory.

## Preservation and source-of-truth rules

- Keep `assets/reference/` and `assets/Gifts/` read-only.
- TikTok/Facebook screenshots are layout/interaction references only. Do not copy their logos, proprietary artwork, text or branded icons.
- Use them to guide Minglora-specific composition and control geometry.
- Do not publish extracted catalogue crops from `assets/Artwork/` until rights and visual review are complete.
- This continuation does not delete, move or overwrite any supplied reference file; its changes are limited to audit documentation.

## Follow-up inspection required

A complete screenshot-by-screenshot human review, original-dimension inventory, transparency check for every art file, and device-specific measurement matrix remain open. Desktop screenshots establish a desktop comparison viewport, but do not establish tablet, foldable, iPhone or Smart TV support by themselves.
