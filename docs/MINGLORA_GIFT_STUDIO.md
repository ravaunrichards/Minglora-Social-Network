# Minglora Gift Studio

Minglora keeps its own gift collection and its own asset files. The catalogue is stored in \`data/minglora-gift-catalog.json\`; its names and coin prices are normalized from public gift metadata and the supplied gift-list pages. Separate name/price variants are retained when a source list shows the same displayed name at different prices.

## Asset pipeline

- \`scripts/generate-minglora-gifts.mjs\` creates one SVG artwork and one glTF 3D model for every catalogue row.
- Files are written to \`public/assets/gifts/catalog/<gift-code>.svg\` and \`public/assets/gifts/catalog/<gift-code>.gltf\`.
- Every row carries its local \`image_url\`, \`model_url\`, \`animation_preset\`, \`sound_preset\`, and \`animation_duration_ms\`.
- \`public/gift-effects.js\` renders the 3D model and runs the corresponding animation family. It synthesizes a deterministic per-gift sound profile with the Web Audio API; it does not download or reproduce another platform's sound recording.
- The SVG and glTF files are generated from Minglora-authored geometry, colors, shapes and iconography. No third-party CDN image, model, animation or sound asset is copied.

## Build and runtime

Run:

\`\`\`sh
npm run build:gifts
\`\`\`

The \`prestart\` lifecycle also runs the generator before \`npm start\`. CI runs the asset generator and the catalogue regression tests. This means the generated media files exist before the Node server begins serving \`public/\`.

## Safe catalogue updates

1. Add or correct a gift row in \`data/minglora-gift-catalog.json\`.
2. Keep the code unique. Keep each name/coin-price pair unique; the same name can appear more than once when the source lists show different priced variants.
3. Set a category, emoji, animation preset, sound preset, duration, local SVG path and local glTF path.
4. Apply the corresponding Supabase migration/upsert so the live and social gifting pickers receive the same active catalogue.
5. Run \`npm run build:gifts\` and \`npm test\`.

The frontend loads thumbnails in pages and creates a 3D viewer only for the selected gift, avoiding a simultaneous 3D load of the whole catalogue. LIVE gifting uses the same catalogue with a paginated picker.
