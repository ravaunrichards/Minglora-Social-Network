# Minglora LIVE — Reference Asset Audit

**Audit date:** 2026-11-13  
**Repository:** `ravaunrichards/Minglora-Social-Network`  
**Branch for this audit and safe integration:** `feat/minglora-live-visual-assets-qa-20261113`

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

## Visual samples inspected

- Android LIVE Fan Club join sheet: `assets/reference/android/Screenshot_20261112_015315_TikTok.jpg`. It shows the creator header, Join entry, audience/leaderboard overlays, Fan/SuperFan tabs, benefit icons and fixed bottom action.
- Android SuperFan state: `assets/reference/android/Screenshot_20261112_015407_TikTok.jpg`. It shows the paid membership presentation, upgraded badge, benefits and separate action treatment.
- Desktop multi-guest LIVE room: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-072900.png` (**1366×644**). It shows a two-person video stage, creator identity header, right-side viewer and chat panel, and a fixed bottom gift tray.
- Desktop LIVE expanded gift picker: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-072931.png` (**1366×642**). It shows the same room with a raised gift-selection grid over the stage, while the separate viewer/chat panel remains visible.
- Desktop single-host LIVE room: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-073154.png` (**1366×642**). It shows one vertical host stream, follow action, viewer list/chat and a bottom gift tray.
- Desktop LIVE discovery page: `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-072813.png` (**1366×636**). This is the discovery/listing view, not an in-room control screen.
- `capture-20261112-072050.png` (**1363×636**) is a video/feed detail with comments, not a LIVE room.
- `capture-20261112-074126.png` (**1364×638**) is a creator scheduler page, not a LIVE room. It is not used as evidence for LIVE guest layouts.

The six desktop PNG dimensions above were read from their PNG IHDR headers. The six images were directly opened for visual classification. The full 1,121-image reference tree remains inventoried by path, Git blob identity and size; the remaining screenshots have not all received a human visual review or per-image dimension/transparency audit. No reference was moved, overwritten or copied into production artwork.
  
## Preservation and source-of-truth rules

- Keep `assets/reference/` and `assets/Gifts/` read-only.
- TikTok/Facebook screenshots are layout/interaction references only. Do not copy their logos, proprietary artwork, text or branded icons.
- Use them to guide Minglora-specific composition and control geometry.
- Do not publish extracted catalogue crops from `assets/Artwork/` until rights and visual review are complete.
- The audit branch does not delete, move or overwrite any supplied reference file.

## Follow-up inspection required

A complete screenshot-by-screenshot human review, original-dimension inventory, transparency check for every art file, and device-specific measurement matrix remain open. Desktop screenshots establish a desktop comparison viewport, but do not establish tablet, foldable, iPhone or Smart TV support by themselves.
