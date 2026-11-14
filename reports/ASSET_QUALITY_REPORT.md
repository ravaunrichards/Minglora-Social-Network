# Minglora LIVE — Asset Quality Report

## Automated source-artwork integrity audit

The existing read-only audit reports:

- Extracted catalogue artwork records: **1,509**
- Missing/invalid/hash integrity errors: **0**
- Exact duplicate SHA-256 groups: **0**
- Same-title near-duplicate candidates: **6**
- Human visual review: **not completed**
- Rights/licence clearance: **not completed**
- Items flagged for review: **1,114**

Flag reasons recorded by the existing audit: 1,058 foregrounds close to crop boundaries, 7 low-OCR-confidence labels, 100 same-title/different-artwork variants and 77 truncated titles. A crop boundary flag means the extractor needs a person to check the image; it is not a confirmed defect in every case.

## Generated 3D and vector quality

The current generator emits one SVG and one GLTF file for each catalogue row, but a file per gift does not mean a fully bespoke illustration/model per gift. The SVG renderer uses category-level vector templates plus a limited set of name-specific vector branches. The previous system-font emoji glyph overlay has been removed from the SVG output; gift artwork no longer depends on Apple/Segoe/Noto emoji font availability. The existing vector forms remain a prototype baseline rather than individually art-directed, reviewed premium illustrations. The GLTF generator likewise uses generated primitive meshes, common category geometry and limited name-specific model branches, with basic metallic/roughness materials. The source does not evidence a bespoke high-detail model for every gift, high-resolution PBR texture maps, GLB/KTX2 compression, embedded skeletal animation or cinematic scene rigs. These outputs are not approved premium production artwork.


## Individually authored Rose 3D source checkpoint

The exact Rose catalogue entry has a dedicated original source model at assets/3d-assets/gift-models/rose-model.mjs. The gift build emits a self-contained glTF 2.0 botanical sculpture with layered curved petals, five sepals, a tapered stem, thorns, three leaves and separate PBR materials. The generated transparent Rose SVG has matching layered Minglora flower artwork. This is one gift-specific art-direction exception; it does not make the remaining catalogue premium-complete. Human design approval, licensing review, renderer review and device QA remain pending.

## Interface icon and effect quality

`public/assets/icons/navigation-3d.svg` contains **53 named SVG symbols** and `public/assets/icons/minglora-push.svg` is a separate push graphic. The 53-symbol sheet is a useful shared application icon source, but it is not a complete individually exported LIVE icon library. Dedicated camera/flip, beauty/filter, host/guest, viewer, battle, ranking, fan-club, moderation and accessibility artwork, including every active/selected/disabled/loading/error state, has not been verified as a complete set. LIVE also uses CSS/SVG/DOM controls. The animation runtime has effect layers and reduced-motion handling; a full Lottie/Rive pack, audio-synchronized video gift clips and all error/loading/selected state artwork have not been completed.

The nine guest-layout reference diagrams under `assets/Guests Layout/` were visually checked individually. The corrected desktop LIVE-room sample is `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-074648.png` (1366×638). `capture-20261112-072050.png` is a For You video/comments page, and `capture-20261112-074126.png` is a creator scheduler; neither is a LIVE-room screenshot.

## Audio quality

Gift effects synthesize short per-gift/category tones using Web Audio. The separate Sound Studio generator creates 120 original WAV cues (30 voice ringtones, 30 video ringtones and 60 notification sounds). Those 120 are not 120 completed gift-specific effects. Dedicated, mastered, synchronized gift sound effects still need a separate production pass.

## Performance and device coverage

LIVE CSS includes phone compact layouts and a desktop room with a distinct stage/chat arrangement. The supplied samples include Android portrait Fan/SuperFan panels and a verified 1366×638 desktop LIVE-room capture. The actual Android room layout still requires a full, separate screenshot-by-screenshot review. Dedicated iPhone, tablet, foldable and Smart TV asset/layout QA matrices and real-device GPU/memory/battery measurements have not been performed in this audit.

## Production gate

The extracted 1,509 catalogue crops remain blocked from production until rights and visual review are documented or original replacements are supplied. The generated SVG catalogue now has zero system-font emoji overlays, but remains below the premium quality gate while category-template art direction, individual visual review, rights review and high-detail 3D production remain incomplete. This continuation changes the generator and automated checks, not the source reference files or catalogue pricing.

## Machine-readable per-gift inventory

`assets/manifests/live-asset-manifest.json` is generated during startup and CI after the canonical gift SVG/GLTF files and active motion index are built. It records actual file sizes and SHA-256 hashes, artwork dimensions, aggregate GLTF bounds and mesh counts, exact active animation-profile mappings, synthesized sound status, licensing/visual-review gates, component use and device QA state. It is an inventory and validation artifact, not a production-approval certificate. The output is uploaded as a named GitHub Actions artifact for inspection.

## GLTF load-error fallback

`public/gift-effects.js` now listens for the supported `<model-viewer>` `error` event. When a model fails to load/parse or the WebGL context is lost, the failed model element is replaced with that gift's canonical SVG artwork. If the SVG also fails, or no image URL exists, the card displays an accessible text status instead of an emoji or a broken image. This is a rendering fallback; it does not restore a lost WebGL context or replace physical-device QA.

## SVG emoji-overlay removal

The gift generator no longer emits a system-font emoji overlay or uses the unused emoji lookup function. The CNC Coin, Fighting, Hibiscus, DJ Headphone, Four Leaf Clover, Rose and Baseball examples are checked against their vector geometry; CI verifies all 1,748 generated SVG records have zero emoji-font overlays. This removes one device-dependent rendering dependency but does not replace pending per-gift creative art direction and human review.

## Per-source raster metadata

The LIVE workflow includes a built-in read-only metadata scanner for supplied Android/desktop screenshots, gift captures, guest-layout diagrams, badge and League references, and extracted artwork crops. It emits per-file dimensions, detected format, orientation, size and SHA-256 plus encoded alpha/transparency/animation declarations. It does not scan decoded pixel alpha, apply EXIF orientation, or perform visual, rights or production approval. CI publishes the generated JSON and Markdown audit as an artifact; inspect that artifact before treating any source image's dimensions or transparency as verified.

## Transparent gift artwork canvases

The gift SVG generator no longer paints a full-canvas gradient rectangle behind each gift. The surrounding 512×512 canvas is transparent while the generated foreground geometry, soft shadow, decorative accents and local nameplate are preserved. `svgInfo` records `transparent_background: true` only when the full-canvas backdrop is absent. CI checks all 1,748 generated SVGs and the per-gift asset manifest; this does not constitute pixel-alpha inspection of the separate screenshot-derived PNG references or premium art-direction approval.

## Bespoke Hibiscus GLTF art-direction checkpoint — 2026-11-14
The canonical **Hibiscus** gift (hibiscus-5-mgl) now has a dedicated procedural mesh source at assets/3d-assets/gift-models/hibiscus-model.mjs, selected explicitly by scripts/generate-minglora-gifts.mjs. The original model contains five separately surfaced, cupped coral-pink petals, five sepals, three surfaced leaves, a tapered stem, a raised flower throat, a central stamen column, seven filaments/anthers and small dew highlights. Its glTF 2.0 document embeds its mesh buffer and gives individual botanical parts their own PBR material records. The generated asset retains design-review-pending.

This is a second gift-specific 3D art-direction exception alongside Rose; it does not upgrade the remaining catalogue's category-level generated models. CI generation, geometry regression tests, renderer review, human visual approval, licensing review and physical-device QA must still pass before the Hibiscus asset can be called production-approved.
