# Minglora LIVE — Gift Catalogue

**Canonical source:** `data/minglora-gift-catalog.json`  
**Generated asset builder:** `scripts/generate-minglora-gifts.mjs`

## Verified catalogue totals

- Catalogue rows: **1,748**
- Active/selectable records: **1,737**
- Retired/inactive records retained in history: **11**
- Unique gift codes: validated by the existing generator and catalogue tests
- Coin price range in the configured catalogue: **1–60,999 Coins**
- Every row has a category, original animation identity, animation preset, sound preset, duration, local SVG path and local GLTF path.
- The catalog generator emits 1,748 SVG artworks and 1,748 GLTF models.

This report does not change coin pricing or activate retired items. Pricing remains sourced from the canonical catalogue and backend.

## Stored categories and mapping to the requested themes

| Stored catalogue category | Rows | Closest requested theme |
|---|---:|---|
| flowers | 55 | Flowers and Romance |
| hearts | 115 | Flowers and Romance |
| animals | 201 | Cute and Fun; Animals and Wildlife |
| community | 73 | Cute and Fun; Supporter and Fan Club themes |
| food_drink | 128 | Cute and Fun; Caribbean and Culture where source-tagged |
| fashion_beauty | 53 | Luxury and Lifestyle; Royal and VIP |
| luxury | 71 | Luxury and Lifestyle; Royal and VIP |
| vehicles | 44 | Luxury and Lifestyle; Gaming and Technology |
| sports | 78 | Sports and Achievement |
| celebrations | 83 | Celebration and Events; Seasonal |
| music | 137 | Music and Entertainment |
| games | 18 | Gaming and Technology |
| fantasy | 105 | Fantasy and Magic; Universe and Space |
| nature | 57 | Animals and Wildlife; Seasonal |
| travel | 47 | Caribbean and Culture; Cinematic themes where applicable |
| symbols | 25 | Gaming and Technology; Supporter and Fan Club themes |
| reactions | 3 | Interactive reactions |
| other | 455 | Mixed themes; requires gift-level tagging/review |

The theme mapping is editorial guidance, not a new catalogue taxonomy. Seasonal, Caribbean, exclusive/limited, cinematic, interactive, supporter/fan-club and creator-custom collections need explicit gift-level tags and review before they can be presented as distinct, complete curated collections. The current catalogue does not prove that every example in the brief has a dedicated original 3D model or animation.

## Per-gift asset contract

For each catalogue row the canonical paths are:

- SVG artwork: `/assets/gifts/catalog/<code>.svg`
- GLTF model: `/assets/gifts/catalog/<code>.gltf`
- Animation: `animation_key`, `animation_preset`, `animation_duration_ms`
- Sound profile: `sound_preset`

The generator and tests validate unique codes and animation keys, safe local paths, required metadata and price validity. The LIVE motion index introduced in this branch contains active gifts only and points at these same canonical paths.

## Rights and review

The 1,509 extracted screenshot crops in `assets/Artwork/` are explicitly marked review-only. Their extraction did not establish commercial use permission. They must not be activated as production gifts until each asset's rights/provenance is established or it is replaced by original Minglora artwork.

## Gift-specific 3D model exceptions
The generator now has **17 individually art-directed gift-specific source models**: Rose (`rose-4ieccm`), Hibiscus (`hibiscus-5-mgl`), Djembe Master (`djembe-master-1v3jzkm`), Palm Breeze (`palm-breeze-gknyt0`), Gamer Otter (`gamer-otter-100-mgl`), LIVE Island (`live-island-rmn3mc`), Crystal Crown (`crystal-crown-1itryeu`), Phoenix (`phoenix-wep6uk`), Beach Maracas (`beach-maracas-1exxoag`), Royal Lions Scepter (`royal-lions-scepter-15000-mgl`), Baseball (`baseball-orcdx9`), Maracas (`maracas-1wegi7n`), Dolphin (`dolphin-4bkejj`), Crocodile (`crocodile-tnyf2j`), Carnival Music (`carnival-music-14x4zts`), Toucan (`toucan-1ovzxjb`) and Signature Jet (`signature-jet-exds0m`). Their source modules are the corresponding `*-model.mjs` files under `assets/3d-assets/gift-models/`, including `signature-jet-model.mjs`. The canonical generator selects these models only for their exact gift codes and continues to use the shared procedural builder for the remaining **1,731 rows**. All seventeen retain `design-review-pending` status; none is premium-approved until human visual and rights review pass. The integrations preserve their canonical catalogue identities, configured values, active flags and LIVE transaction/offer logic.

## Transparent icon and full-artwork separation — 2026-11-14

- Every canonical gift retains its existing full SVG artwork and glTF model URL. A separate `icon_url` now points to `/assets/gifts/catalog/<code>-icon.svg`.
- Gift Center cards use the transparent icon; the selected gift preview continues to use the full primary artwork and 3D model. LIVE sending-grid cards use the same subject-only icon.
- Existing names, category IDs, configured coin prices, animation keys, active flags, and catalogue transactions are not changed by this visual-asset update.
- The generator and manifest now verify 1,748 per-gift icon files and record their dimensions, paths, SHA-256, provenance and review status.
- This is a scalable vector-icon pass, not a claim that all 1,748 subjects have bespoke premium 3D models or completed art direction.


## Djembe Master bespoke source — 2026-11-14

The canonical Djembe Master music gift is now linked to its own 3D source module and original vector artwork. CI validated the exact catalogue code, category, generated self-contained glTF, named PBR parts and transparent SVG art signature. The catalogue configured price, active state and backend gift/earnings logic were not changed. Human review and device QA are still required.


## Palm Breeze bespoke source — 2026-11-14

The canonical Palm Breeze nature gift now uses its own palm-tree/island glTF source and subject-specific original vector artwork. CI validated the catalogue identity, self-contained GLTF geometry, named mesh/material groups and SVG art signature. Catalogue price/status and LIVE economy logic were not changed. Human design/licensing review and device QA remain required.


## Gift-specific sound-design exceptions — 2026-11-14

- Djembe Master (`djembe-master-1v3jzkm`) uses a dedicated Web Audio design `djembe-hand-drum-impact-v1`.
- Palm Breeze (`palm-breeze-gknyt0`) uses a dedicated Web Audio design `palm-breeze-wind-and-chimes-v1`.
- Both are local synth designs triggered from the existing gift effect mount; all other gifts retain category-level sound synthesis.
- These additions do not create audio files: `audio_file` remains null and the dedicated mastered-gift-audio file count remains zero. No price, active state or economy record is modified.


## Gamer Otter bespoke artwork — 2026-11-14

- Existing catalogue record: `gamer-otter-100-mgl`, category `animals`, 100 Coins. No catalogue row, price, active flag or transaction rule is changed.
- New original source: `assets/3d-assets/gift-models/gamer-otter-model.mjs`; generated GLTF contains a seated otter character with facial details, curled tail, headset, microphone and custom controller.
- Matching transparent SVG subject artwork is emitted by `scripts/generate-minglora-gifts.mjs`; the asset is loaded using the existing canonical paths and model/SVG fallback.
- The existing LIVE event runtime selects `gamer-otter-cheer` motion and the local synthesized arcade sound by exact gift code.
- Human art review, rights review, premium approval, physical-device rendering and audio QA remain pending. Sound is synthesized; no mastered file is available or claimed.


## LIVE Island bespoke gift source — 2026-11-14

- Canonical record: `live-island-rmn3mc` / LIVE Island, nature category, 10 Coins, active. This change reuses that exact record and changes no price, publication flag, ledger event or offering.
- New model source: `assets/3d-assets/gift-models/live-island-model.mjs`; generated glTF contains a lagoon cay, surf rims, raised green headland, waterfall, three palm clusters, lit pavilion, sail canoe, coral branches, shells and LIVE beacon.
- Original matching primary vector artwork and transparent icon are generated by `scripts/generate-minglora-gifts.mjs` using the `live-island-original-v1` art signature.
- The existing LIVE event runtime selects `island-tide` animation and a filtered synthesized surf swell with four soft tonal chimes.
- Design/right review and physical-device visual/audio QA remain pending. No mastered sound file, skeletal GLTF animation or premium approval is claimed.


## Crystal Crown bespoke artwork — 2026-11-14

- Existing canonical item: `crystal-crown-1itryeu`, Crystal Crown, luxury category, active, 2,000 Coins. Its catalogue identity, value, activation state and ledger behavior are unchanged.
- Original model source: `assets/3d-assets/gift-models/crystal-crown-model.mjs`; the generated GLTF contains a gold crown band, velvet lining, five spires/arches, faceted sapphire/amethyst/emerald stones, engraved details, pavé gems and pendant drops.
- Matching primary SVG and transparent icon use the `crystal-crown-original-v1` art signature and are produced by the existing generator.
- LIVE exact-code runtime uses `crown-lustre` choreography and the local synthesized `crystal-crown-royal-glass-chime-v1` sound.
- Human visual approval, rights review and physical-device rendering/audio QA remain pending. Sound is synthesized; it is not a mastered recording. No production gift price or status change was made.


## Phoenix bespoke artwork — 2026-11-14

- Existing canonical item: `phoenix-wep6uk`, Phoenix, animals category, active, 25,999 Coins. Its identity, publication state and Coin value are unchanged.
- Original 3D source: `assets/3d-assets/gift-models/phoenix-model.mjs`; generated GLTF includes an ember plinth, sculpted firebird, long neck/head, flame crest, layered red/amber coverts and flight feathers, comet tail, talons and ember motes.
- Matching subject-specific primary SVG and transparent icon use `phoenix-original-v1` and are emitted by the existing gift generator.
- The LIVE exact-code effect path uses `phoenix-rise` choreography and `phoenix-flame-rise-and-ember-choir-v1` local sound synthesis.
- Design and licensing review, visual acceptance and physical-device rendering/audio QA remain pending. Sound is synthesized, not mastered. No price, active flag or database gift record was changed.


## Beach Maracas bespoke Caribbean artwork — 2026-11-14

- Existing canonical item: `beach-maracas-1exxoag`, Beach Maracas, music category, active, 349 Coins; catalogue identity, publication state and value remain unchanged.
- New 3D source: `assets/3d-assets/gift-models/beach-maracas-model.mjs`; it creates a crossed pair of original carved gourd shakers with hardwood handles, hand-painted seed/sunburst motifs, woven grip bands and a conch charm.
- Matching `beach-maracas-original-v1` SVG and transparent icon are generated by the existing gift generator.
- LIVE exact-code runtime selects `maraca-rhythm` motion and `beach-maracas-caribbean-shaker-rhythm-v1` synthesized shaker bursts with four bright tonal accents.
- Visual/rights review and physical-device rendering/audio QA remain pending. Sound is generated via Web Audio, not a mastered recording; no price, state or backend gift record changed.


## Royal Lions Scepter bespoke artwork — 2026-11-15

- Existing canonical source item: `royal-lions-scepter-15000-mgl`, Royal Lions Scepter, fantasy category, configured at **15,000 Coins** and marked active in the repository source catalogue. The source name, code, price, category and active flag are retained unchanged.
- New original model source: `assets/3d-assets/gift-models/royal-lions-scepter-model.mjs`; the generated self-contained glTF 2.0 includes a forward-facing lion head, separately modelled radial mane locks, sculpted muzzle/brows, crown points, faceted blue/red gemstones, spiral-fluted gold staff, dark enamel grip and jeweled pommel.
- Matching `royal-lions-scepter-original-v1` primary SVG and transparent icon are emitted by the existing generator through the exact canonical gift code.
- The source catalogue retains its canonical grand-entry animation preset, animation key, 1,900-ms duration and existing sound-preset value. The generated LIVE motion index records the effective exact-code lion-scepter-rise override without rewriting those source fields.
- The actual gift-event playback path selects lion-scepter-rise and locally synthesizes the royal-lions-scepter-roar-and-regal-fanfare-v1 growl/impact/fanfare/shimmer cue through Web Audio. This is synthesized audio, not a mastered sound file; existing sound opt-out and reduced-motion behavior are retained.
- Design review remains pending. No production gift row was inserted or activated, and no Coin price, wallet, transaction, creator earning or payout was changed. The production catalogue's separate version-3 publication and rights gates still apply.


## Maracas and Dolphin original artwork entries — 2026-11-16

- Maracas: `maracas-1wegi7n`, `music`, configured 1 Coin, source active. Original paired-gourd SVG/transparent icon and bespoke self-contained glTF source. Runtime motion/audio are gift-specific; source metadata and Coin value are unchanged.
- Dolphin: `dolphin-4bkejj`, `animals`, configured 10 Coins, source active. Original bottlenose SVG/transparent icon and bespoke self-contained glTF source. Runtime leap and synthesized ocean-splash audio are gift-specific; source metadata and Coin value are unchanged.
- Both new assets built with the standard catalogue generator; both dedicated unit tests passed. The 13-model Chromium render matrix passed all 39 viewport/pixel checks with 39 screenshots and no page/network errors (PR #411 workflow 43779388045; artifact 14187976230). This is generated-asset/browser verification only, not human visual, licensing or production approval.


## Crocodile original art and renderer status — 2026-11-16

- Crocodile (`crocodile-tnyf2j`) is an active Animals record with configured value 10 Coins. It now has a distinct authored source module, original vector gift artwork, transparent icon, exact-code glTF route, custom snap motion and synthesized snap/rumble sound.
- The catalogue source value and active flag were not changed. Both Crocodile and the 13 preceding bespoke models passed the 14×3 Chromium matrix: 42/42 model renders, 42/42 pixel checks, 42 screenshots and zero page/network errors (PR #411 run 43781000444; artifact 14188617258).
- This is browser/build verification, not design or licensing approval. The remaining 1,731 catalogue gifts still rely on shared procedural/category geometry and need bespoke artwork/model review where premium individual assets are required.


## Carnival Music bespoke Caribbean steelpan gift — 2026-11-16

- Canonical source: `carnival-music-14x4zts`; display name Carnival Music; category music; configured value 999 Coins; the source catalogue active flag is preserved.
- Original model source: `assets/3d-assets/gift-models/carnival-music-model.mjs`. The model contains the brushed steelpan barrel and dish, individually modelled tuned note fields, crossed maple mallets, tripod support, brass trim and a layered carnival feather fan.
- The canonical generator emits subject-specific `carnival-music-original-v1` SVG artwork, a transparent icon and a self-contained glTF 2.0 model at the existing canonical gift paths.
- Exact-code model routing preserves all catalogue metadata and LIVE transaction behaviour. The existing grand-entry motion and synthesized music-category sound remain unchanged.
- Review status: `design-review-pending`; human visual approval, rights clearance, mastered audio, production activation and physical-device sign-off are not claimed.


## Current 16-model Chromium/WebGL verification — 2026-11-16
- Canonical gift build: **1,748 primary SVGs, 1,748 transparent SVG icons and 1,748 glTF models** generated successfully.
- The 16 individually authored sources were checked across desktop, tablet and mobile Chromium viewports: **48/48 model renders, 48/48 non-empty pixel checks and 48 screenshots**.
- Browser evidence: workflow `43789909388`, artifact `14192111910`; zero page errors, HTTP failures, request failures or unexpected request cancellations.
- This confirms build and browser rendering only. Human visual acceptance, rights clearance, mastered audio and physical-device sign-off remain outstanding.


## Signature Jet bespoke vehicle source — 2026-11-16
- Canonical item: Signature Jet (`signature-jet-exds0m`), category `vehicles`, source-catalogue value **4,888 Coins**, active flag preserved. No production database, wallet or transaction records were changed.
- New source: `assets/3d-assets/gift-models/signature-jet-model.mjs`, independently generated self-contained glTF 2.0 with named PBR aircraft parts: pearl titanium fuselage/nose, smoked cockpit, cabin glazing, swept wings and inlays, twin turbofan nacelles, intake/exhaust details, tailplanes/stabilizer, navigation lights and retractable landing gear.
- Exact-code generator integration emits original `signature-jet-original-v1` primary SVG and transparent subject icon at the existing canonical catalogue paths.
- LIVE motion override: `signature-jet-flight`; sound: locally synthesized turbine wash, rising/falling engine tone and two chimes, explicitly not a mastered recording.
- Dedicated tests cover the GLTF structure, catalogue source invariants, artwork/icon identity, runtime route, sound manifest and preset mapping. CI asset generation and JavaScript syntax passed on commit `fbeade470f4ac913ba2cb775d884c750d1889d6e`; browser render verification for the current 17-source matrix is pending.
- Review status remains `design-review-pending`; human visual/rights approval, mastered audio and physical-device QA remain outstanding.
