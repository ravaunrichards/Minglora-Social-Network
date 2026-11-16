# Original Minglora LIVE gift model sources

This directory contains original, version-controlled 3D gift authoring sources. It is separate from the read-only references under assets/reference/ and assets/Gifts/, and the extracted review-only crops under assets/Artwork/.

## Rose v1

- Source: rose-model.mjs
- Target: exact catalogue display name Rose
- Generated output: public/assets/gifts/catalog/<rose-code>.gltf
- Format: self-contained glTF 2.0 JSON with embedded binary mesh buffers
- Geometry: curved petal surfaces, five sepals, stem, thorns, three leaves and dew details
- Materials: per-part PBR base color, metallic and roughness values
- Review state: design-review-pending; no screenshot-derived artwork or third-party trademark material is used
- Integration: scripts/generate-minglora-gifts.mjs routes only the exact Rose record to this source. Catalogue data, configured coin price and LIVE event handling remain unchanged.

Run npm run build:gifts to generate the model and SVG. Catalogue tests verify the Rose model ID, GLTF structure and artwork signature.

## Djembe Master v1

- Source: `djembe-model.mjs`
- Target: canonical catalogue item `djembe-master-1v3jzkm` (Djembe Master)
- Generated output: `public/assets/gifts/catalog/djembe-master-1v3jzkm.gltf`
- Format: self-contained glTF 2.0 JSON with embedded binary mesh buffers
- Geometry: sculpted mahogany body, hollow inner bowl, taut hide drumhead, separate rim bindings, 16 tension strands, woven diamond lacing and carved lower-shell detailing
- Materials: separate PBR surfaces for wood, hide and rope
- Review state: design-review-pending; original geometry, with no copied logos or screenshot-derived artwork
- Integration: the canonical gift code is routed to this source by `scripts/generate-minglora-gifts.mjs`; catalogue pricing, status and LIVE transaction logic remain unchanged

The existing gift build generates the model and the subject-specific transparent SVG artwork. Regression coverage verifies generated mesh metadata, components, embedded geometry and the artwork signature.


## Palm Breeze v1

- Source: palm-breeze-model.mjs
- Target: canonical catalogue item palm-breeze-gknyt0 (Palm Breeze)
- Generated output: public/assets/gifts/catalog/palm-breeze-gknyt0.gltf
- Format: self-contained glTF 2.0 JSON with embedded binary mesh buffers
- Geometry: curved fibrous trunk, eight pinnate fronds with individually modelled leaflets and veins, young coconuts, root flares, carved trunk details and a compact sand/water plinth
- Materials: separate PBR records for trunk, fronds, husks, shoreline and surface details
- Performance: repeated leaflet and vein meshes are batched by material to reduce draw calls
- Review state: design-review-pending; original Minglora geometry with no copied logos or screenshot-derived artwork
- Integration: the canonical gift code is routed through scripts/generate-minglora-gifts.mjs; gift price, status and LIVE transaction logic remain unchanged

The existing gift build generates both subject-specific transparent SVG artwork and the self-contained glTF. Regression coverage checks catalogue identity, model provenance, mesh groups, embedded buffers and SVG artwork signature.


## LIVE Island v1

- Source: `live-island-model.mjs`
- Target: canonical catalogue item `live-island-rmn3mc` (LIVE Island)
- Output: canonical generated catalogue GLTF plus primary SVG and transparent icon
- Geometry: lagoon/surf rings, sand cay, headland, waterfall, three palms, pavilion, canoe, reef and beacon
- Review: `design-review-pending`; no premium or rights approval is implied


## Crystal Crown v1

- Source: `crystal-crown-model.mjs`
- Target: canonical catalogue item `crystal-crown-1itryeu`
- Output: generated gift GLTF, primary SVG and transparent icon
- Geometry: gold band, velvet lining, five arches and points, faceted centre/side gems, pavé and pendants
- Review: `design-review-pending`; no premium or licensing approval is implied


## Phoenix v1

- Source: `phoenix-model.mjs`
- Target: canonical catalogue item `phoenix-wep6uk`
- Output: generated GLTF, primary SVG and transparent icon
- Geometry: layered firebird body, flame crest, coverts, primary feathers, comet-tail fan, talons and embers
- Review: `design-review-pending`; no premium or licensing approval is implied


## Beach Maracas v1

- Source: `beach-maracas-model.mjs`
- Target: canonical gift `beach-maracas-1exxoag`
- Output: generated bespoke GLTF, primary SVG and transparent icon
- Geometry: crossed coral/lagoon gourd shakers, handles, grip rings, painted motifs and conch charm
- Review: `design-review-pending`; no premium or licensing approval is implied


## Royal Lions Scepter v1

- Source: `royal-lions-scepter-model.mjs`
- Target: canonical catalogue item `royal-lions-scepter-15000-mgl` (Royal Lions Scepter)
- Output: generated gift GLTF, primary SVG and transparent icon
- Geometry: forward-facing lion face, individually modelled radial mane locks, ears, muzzle, crown points, faceted sapphire and ruby details, fluted staff, spiral filigree, enamel grip and jeweled pommel
- Materials: named PBR meshes for gold, mane, face, enamel, eyes and gemstones; geometry buffers are embedded for the existing model viewer
- Review: `design-review-pending`; no premium, human visual, licensing or device approval is implied
- Integration: the existing gift generator routes only the exact canonical gift code to this source; the configured catalogue value, publication flag, backend offers and transaction logic remain unchanged

## Rose refinement v2 — 2026-11-15

- Source: `rose-model.mjs`
- Canonical gift: `Rose` (`rose-4ieccm`)
- Model detail: layered cupped petal tiers, raised petal/leaf venation, three connected leaf petioles, five sepals, tapered thorned stem, eight gold stamen filaments/anthers and dew detail.
- Geometry is emitted as a self-contained glTF 2.0 model by the existing canonical gift generator; the primary SVG, transparent icon, catalogue record, coin value, publication state and LIVE gift event flow are unchanged.
- Regression coverage requires the named petal, vein, petiole, stamen and anther meshes/materials.
- Validation: repository CI passed; independent LIVE/MeetWave layout matrix passed; Chromium WebGL rendered 9 bespoke model sources across desktop/tablet/mobile (27/27 checks).
- Review state remains `design-review-pending`. This change is not a human-approved premium artwork, rights clearance, mastered audio asset or physical-device sign-off.


## Baseball v1

- Source: `baseball-model.mjs`
- Target: canonical catalogue item `baseball-orcdx9` (Baseball; sports; configured value 1 Coin)
- Generated output: `public/assets/gifts/catalog/baseball-orcdx9.gltf`, primary SVG and transparent `-icon.svg`
- Format: self-contained glTF 2.0 JSON with embedded binary mesh buffers and per-part PBR factors
- Geometry: full-grain warm-ivory leather shell, fine leather-grain flecks, two curved recessed seam channels, raised scarlet cotton seams, hand-sewn stitch strands and thread highlights
- Artwork: original subject-specific baseball vector illustration marked `baseball-original-v1`
- Review state: `design-review-pending`; no human art, rights or device approval is implied
- Integration: exact-code route in `scripts/generate-minglora-gifts.mjs`; canonical catalogue price, active flag and LIVE transaction flow remain unchanged
- Verification target: desktop, tablet and mobile Chromium model-render matrix plus gift-catalogue model/artwork regression tests


## Maracas v1

- Source: `maracas-model.mjs`
- Canonical target: `maracas-1wegi7n` (Maracas; music; configured value 1 Coin; source active flag preserved)
- Output: generated self-contained glTF 2.0, subject-specific primary SVG and transparent icon
- Geometry: separately sculpted coral and lagoon calabash shells, tapered hardwood handles, spiral grip wraps, raised woven grip bands, concentric enamel rings, painted diamond seed inlays and radial sunburst details
- LIVE motion: exact-code selection of the existing `maraca-rhythm` Web Animations choreography
- LIVE audio: original locally synthesized shaker-noise pulses with short pitched accents; not a recorded or mastered audio file
- Review state: `design-review-pending`; no premium, legal/rights, human visual or physical-device approval is implied
- Integration: exact canonical gift code only; source catalogue metadata, configured coin value, publication flag, database rows and LIVE transaction flow are unchanged


## Dolphin v1

- Source: `dolphin-model.mjs`
- Canonical target: `dolphin-4bkejj` (Dolphin; animals; configured value 10 Coins; source active flag preserved)
- Output: generated self-contained glTF 2.0, subject-specific primary SVG and transparent icon
- Geometry: hydrodynamic blue-grey bottlenose body, tapered rostrum, pearl countershading, dorsal fin, paired pectoral flippers, split tail flukes, glossy eyes, eyebrow highlights, gill grooves, blowhole and sea-spray droplets
- LIVE motion: exact-code selection of the dedicated `dolphin-leap` Web Animations sequence
- LIVE audio: locally synthesized ocean wash, water splash and three soft rising tones; not a recorded or mastered audio file
- Review state: `design-review-pending`; human visual, rights and physical-device approval are not implied
- Integration: exact canonical gift code only; source catalogue metadata, configured coin value, publication flag, database rows and LIVE transaction flow are unchanged
