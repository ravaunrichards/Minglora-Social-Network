# Minglora League System

## Two separate progression tracks

Minglora has a Creator League class and a Match Rank. Confirmed LIVE Gift activity changes the Creator League only. Completed League Match results change Match Rank only. Match power-ups never multiply Creator League points or official class standings.

## Creator League classes

Progression from lowest to highest:

**D5 → D4 → D3 → D2 → D1 → C5 → C4 → C3 → C2 → C1 → B5 → B4 → B3 → B2 → B1 → A3 → A2 → A1**

New creators start at D5. A1 is the ceiling and D5 is the floor.

Creator League points are awarded only after the trusted Minglora LIVE Gift settlement function returns a confirmed transaction. The server uses its confirmed gift transaction ID and coin amount; the browser cannot supply points. One confirmed Minglora Coin of LIVE Gift value earns one Creator League point.

**Automatic class progression:** every 100,000 confirmed lifetime LIVE Gift points advances a creator exactly one class in the hierarchy above. The class updates as soon as the confirmed Gift is recorded; it does not wait for the end of a UTC day, a relative leaderboard placement, or four promotion fragments. A creator with 985,092 eligible lifetime LIVE Gift points is therefore in C1. A1 is reached at 1,700,000 points. These are Minglora progression settings, not claims about TikTok's internal thresholds.

Weekly seasons start Monday at 00:00 UTC. Season points reset weekly; lifetime LIVE Gift points and the class earned from them remain. Refunded LIVE Gifts are excluded and removed from the lifetime total when their refund is reconciled. Daily and weekly leaderboards are informational rankings and do not override a creator's lifetime-point class.

Coin purchases, direct profile gifts, social gifts, viewer support and match power-up bonuses do not add Creator League points. Match power-ups change only an active match score.

## Match Rank

Progression from lowest to highest:

**Bronze III → Bronze II → Bronze I → Silver III → Silver II → Silver I → Gold IV → Gold III → Gold II → Gold I → Platinum IV → Platinum III → Platinum II → Platinum I → Diamond IV → Diamond III → Diamond II → Diamond I → Heroic → Master → Grandmaster**

New creators start at Bronze III. A completed match awards +25 rating points to the winner, +5 to each creator for a draw, and −15 to the loser. Every 100 points advances one rank. A creator cannot drop below Bronze III or advance beyond Grandmaster. These values are initial Minglora settings.

## LIVE League Matches

A challenge pairs two active, independently hosted LIVE sessions. Both hosts must be connected to their LiveKit rooms when a challenge is sent and accepted. Invitations expire after two minutes. An accepted match runs for five minutes by default. Match scoring can use all LIVE Gifts or one selected Gift. Confirmed Gift value scores the match while its original eligible LIVE Gift value also contributes to the recipient's Creator League.

Viewers can support one side once per match for three match points. Creators cannot support their own match. Viewer support changes only that match result and Match Rank; it does not change Creator League points.

The server settles a match once when its timer ends and expires unanswered invitations. The League Arena refreshes current scores and match status.

## Match Power-Ups

Each power-up is available once per member per UTC day. These affect only the active match:

| Power-up | Initial Minglora rule |
| --- | --- |
| Momentum Boost | Adds 25% to eligible match Gift points for 30 seconds. |
| Shield | For 30 seconds, blocks the next opposing Momentum Boost or Score Multiplier bonus. The base Gift points still count; it cannot erase a result or override a referee. |
| Time Boost | Adds 30 seconds in flexible-timer matches. Fixed-timer matches reject it. |
| Score Multiplier | Doubles eligible match Gift points for 15 seconds. |

Momentum Boost and Score Multiplier do not stack multiplicatively; the strongest active multiplier is used. No power-up changes the underlying Gift transaction, Creator League total, or league class.

## TikTok-inspired principles, Minglora-owned rules

Minglora uses original class names, progression values, match rating rules, power-up values, and original assets. The class thresholds above are Minglora-owned settings.

The current implementation pairs two separate existing LIVE sessions. It does not claim to provide a shared co-host stage or a full 2v2 multi-creator room.
