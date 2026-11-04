# Minglora Gifter Progression

## Separate progression tracks

Gifter Progression belongs to the member who sends a gift. Creator League and Gift Gallery belong to creator/recipient activity. The two tracks remain separate and do not share point totals.

## XP rule

A member earns **1 Gifter XP per Minglora Coin** in a successfully confirmed member-to-member gift or LIVE gift they send. XP is based on the actual server-confirmed gift transaction. Coin purchases, gifts received, failed gift attempts, and duplicate transaction IDs do not count.

## Levels 1–50

The first level starts at 0 XP. For level N above 1, the cumulative threshold is:

`round(100 × (N − 1)^1.65)`

Thresholds are lifetime totals. The maximum level is 50. The client receives the server-calculated current level, XP, progress, chart, history, and leaderboard; it cannot submit or award XP.

## Level 25 milestone

Level 25 is a special milestone that unlocks the Minglora LIVE entrance badge/recognition. The progression page shows whether this milestone is unlocked and the remaining lifetime XP.

## Persistence and deduplication

Confirmed gift transaction IDs are stored in `gifterProgressionLedger`, a persisted Minglora runtime-state collection. The service rejects malformed events, self-gifts, non-positive Coin amounts, and duplicate transaction IDs. The direct-gift and LIVE-gift routes record events only after the Supabase economy operation confirms the transaction.

## User page

The dedicated page includes the current badge and progress bar, the full 50-level chart and badge gallery, recent confirmed gift activity, real community gifter rankings, and an explanation of the XP rules. Empty states are shown until real transactions exist; no demonstration members or sample gift totals are inserted.

## Where earned badges appear

A member's public gifter badge is included in the member profile, post/comment bylines, and LIVE directory identity after at least one confirmed gift has been sent. The badge level is calculated by the server from the deduplicated confirmed-gift ledger; the browser cannot assign or unlock it.

Members who have reached Level 25 or higher receive a special LIVE entry recognition banner when they enter a LIVE room. The Level 25 LIVE recognition is permanent because gifter XP is lifetime-based. Creator League rank and gifts received do not grant gifter badges.
