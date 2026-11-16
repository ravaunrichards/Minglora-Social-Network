# Minglora Gifter Progression

## Separate progression tracks

Gifter Progression belongs to the member who sends a gift. Creator League and Gift Gallery belong to creator/recipient activity. The two tracks remain separate and do not share point totals.

## Coin-spend rule

A member earns **1 Gifter progress point per Minglora Coin** in a successfully confirmed member-to-member gift or LIVE gift they send. Progress is based on the actual server-confirmed gift transaction. Coin purchases, gifts received, failed gift attempts, and duplicate transaction IDs do not count.

## Locked levels 1–50

Every account starts with **no gifting badge and all 50 Gifter Levels locked**. There is no default Level 1 badge. The first confirmed Coin spent sending a gift unlocks Level 1. Each later level unlocks only after the member's cumulative lifetime Coins sent reaches its published threshold:

```js
[
  1, 8, 18, 34, 56, 90, 140, 220, 340, 530,
  820, 1260, 1920, 2840, 4340, 6420, 9280, 13500, 19400, 27600,
  39600, 54600, 75800, 105000, 144000, 196000, 265000, 357000, 478000, 637000,
  845000, 1120000, 1470000, 1920000, 2500000, 3230000, 4180000, 5430000, 6890000, 8780000,
  11200000, 14100000, 17800000, 22300000, 30000000, 37500000, 47500000, 60000000, 75000000, 97500000
])
```

**Reference precedence:** Live thresholds use the widely reproduced TikTok LIVE gifter community reference table, not the conflicting lower values in the removed `Gifters Level Up.png` artwork. The corrected thresholds are Level 45 = 30,000,000 Coins and Level 50 = 97,500,000 Coins. Level 48 remains 60,000,000 Coins in the selected reference table. TikTok does not publish an official threshold table, so these are community-compiled reference amounts; see the cited comparison at https://tikradar.io/blog/tiktok-gifter-levels/ and the full 1–50 table at https://tikradar.io/blog/tiktok-gifter-level-50-cost/. The conflicting chart image has been removed from the member interface and source asset folder. The server-driven Level 1–50 directory remains authoritative for unlocks.

The maximum level is 50. The client receives the server-calculated level, progress, chart, history, and leaderboard; it cannot submit or award XP. Earned levels remain unlocked. An authorized MFA-verified Creator Hub admin may separately grant a level (including all 50), with an admin-awarded marker and audit entry; this does not add Coin spend or change any wallet. An admin reset starts a new progression epoch without deleting the original gift ledger or lifetime history.

## Interactive 50-level progression strip

The supplied original PNG progression strip is the complete visual layout. Its six artwork positions correspond to Levels 1, 10, 20, 30, 40, and 50. Earned milestone badge crops highlight the corresponding positions after each stage is reached. No white position marker or extra tracker dot is placed over the artwork; the exact current level and Coin progress remain visible separately in the member's Gifter Status.

The ordered Level 1–50 directory remains the individual badge tracker: locked badges stay muted, earned/admin-awarded badges light up, and the current badge receives the strongest highlight. The original progression strip and all 50 original numbered badge images remain unchanged. A successfully confirmed Gift Center send triggers an immediate refresh; the existing quiet overview polling keeps other confirmed gift routes synchronized. The server remains authoritative for coin totals, unlocks, refunds, and admin awards.

## NEW GIFTER identity

The **NEW GIFTER** identity begins when the member sends their first successfully confirmed gift. It remains visible for exactly seven days from that first gift timestamp, then expires automatically. Sending additional gifts during the week does not restart the timer. It is a temporary identity, separate from permanent earned Gifter Level badges.

## Level 25 milestone

Level 25 is a special milestone that unlocks the Minglora LIVE entrance badge/recognition. The progression page shows whether this milestone is unlocked and the remaining lifetime Coins. This recognition remains unlocked because gifter progression is lifetime-based.

## Persistence and deduplication

Confirmed gift transaction IDs are stored in `gifterProgressionLedger`, a persisted Minglora runtime-state collection. The service rejects malformed events, self-gifts, non-positive Coin amounts, and duplicate transaction IDs. The direct-gift and LIVE-gift routes record events only after the Supabase economy operation confirms the transaction. The earliest confirmed gift timestamp is retained for the seven-day identity window.

## Where earned badges and NEW GIFTER appear

Earned Gifter badges appear in member profiles, post/comment bylines, and LIVE directory identity after the relevant level is achieved. The temporary NEW GIFTER identity appears in those same identity surfaces during its seven-day window. Badge levels and identity dates are calculated by the server from the deduplicated confirmed-gift ledger; the browser cannot assign, unlock, or extend them.

Creator League rank and gifts received do not grant Gifter badges.


## Complete source-reference placement — 2026-11-16

The Gifter assets remain separated by purpose. The 50 numbered individual badge PNGs, the Gifter Level Range references, the six Gifter Badge Progression milestone overlays, and the six-stage progression strip are distinct visual collections. No image-source files were recolored, redrawn, resized, restored from an older version, or overwritten for the premium-quality presentation update.

- `Gifters Rewards.png` remains the primary artwork banner at the top of the Gifts entry page.
- The 11 original `Levels 1-4.jpg` through `Levels 50.jpg` panels appear in the detailed, ordered LV 1–50 section.
- The six cropped range-reference PNGs (`LV.1 - LV.9.png` through `LV.50+.png`) are stored only in `assets/Crop References/Gifter level range sheets/` and served through the six explicit `/assets/gifter-badge-range-sheets/*.png` routes. These are the separate range-sheet gallery references; no JPG companion is required or used.
- The six cropped Gifter Badge Progression milestone PNGs are stored directly in `assets/Crop References/Gifters Badges/` and served through `/assets/gifter-crop-badges/range-1.png` through `range-6.png`. They highlight the original progression strip only at Levels 1, 10, 20, 30, 40 and 50. There is no nested `Png/` folder in the canonical source path.
- `Badges_Level_01-50/Badges_Level_01-50.png` and its `_preview.jpg` remain together in the separate master-collection section.
- The 50 original, distinct numbered PNG files remain in `assets/Gifters Badge Levels/Level_Badges_01-50_Individual/`. The ordered Level 1–50 directory, current earned badge, Gifter leaderboard, Top Gifters and member/LIVE identity renderers select the matching `level_01.png` through `level_50.png` using the server-confirmed level. These are the original badge images, not generated substitute artwork.
- The canonical progression-strip source is `assets/Gifters Badge Progressions/Gifters Badge Progressions.png`. It is served directly and uncropped through `/assets/gifter-badge-progression-art.png`. It remains visual artwork only and does not define Coin thresholds, level assignments or unlock calculations.

All referenced artwork is served through explicit allow-list routes and uses aspect-ratio-preserving image presentation. Every individual 170×76 Gifter badge uses the same vivid brightness, saturation, contrast and layered illumination as the earned badges on the progression strip across the level directory, current-status card, leaderboard, profile, LIVE and chat identity surfaces. Locked badges remain full-colour and recognizable; unlock state is communicated by the accompanying status label and card treatment, not by dimming the artwork. The six range-sheet references use a compact gallery with reduced gaps and padding. Original PNG files remain unchanged. Reduced-motion preferences disable animated highlights.

The Gifter Level Range and Gifter Badge Progression remain independent systems. This visual-quality work does not alter the 50-level earning thresholds, confirmed-gift ledger, refunds, wallet balances, Coin transactions, admin awards or database records.
