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
