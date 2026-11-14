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
