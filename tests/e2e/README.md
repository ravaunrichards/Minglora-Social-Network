# End-to-end tests

Browser tests should cover registration, login/logout, feed loading, publishing, comments/reactions, navigation, profile editing, and mobile layouts against a disposable environment. Test populated and empty states. Include keyboard-only navigation and screen-reader smoke coverage.

## Profile style visual matrix

`profile-style-visual.mjs` is an isolated Chromium layout QA fixture for the Minglora profile renderer. It loads the production stylesheet stack from `public/index.html` and exercises the production profile class names, ten registered style identifiers, nine screen-layout identifiers, and nine representative viewport sizes (320, 360, 390, 430, 740, 768, 1024, 1280 and 2560 CSS pixels). It checks profile visibility, cover treatment, media/friends sections, horizontal overflow, avatar/identity separation and action/metric separation. This is layout QA only: it uses a disposable visual fixture, does not authenticate to Supabase, and does not read or write live account data.

The `Minglora profile visual QA` workflow saves 90 desktop screenshots (10 styles × 9 screen layouts) and 10 phone screenshots to the `minglora-profile-visual-evidence` artifact. Screenshots are supporting evidence; the workflow's layout assertions are the automated pass/fail gate.
