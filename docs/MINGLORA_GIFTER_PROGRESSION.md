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
  845000, 1120000, 1470000, 1920000, 2500000, 3230000, 4180000, 5180000, 6890000, 8780000,
  11200000, 14100000, 17800000, 22300000, 30000000, 37500000, 47500000, 60000000, 75000000, 97500000
])
```

The maximum level is 50. The client receives the server-calculated level, progress, chart, history, and leaderboard; it cannot submit or award XP. Once earned, levels and badges remain unlocked.

## NEW GIFTER identity

The **NEW GIFTER** identity begins when the member sends their first successfully confirmed gift. It remains visible for exactly seven days from that first gift timestamp, then expires automatically. Sending additional gifts during the week does not restart the timer. It is a temporary identity, separate from permanent earned Gifter Level badges.

## Level 25 milestone

Level 25 is a special milestone that unlocks the Minglora LIVE entrance badge/recognition. The progression page shows whether this milestone is unlocked and the remaining lifetime Coins. This recognition remains unlocked because gifter progression is lifetime-based.

## Persistence and deduplication

Confirmed gift transaction IDs are stored in `gifterProgressionLedger`, a persisted Minglora runtime-state collection. The service rejects malformed events, self-gifts, non-positive Coin amounts, and duplicate transaction IDs. The direct-gift and LIVE-gift routes record events only after the Supabase economy operation confirms the transaction. The earliest confirmed gift timestamp is retained for the seven-day identity window.

## Where earned badges and NEW GIFTER appear

Earned Gifter badges appear in member profiles, post/comment bylines, and LIVE directory identity after the relevant level is achieved. The temporary NEW GIFTER identity appears in those same identity surfaces during its seven-day window. Badge levels and identity dates are calculated by the server from the deduplicated confirmed-gift ledger; the browser cannot assign, unlock, or extend them.

Creator League rank and gifts received do not grant Gifter badges.
