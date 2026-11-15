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


## Phoenix bespoke firebird gift — 2026-11-14

| Source | Canonical item | Generated output | Integration / acceptance |
|---|---|---|---|
| `assets/3d-assets/gift-models/phoenix-model.mjs` | Phoenix (`phoenix-wep6uk`, animals; existing value 25,999 Coins) | Self-contained glTF 2.0 firebird with body/neck/head, flame crest, layered coverts, separate primary flight feathers, comet-tail fan, talons and ember motes. Subject-specific SVG and transparent icon carry `phoenix-original-v1`. | Exact-code generator, Phoenix-rise motion and local synthesized flame/chime sound. Design and rights review pending. |

Canonical name, code, animals category, active flag and 25,999-Coin value are reused without mutation. Source provenance is `gift-phoenix-3d-v1`; review state remains `design-review-pending`.


## Beach Maracas bespoke Caribbean music gift — 2026-11-14

| Source | Canonical item | Generated output | Integration / acceptance |
|---|---|---|---|
| `assets/3d-assets/gift-models/beach-maracas-model.mjs` | Beach Maracas (`beach-maracas-1exxoag`, music; existing value 349 Coins) | Self-contained glTF 2.0 crossed gourd-shaker pair in distinct coral and lagoon palettes, hardwood handles, woven grip bands, painted seed motifs, sunburst details and conch charm. Matching subject-specific SVG and transparent icon carry `beach-maracas-original-v1`. | Exact-code generator, alternating maraca-rhythm motion and dedicated synthesized shaker/tonal sound. Human visual and rights review pending. |

The canonical gift name, code, music category, active flag and 349-Coin value are reused without mutation. Source ID is `gift-beach-maracas-3d-v1`; review state remains `design-review-pending`.
## Legacy standalone glTF gift-model inventory — 2026-11-15

A machine-readable integrity inventory is now maintained at `assets/manifests/legacy-live-gift-models.json`.

- **45** repository-tracked standalone glTF files are retained under `public/assets/gifts/` (**676,631 bytes total**).
- Each record includes the repository/public path, byte size and Git blob SHA-1. The hash field is explicitly identified as Git's SHA-1 object identifier, not SHA-256.
- `tests/unit/legacy-live-gift-model-inventory.test.js` verifies manifest uniqueness, file presence, byte sizes, Git blob hashes and core glTF 2.0 scene/mesh/buffer structure.
- These are **legacy source assets**, not a production-ready gift catalogue. Catalogue identity mapping, visual review, technical render review and rights review remain pending for every item. The inventory intentionally records `production_eligible: false`; no LIVE runtime route, catalogue row, gift price or transaction was changed.
- Reuse requires matching each model to a canonical gift code, visually inspecting the rendered asset, checking the actual runtime fallback/animation path and documenting rights/provenance before release.
## Historical identity reconciliation for legacy standalone gift models — 2026-11-15

The 45 standalone glTF files have now been traced back to their original catalogue identities in the migration history:

- **45/45 unique model files** map to **45/45 unique historical gift codes**.
- **38** mappings originate from explicit gift `INSERT` rows across migrations 021, 023, 024 and 025. Their names, source categories, animation keys/presets, historical seed coin values and sort order are recorded as historical provenance only.
- **7** base-catalogue models are mapped by the `model_url CASE` in migration 021 (`rose`, `heart`, `coffee`, `party`, `trophy`, `lion`, and `universe`). That migration does not provide the gift name/category/price fields for those seven, so those fields are intentionally left unknown here.
- A read-only query against the connected Minglora Supabase `public.live_gift_catalog` on 2026-11-15 returned **zero rows** for these 45 historical codes. None is currently confirmed as a production gift in that snapshot.
- The manifest records exact source migration paths and a conservative production status. Historical seed Coin values are **not current prices** and must not be reused for publication or gifting.

The reconciliation test reads the source migrations and verifies that each model path resolves to the exact historical code or INSERT row. It does not modify or reactivate catalogue records.
## Technical structure audit of the 45 legacy GLTF models — 2026-11-15

The individual structural profile for each file is recorded in `assets/manifests/legacy-live-gift-models.json` and is checked against the source GLTF document by the unit suite.

- 45/45 declare glTF 2.0, with scene mesh geometry and one buffer each.
- Combined geometry inventory: **531 meshes**, **342 nodes**, **196 materials**, and **394,992 buffer bytes**.
- 0/45 contain texture files, image files or embedded animation channels. These models are static mesh packages; current room/gift animation must come from the separate application effect runtime, not from GLTF animation tracks.
- 38/45 expose at least one position accessor with min/max bounds; 7/45 do not expose these bounds. The recorded values are accessor-local only. Node transforms have not been applied, so world-space dimensions and final presentation scale remain unverified.
- This is a structural audit, not a visual-render, PBR-material, performance or artistic-quality approval.

## Legacy standalone glTF structural audit — 2026-11-15

All **45** retained standalone gift models in `public/assets/gifts/` were inspected against their embedded float32 vertex data and their technical profiles reconciled.

- **45/45** documents parse as glTF 2.0 and contain scene mesh geometry.
- **45/45** use an embedded geometry buffer; **0** external resource URIs were found.
- **0** texture/image resources and **0** embedded glTF animation channels were found. Gift motion in the application is implemented separately from embedded model animation.
- **23 models** required correction: **7** lacked POSITION accessor bounds and **16** had existing bounds that did not match the actual vertex extrema. **42 unique POSITION accessors** were recalculated from the embedded float32 data. All **531 POSITION accessor references** are now covered by finite, three-component `min`/`max` bounds matching the stored vertices.
- Updated files: `minglora_aurora_whale.gltf`, `minglora_blue_mountain_coffee.gltf`, `minglora_christmas_lantern.gltf`, `minglora_confetti.gltf`, `minglora_cosmic_orbit.gltf`, `minglora_cricket_bat.gltf`, `minglora_diamond_basketball.gltf`, `minglora_diamond_ring.gltf`, `minglora_finger_heart.gltf`, `minglora_fireworks.gltf`, `minglora_galaxy.gltf`, `minglora_golden_microphone.gltf`, `minglora_golden_trophy.gltf`, `minglora_island_pride.gltf`, `minglora_jade_dragon.gltf`, `minglora_money_gun.gltf`, `minglora_money_rain.gltf`, `minglora_parish_pride_crest.gltf`, `minglora_perfume.gltf`, `minglora_royal_lion.gltf`, `minglora_thunder_falcon.gltf`, `minglora_tropical_sunset.gltf` and `minglora_zeus.gltf`.
- The per-model inventory now records corrected byte sizes, Git blob hashes, POSITION-reference counts and accessor-local bounds. The regression test recalculates the extrema from each embedded vertex buffer across all 45 files.

**Approval remains blocked:** these models are still production-ineligible pending canonical catalogue mapping, visual/render review and rights clearance. Structural validity is not premium artwork approval. World-space dimensions have deliberately not been guessed because node transforms have not been applied. No production gift, price, wallet, transaction or earning state was changed.
