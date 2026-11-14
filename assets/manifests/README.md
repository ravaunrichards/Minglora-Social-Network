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

## Transparent vector icons

The generator also emits `<code>-icon.svg` for every catalogue gift and 18 files under `public/assets/gifts/categories/`. Each gift record includes `icon`, `icon_url` and a thumbnail record pointing to the icon. The `shared_assets.category_icons` array inventories category icons. The manifest validates file sizes, SHA-256 hashes, SVG dimensions and the structural absence of the poster's full-canvas background. The icons are vector presentation assets and are not a certification of premium 3D artwork, licensing clearance or physical-device compatibility.
