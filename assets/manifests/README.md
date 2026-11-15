# manifests

Track asset identifier, relative path, source, license, content type, dimensions, alt text and owner. Validate referenced files in CI; never add production user-upload metadata or private URLs to Git.

## Generated LIVE manifest

- Output: `live-asset-manifest.json` (generated, ignored build artifact; do not hand-edit).
- Command: `npm run build:live-asset-manifest` after gift and motion-index generation.
- Validation: `npm run build:live-asset-manifest -- --check`.
- CI uploads the JSON as `minglora-live-asset-manifest-<run-number>`.
- Each gift record includes measured SVG/GLTF metadata, SHA-256, model bounds, active motion profile, sound implementation, component usage, provenance/licensing and device/fallback status.
- The manifest must not be used to imply human visual approval, rights clearance or production-ready artwork.

## Supplied source-image metadata audit

- Command: `npm run audit:live-image-metadata`.
- Generated outputs: `reports/live-image-metadata-audit.json` and `reports/live-image-metadata-audit.md`.
- Scanned roots: reference screenshots, gift captures, guest layouts, gifter badges, League captures and extracted artwork.
- The audit is read-only and records raster-header dimensions, format, orientation, size and SHA-256 plus encoded alpha/transparency/animation declarations.
- It does not decode pixel alpha, apply EXIF orientation, establish image quality, or grant production/licensing approval. CI uploads the outputs for inspection.

## Standalone LIVE SVG icon packs

- The generated live manifest inventories `public/assets/icons/live-controls/` and `public/assets/icons/live-gift-categories/` using their JSON manifests.
- Each standalone SVG record includes path, SHA-256, 24×24 viewBox, component usage, visual-review state and rights-review state.
- CI validates all 18 room-control icons and all 22 gift-category icons before publishing the generated manifest. The two active-state variants cover stopping screen sharing and exiting fullscreen; the pack still records design/licensing review as pending.
- The packs are individually addressable UI vector assets; this does not certify premium 3D gift art or human design approval.
