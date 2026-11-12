# Minglora Profile Style Library

## Scope and status

This change adds ten selectable profile presentations to the existing Minglora Social Network. It changes profile presentation only; it does not create additional user accounts, profile content tables, media stores, or relationship graphs.

Implementation is on the feature branch \`feat/profile-style-library-10x9\`. It is not a production release until the pull request checks pass and the change is merged/deployed.

## Style catalogue

1. **Facebook-style** — retains the existing cover-led Minglora profile hierarchy and current behaviour; it remains the default for existing and new accounts.
2. **TikTok-style** — creator-first avatar header, follower metrics, and video-led content presentation.
3. **Instagram-style** — compact creator identity, centered section navigation, and square media galleries.
4. **YouTube-style** — channel banner and identity treatment, channel-oriented navigation, and video content emphasis.
5. **X (Twitter)-style** — compact banner and identity presentation with a timeline-first content area.
6. **LinkedIn-style** — professional identity card and emphasis on the existing About/work/education data.
7. **Pinterest-style** — creator identity with a masonry-style visual media presentation.
8. **Twitch-style** — channel-stage presentation with dark media navigation and creator content emphasis.
9. **Snapchat-style** — centered avatar-led profile and short-form content presentation.
10. **Custom Minglora-style** — original Minglora blue/violet identity and profile-card treatment.

The implementation uses familiar high-level layout patterns, not third-party logos or copied brand assets.

## Account data and persistence

The current account preference store is reused:

- \`preferences.profileStyle\` is the active public profile style.
- \`preferences.defaultProfileStyle\` is the private preferred default.
- Both values are validated against the same ten supported style IDs.
- Legacy accounts without either key safely resolve to \`facebook\`.
- The public profile payload exposes the active \`profileStyle\` so viewers see the owner's selected presentation. The preferred default is only included for the profile owner.
- Both preferences are saved through the existing \`PATCH /api/settings\` route and the existing user settings record.

The existing \`profileLayout\` preference (\`standard\`, \`advanced\`, \`creator\`) is retained for backward compatibility and is not overloaded with the ten-style preference.

## User workflow

Open the three-dot menu on the member's own profile and choose **Profile Style Library**.

- **Preview** changes the preview surface only.
- **Apply** saves the selected style as the active public profile presentation.
- **Save as default** stores the selected style as the account's preferred default.
- **Reset to Default** reapplies the saved default.

The public profile remains one profile attached to one Minglora account. Existing profile tabs still route to the real Minglora posts, About, friends, photos, reels, and More content handlers. Style variants change the navigation labels and presentation, not the underlying relationship, media, privacy, or account permissions.

## Responsive compatibility matrix

The regression contract enumerates ten profile styles across these nine viewport classes (90 style/viewport combinations):

| Viewport class | Width × height |
|---|---:|
| Compact phone | 320 × 640 |
| Standard phone | 360 × 800 |
| Large phone | 390 × 844 |
| Wide phone | 430 × 932 |
| Phone landscape | 740 × 360 |
| Tablet portrait | 768 × 1024 |
| Tablet landscape | 1024 × 768 |
| Laptop | 1280 × 800 |
| Wide desktop | 2560 × 1440 |

The nine previously named Full Screen, Fluid Panel, Fluid Grid, Fixed Grid, Fixed Panel, Side by Side, Spotlight, Roundtable 1 and Roundtable 2 presets are LIVE/meeting composition modes, not physical device classes. They remain unchanged and are not applied to ordinary profile pages. The viewport matrix above is the responsive-device coverage for this profile work.

## Verification

- \`tests/unit/profile-style-library.test.js\` checks the ten style IDs, server allowlist/default behavior, account preference persistence wiring, preview/apply/save/reset hooks, existing profile data-tab hooks, asset cache versioning, and the 90-case style/viewport coverage contract.
- The main CI workflow runs \`node --check\` on \`public/app.js\`, \`src/server.js\`, \`public/sw.js\`, \`public/settings.js\`, followed by \`npm test\`.
- The viewport test is a structural responsive-coverage test. It is not a pixel-level browser screenshot test; verify actual browser/device rendering before declaring all 90 visual combinations fully accepted.
