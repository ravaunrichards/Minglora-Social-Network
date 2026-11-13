# Minglora Profile Style and Screen Layout Library

## Scope and status

This change adds ten profile experiences to the existing Minglora Social Network. Profile Style Library manages profile styles only; it does not display or modify screen-layout choices. Existing screen-layout preferences and the separate LIVE/MeetWave layout controls are left independent. The change does not create extra accounts, user tables, profile content tables, media stores, or relationship graphs.

The original Profile Style Library was introduced in PR #266. The seven-screen/two-guest-box separation was merged into `main` in PR #269 on 2026-11-13. Confirm the active hosting deployment separately; a merged pull request alone does not prove production deployment.

## Ten profile styles

1. **Facebook-style** — preserves the existing cover-led profile hierarchy and existing controls; remains the default for legacy and new accounts.
2. **TikTok-style** — creator-first identity header and short-video-led content presentation.
3. **Instagram-style** — compact creator identity, centered navigation and square media gallery.
4. **YouTube-style** — channel banner and identity treatment, channel-oriented navigation and video emphasis.
5. **X (Twitter)-style** — compact banner and identity treatment with a timeline-first profile presentation.
6. **LinkedIn-style** — professional identity card and emphasis on existing About, work and education information.
7. **Pinterest-style** — creator identity and masonry-inspired visual media presentation.
8. **Twitch-style** — channel-stage presentation with dark creator/navigation treatment.
9. **Snapchat-style** — centered avatar-led profile and short-form content presentation.
10. **Custom Minglora-style** — original Minglora blue/violet profile-card experience.

The styles use familiar, high-level interface patterns and original Minglora assets, not third-party logos or official platform assets.

## Seven profile screen layouts

These seven screen-layout modes are separate from the ten profile style choices. They are not displayed or selected in Profile Style Library; the library changes only the profile's visual style:

1. **Full Screen** — edge-to-edge profile canvas and full-width content.
2. **Fluid Panel** — flexible, centered panels; default mode to preserve the existing Facebook profile geometry.
3. **Fluid Grid** — adaptive grids that grow and wrap with available space.
4. **Fixed Grid** — bounded, consistent multi-column content grid.
5. **Fixed Panel** — centered panel with a stable maximum reading width.
6. **Side by Side** — profile sections and media in adjacent columns.
7. **Spotlight** — centered identity presentation and focused main content.

The profile style choices remain independent of LIVE/MeetWave screen layouts. **Roundtable 1 and Roundtable 2 are guest-box arrangements**, not profile styles or profile layout choices; they remain in the LIVE and MeetWave guest panels/grids with their own controls.

## Unified account preferences

The existing \`user.settings.preferences\` record and \`PATCH /api/settings\` route store:

- \`profileStyle\` — active public profile style.
- \`defaultProfileStyle\` — owner's preferred default style.
Screen-layout preferences are not read or written by Profile Style Library. Applying or saving a profile style leaves those existing values untouched.

All values are validated against allowlists. Accounts that predate these preferences safely resolve to Facebook-style and Fluid Panel. The active style/layout are included in the public profile payload; preferred defaults are included only for the profile owner.

The existing \`profileLayout\` preference (\`standard\`, \`advanced\`, \`creator\`) remains independent and backward-compatible.

## User workflow

Open the three-dot menu on your own profile and choose **Profile Style Library**.

- **Preview** previews any of the ten profile styles without changing saved preferences.
- **Apply** saves the active profile style only.
- **Save as default** stores the preferred profile style across sessions and devices.
- **Reset to Default** reapplies the saved profile-style default. Existing screen-layout preferences are not modified by these actions.

The active style and layout travel with the member profile, so visitors see the selected experience. The underlying existing posts, About, friends, photos, reels, profile media, privacy checks and relationships remain the same.

## Responsive widths

In addition to the seven named screen-layout modes, CSS guardrails and responsive breakpoints cover compact and standard phones, phone landscape, tablet portrait/landscape, laptop and large desktop widths. The unit test enumerates a representative nine-width matrix (320, 360, 390, 430, 740, 768, 1024, 1280 and 2560 CSS pixels) as a supplemental responsive contract.

## Verification

- \`tests/unit/profile-style-library.test.js\` covers the ten style IDs, seven screen-layout IDs, all 70 combinations at the structural level, preference validation/defaults, owner-only default exposure, preview/apply/save/reset wiring, preserved profile content hooks and asset cache versions.
- Main CI syntax checks cover \`public/app.js\`, \`src/server.js\`, \`public/sw.js\` and \`public/settings.js\`, followed by the full \`npm test\` suite.
- The separate \`Minglora profile visual QA\` workflow runs two Chromium suites: a lightweight production-CSS fixture and an integration suite that boots the actual \`public/index.html\` app, uses the real \`app.js\` session bootstrap and profile event handlers, and renders through production \`renderProfile()\`. Only \`/api/*\` responses are stubbed with disposable test data; external requests are blocked, service workers are disabled, and no live Supabase account or data is touched.
- Each suite checks the 10 styles × 7 layouts at all nine viewport widths (630 scenarios per suite; 1,260 total). The real-app suite verifies the active style/layout, avatar and identity, owner actions, style-specific metrics, six navigation actions, content panel, overlap and horizontal-overflow guardrails.
- Each suite captures 70 desktop screenshots (all style/layout pairs) plus ten 360px phone screenshots; across both suites that is 160 screenshots, alongside the matrix JSON report, to the \`minglora-profile-visual-evidence\` artifact. This is browser layout QA with inspectable screenshots, not pixel-baseline comparison or a test of live Supabase data.

## Supplied reference collection and coverage

The checked-in `assets/reference` collection remains preserved in place and contains at least **1,050 image files** in the current inventory (the Android directory exceeds the GitHub contents API's 1,000-entry listing cap):

- `assets/reference/android/`: 1,000+ JPEG screenshots, including newer unlabelled, TikTok and Facebook captures.
- `assets/reference/Laptop PC Web/facebook/`: 21 desktop PNG captures.
- `assets/reference/Laptop PC Web/tiktok/`: 29 desktop PNG captures.

Representative Android Facebook and TikTok profile references and desktop Facebook/TikTok captures were sampled during this review. The TikTok Android profile capture `assets/reference/android/Screenshot_20261112_081840_TikTok.jpg` shows the creator identity on the left, avatar on the right, Following/Followers/Likes metrics, Follow and Message actions, story-highlight circles and a three-column short-video gallery. Minglora's TikTok style follows those layout cues with the account's real three headline metrics, a right-aligned avatar, real profile Highlights, and the existing video records in a three-column grid while retaining Minglora's own relationship, subscription and calling controls.

The supplied image collection directly covers Facebook and TikTok. It does not contain identifiable reference folders for Instagram, YouTube, X, LinkedIn, Pinterest, Twitch or Snapchat. Those eight implementations therefore use original Minglora presentations inspired by each style's established high-level patterns; they are not claimed to be pixel-perfect clones. Unlabeled Android images remain unclassified rather than being guessed. Reference screenshots are not copied into the public app bundle.

Profile Style Library previews now use the signed-in profile's available cover image, avatar, current post, photo/albums and videos. Empty account media areas show empty states rather than invented activity or sample statistics.
