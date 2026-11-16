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

The complete file-by-file listing is recorded in `reports/minglora-live-reference-assets.json` (1,121 records). It includes each repository path, filename, format, byte size, Git blob SHA and source group. The 2026-11-16 CI raster metadata run separately adds encoded dimensions, orientation, alpha-channel declarations and per-file SHA-256 for all 2,869 supported raster images across the six audited source roots; human visual review and pixel-level transparency verification remain separate, incomplete tasks.

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
- `assets/Gifters Badge Levels/`: 66 raster image files (52 PNG and 14 JPEG; 65 unique image contents because one progression-strip JPEG exists at two paths; 1,785,279 bytes). The six cropped range PNGs reside under `assets/Crop References/Gifter level range sheets/` and are used in the Gifter range gallery; their uploaded JPG companions are retained beside them. The six milestone PNG crops remain separate under `assets/Crop References/Gifters Badges/Png/`. Their duplicate legacy copies were removed from this folder.
- `assets/League/`: 20 JPEG reference captures; file inventory completed, with the Android League FAQ sample above visually inspected.
- `assets/Gifts/`: 131 catalogue capture PNGs plus the `Video Gifts/Video Gifts.jpg` reference sheet. The directory contains 132 image files in total.

The path/size/hash inventory is complete for the 1,121 images under `assets/reference/`. Header-level dimension, format, orientation, encoded-alpha and SHA-256 metadata has now been parsed for all 2,869 raster files under the six audited source roots (see the verified result below). This does **not** scan decoded pixel alpha, apply JPEG EXIF orientation, or replace image-by-image human review. Human visual and rights review of the references and extracted crops remains incomplete. No original reference was altered or copied into a production asset directory.

## Preservation and source-of-truth rules

- Keep `assets/reference/` and `assets/Gifts/` read-only.
- Supplied platform screenshots are layout/interaction references only. Recreate their useful structure, geometry, spacing, states, generic non-brand labels and interaction behavior with original Minglora implementation. Exclude the source platforms' names, logos, wordmarks, trademarks, proprietary artwork and branded iconography; do not ship reference screenshots or extracted crops as product artwork.
- Use them to guide Minglora-specific composition and control geometry.
- Do not publish extracted catalogue crops from `assets/Artwork/` until rights and visual review are complete.
- This continuation does not delete, move or overwrite any supplied reference file; its changes are limited to audit documentation.

## Follow-up inspection required

A complete screenshot-by-screenshot human review, original-dimension inventory, transparency check for every art file, and device-specific measurement matrix remain open. Desktop screenshots establish a desktop comparison viewport, but do not establish tablet, foldable, iPhone or Smart TV support by themselves.

## Raster metadata audit automation

A separate read-only metadata scanner is part of the LIVE asset workflow:

- Command: `npm run audit:live-image-metadata`.
- Scans raster images under `assets/reference/`, `assets/Gifts/`, `assets/Guests Layout/`, `assets/Gifters Badge Levels/`, `assets/League/` and `assets/Artwork/`.
- Reads PNG, JPEG, GIF and WebP headers for encoded dimensions, format, orientation, alpha-channel declarations, transparency metadata and animation flags; records per-file byte sizes and SHA-256 values.
- Writes `reports/live-image-metadata-audit.json` and `reports/live-image-metadata-audit.md`; CI uploads both as a named artifact.
- It does not apply EXIF orientation or scan decoded pixels. An alpha channel/transparency flag is not proof that an image has transparent pixels, and this audit does not certify visual quality, licensing or production approval.
- Source images and extracted artwork remain read-only. Unsupported formats or malformed headers are reported and fail the audit rather than being silently skipped.

## Verified raster metadata result — 2026-11-16

PR #439 CI run [43821480523](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/43821480523), test job **133145316730**, executed `npm run audit:live-image-metadata` against the PR merge result with current main at `cb3775392d3d58d73a38d4af922ea3f3b85ef3d1`. The job, asset-manifest generation and both artifact uploads succeeded. The LIVE/MeetWave layout independence matrix also passed in run [43821480493](https://github.com/ravaunrichards/Minglora-Social-Network/actions/runs/43821480493).

| Source root | Files | Bytes | Header-dimension range (width × height) |
|---|---:|---:|---|
| `assets/reference/` | 1,121 | 387,820,405 | 144–1,366 × 157–2,408 px |
| `assets/Gifts/` | 132 | 27,150,149 | 604–1,080 × 417–890 px |
| `assets/Guests Layout/` | 9 | 66,481 | 154–170 × 292–323 px |
| `assets/Gifters Badge Levels/` | 78 | 2,958,504 | 170–1,080 × 76–1,040 px |
| `assets/League/` | 20 | 570,961 | 711–1,080 × 216–573 px |
| `assets/Artwork/` | 1,509 | 13,972,858 | 256 × 256 px |
| **Total** | **2,869** | **432,539,358** | — |

**Format and parser outcome:** 1,748 PNG and 1,121 JPEG files; 2,869 parsed; zero unsupported formats; zero parse failures. The parser recorded an encoded alpha channel on 1,747 PNGs. It found no transparency chunks/flags and no animation metadata in this raster set.

**Historical Gifter milestone-crop scan:** the earlier scan captured six cropped milestone badge PNGs under `assets/Gifters Badge Levels/Gifters Badges/Png/` (not the six broad-range JPG sheets). They are now canonical under `assets/Crop References/Gifters Badges/Png/`; their duplicate legacy PNG copies were removed. All six declare an alpha channel; their historical dimensions and byte sizes were:

| Original sheet | Dimensions | Bytes |
|---|---:|---:|
| LV.1 - LV.9 | 985×566 | 66,876 |
| LV.10 - LV.19 | 989×560 | 71,777 |
| LV.20 - LV.29 | 998×580 | 102,317 |
| LV.30 - LV.39 | 995×580 | 93,492 |
| LV.40 - LV.49 | 988×588 | 108,289 |
| LV.50+ | 1006×594 | 114,626 |

These original sheets were only read by the metadata audit; no crop, resize, border removal or other edit was applied. Six companion files in the sibling `psd/` source folder are outside this raster-only scanner's supported formats and remain unmodified.

**Resolution observations:** the 1,121 reference screenshots are predominantly portrait (1,032 portrait, 89 landscape) and include 94 unique dimension pairs. The nine guest-layout reference diagrams are portrait. The 1,509 extracted artwork crops are all 256×256. The 50 individual Gifter badge PNGs are 170×76; those originals were not upscaled or modified by this scan.

**Interpretation limit:** an encoded alpha channel does not prove that any pixel is transparent. The audit explicitly records `pixel_alpha_values_scanned=false`, does not apply JPEG EXIF orientation and performs no human visual, quality, rights or production-approval review. The 1,509 extracted artwork files remain quarantined from production use pending provenance/rights and visual approval. Source images remain unchanged.

The CI uploaded `minglora-live-image-metadata-audit-13700` (artifact **14204652494**), containing the complete 2,869-record JSON report and its Markdown summary. The same run uploaded the generated LIVE asset manifest (artifact **14205036251**).

## Generated per-gift icon follow-up — 2026-11-14

- Supplied reference material remains unchanged. The existing inventory records 1,121 reference raster images, 131 gift-capture PNGs plus the capture sheet, 1,509 extracted artwork crops, and 9 guest-layout references.
- The new gift icon pipeline generates original subject-only SVG variants from the canonical repository gift catalogue. It does not overwrite, re-label, or silently approve supplied captures or extracted artwork.
- Generated icons are stored at build/runtime under `public/assets/gifts/catalog/<gift-code>-icon.svg`; source references remain preserved and separate.
- The generated icon provenance is recorded per gift in the LIVE asset manifest. Visual approval and licensing clearance remain outstanding for generated catalogue artwork; extracted reference artwork remains quarantined pending its own review.


## Explicit source-brand exclusion — 2026-11-15

- Source folder names and screenshot filenames are provenance metadata only; they must not become visible application branding.
- Preserve platform-neutral text, content hierarchy, layout geometry, controls, interaction patterns, responsive behavior and relevant states when recreating the supplied references.
- Exclude source-company names, logos, wordmarks, trademarks, distinctive branded marks and branded icon artwork from the Minglora application. Use Minglora identity and original assets instead.
- Keep supplied screenshots and extracted reference crops read-only and separate from production asset paths. Generated artwork remains subject to human visual and rights review before publication.


## Gifter range-sheet edge-crop checkpoint — 2026-11-15

The six cropped Gifter range sheets are now stored once in `assets/Crop References/Gifter level range sheets/` and served directly from that folder (crop details: `reports/GIFTER_RANGE_SHEET_CROP_REPORT.md`). The prior padded PNG duplicates and legacy root JPG duplicates have been removed. The sheets remain reference material, not approved product artwork:

| Source | Before | After | Edge crop (L / T / R / B) |
|---|---:|---:|---:|
| LV.1–LV.9 | 985×566 | 985×552 | 0 / 14 / 0 / 0 |
| LV.10–LV.19 | 989×560 | 989×542 | 0 / 18 / 0 / 0 |
| LV.20–LV.29 | 998×580 | 986×558 | 0 / 22 / 12 / 0 |
| LV.30–LV.39 | 995×580 | 987×541 | 0 / 39 / 8 / 0 |
| LV.40–LV.49 | 988×588 | 988×565 | 0 / 23 / 0 / 0 |
| LV.50+ | 1006×594 | 989×569 | 7 / 23 / 10 / 2 |

The crop report states the 11 internal detailed panels, master sheets, Rewards banner, badge artwork/lettering, progression logic, Coin thresholds, wallets and the removed Level-Up chart were not changed by this edge crop. This is a technical border cleanup only; it does not constitute visual or rights review of all 78 raster files and the six companion files in the source-only `psd/` directory. The newly cropped references remain in the reference directory and are not copied into product assets.


## Legacy standalone GLTF suitability review — 2026-11-16

The 45-file `public/assets/gifts/` legacy GLTF collection remains preserved. Its manifest describes historical seed/migration identities; it is not the same as the current `public/assets/gifts/catalog/` generated active gift catalogue. Files are not automatically production eligible merely because they are glTF 2.0 or have a matching filename.

The legacy `minglora_dolphin.gltf` record is `minglora-dolphin` / historical code `dolphin` / `Ocean Dolphin`, 7,246 bytes, 10 meshes, 5 materials, 0 textures, 0 images and 0 embedded animations. Its visual review, technical render review and rights review are pending; the manifest explicitly sets `production_eligible=false`. The historical migration value was 650 Coins and the record is absent from the 2026-11-15 production database snapshot. It was not overwritten, rebranded, or substituted for the current `dolphin-4bkejj` gift (10 Coins); the new bespoke Dolphin code/assets route only to that current canonical identifier.

Crocodile had no matching standalone approved model record in the canonical model source inventory, so a dedicated `crocodile-tnyf2j` asset was authored. The Crocodile model and vector art remain design-review-pending; CI render proof is not legal or human visual approval.


## Post-consolidation Gifter source state — PR #443

The current Gifter source folder contains 66 raster images (52 PNG and 14 JPEG, 1,785,279 bytes). The six cropped broad-range JPGs and six cropped milestone PNG overlays are stored once under the appropriate Crop References subfolders. Five genuine layered PSD source files remain in `assets/Crop References/Gifters Badges/psd/`; legacy duplicate PNG/PSD files and the extensionless PNG duplicate were removed. The raster metadata table above is the earlier CI snapshot and is not a post-consolidation scan.
