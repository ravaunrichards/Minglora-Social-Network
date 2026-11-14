# Minglora LIVE — Asset Inventory

**Audit date:** 2026-11-14

## Existing source and production assets

| Location | Observed state | Production interpretation |
|---|---|---|
| `assets/reference/` | 1,121 images (Android + desktop TikTok/Facebook) | Read-only design references |
| `assets/Gifts/` | 131 capture PNGs plus 1 reference-sheet JPEG (132 image files total) | Read-only source captures |
| `assets/Artwork/` | 1,509 extracted PNG records | Review-only, not cleared for production |
| `assets/Guests Layout/` | 9 JPEG layout diagrams | Read-only layout references; all 9 individually visually inspected |
| `assets/Gifters Badge Levels/` | 71 images (53 PNG, 18 JPEG) | Badge/level source references; full visual and rights review pending |
| `assets/League/` | 20 JPEG reference captures | League/rules references; full visual review pending |
| `public/assets/gifts/` | 45 standalone original Minglora GLTF models | Existing original gift models; retained |
| `data/minglora-gift-catalog.json` | 1,748 gift rows; 1,737 active and 11 retired | Canonical catalogue metadata and configured coin values |
| `scripts/generate-minglora-gifts.mjs` | Generates one SVG and one GLTF per catalogue row | Build/start-time asset pipeline |
| `public/gift-effects.js` | 3D viewer, subject motion, particle overlays, Web Audio | Shared Gift Studio/LIVE effects runtime |
| `public/live-gift-access.css` | Search, category chips, previews and responsive gift grid | LIVE gift picker layout |
| `public/live-tiktok-compact.css` | Compact room shell and responsive stage/chat treatment | LIVE room presentation layer |
| `public/assets/icons/navigation-3d.svg` | One SVG sprite with 53 named symbols | Shared navigation/app icon source; not a complete individually exported LIVE icon/state pack |
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

## LIVE reference and guest layout mapping

The nine files in `assets/Guests Layout/` map to seven host-selectable screen layouts (`full-screen`, `fluid-panel`, `fluid-grid`, `fixed-grid`, `fixed-panel`, `side-by-side`, `spotlight`) and two independently persisted guest-box layouts (`roundtable-1`, `roundtable-2`). See `reports/REFERENCE_ASSET_AUDIT.md` for the individual reference-to-layout mapping and the corrected desktop LIVE screenshot attribution.

## LIVE interface resources already wired

- `public/index.html` includes the LIVE room CSS, gift-access CSS, `gift-effects.js` and `gifts.js`.
- `public/app.js` loads the motion index through the gift runtime.
- `public/sw.js` pre-caches `/assets/animations/gifts/catalog-motion-index.json`.
- The LIVE layout code already supports the nine saved screen-layout identifiers validated by `tests/unit/live-layout-panels.test.js`.
- Gift picker CSS includes category selection, search, sort, preview, paginated grid and responsive 3-column/2-column small-phone rules.

## Asset types not found as complete production libraries

The inspected `assets/animations/` directory had only a README before this branch. The existing app animation implementation is JavaScript/CSS/Web Animations; no populated Lottie or Rive collection was found there. No gift GLTF animation channels, KTX2 texture pack or per-gift recorded audio pack were verified. Do not imply these formats or packs are complete.

## Generated transparent vector icon pack — 2026-11-14

The build-time gift generator now creates the following files in addition to the original labelled poster and GLTF assets:

- 1,748 per-gift SVG icons at `public/assets/gifts/catalog/<code>-icon.svg`.
- 18 category SVG icons at `public/assets/gifts/categories/<category>.svg`.
- A version-3 catalogue build stamp that records separate poster, gift-icon, category-icon and GLTF counts.

The separate icon SVGs omit the poster's full-canvas background rectangle and poster label. This is a structural SVG transparency check; it does not claim pixel-alpha auditing of raster artwork, premium 3D quality, or human licensing approval. CI is responsible for producing and verifying the generated files before they are called complete.
