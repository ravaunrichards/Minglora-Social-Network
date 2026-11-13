# Minglora LIVE — Reference Asset Audit

**Audit date:** 2026-11-13  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch for this audit and safe integration:** `feat/minglora-live-assets-audit-motion-index-20261113`

## Reference inventory

| Source | Files | Formats | Total size |
|---|---:|---|---:|
| `assets/reference/android/` | 1,071 | JPEG | 360,192,780 bytes |
| `assets/reference/Laptop PC Web/tiktok/` | 29 | PNG | 19,050,395 bytes |
| `assets/reference/Laptop PC Web/facebook/` | 21 | PNG | 8,577,230 bytes |
| **Reference folder total** | **1,121 images** | 1,071 JPEG + 50 PNG | **387,820,406 bytes** (plus one `.gitkeep`) |

The root reference Git tree was traversed recursively and was not truncated. The Android folder contains 1,071 JPEGs; the desktop TikTok folder contains 29 PNGs; the desktop Facebook comparison folder contains 21 PNGs. The repository separately contains 131 gift-catalogue capture screenshots in `assets/Gifts/`.

## Visual samples inspected

- Android LIVE fan-club join sheet: `assets/reference/android/Screenshot_20261112_015315_TikTok.jpg` (portrait viewport, 832 px wide in the inspected image). It shows the creator header, Join entry, audience/leaderboard overlays, Fan/SuperFan tabs, benefit icons and a fixed bottom action.
- Android SuperFan state: `assets/reference/android/Screenshot_20261112_015407_TikTok.jpg`. It shows the paid membership presentation, upgraded badge, benefits and a separate action treatment.
- Desktop video + comments layout: `assets/reference/Laptop PC Web/tiktok/capture-20261112-072050.png` (1365×635 inspected). The reference has a left navigation rail, central media stage, adjacent action rail and right comments panel.
- Desktop LIVE co-host room: `assets/reference/Laptop PC Web/tiktok/capture-20261112-074126.png` (1365×636 inspected). It has left LIVE navigation, a 3×2 guest stage, viewer roster and separate right chat panel.
- Other inspected desktop captures include the Get Coins panel and creator account scheduler screen. They are comparison context, not LIVE art.

Only these representative screenshots were visually sampled in this pass. The entire reference tree was inventoried by path, Git blob identity and file size; a complete per-image visual review and per-image dimension/transparency extraction for all 1,121 references has **not** been completed. No original reference was altered or copied into a production asset directory.

## Preservation and source-of-truth rules

- Keep `assets/reference/` and `assets/Gifts/` read-only.
- TikTok/Facebook screenshots are layout/interaction references only. Do not copy their logos, proprietary artwork, text or branded icons.
- Use them to guide Minglora-specific composition and control geometry.
- Do not publish extracted catalogue crops from `assets/Artwork/` until rights and visual review are complete.
- The audit branch does not delete, move or overwrite any supplied reference file.

## Follow-up inspection required

A complete screenshot-by-screenshot human review, original-dimension inventory, transparency check for every art file, and device-specific measurement matrix remain open. Desktop screenshots establish a desktop comparison viewport, but do not establish tablet, foldable, iPhone or Smart TV support by themselves.
