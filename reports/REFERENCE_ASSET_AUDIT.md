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

The Android sample pass also opened eight 1080×2408 screenshots: the Fan Club join sheet, SuperFan upgrade sheet, first-recharge offer, creator profile card with Fan Club action, and three gift-gallery views. These samples establish mobile interaction states and show how creator membership and the catalogue appear over a live creator context. Other than the eight samples, the remaining Android images are still pending human review. JPEG files are marked as not supporting transparency; this format-level fact is not an alpha-pixel audit of the PNG collections.

The Android gift-gallery references include third-party gift names, images and Coin labels. They are preserved as read-only reference material for user-provided comparison. They are not cleared as Minglora-owned artwork and have not been copied into production; exact artwork reuse remains gated on documented permission/licensing. The Minglora catalogue must continue to use its configured canonical names and Coin values rather than inferred values from screenshots.

The image records were expanded during the 2026-11-13 follow-up pass. **23 of the 29 desktop TikTok PNGs were opened and visually classified**, and their exact PNG IHDR width/height values are now recorded in the machine-readable manifest. The 23 include LIVE discovery/previews, solo-host rooms, multi-guest stages, a gift-picker overlay, creator/profile screens, feed/video pages, a Coins recharge panel and a scheduler/level-up dialog. The six large desktop PNGs that did not return usable image data in this pass remain pending rather than being guessed. Desktop Facebook and Android image dimensions/transparency, and human review of the full 1,121-image tree, are still incomplete. No reference was moved, overwritten or copied into production artwork.

The 23 reviewed TikTok screenshots establish several distinct layout states:
- **Solo-host room:** portrait video stage, creator identity/follow action, a separate viewer/chat rail and a bottom gift dock.
- **Multi-guest rooms:** two-person stage, four-position participant arrangement and six-position grid variants, with a separate viewer/chat rail.
- **Gift-picker state:** a stage overlay that keeps the viewer/chat rail visible and retains the room's bottom gift dock.
- **Discovery/preview:** separate browse/watch-preview pages with category navigation; these are not in-room control layouts.
- **Non-LIVE controls:** feed/video detail, short-drama discovery, creator profile, scheduler, account-level modal and Coins recharge views. These have been explicitly classified as non-room references so they are not used to infer LIVE room geometry.
  
## Preservation and source-of-truth rules

- Keep `assets/reference/` and `assets/Gifts/` read-only.
- TikTok/Facebook screenshots are layout/interaction references only. Do not copy their logos, proprietary artwork, text or branded icons.
- Use them to guide Minglora-specific composition and control geometry.
- Do not publish extracted catalogue crops from `assets/Artwork/` until rights and visual review are complete.
- The audit branch does not delete, move or overwrite any supplied reference file.

## Follow-up inspection required

A complete screenshot-by-screenshot human review, original-dimension inventory, transparency check for every art file, and device-specific measurement matrix remain open. Desktop screenshots establish a desktop comparison viewport, but do not establish tablet, foldable, iPhone or Smart TV support by themselves.
