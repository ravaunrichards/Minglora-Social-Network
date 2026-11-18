# Minglora Crop References

This directory is the **single source of truth** for the supplied cropped reference images used by Minglora LIVE, Gifter Progression, Daily Ranking, and the default member profile.

## Import and duplication rules

- Keep each supplied image in its named source folder below. Do not copy these images into a second `public/assets/` directory.
- The application exposes versionable image routes from `src/server.js`; those routes read these original files directly.
- `public/sw.js` caches the application-facing routes. Update the relevant cache/version entry and the asset regression test whenever a route or source file changes.
- Preserve the originals. Do not recolor, stretch, crop again, add a border, or replace a source file unless a separately approved edited reference is supplied.
- The two Gifter groups intentionally use the same six level-range labels in **different folders** for different purposes: milestone overlays are PNG files; full level-range reference sheets are also PNG files, stored separately. They are distinct original assets, not interchangeable duplicates.

## 1. Gifter Badge Progression

**Source folder:** `Gifters Badges/`

Six cropped milestone badge PNG images:

- `LV.1 - LV.9.png`
- `LV.10 - LV.19.png`
- `LV.20 - LV.29.png`
- `LV.30 - LV.39.png`
- `LV.40 - LV.49.png`
- `LV.50+.png`

**Application routes:** `/assets/gifter-crop-badges/range-1.png` through `/assets/gifter-crop-badges/range-6.png`.

**Progression behavior:** The six PNG overlays align with the existing progression strip and reveal in earned order at Levels **1, 10, 20, 30, 40, and 50**. Unreached stages remain hidden/muted; reached stages use the supplied cropped artwork with stronger brightness, saturation, scale and glow. These overlays do not replace the 50 individual member Gifter badges. The six supplied PNGs are the canonical milestone artwork; do not substitute older versions or add duplicate copies.

## 2. Gifter Level Range Sheets

**Source folder:** `Gifter level range sheets/`

The six cropped PNG range sheets are the primary reference-gallery images:

- `LV.1 - LV.9.png`
- `LV.10 - LV.19.png`
- `LV.20 - LV.29.png`
- `LV.30 - LV.39.png`
- `LV.40 - LV.49.png`
- `LV.50+.png`

They are served through `/assets/gifter-badge-range-sheets/lv-1-9.png`, `lv-10-19.png`, `lv-20-29.png`, `lv-30-39.png`, `lv-40-49.png`, and `lv-50-plus.png` (explicit PNG routes). The six supplied PNGs are the canonical range-sheet artwork. No JPG companion is required or used by the Gifter range gallery.

These are full range/reference-sheet artwork. Keep them separate from the six milestone-overlay PNGs in `Gifters Badges/` and from the 50 individual badge image files.

## 3. Daily Ranking Badges

**Canonical source folder:** `Daily Ranking Badge/`

The folder contains **eight unique PNG reference crops**, and all eight now have defined runtime roles. The original uploaded PNGs remain unchanged and are served from one canonical route each.

**Daily member Rankings podium**
- `Screenshot_20261112_021224_TikTok(1).png` — first-place podium frame
- `Screenshot_20261112_021224_TikTok(2).png` — second-place podium frame
- `Screenshot_20261112_021309_TikTok(1).png` — third-place podium frame

**Daily LIVE Top Gifters podium avatars**
- `Screenshot_20261112_021309_TikTok(2).png` — first-place avatar frame
- `Screenshot_20261112_021333_TikTok(1).png` — second-place avatar frame
- `Screenshot_20261112_021343_TikTok(1).png` — third-place avatar frame

**Daily Top 4–20 avatar rank frames**
- `Screenshot_20261112_021355_TikTok(1).png` — blue/silver flame frame for ranks **4–10**
- `Screenshot_20261112_021407_TikTok(1).png` — blue/white flame frame for ranks **11–20**

The flame frames are used on the standalone member Rankings list, the daily LIVE ranking board, daily Top Gifters, and current daily-rank member profiles. The rank number and Top 10 / Top 20 label remain readable beside or with the frame; the source artwork is not altered, recolored, stretched, or duplicated. Ranks 21–100 retain the standard numbered list treatment.

**Application routes:** `/assets/daily-ranking-badges/place-1.png` through `place-3.png`; `/assets/daily-ranking-badges/top-gifters-place-1.png` through `top-gifters-place-3.png`; `/assets/daily-ranking-badges/place-4-10.png`; and `/assets/daily-ranking-badges/place-11-20.png`.

The first three routes serve the member Rankings podium; the next three serve the daily Top Gifters podium avatars; the final two routes serve the Top 4–10 and Top 11–20 flame frames. Ranking scores and Today / This week / This month / All time periods remain driven by confirmed LIVE gifts.

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

The test `tests/unit/crop-reference-assets.test.js` verifies the route mappings, frontend usage, progression states, guest-layout previews, default avatar wiring, source-file presence, and unique image contents across all 30 canonical PNG references: six milestone overlays, six Gifter range sheets, eight Daily Ranking crops, nine guest-layout previews, and the ENIGMA default profile picture. The two unnumbered Daily Ranking flame frames are audited but intentionally remain unassigned to runtime ranking positions.

**Do not add duplicate image copies.** Add a new source file only when it is a genuinely new reference, place it in the matching category, document its intended use here, and wire one canonical application route to it.
