# Minglora LIVE — Asset Integration Map

| App area | Existing implementation | Asset/resource path |
|---|---|---|
| LIVE room shell | `public/app.js` plus room CSS | `public/live-tiktok-compact.css`, `public/live-room-compact.css`, `public/live-room-fit.css` |
| LIVE gift browser | `public/app.js`, paginated category/search tools | `public/live-gift-access.css` |
| Gift Studio | `public/gifts.js` | `data/minglora-gift-catalog.json`, `/assets/gifts/catalog/<code>.svg`, `<code>.gltf` |
| Gift playback and preview | `public/gift-effects.js`, `window.MingloraGiftFX` | SVG/GLTF paths and `catalog-motion-index.json`; model errors fall back to the matching SVG |
| Gift motion profiles | New generator in this branch | `scripts/generate-live-gift-motion-index.mjs` → `public/assets/animations/gifts/catalog-motion-index.json` |
| Gift sounds | Web Audio in `public/gift-effects.js`; separate sound-library generator | gift sound preset metadata; `scripts/generate-minglora-sound-library.mjs` for the separate 120-cue Sound Studio pack |
| Navigation icons | Shared symbol sheet | `public/assets/icons/navigation-3d.svg` |
| Push graphic | Existing SVG | `public/assets/icons/minglora-push.svg` |
| Offline shell | Service worker | `public/sw.js` already pre-caches the canonical motion-index path and LIVE assets |
| LIVE transport/media | LiveKit browser/server integration | `backend/modules/live/`, `src/server.js`, `public/app.js` |


- The exact Rose catalogue record uses the bespoke model source at assets/3d-assets/gift-models/rose-model.mjs. The standard gift builder emits the self-contained GLTF to the catalogue's canonical path; the existing viewer, SVG error fallback and server-confirmed gift event flow remain unchanged.

## Build lifecycle changes

- `npm run build:gifts` creates SVG/GLTF catalogue assets.
- `npm run build:live-gift-motion` creates the motion index from the same source JSON.
- Application `prestart` runs the gift, sound and motion-index generators.
- GitHub CI checks the motion-index generator syntax and runs the build before automated tests.
- The new unit test verifies every active catalogue row resolves to the exact canonical image/model path and animation/sound profile.

No prices, balances, transactions, account state, LiveKit credentials, or existing gift records were modified by this branch.

## Per-gift machine-readable manifest

- `npm run build:live-asset-manifest` reads the canonical gift catalogue, generated SVG/GLTF files and active motion index.
- `assets/manifests/live-asset-manifest.json` records every active and inactive catalogue row, exact generated file bytes and SHA-256 hashes, SVG dimensions, GLTF mesh bounds, source/generator references, coin price from the canonical catalogue, runtime animation profile, synthesized sound implementation, licensing/visual-review status, component usage, fallback state and unverified device QA.
- `npm run build:live-asset-manifest -- --check` verifies the output is current and deterministic. The generated manifest is ignored as a build artifact and uploaded by CI as `minglora-live-asset-manifest-<run-number>`.
- The manifest marks generated category-vector SVGs as awaiting human review, procedural GLTFs, synthesized category sound and unverified physical-device support as limitations. The model-load error fallback is implemented; the generator records it as available. It does not grant production approval or rights clearance.
- The SVG generator no longer includes system-font emoji glyph overlays; the per-gift manifest and catalogue tests enforce a zero-overlay count. Existing vector forms and gift labels are preserved.


## Individually addressable LIVE control icons

- Added original `screen-stop.svg` and `fullscreen-exit.svg` state variants. `public/app.js` switches to the stop-sharing glyph only after screen-share publication is enabled, and to the exit-fullscreen glyph only while the room shell is in browser fullscreen; failed or ended screen shares return to the idle screen glyph.
- The immutable 18-name allow-list, machine-readable manifest, versioned service-worker shell (`v316`) and `tests/unit/live-control-icons.test.js` all cover both new files. The SVGs inherit `currentColor`; design and rights review remain pending.

- The LIVE room control buttons now use a dedicated SVG asset pack under `public/assets/icons/live-controls/`.
- `manifest.json` records all 18 original control symbols and their canonical paths. SVG files share a `0 0 24 24` viewBox and inherit `currentColor`, preserving existing responsive sizing and button-state styling.
- `public/app.js` references only the immutable icon allow-list; user input is never interpolated into an asset path.
- `public/sw.js` increments the shell cache version and pre-caches the manifest plus all 18 SVG files for offline LIVE controls.
- `tests/unit/live-control-icons.test.js` validates the inventory, SVG structure, safe reference logic, state inheritance and offline cache coverage.


## LIVE gift category artwork

- The dynamic gift-category chips use individually addressable SVG artwork under `public/assets/icons/live-gift-categories/` for All and all 21 current catalogue category keys.
- `manifest.json` records labels, canonical file paths, shared 24×24 viewBox, `currentColor` treatment and design-review status.
- `public/app.js` maps category keys through an immutable allow-list; unknown keys use the neutral More Gifts artwork. Existing category filtering, search, selection, favorites and price sorting remain unchanged.
- `public/live-gift-access.css` sizes the category marks consistently with the existing chips.
- The service worker uses shell cache v305 and pre-caches the category manifest and all 22 SVG files.
- `tests/unit/live-gift-category-icons.test.js` verifies manifest coverage, physical files, vector-only artwork, accessible chip markup and offline cache inclusion.

## Shared asset manifest coverage

- The generated LIVE asset manifest now indexes the 18 standalone control SVGs and the 22 gift-category SVGs, including each file path and SHA-256 checksum.
- The asset-manifest build validates canonical URLs, unique IDs, 24×24 SVG symbols, `currentColor` vector geometry and absence of emoji glyph artwork.
- Design review and rights review remain pending for these new vector packs; the manifest records this rather than inferring approval.

## LIVE tools drawer shortcut icons

- The LIVE tools drawer now uses a dedicated 12-icon SVG pack under `public/assets/icons/live-tools/` for Layout, Permissions, Guests, Viewers, Fan Club, Match, Top Gifters, Gifts, Rewards, Moderators, Appearance and Devices.
- `public/assets/icons/live-tools/manifest.json` records canonical IDs, labels and file paths with a shared 24×24 viewBox. The SVGs inherit `currentColor`; active and focus states remain controlled by the existing drawer buttons and `aria-pressed` state.
- `public/app.js` maps each icon through an immutable allow-list and preserves the current role and gift-availability conditions plus the existing `data-live-tools-panel-target` / `data-live-tools-target` panel routing.
- `public/sw.js` uses shell cache v306 and pre-caches the manifest and all 12 SVG files for offline tools navigation.
- `tests/unit/live-tool-shortcut-icons.test.js` validates artwork files, safe icon mapping, panel targets, accessibility state, responsive drawer styling and service-worker coverage.
- The icons are original Minglora outline navigation graphics; design review and licensing metadata remain explicitly pending. They are not premium 3D gift artwork.

## Bespoke Hibiscus gift model
- Canonical gift hibiscus-5-mgl selects assets/3d-assets/gift-models/hibiscus-model.mjs from scripts/generate-minglora-gifts.mjs.
- The source produces the standard self-contained glTF 2.0 asset at public/assets/gifts/catalog/hibiscus-5-mgl.gltf; the existing LIVE/model-viewer loader and SVG fallback remain in use.
- The model is tagged gift-hibiscus-3d-v1 and design-review-pending. No gift catalogue price, animation, transaction or server event behavior is changed.

## Named glTF provenance in the generated LIVE asset manifest
- The asset manifest reads named source metadata from each generated glTF asset's extras. Rose, Hibiscus, Djembe Master and Palm Breeze are now recorded as gift-specific repository mesh sources with their asset ID, source file, art direction and review status.
- Generic gift models remain identified as generated procedural meshes. The manifest records the presence of named mesh sources separately from premium/high-detail approval; both remain false until human visual review and rights review pass.
- Regression tests cover both named models and ensure their design-review-pending status is not misreported as production approval.

## Transparent per-gift icon integration — 2026-11-14

- `scripts/generate-minglora-gifts.mjs` now emits a primary SVG, a subject-only transparent SVG icon, and the existing glTF model for each canonical gift record. The icon path is `public/assets/gifts/catalog/<code>-icon.svg`.
- `scripts/generate-minglora-live-asset-manifest.mjs` records icon path, format, dimensions, transparency, SHA-256, provenance, component usage and review/licensing status.
- `public/gifts.js` uses the icon in Gift Center catalogue cards while retaining the full primary artwork/model in the selected preview. `public/app.js` uses the same icon in the LIVE gift grid and renders an accessible status fallback if the image fails to load.
- The existing image-request caching strategy handles SVG image requests. `public/index.html` versions the changed bundles; `public/sw.js` advances the shell to v307 and precaches the current app/gifts scripts.
- The existing `prestart` generator chain creates the assets and manifest on application startup. This branch has not been deployed to a live Render service.


## Bespoke Djembe Master gift model integration — 2026-11-14

- Canonical gift code `djembe-master-1v3jzkm` selects `assets/3d-assets/gift-models/djembe-model.mjs` in `scripts/generate-minglora-gifts.mjs`.
- The build emits `public/assets/gifts/catalog/djembe-master-1v3jzkm.gltf` as a self-contained glTF 2.0 model and `djembe-master-1v3jzkm.svg` as bespoke original subject artwork. Existing Gift Center and LIVE gift picker components continue to consume the canonical generated asset URLs.
- Model provenance is `gift-djembe-3d-v1`; the runtime model viewer/fallback path is unchanged.
- PR #339 merged at `6daf3cf23867b229168819aa0adae146cae23fc2`. The source branch passed repository CI (including asset generation, manifest validation and tests) and LIVE/MeetWave layout QA before merge.
- No production offering, gift price, active flag, transaction or payout was modified. Art review, rights clearance, physical device QA and production-host verification remain outstanding.


## Bespoke Palm Breeze gift model integration — 2026-11-14

- Canonical gift code `palm-breeze-gknyt0` selects `assets/3d-assets/gift-models/palm-breeze-model.mjs` in `scripts/generate-minglora-gifts.mjs`.
- The build emits a self-contained glTF 2.0 model and subject-specific transparent SVG artwork at the canonical gift paths. The source contains grouped pinnate leaf meshes, curved trunk, coconuts and an island plinth; the existing LIVE model viewer and fallback remain unchanged.
- Repeated leaves/veins are batched by material to reduce primitive count. Source provenance is `gift-palm-breeze-3d-v1` and its review state remains `design-review-pending`.
- PR #340 merged as `976e4293d2bbe68b7ad4006dea41d21107097e23` after CI asset generation, automated tests and LIVE/MeetWave layout QA passed.
- No production offering, gift price, active flag, transaction or payout was modified. Art/rights review, physical-device QA and production-host verification remain outstanding.


## Djembe and Palm Breeze sound integration — 2026-11-14

- `public/gift-effects.js` now recognizes the exact canonical gift codes `djembe-master-1v3jzkm` and `palm-breeze-gknyt0` inside the existing `play(gift)` function.
- Djembe uses a seeded local noise buffer with a low drum pitch-drop envelope and a rim accent. Palm Breeze uses a seeded filtered-noise breeze and three sine chime tones. Sound starts when the existing `MingloraGiftFX.mount` creates the associated visual gift effect; `options.sound === false` remains authoritative.
- Unrecognized gifts continue through the prior category/seed-based oscillator synthesis, with no remote audio request or new third-party dependency.
- `scripts/generate-minglora-live-asset-manifest.mjs` adds design IDs and synthesized-layer provenance for those two records. The manifest explicitly does not claim a mastered audio file: `audio_file` is null and the mastered file count is zero.
- PR #341 (`81764826f74975ac17bd9f9e1c67c0fc72527216`) merged after full CI and LIVE/MeetWave visual QA passed. Cross-device audio latency/mixing and human audio review are still not complete.


## Djembe and Palm Breeze visual choreography integration — 2026-11-14

- `public/gift-effects.js` now selects `djembe-strike` for `djembe-master-1v3jzkm` and `palm-canopy-sway` for `palm-breeze-gknyt0` at the visual model/image animation trigger.
- Djembe keyframes create a compact strike/recoil/settle sequence. Palm Breeze keyframes create a gentle alternating canopy sway. Other gifts continue through the pre-existing category/gift motion presets.
- Visual choreography, corresponding synthesized Web Audio, existing duration clamping, `sound:false` opt-out and reduced-motion handling share the original LIVE gift effect lifecycle; no second animation runtime was introduced.
- PR #342 merged as `ab2939e27378d8f02a8dd1a92172105463d6dbd4`; full tests and Chromium layout QA passed before merge.
- These are runtime Web Animations only. GLTF animation channels, Rive/Lottie libraries, recorded video/sprite fallback assets and physical-device validation remain outstanding.


## Gamer Otter bespoke gift integration — 2026-11-14

| Integration point | Implementation |
|---|---|
| Catalogue identity | Existing canonical record `gamer-otter-100-mgl`; its category, activity state and 100-Coin catalogue value are unchanged. |
| 3D model source | `assets/3d-assets/gift-models/gamer-otter-model.mjs`, routed in `scripts/generate-minglora-gifts.mjs` by exact gift code; prestart gift generation emits the canonical GLTF path. |
| Primary artwork and icon | A subject-specific `gamer-otter-original-v1` SVG branch is used by the same catalogue generator for the primary artwork and transparent icon. |
| Animation | `gamer-otter-cheer` is selected from the existing effect runtime's exact-code override and runs on the existing gift mount event. |
| Sound | `playGamerOtter` synthesizes an arcade arpeggio and low thump locally through Web Audio; the existing sound opt-out remains active. |

The asset is wired into the existing generated catalogue/preview/sent-gift pipeline; no new endpoint, catalogue price, wallet event or database offering is introduced. Design/right clearance and renderer/device QA are not approved by source integration alone.


## LIVE Island bespoke artwork and effect integration — 2026-11-14

| Integration point | Implementation |
|---|---|
| Canonical catalogue | Existing `live-island-rmn3mc` record (nature, 10 Coins, active); identity and economics unchanged. |
| 3D source | `assets/3d-assets/gift-models/live-island-model.mjs`, exact-code route in `scripts/generate-minglora-gifts.mjs`; emits the canonical self-contained GLTF path. |
| Vector assets | Exact-name SVG branch emits `live-island-original-v1` to the existing primary artwork and transparent icon paths. |
| Animation | `island-tide` exact-code override in `public/gift-effects.js`; runs through the existing server-confirmed LIVE gift mount. |
| Sound | `playLiveIsland` local filtered surf and soft tonal chimes; inventory ID `live-island-tide-and-chime-v1`. |
| Cache | `public/index.html` references `gift-effects.js?v=20261114-live-island-tide-1`; `public/sw.js` shell cache advances to v309 and precaches the matching bundle. |

No new API, DB row, wallet transaction, payout or catalogue record is introduced. Artwork/rights acceptance and physical device QA remain unverified.


## Crystal Crown bespoke artwork and effect integration — 2026-11-14

| Integration point | Implementation |
|---|---|
| Canonical catalogue | Existing `crystal-crown-1itryeu` record (luxury, 2,000 Coins, active); unchanged. |
| 3D source | `assets/3d-assets/gift-models/crystal-crown-model.mjs`, exact-code route in `scripts/generate-minglora-gifts.mjs`; existing generator emits the canonical GLTF. |
| Vector artwork | Exact-name SVG branch emits `crystal-crown-original-v1` primary art and transparent icon. |
| Animation | `crown-lustre` exact-code override runs on the existing LIVE gift mount. |
| Sound | `playCrystalCrown` local five-tone chime and filtered shimmer; manifest ID `crystal-crown-royal-glass-chime-v1`. |
| Cache | `public/index.html` and `public/sw.js` reference `gift-effects.js?v=20261114-crystal-crown-royal-chime-1`; service-worker shell cache advances to v310. |

This adds no catalogue row, database offering, price edit, wallet/ledger event or payout. Art and rights acceptance and physical-device QA remain open.


## Phoenix bespoke firebird integration — 2026-11-14

| Integration point | Implementation |
|---|---|
| Canonical catalogue | Existing `phoenix-wep6uk` item (animals, 25,999 Coins, active), unchanged. |
| 3D source | `assets/3d-assets/gift-models/phoenix-model.mjs`, imported and routed by exact code in `scripts/generate-minglora-gifts.mjs`. |
| Vector art | `phoenix-original-v1` SVG art and transparent icon emitted by the existing generator. |
| Animation | `phoenix-rise` exact-code override on the existing LIVE gift mount. |
| Sound | `playPhoenix` local filtered flame swell and ascending firebird tones; manifest ID `phoenix-flame-rise-and-ember-choir-v1`. |
| Cache | HTML and service worker now use `gift-effects.js?v=20261114-phoenix-rise-1`; service-worker shell cache advances to v311. |

No new catalogue row, database gift offering, Coin-price change, wallet/ledger event, payout or AI runtime change is introduced. Art/rights review and physical-device QA remain open.


## Beach Maracas bespoke art/effect integration — 2026-11-14

| Integration point | Implementation |
|---|---|
| Canonical catalogue | Existing `beach-maracas-1exxoag` record (music, 349 Coins, active), unchanged. |
| 3D source | `assets/3d-assets/gift-models/beach-maracas-model.mjs`, imported and routed by exact gift code in `scripts/generate-minglora-gifts.mjs`. |
| Vector art | `beach-maracas-original-v1` subject SVG and transparent icon emitted by existing generation pipeline. |
| Animation | `maraca-rhythm` exact-code override, triggered by the existing LIVE gift mount. |
| Sound | `playBeachMaracas` locally synthesized shaker pulses and tonal accents; manifest ID `beach-maracas-caribbean-shaker-rhythm-v1`. |
| Cache | HTML and service worker use `gift-effects.js?v=20261114-beach-maracas-rhythm-1`; shell cache advances to v312. |

No catalogue record, Coin value, wallet, transaction, payout or database offer is changed. Rights/art approval and physical-device QA remain open.


## Bespoke gift motion-index routing — 2026-11-14

`scripts/generate-live-gift-motion-index.mjs` now includes an exact gift-code-to-runtime-preset map for Djembe Master, Palm Breeze, Gamer Otter, LIVE Island, Crystal Crown, Phoenix and Beach Maracas. This makes the generated `catalog-motion-index.json` and asset manifest carry the same preset IDs as the runtime's exact-code overrides. The catalogue's canonical animation and sound identifiers remain unchanged. Unit tests assert generated index and manifest parity.


The motion-index schema keeps the original `catalog_motion_preset` and the effective `motion_preset` as separate fields. The asset manifest carries `gift_specific_motion_override` so consumers and reviewers can distinguish catalog defaults from exact-code choreography. Strict validation now compares the canonical field to the source gift row while allowing an explicit runtime override.


## Royal Lions Scepter bespoke asset integration — 2026-11-15

- Canonical source item: `royal-lions-scepter-15000-mgl` (Royal Lions Scepter); the source catalogue's fantasy category, configured 15,000-Coin value, existing `grand-entry` animation and sound mapping are retained.
- The build-time generator routes that exact gift code to `assets/3d-assets/gift-models/royal-lions-scepter-model.mjs`, producing the canonical GLTF path alongside the `royal-lions-scepter-original-v1` primary SVG and transparent icon.
- Gift Studio and LIVE continue to use the existing canonical asset paths, 3D preview loader, SVG fallback and server-confirmed gift event path. No new gift event or transaction route is introduced.
- The manifest/test suite records the bespoke source as design-review-pending and verifies the source identity, model geometry and SVG artwork. Rights/human visual review and physical-device QA are not claimed.


## Royal Lions Scepter LIVE event motion/audio — 2026-11-15

- Canonical source catalogue animation fields remain grand-entry, the existing animation key and 1,900-ms duration; the runtime does not rewrite them.
- scripts/generate-live-gift-motion-index.mjs maps exact code royal-lions-scepter-15000-mgl to effective lion-scepter-rise. The generated motion index retains both the canonical catalogue preset and effective override.
- public/gift-effects.js selects the same exact-code visual motion at the existing model element's Web Animations trigger. The normal gift mount and prefers-reduced-motion handling remain authoritative.
- The same server-confirmed gift mount reaches playRoyalLionsScepter through the existing sound dispatch. It synthesizes a filtered growl sweep, low impact, five-note ceremonial fanfare and high-frequency jewel shimmer using Web Audio.
- The asset manifest records royal-lions-scepter-roar-and-regal-fanfare-v1 as gift-specific synthesis, not mastered audio. Sound opt-out remains respected. HTML references gift-effects.js?v=20261115-royal-lions-scepter-rise-1; service-worker shell v318 caches that exact version.
- No API, production catalogue row, Coin price, wallet, transaction, payout or production activation is changed by this event-effect integration.


## Baseball bespoke LIVE asset integration — 2026-11-15

- Canonical source record: `baseball-orcdx9`; name `Baseball`; category `sports`; source Coin value `1`; source active flag `true`. These catalogue fields are asserted by tests and are not changed.
- 3D source: `assets/3d-assets/gift-models/baseball-model.mjs`; exact-code route in `scripts/generate-minglora-gifts.mjs`.
- Generated model: `public/assets/gifts/catalog/baseball-orcdx9.gltf`, self-contained glTF 2.0 with embedded geometry buffers, named leather/seam/stitch mesh parts and PBR material factors.
- Original artwork: the generator emits `baseball-original-v1` into both `baseball-orcdx9.svg` and the transparent `baseball-orcdx9-icon.svg`; both retain canonical per-gift path conventions.
- Runtime: the existing gift viewer consumes the canonical generated `.gltf` path; no new renderer, third-party brand asset, transaction route or backend data mutation is introduced.
- The updated isolated Chromium matrix includes 13 bespoke models at desktop (1280×900), tablet (768×1024) and mobile (390×844) sizes: 39 model/viewport renders. PR #411 workflow run 43779388045 passed all 39 model renders and 39 non-empty pixel checks and uploaded 39 screenshots; zero page errors, HTTP failures, request failures or cancellations were recorded.
- Release boundary: the asset remains `design-review-pending`; production catalogue version-3 approval, rights review, human artwork sign-off and physical-device testing remain separate gates.


## Crocodile exact-code runtime mapping — 2026-11-16

- Source module: `assets/3d-assets/gift-models/crocodile-model.mjs`.
- Model route: `scripts/generate-minglora-gifts.mjs` maps only `crocodile-tnyf2j` to `createCrocodileModel()` and the original `crocodile-original-v1` vector artwork.
- Output paths: `public/assets/gifts/catalog/crocodile-tnyf2j.gltf`, `crocodile-tnyf2j.svg`, `crocodile-tnyf2j-icon.svg`.
- Runtime: `public/gift-effects.js` maps the exact code to the custom synthesized sound and snap visual entrance. Catalogue category, 10-Coin source value and active flag are preserved.
- QA: **PASS** — PR #411 run 43781000444 rendered 14 bespoke models across desktop/tablet/mobile: 42/42 model and pixel checks, 42 screenshots, zero page errors, HTTP failures, request failures or cancellations. Artifact 14188617258.


## Crocodile exact-code integration and verified QA — 2026-11-16

- Source: `assets/3d-assets/gift-models/crocodile-model.mjs`; canonical code `crocodile-tnyf2j`, unchanged source value 10 Coins and `active=true`.
- Generator: exact import and routes for the unique glTF model and `crocodile-original-v1` main SVG / transparent icon.
- Runtime: `public/gift-effects.js` selects `crocodile-snap` and local synthesized rumble/snap audio only for this canonical gift code.
- Output: `public/assets/gifts/catalog/crocodile-tnyf2j.gltf`, `crocodile-tnyf2j.svg`, `crocodile-tnyf2j-icon.svg`.
- Acceptance: source-specific unit test passed; 14-model/3-viewport Chromium job passed 42/42 model and pixel checks; layout visual QA passed. Human art/rights and physical-device review remain open.


## Carnival Music bespoke LIVE gift model — 2026-11-16

- Canonical source record: `carnival-music-14x4zts` (Carnival Music; music; configured 999 Coins). No catalogue, Coin, active-state or transaction mutation is included.
- Source model: `assets/3d-assets/gift-models/carnival-music-model.mjs`, selected only for the exact canonical code by `scripts/generate-minglora-gifts.mjs`.
- Artwork: original `carnival-music-original-v1` primary SVG and transparent icon are generated by the same canonical builder.
- Runtime paths: `/assets/gifts/catalog/carnival-music-14x4zts.svg`, `-icon.svg` and `.gltf`; existing Gift Center, LIVE picker and model viewer continue to consume canonical generated paths.
- Motion/audio: existing `grand-entry` Web Animations preset and synthesized music-category sound are reused. No standalone animation file or mastered recording is claimed.
- Quality gate: `design-review-pending`; human design/rights review and physical-device QA remain pending.


### Carnival Music Chromium evidence

- Code commit: `e66f2e9d031b8656f87092f66dad418a623feef1`.
- Chromium/WebGL matrix: 15 models × 3 viewports = **45/45 model renders and 45/45 non-empty pixel checks**.
- Failures: `page_errors=0`, `http_failures=0`, `request_failures=0`.
- GitHub Actions run `43787366815`; uploaded evidence artifact ID `14190154120`.
- Scope is simulated Chromium rendering only; legal/design acceptance and physical-device validation remain open.


## Toucan original LIVE gift integration — 2026-11-16
- Canonical item: Toucan (`toucan-1ovzxjb`, animals). Source module: `assets/3d-assets/gift-models/toucan-model.mjs`; generated outputs use the existing canonical `/assets/gifts/catalog/<code>.svg`, `-icon.svg` and `.gltf` paths.
- `scripts/generate-minglora-gifts.mjs` routes the exact code to the bespoke mesh/artwork builder. `public/gift-effects.js` provides `toucan-glide` motion and the locally synthesized three-chirp/rustle sound cue; catalogue price, active state and LIVE gift transaction handling are unchanged.
- Verification: the complete 1,748-record asset build passed; dedicated Toucan tests passed in CI; current 16-source Chromium/WebGL run `43789909388` passed 48/48 render and 48/48 pixel checks, with 48 screenshots and no page/network failures (artifact `14192111910`).
- Review state: `design-review-pending`; human visual/rights approval, mastered audio and physical-device testing are not inferred.


## Signature Jet production asset integration — 2026-11-16
- Canonical catalogue item `signature-jet-exds0m` remains a 4,888-Coin active source row; the catalogue, transaction handlers, wallet or balances were not changed.
- `scripts/generate-minglora-gifts.mjs` imports `createSignatureJetModel()` and emits original `signature-jet-original-v1` artwork plus the transparent gift icon. `assets/3d-assets/gift-models/signature-jet-model.mjs` serializes the separately named PBR aircraft meshes to the canonical GLTF path.
- `scripts/generate-live-gift-motion-index.mjs` maps only the exact Signature Jet code to `signature-jet-flight`; `public/gift-effects.js` wires the same code to that animation and to the local `playSignatureJet` Web Audio route. `scripts/generate-minglora-live-asset-manifest.mjs` records its dedicated synthesized sound profile.
- Review state stays `design-review-pending`; visual/rights review, mastered audio, physical-device validation and release approval are not claimed.


## Signature Jet verified integration and render evidence — 2026-11-16
- All paths are exact-code keyed to `signature-jet-exds0m`: generator import and self-contained GLTF model, original SVG/icon generation, model-specific `signature-jet-flight` motion-index override, `public/gift-effects.js` animation/sound route and dedicated sound-manifest record.
- Generated-assets CI and the dedicated Signature Jet model/source tests pass. E2E renderer matrix includes the canonical gift on desktop/tablet/mobile: **51/51 renders, 51/51 pixel checks and 51 screenshots**, zero page/network failures or cancellations (run `43794849282`, artifact `14193698895`).
- The overall repository CI still has five existing failures on main (API startup, League settlement, Home Stories, League bands and region-separated rankings); 1,246/1,251 passed, including all new LIVE asset tests.
- Quality/release limits remain explicit: human art/rights approval, mastered recording, high-resolution KTX2/GLTF animation work, physical-device QA and production deployment are not complete; review status remains `design-review-pending`.
