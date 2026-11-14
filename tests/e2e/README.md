# End-to-end tests

Browser tests should cover registration, login/logout, feed loading, publishing, comments/reactions, navigation, profile editing, and mobile layouts against a disposable environment. Test populated and empty states. Include keyboard-only navigation and screen-reader smoke coverage.

## Profile style visual matrix

`profile-style-visual.mjs` runs two isolated Chromium suites. The first is a fast CSS fixture using the production stylesheet stack. The second boots the actual `public/index.html` application, lets the real `app.js` session bootstrap and profile event handlers run, and renders profiles through the production `renderProfile()` function. Only the `/api/*` boundary is stubbed with disposable test responses; external requests are blocked, service workers are disabled, and no live Supabase account or data is accessed.

Both suites cover ten profile styles × seven screen-layout modes at nine viewport widths (320, 360, 390, 430, 740, 768, 1024, 1280 and 2560 CSS pixels). The production-app checks verify the rendered profile attributes, owner actions, style-specific metrics, navigation, content panel visibility, horizontal overflow and key-element overlap. The script records 630 CSS-fixture scenarios plus 630 real-app scenarios.

The workflow saves 70 screenshots for all style/layout pairs at desktop width and ten phone screenshots at 360px for each suite (160 screenshots total), alongside a JSON matrix report, in the `minglora-profile-visual-evidence` artifact. The browser assertions are the automated pass/fail gate; the screenshots remain review evidence rather than pixel-baseline comparisons.
