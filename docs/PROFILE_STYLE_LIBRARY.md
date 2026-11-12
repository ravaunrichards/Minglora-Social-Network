# Minglora Profile Style and Screen Layout Library

## Scope and status

This change adds ten profile experiences and nine profile screen-layout modes to the existing Minglora Social Network. The selected style and screen layout are presentation preferences on the same Minglora member account. The change does not create extra accounts, user tables, profile content tables, media stores, or relationship graphs.

Implementation is on \`feat/profile-style-library-10x9\` and PR #266. It is not a production release until review, CI and deployment verification are complete.

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

## Nine profile screen layouts

All nine modes are available in the Profile Style Library screen-layout selector and compose with every profile style:

1. **Full Screen** — edge-to-edge profile canvas and full-width content.
2. **Fluid Panel** — flexible, centered panels; default mode to preserve the existing Facebook profile geometry.
3. **Fluid Grid** — adaptive grids that grow and wrap with available space.
4. **Fixed Grid** — bounded, consistent multi-column content grid.
5. **Fixed Panel** — centered panel with a stable maximum reading width.
6. **Side by Side** — profile sections and media in adjacent columns.
7. **Spotlight** — centered identity presentation and focused main content.
8. **Roundtable 1** — balanced two-column profile panels.
9. **Roundtable 2** — compact multi-panel layout with a featured main column.

This creates **10 × 9 = 90 profile style/screen-layout combinations**. The existing LIVE/meeting mode definitions and their host/guest controls are not modified; profile layouts use separate preference keys and CSS attributes.

## Unified account preferences

The existing \`user.settings.preferences\` record and \`PATCH /api/settings\` route store:

- \`profileStyle\` — active public profile style.
- \`defaultProfileStyle\` — owner's preferred default style.
- \`profileScreenLayout\` — active public profile screen layout.
- \`defaultProfileScreenLayout\` — owner's preferred default screen layout.

All values are validated against allowlists. Accounts that predate these preferences safely resolve to Facebook-style and Fluid Panel. The active style/layout are included in the public profile payload; preferred defaults are included only for the profile owner.

The existing \`profileLayout\` preference (\`standard\`, \`advanced\`, \`creator\`) remains independent and backward-compatible.

## User workflow

Open the three-dot menu on your own profile and choose **Profile Style Library**.

- **Preview** previews any of the ten profile styles and selected screen layout without changing saved preferences.
- **Profile screen layout** selects one of the nine named modes for the preview and next Apply/Save action.
- **Apply** saves the active profile style and screen layout.
- **Save as default** stores both preferred defaults across sessions and devices.
- **Reset to Default** reapplies both saved defaults.

The active style and layout travel with the member profile, so visitors see the selected experience. The underlying existing posts, About, friends, photos, reels, profile media, privacy checks and relationships remain the same.

## Responsive widths

In addition to the nine named screen-layout modes, CSS guardrails and responsive breakpoints cover compact and standard phones, phone landscape, tablet portrait/landscape, laptop and large desktop widths. The unit test enumerates a representative nine-width matrix (320, 360, 390, 430, 740, 768, 1024, 1280 and 2560 CSS pixels) as a supplemental responsive contract.

## Verification

- \`tests/unit/profile-style-library.test.js\` covers the ten style IDs, nine screen-layout IDs, all 90 combinations at the structural level, preference validation/defaults, owner-only default exposure, preview/apply/save/reset wiring, preserved profile content hooks and asset cache versions.
- Main CI syntax checks cover \`public/app.js\`, \`src/server.js\`, \`public/sw.js\` and \`public/settings.js\`, followed by the full \`npm test\` suite.
- The combination test is structural responsive coverage. It is not a pixel-level browser screenshot run; actual browser rendering across all 90 combinations remains required before calling visual QA complete.
