# Minglora LIVE — Asset Integration Map

| App area | Existing implementation | Asset/resource path |
|---|---|---|
| LIVE room shell | `public/app.js` plus room CSS | `public/live-tiktok-compact.css`, `public/live-room-compact.css`, `public/live-room-fit.css` |
| LIVE gift browser | `public/app.js`, paginated category/search tools | `public/live-gift-access.css` |
| Gift Studio | `public/gifts.js` | `data/minglora-gift-catalog.json`, `/assets/gifts/catalog/<code>.svg`, `<code>.gltf` |
| Gift playback and preview | `public/gift-effects.js`, `window.MingloraGiftFX` | SVG/GLTF paths and `catalog-motion-index.json` |
| Gift motion profiles | New generator in this branch | `scripts/generate-live-gift-motion-index.mjs` → `public/assets/animations/gifts/catalog-motion-index.json` |
| Gift sounds | Web Audio in `public/gift-effects.js`; separate sound-library generator | gift sound preset metadata; `scripts/generate-minglora-sound-library.mjs` for the separate 120-cue Sound Studio pack |
| Navigation icons | Shared symbol sheet | `public/assets/icons/navigation-3d.svg` |
| LIVE control icons | `liveControlIcon()` and `updateLiveControlButton()` in `public/app.js`; existing room click handlers are unchanged | `/assets/icons/live-control-icons.svg#<allowlisted-symbol>`; service-worker precache entry |
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


## LIVE dock icon delivery

The dedicated 16-symbol sprite is loaded through external SVG `<use>` references from the same-origin application asset path. The icon key is checked against a fixed allowlist before a fragment URL is constructed. `public/index.html` versions the updated application script, while `public/sw.js` uses shell cache v302 and precaches the sprite. No new runtime dependency or server endpoint is introduced.


## Separate animation asset files

| Layer | Source | Runtime location | Integration |
|---|---|---|---|
| Animation definitions | `assets/animations/gifts/animation-catalog.json` | `public/assets/animations/gifts/presets/*.json` | `loadMotionPresetAssets()` in `public/gift-effects.js` |
| Preset manifest | Deterministic generator | `public/assets/animations/gifts/preset-index.json` | Runtime fetch; service-worker cache |
| Per-gift binding | `data/minglora-gift-catalog.json` | `catalog-motion-index.json` | `withCatalogMotion()` retains exact gift-code mapping |
| Source art/model/audio | `assets/gift-assets/` | Approved runtime export paths remain a separate release step | Rights register and asset register |

The loader validates exact same-origin preset paths. Existing inline choreography remains the fallback. Build command: `npm run build:live-gift-animations`.
