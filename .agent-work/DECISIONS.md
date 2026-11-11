# Engineering Decisions

## Repository and execution

1. The only repository in scope is `ravaunrichards/Minglora-Social-Network`.
2. All implementation work is isolated in `fix/profile-unique-gifter-badge-display`; merge only after expected-head and green-CI verification.
3. Use GitHub repository root `.` as the verified root notation; do not invent an absolute checkout path when the connected interface does not provide one.
4. Overall project completion remains unquantified until the documented backlog is decomposed and weighted.

## Gifter badge rendering

5. The canonical user badge is the original individual image matching the earned Level: `/assets/gifter-badges/level_01.png` through `level_50.png`.
6. Generate the numbered asset path from the member's validated Level, clamped to the supported 1–50 range. Do not create alternate artwork, reuse one Level's badge for another, or modify source PNGs.
7. Use one renderer for each identity context so profile header, previews, compact identity rows and profile recognition stay consistent.
8. Badge placement: immediately adjacent to the relevant username or member identity, not floating over the profile image, cover, or other controls.
9. Badge rendering uses proportional containment (`object-fit: contain`) and responsive size variants: 40px profile, 34px narrow-mobile profile, 24px compact (22px narrow mobile), and 120px gallery (96px narrow mobile). The original source dimensions/artwork remain unchanged.
10. Preserve distinct verification, LIVE Pro, admin-awarded, LIVE-entry, New Gifter and Creator League recognition. A Gifter badge must not replace or impersonate any other marker.
11. The main profile uses the badge beside the username; the profile Badges recognition panel presents a larger copy. Lists use compact versions.

## Safety and maintenance

12. Do not modify Gifter level thresholds, Coin accounting, gift transactions, wallet balances or badge award rules as part of display-only work.
13. Keep the original combined level panels and all individual badge PNGs intact.
14. Update the app script, badge stylesheet and service-worker cache versions together when asset behavior changes.
15. Serve existing artwork from its actual repository path; do not duplicate the image just to match an incorrect route.
16. Keep automated tests aligned with the new asset URL/cache version; change only assertions that encode the previous behavior.
17. Never reactivate Marketplace or other explicitly retired product surfaces without a separate approved scope; repository docs classify Marketplace as RETIRED.
