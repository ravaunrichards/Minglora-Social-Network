# Minglora LIVE — Asset Inventory

**Audit date:** 2026-11-13

## Existing source and production assets

| Location | Observed state | Production interpretation |
|---|---|---|
| `assets/reference/` | 1,121 images (Android + desktop TikTok/Facebook) | Read-only design references |
| `assets/Gifts/` | 131 catalogue capture screenshots | Read-only source captures |
| `assets/Artwork/` | 1,509 extracted PNG records | Review-only, not cleared for production |
| `public/assets/gifts/` | 45 standalone original Minglora GLTF models | Existing original gift models; retained |
| `data/minglora-gift-catalog.json` | 1,748 gift rows; 1,737 active and 11 retired | Canonical catalogue metadata and configured coin values |
| `scripts/generate-minglora-gifts.mjs` | Generates one SVG and one GLTF per catalogue row | Build/start-time asset pipeline |
| `public/gift-effects.js` | 3D viewer, subject motion, particle overlays, Web Audio | Shared Gift Studio/LIVE effects runtime |
| `public/live-gift-access.css` | Search, category chips, previews and responsive gift grid | LIVE gift picker layout |
| `public/live-tiktok-compact.css` | Compact room shell and responsive stage/chat treatment | LIVE room presentation layer |
| `public/assets/icons/navigation-3d.svg` | One SVG symbol sheet with multiple navigation symbols | Shared icon source |
| `public/assets/icons/live-control-icons.svg` | 16 original vector symbols for current LIVE dock controls and states | Dedicated LIVE SVG sprite used by `public/app.js`; precached by the service worker |
| `public/assets/icons/minglora-push.svg` | One standalone SVG | Push/notification graphic |
| `assets/icons/`, `assets/animations/`, `assets/manifests/` | Documentation-only directories before this work | Source/design workspaces, not complete production packs |

The gift generator emits 1,748 SVGs plus 1,748 GLTF files into `public/assets/gifts/catalog/` when run. These outputs are generated during CI and the application's `prestart` lifecycle; they are not present as committed files in the audited `main` tree. The generator currently emits all catalogue rows, including retired records; only 1,737 rows are marked active.

## Existing catalogue category counts

| Category | Rows | Category | Rows |
|---|---:|---|---:|
| other | 455 | animals | 201 |
| music | 137 | food_drink | 128 |
| hearts | 115 | fantasy | 105 |
| celebrations | 83 | sports | 78 |
| community | 73 | luxury | 71 |
| nature | 57 | flowers | 55 |
| fashion_beauty | 53 | travel | 47 |
| vehicles | 44 | symbols | 25 |
| games | 18 | reactions | 3 |

These are the catalogue's actual stored categories, not the 18 conceptual categories in the user's brief. Caribbean, seasonal, fan-club, cinematic and creator-custom themes are not each represented as a distinct top-level catalogue category.

## LIVE interface resources already wired

- `public/index.html` includes the LIVE room CSS, gift-access CSS, `gift-effects.js` and `gifts.js`.
- `public/app.js` loads the motion index through the gift runtime.
- `public/sw.js` pre-caches `/assets/animations/gifts/catalog-motion-index.json`.
- The LIVE layout code already supports the nine saved screen-layout identifiers validated by `tests/unit/live-layout-panels.test.js`.
- Gift picker CSS includes category selection, search, sort, preview, paginated grid and responsive 3-column/2-column small-phone rules.

## Asset types not found as complete production libraries

The inspected `assets/animations/` directory had only a README before this branch. The existing app animation implementation is JavaScript/CSS/Web Animations; no populated Lottie or Rive collection was found there. No gift GLTF animation channels, KTX2 texture pack or per-gift recorded audio pack were verified. Do not imply these formats or packs are complete.


## Visual control asset update — 2026-11-13

The visual QA branch adds `public/assets/icons/live-control-icons.svg`, a 16-symbol original Minglora SVG sprite. The existing LIVE control renderer in `public/app.js` selects symbols from a fixed allowlist; it does not accept arbitrary fragment names. The service worker precaches the sprite, and the app script/cache version is advanced together. Existing click handlers, labels, pressed states and room role checks remain in place. This is the dedicated pack for the current LIVE dock controls, not a claim that every moderator, filter, effect, ranking, fan-club and accessibility sub-control in the broader brief is finished.


## File-based gift animation and production workspace — 2026-11-13

The follow-on branch adds the source animation catalogue at `assets/animations/gifts/animation-catalog.json`, 17 separate runtime keyframe files under `public/assets/animations/gifts/presets/`, and a preset index. The runtime loads those same-origin files and retains the existing inline choreography as a fallback. A controlled `assets/gift-assets/` workspace now separates artwork, models, audio and manifests. Its approved/source folders contain instructions only; they are not represented as completed premium assets. The 1,748-row canonical catalogue and generated SVG/GLTF build pipeline are preserved.
