# Minglora Gift Animation Source Library

This is the source-of-truth directory for original Minglora gift choreography definitions.

- `animation-catalog.json`: 17 source preset definitions and keyframes.
- `public/assets/animations/gifts/presets/`: individually served preset JSON files generated from this source.
- `public/assets/animations/gifts/preset-index.json`: runtime index for the preset files.
- `public/assets/animations/gifts/catalog-motion-index.json`: 1,737 active gift-code mappings to artwork, model, motion preset, effect layer and sound preset.

Build with `npm run build:live-gift-animations`. Verify generated output with `node scripts/generate-live-gift-animation-assets.mjs --check`.

The browser runtime uses the native Web Animations API. Lottie, Rive, recorded video animations and embedded GLTF skeletal clips are not included in this pack. The existing inline choreography remains the fallback if a file cannot be loaded.

Keep reference screenshots and uncleared extracted artwork read-only. Record author, source, licence and modification permission before any reference crop enters production. Respect reduced-motion settings and avoid flashing patterns or fake engagement.
