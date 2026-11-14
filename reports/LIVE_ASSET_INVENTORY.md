## Live production catalogue reconciliation — 2026-11-14

**Read-only production verification (existing Minglora Supabase project):**
- `public.live_gift_catalog`: **97 rows total; 0 active; 97 inactive**.
- Asset versions: **87 version-1 rows and 10 version-2 rows; zero version-3 rows**.
- All 97 retained rows have image/model paths and animation key/preset/sound preset metadata, but they are retired versions and must not be re-enabled.
- The database constraint `live_gift_catalog_only_approved_assets_active_ck` permits activation only when `asset_version='3'` and both image/model paths are present.
- The deployed `minglora-runtime-state` function (ACTIVE v129) loads the production catalogue using `active=true` and `asset_version='3'`. The LIVE room and Gift Studio call `/api/coins/catalog`; the UI intentionally displays the empty-state message and does not permit sending when no published gifts are returned.
- The repository source catalogue remains separate: `data/minglora-gift-catalog.json` contains **1,748 records (1,737 marked active, 11 retired)** and its generator creates catalog SVG/GLTF outputs. Those source records are **not evidence of 1,748 live database offerings**.
- No production gift was activated, no version-1/2 row was revived, no coin price or transaction was changed, and no test gift was inserted.

**Release gate:** A version-3 publication migration must be prepared only after each candidate gift's original Minglora artwork, image/model paths, rights/attribution, coin price, animation/sound mapping and transaction compatibility have been validated. Do not bulk-copy the source catalogue or activate records solely to make the count nonzero. Until this gate is met, the empty production gift catalogue is the safe and correct runtime result.

---

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

The inspected `assets/animations/` directory had only a README before this branch. The existing app animation implementation is JavaScript/CSS/Web Animations; no populated Lottie or Rive collection was found there. No gift GLTF animation channels or KTX2 texture pack were verified. Dedicated mastered/per-gift audio files are still not present; however, Djembe Master and Palm Breeze now have individual local Web Audio synthesis designs triggered with their gift effects. Do not describe those synthesized effects as recorded/mastered audio files.

## LIVE tools shortcut icon pack — 2026-11-14

| Location | Observed state | Production interpretation |
|---|---|---|
| `public/assets/icons/live-tools/` | 12 individually addressable original SVG symbols plus `manifest.json` | Integrated icons for the existing LIVE tools drawer; 24×24 outline assets, currentColor, design review pending |

The shortcuts remain Layout, Permissions, Guests, Viewers, Fan Club, Match, Top Gifters, Gifts, Rewards, Moderators, Appearance and Devices. The existing role gates, rewards visibility gate, panel selectors and active `aria-pressed` behavior remain authoritative. The service worker cache v306 includes the new manifest and every icon.

## Gift-specific botanical model sources
| Source | Canonical item | Model art direction | Review state |
|---|---|---|---|
| assets/3d-assets/gift-models/rose-model.mjs | Rose | Layered rose petals, sepals, thorned stem, sculpted leaves and dew | Design review pending |
| assets/3d-assets/gift-models/hibiscus-model.mjs | Hibiscus (hibiscus-5-mgl) | Five cupped tropical petals, sepals, three leaves, central stamen column and pollen anthers | Design review pending; CI/build tests passed in merged PR #339 validation set |
| assets/3d-assets/gift-models/djembe-model.mjs | Djembe Master (djembe-master-1v3jzkm) | Mahogany shell, hollow bowl, hide drumhead, rim bindings, 16 tension strands, diamond lacing and carved detailing | Design review pending; CI/build tests passed in merged PR #339 |
| assets/3d-assets/gift-models/palm-breeze-model.mjs | Palm Breeze (palm-breeze-gknyt0) | Curved trunk, eight pinnate fronds, grouped leaflets and veins, coconuts, roots and sand/water plinth | Design review pending; CI/build tests passed in merged PR #340 |

These are four individually art-directed model sources. The generator still uses procedural category/name geometry for the remaining catalogue gifts; the presence of a generated GLTF file per catalogue row must not be interpreted as proof of bespoke modelling or premium approval.

## Transparent gift-icon inventory — 2026-11-14

- The canonical catalogue contains 1,748 distinct gift records. The generator now produces three separate per-record files: primary SVG artwork (`<code>.svg`), subject-only transparent SVG icon (`<code>-icon.svg`), and glTF 2.0 model (`<code>.gltf`).
- The build stamp is version 3 and reports 1,748 primary SVGs, 1,748 transparent SVG icons, and 1,748 glTF models.
- Every icon record is present in the machine-readable LIVE manifest with path, SVG format, 512×512 dimensions, transparency, generator provenance, component usage, and a pending human-review/licensing state.
- These generated files are produced by `npm run build:gifts` and the existing `prestart` script; individual generated outputs are not claimed as pre-committed source files.
- The CI run generated and then independently verified all three per-gift file sets. Production deployment still needs a separate live-host verification.


### Djembe Master model source — 2026-11-14

The canonical Djembe Master gift (djembe-master-1v3jzkm) is now routed to the individually authored assets/3d-assets/gift-models/djembe-model.mjs source. It emits a self-contained glTF 2.0 scene and gift-specific transparent SVG artwork. The merged PR #339 passed repository CI asset-generation and gift-catalogue regression tests. The model remains design-review-pending; no premium-production or physical-device approval is inferred.


### Palm Breeze model source — 2026-11-14

The canonical Palm Breeze gift (palm-breeze-gknyt0) is now routed to the individually authored assets/3d-assets/gift-models/palm-breeze-model.mjs source. It emits a self-contained glTF 2.0 scene and subject-specific transparent SVG artwork. PR #340 passed the full repository CI asset build and gift-catalogue regression tests before merge. The model remains design-review-pending; no premium-production or physical-device approval is inferred.


## Gift-specific synthesized Web Audio designs — 2026-11-14

| Gift | Sound design ID | Implementation | Recording/file status |
|---|---|---|---|
| Djembe Master (`djembe-master-1v3jzkm`) | `djembe-hand-drum-impact-v1` | Filtered noise attack, falling low drum tone and short rim accent | Synthesized locally in `public/gift-effects.js`; no dedicated WAV file/mastering |
| Palm Breeze (`palm-breeze-gknyt0`) | `palm-breeze-wind-and-chimes-v1` | Filtered breeze sweep plus three soft chime partials | Synthesized locally in `public/gift-effects.js`; no dedicated WAV file/mastering |

Both routines run from the existing gift-effect trigger and honour `options.sound === false`. The asset manifest records the exact sound design/layers and deliberately keeps `audio_file: null`, `dedicated_mastered_gift_sound: false` and the total mastered-file count at zero. Other gifts retain the existing category-level synthesized sound fallback.


## Bespoke gift motion presets — 2026-11-14

| Gift | Runtime preset | Visual sequence | Integration |
|---|---|---|---|
| Djembe Master (`djembe-master-1v3jzkm`) | `djembe-strike` | Percussive entry, hit, recoil and settle | Existing `motionElement.animate` path in `public/gift-effects.js` |
| Palm Breeze (`palm-breeze-gknyt0`) | `palm-canopy-sway` | Gentle alternating canopy sway and settle | Existing `motionElement.animate` path in `public/gift-effects.js` |

Both sequences run with the existing gift FX mount that triggers their individual Web Audio sound designs. Duration limits, cleanup and `prefers-reduced-motion` remain in force. These are code-driven Web Animations, not Lottie/Rive, GLTF animation channels or standalone video/spritesheet files. No physical-device QA is claimed.


## Gamer Otter bespoke LIVE gift source — 2026-11-14

| Source | Canonical item | Model and artwork | Integration / acceptance |
|---|---|---|---|
| `assets/3d-assets/gift-models/gamer-otter-model.mjs` | Gamer Otter (`gamer-otter-100-mgl`, animals, 100 Coins) | Original seated otter character with individually addressable body/facial meshes, headset, microphone, paws, curled tail and controller; embedded glTF 2.0 mesh buffers and PBR material factors. Matching subject-specific primary SVG and transparent icon are emitted by the existing generator. | Generator routes the exact canonical gift code; LIVE runtime adds code-specific arcade sound synthesis and a subject-specific cheer animation. Design and rights review remain pending. |

The model is authored separately from the generic animals-category geometry. The canonical catalogue code, category, active state and 100-Coin value are reused without changing catalogue pricing or production gift publication. The source carries `gift-gamer-otter-3d-v1` provenance and `design-review-pending`; it is not labelled premium-approved. The GLTF source contains no skeletal animation channels or external texture dependency. Audio is synthesized through the existing local Web Audio runtime; no mastered audio file is claimed.


## LIVE Island bespoke Caribbean-cay asset — 2026-11-14

| Source | Canonical item | Generated output | Integration / acceptance |
|---|---|---|---|
| `assets/3d-assets/gift-models/live-island-model.mjs` | LIVE Island (`live-island-rmn3mc`, nature; existing value 10 Coins) | Self-contained glTF 2.0 sculpture with lagoon/surf rings, sand cay, raised grassy headland, waterfall, three palm clusters, pavilion, canoe, branching coral, shells and beacon. Subject-specific SVG and transparent icon use `live-island-original-v1`. | Exact-code generator route and exact-code LIVE tide/surf sound route. Design and rights review remain pending. |

The catalogue name, code, nature category, 10-Coin value and active state are asserted in regression tests and left unchanged. The GLTF uses embedded geometry and PBR metallic/roughness factors; it does not include texture maps or embedded skeletal animation. Its review status is `design-review-pending`, not premium-approved.


## Crystal Crown bespoke royal gift — 2026-11-14

| Source | Canonical item | Generated output | Integration / acceptance |
|---|---|---|---|
| `assets/3d-assets/gift-models/crystal-crown-model.mjs` | Crystal Crown (`crystal-crown-1itryeu`, luxury; existing value 2,000 Coins) | Self-contained glTF 2.0 gold tiara sculpture with velvet lining, engraved band, five arched points, faceted centre/side stones, pavé accents and suspended crystal drops. Matching subject-specific SVG and transparent icon carry `crystal-crown-original-v1`. | Exact-code generator, royal shimmer animation and dedicated synthesized chime cue. Design and rights review remain pending. |

The existing canonical code, luxury category, active flag and 2,000-Coin value are reused without mutation. The source carries `gift-crystal-crown-3d-v1` provenance and `design-review-pending`; no premium-production approval is implied.
