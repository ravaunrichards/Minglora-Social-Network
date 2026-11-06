# Minglora League System

## Two separate progression tracks

Minglora has a Creator League class and a Match Rank. LIVE Gift activity changes the Creator League only. Completed League Match results change Match Rank only. Match power-ups never multiply Creator League points or official class standings.

## Creator League classes

Progression from lowest to highest:

**D5 → D4 → D3 → D2 → D1 → C5 → C4 → C3 → C2 → C1 → B5 → B4 → B3 → B2 → B1 → A3 → A2 → A1**

New creators start at D5. A1 is the ceiling and D5 is the floor.

Creator League points are awarded only after the trusted Minglora LIVE Gift settlement function returns a confirmed transaction. The server uses its giftTransactionId and coinAmount fields; the browser cannot supply points. One confirmed Minglora Coin of LIVE Gift value earns one Creator League point. Coin purchases, direct profile gifts, social gifts, viewer support and power-up bonuses do not add Creator League points.

Weekly seasons start Monday at 00:00 UTC. Season points reset; lifetime LIVE Gift points remain. Daily placements rank every creator with a Creator League profile in the same region and class by confirmed LIVE Gift points earned that UTC day. One confirmed Minglora Coin of LIVE Gift value equals one Creator League point; a 500-Coin Gift earns 500 points. Creators who receive no eligible LIVE Gifts remain in the standings with zero points, so a creator who does receive Gifts can still compete even when they are the only gifter that day. At least two enrolled creators in the same region/class are required for placement; two Gift senders are not required. The top 20% earn one promotion fragment; four fragments promote a creator one class and award one League Shield. The bottom 20% lose one fragment. If no fragment remains, a League Shield prevents one class demotion; without a shield, the creator moves down one class. D5 cannot be demoted and A1 cannot be promoted. A tie that crosses both movement boundaries is neutral so equal scores do not cause arbitrary movement.

These are initial Minglora rules, not claims about TikTok's internal thresholds.

## Match Rank

Progression from lowest to highest:

**Bronze III → Bronze II → Bronze I → Silver III → Silver II → Silver I → Gold IV → Gold III → Gold II → Gold I → Platinum IV → Platinum III → Platinum II → Platinum I → Diamond IV → Diamond III → Diamond II → Diamond I → Heroic → Master → Grandmaster**

New creators start at Bronze III. A completed match awards +25 rating points to the winner, +5 to each creator for a draw, and −15 to the loser. Every 100 points advances one rank. A creator cannot drop below Bronze III or advance beyond Grandmaster. These values are initial Minglora settings.

## LIVE League Matches

A challenge pairs two active, independently hosted LIVE sessions. Both hosts must be connected to their LiveKit rooms when a challenge is sent and accepted. Invitations expire after two minutes. An accepted match runs for five minutes by default. Match scoring can use all LIVE Gifts or one selected Gift. Confirmed Gift value scores the match while its original transaction value also contributes to the recipient's Creator League.

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

Momentum Boost and Score Multiplier do not stack multiplicatively; the strongest active multiplier is used. No power-up changes the underlying Gift transaction, Creator League total, or league standings.

## TikTok-inspired principles, Minglora-owned rules

The public TikTok LIVE Match description supports solo or team competition, viewer participation through Gifts or Likes, timed scoring, and the side with the most points winning. Minglora uses its own class names, promotion rules, match rating values, power-up values, and original assets.

The current implementation pairs two separate existing LIVE sessions. It does not claim to provide a shared co-host stage or a full 2v2 multi-creator room.