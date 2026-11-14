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

- The LIVE room control buttons now use a dedicated SVG asset pack under `public/assets/icons/live-controls/`.
- `manifest.json` records all 16 original control symbols and their canonical paths. SVG files share a `0 0 24 24` viewBox and inherit `currentColor`, preserving existing responsive sizing and button-state styling.
- `public/app.js` references only the immutable icon allow-list; user input is never interpolated into an asset path.
- `public/sw.js` increments the shell cache version and pre-caches the manifest plus all 16 SVG files for offline LIVE controls.
- `tests/unit/live-control-icons.test.js` validates the inventory, SVG structure, safe reference logic, state inheritance and offline cache coverage.


## LIVE gift category artwork

- The dynamic gift-category chips use individually addressable SVG artwork under `public/assets/icons/live-gift-categories/` for All and all 21 current catalogue category keys.
- `manifest.json` records labels, canonical file paths, shared 24×24 viewBox, `currentColor` treatment and design-review status.
- `public/app.js` maps category keys through an immutable allow-list; unknown keys use the neutral More Gifts artwork. Existing category filtering, search, selection, favorites and price sorting remain unchanged.
- `public/live-gift-access.css` sizes the category marks consistently with the existing chips.
- The service worker uses shell cache v305 and pre-caches the category manifest and all 22 SVG files.
- `tests/unit/live-gift-category-icons.test.js` verifies manifest coverage, physical files, vector-only artwork, accessible chip markup and offline cache inclusion.
