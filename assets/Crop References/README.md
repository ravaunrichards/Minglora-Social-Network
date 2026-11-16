# Minglora Crop References

This directory is the **single source of truth** for the supplied cropped reference images used by Minglora LIVE, Gifter Progression, Daily Ranking, and the default member profile.

## Import and duplication rules

- Keep each supplied image in its named source folder below. Do not copy these images into a second `public/assets/` directory.
- The application exposes versionable image routes from `src/server.js`; those routes read these original files directly.
- `public/sw.js` caches the application-facing routes. Update the relevant cache/version entry and the asset regression test whenever a route or source file changes.
- Preserve the originals. Do not recolor, stretch, crop again, add a border, or replace a source file unless a separately approved edited reference is supplied.
- The two Gifter groups intentionally use the same six level-range filenames in **different folders** for different purposes. They are separate source images, not duplicates.

## 1. Gifter Badge Progression

**Source folder:** `Gifters Badges/Png/`

Six cropped milestone badge images:

- `LV.1 - LV.9.png`
- `LV.10 - LV.19.png`
- `LV.20 - LV.29.png`
- `LV.30 - LV.39.png`
- `LV.40 - LV.49.png`
- `LV.50+.png`

**Application routes:** `/assets/gifter-crop-badges/range-1.png` through `/assets/gifter-crop-badges/range-6.png`.

**Progression behavior:** The six overlays align with the existing progression strip and reveal in earned order at Levels **1, 10, 20, 30, 40, and 50**. Unreached stages remain hidden/muted; earned stages use the supplied bright crop artwork. These overlays do not replace the 50 individual member Gifter badges.

## 2. Gifter Level Range Sheets

**Source folder:** `Gifter level range sheets/`

The six range reference sheets listed above, served through:

- `/assets/gifter-crop-range-sheets/lv-1-9.png`
- `/assets/gifter-crop-range-sheets/lv-10-19.png`
- `/assets/gifter-crop-range-sheets/lv-20-29.png`
- `/assets/gifter-crop-range-sheets/lv-30-39.png`
- `/assets/gifter-crop-range-sheets/lv-40-49.png`
- `/assets/gifter-crop-range-sheets/lv-50-plus.png`

These are range/reference-sheet artwork. Keep them separate from the six progression-overlay crops and from the 50 individual badge image files.

## 3. Daily Ranking Badges

**Source folder:** `Daily Ranking Badge/png/`

The source folder contains **eight** unique PNG crops:

**Numbered daily podium frames**
- `Screenshot_20261112_021224_TikTok(1).png` — first place
- `Screenshot_20261112_021224_TikTok(2).png` — second place
- `Screenshot_20261112_021309_TikTok(1).png` — third place

**Numbered daily Top Gifters avatar frames**
- `Screenshot_20261112_021309_TikTok(2).png` — first place
- `Screenshot_20261112_021333_TikTok(1).png` — second place
- `Screenshot_20261112_021343_TikTok(1).png` — third place

**Additional unnumbered source references — retained, not assigned to a rank**
- `Screenshot_20261112_021355_TikTok(1).png` — blue/white flame frame
- `Screenshot_20261112_021407_TikTok(1).png` — blue/white flame frame

The two unnumbered frames are genuine, separate source images. They remain in this canonical folder and are included in the uniqueness audit, but are deliberately not wired to a podium position or ranking slot until their intended use is specified. Do not infer a rank or duplicate them under a second asset path.

**Application routes:** `/assets/daily-ranking-badges/place-1.png` through `place-3.png`, plus `/assets/daily-ranking-badges/top-gifters-place-1.png` through `top-gifters-place-3.png`.

The first three routes supply the daily podium placement frames; the latter three supply the daily Top Gifters avatar frames. Period selection and ranking data remain driven by confirmed LIVE gifts. The runtime serves the six designated numbered frames; all eight PNGs remain tracked as supplied source references.

## 4. LIVE Guest Layout References

**Source folder:** `Guests Layout/png/`

Nine layout previews:

- `Full Screen.png`
- `Fluid Panel.png`
- `Fluid Grid.png`
- `Fixed Grid.png`
- `Fixed Panel.png`
- `Side by Side.png`
- `Spotlight.png`
- `Roundtable 1.png`
- `Roundtable 2.png`

**Application routes:** `/assets/live-guest-layouts/full-screen.png`, `fluid-panel.png`, `fluid-grid.png`, `fixed-grid.png`, `fixed-panel.png`, `side-by-side.png`, `spotlight.png`, `roundtable-1.png`, and `roundtable-2.png`.

These images are layout previews, not replacements for the responsive LIVE layout implementation. The set represents seven host-selectable layouts and the two separately selectable Roundtable guest-box layouts.

## 5. Default Profile Picture

**Source file:** `Profile Picture/ENIGMA.png`

**Application route:** `/assets/profile-defaults/enigma.png`.

ENIGMA is the Minglora default/fallback profile picture. The application fallback and database migration reference this same source file. The migration is scoped to the former application placeholder avatar; custom member-uploaded profile pictures must remain unchanged.

## Validation

The test `tests/unit/crop-reference-assets.test.js` verifies the route mappings, frontend usage, progression states, guest-layout previews, default avatar wiring, source-file presence, and unique image contents across all **30 PNG references** in these groups: six milestone overlays, six separate level-range sheets, eight Daily Ranking crops, nine guest-layout previews, and the ENIGMA default profile picture. The two additional unnumbered Daily Ranking frames are included in the inventory and duplicate check, but remain unassigned to a runtime ranking position.

**Do not add duplicate image copies.** Add a new source file only when it is a genuinely new reference, place it in the matching category, document its intended use here, and wire one canonical application route to it.
