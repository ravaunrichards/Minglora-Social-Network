# Minglora LIVE — Asset Integration Map

| App area | Existing implementation | Asset/resource path |
|---|---|---|
| LIVE room shell | `public/app.js` plus room CSS | `public/live-tiktok-compact.css`, `public/live-room-compact.css`, `public/live-room-fit.css` |
| LIVE gift browser | `public/app.js`, paginated category/search tools | `public/live-gift-access.css` |
| LIVE Goody Bag / Treasure Box cards | `renderLiveRewardDrops()` in `public/app.js` | `/assets/icons/live-reward-icons.svg#goody-bag`, `/assets/icons/live-reward-icons.svg#treasure-box`; precached in `public/sw.js` |
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

The dedicated 16-symbol sprite is loaded through external SVG `<use>` references from the same-origin application asset path. The icon key is checked against a fixed allowlist before a fragment URL is constructed. `public/index.html` versions the updated application script, while `public/sw.js` uses the latest shell cache and precaches the sprite. No new runtime dependency or server endpoint is introduced.


## Separate animation asset files

| Layer | Source | Runtime location | Integration |
|---|---|---|---|
| Animation definitions | `assets/animations/gifts/animation-catalog.json` | `public/assets/animations/gifts/presets/*.json` | `loadMotionPresetAssets()` in `public/gift-effects.js` |
| Preset manifest | Deterministic generator | `public/assets/animations/gifts/preset-index.json` | Runtime fetch; service-worker cache |
| Per-gift binding | `data/minglora-gift-catalog.json` | `catalog-motion-index.json` | `withCatalogMotion()` retains exact gift-code mapping |
| Source art/model/audio | `assets/gift-assets/` | Approved runtime export paths remain a separate release step | Rights register and asset register |

The loader validates exact same-origin preset paths. Existing inline choreography remains the fallback. Build command: `npm run build:live-gift-animations`.


## Individual gift motion file integration

`scripts/generate-live-gift-motion-index.mjs` now creates `public/assets/animations/gifts/per-gift/<gift-code>.json` for every active canonical gift and adds an exact local `motion_asset_url` to `catalog-motion-index.json`. `public/gift-effects.js` lazy-loads and validates the matching file when a gift is previewed or played, then applies the unique keyframes to the existing gift image/model. If the file is unavailable or invalid, the runtime falls back to the existing shared preset choreography. The files are deliberately not all precached, avoiding a large initial LIVE room download.


## Gift record copy/export

`public/gifts.js` exposes copy actions for the currently selected complete catalogue record, the full set of records returned by the actual `/coins/catalog` API, and the saved `public/gift-system-requirements.md` notes. JSON copy preserves fields supplied by the backend and does not invent absent descriptions, prices, IDs or metadata. Clipboard API is preferred, with a text-area fallback for browsers that do not provide Clipboard API. The app script query and service-worker shell cache have been advanced together; the requirements file is included in the offline shell cache.


## Full-artwork display and delivery gate — 2026-11-13

Gift Studio and LIVE gift cards use canonical local artwork/model URLs only. Gift Studio thumbnails use `object-fit: contain`; LIVE already uses full-fit containment, and the animation overlay layer is also contained. Artwork failure marks the gift unavailable in the current picker, removes its visible preview, and disables send. LIVE verifies the source artwork image has loaded with non-zero intrinsic dimensions before enabling the send action. These client-side display gates do not delete or rewrite catalogue rows, names, coin prices, gift IDs, active flags, wallet records or transactions. The full backend gift list remains available for faithful record copy/export.

HTML app/style/gift asset references and the service-worker shell cache were advanced together: app/gifts use `20261113-complete-gift-artwork-gate-1`, styles use `20261113-gift-artwork-contain-1`, and the shell cache is v305.


## Original LIVE reward-drop artwork

The room's Goody Bag and Treasure Box reward cards and the empty reward state now use two separate Minglora-authored SVG symbols from `public/assets/icons/live-reward-icons.svg`. The vector artwork uses original shapes, gradients and highlight/shadow detail; it is a lightweight UI illustration, not a 3D model or rendered cinematic gift. The service worker precaches the sprite, and the LIVE renderer references the two explicit symbol IDs.

The change is presentation-only. Reward-drop creation, wallet funding, escrow, participant entry, claims, settlement, refunds, and audit ledger paths are unchanged.
