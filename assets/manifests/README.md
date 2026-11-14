# manifests

Track asset identifier, relative path, source, license, content type, dimensions, alt text and owner. Validate referenced files in CI; never add production user-upload metadata or private URLs to Git.

## Generated LIVE manifest

- Output: `live-asset-manifest.json` (generated, ignored build artifact; do not hand-edit).
- Command: `npm run build:live-asset-manifest` after gift and motion-index generation.
- Validation: `npm run build:live-asset-manifest -- --check`.
- CI uploads the JSON as `minglora-live-asset-manifest-<run-number>`.
- Each gift record includes measured SVG/GLTF metadata, SHA-256, model bounds, active motion profile, sound implementation, component usage, provenance/licensing and device/fallback status.
- The manifest must not be used to imply human visual approval, rights clearance or production-ready artwork.
