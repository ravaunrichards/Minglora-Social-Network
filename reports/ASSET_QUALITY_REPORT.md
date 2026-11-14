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

The current generator emits one SVG and one GLTF file for each catalogue row, but a file per gift does not mean a fully bespoke illustration/model per gift. The SVG renderer uses a small set of category-level vector templates plus limited name-specific overrides, then overlays a large Unicode emoji glyph using system emoji fonts. That makes the output font/device dependent and explicitly fails the no-emoji, self-contained premium-art requirement. The GLTF generator likewise uses generated primitive meshes, common category geometry and limited name-specific model branches, with basic metallic/roughness materials. The source does not evidence a bespoke high-detail model for every gift, high-resolution PBR texture maps, GLB/KTX2 compression, embedded skeletal animation or cinematic scene rigs. These outputs are a procedural prototype/placeholder baseline, not approved premium production artwork.

## Interface icon and effect quality

`public/assets/icons/navigation-3d.svg` contains **53 named SVG symbols** and `public/assets/icons/minglora-push.svg` is a separate push graphic. The 53-symbol sheet is a useful shared application icon source, but it is not a complete individually exported LIVE icon library. Dedicated camera/flip, beauty/filter, host/guest, viewer, battle, ranking, fan-club, moderation and accessibility artwork, including every active/selected/disabled/loading/error state, has not been verified as a complete set. LIVE also uses CSS/SVG/DOM controls. The animation runtime has effect layers and reduced-motion handling; a full Lottie/Rive pack, audio-synchronized video gift clips and all error/loading/selected state artwork have not been completed.

The nine guest-layout reference diagrams under `assets/Guests Layout/` were visually checked individually. The corrected desktop LIVE-room sample is `assets/reference/Laptop PC Web/Minglora TikTok/capture-20261112-074648.png` (1366×638). `capture-20261112-072050.png` is a For You video/comments page, and `capture-20261112-074126.png` is a creator scheduler; neither is a LIVE-room screenshot.

## Audio quality

Gift effects synthesize short per-gift/category tones using Web Audio. The separate Sound Studio generator creates 120 original WAV cues (30 voice ringtones, 30 video ringtones and 60 notification sounds). Those 120 are not 120 completed gift-specific effects. Dedicated, mastered, synchronized gift sound effects still need a separate production pass.

## Performance and device coverage

LIVE CSS includes phone compact layouts and a desktop room with a distinct stage/chat arrangement. The supplied samples include Android portrait Fan/SuperFan panels and a verified 1366×638 desktop LIVE-room capture. The actual Android room layout still requires a full, separate screenshot-by-screenshot review. Dedicated iPhone, tablet, foldable and Smart TV asset/layout QA matrices and real-device GPU/memory/battery measurements have not been performed in this audit.

## Production gate

The extracted 1,509 catalogue crops remain blocked from production until rights and visual review are documented or original replacements are supplied. The current generated SVG catalogue also remains below the requested quality gate while its system-rendered emoji overlay and shared category-template artwork remain in place. No source files were changed or removed during this documentation-only continuation.

## Machine-readable per-gift inventory

`assets/manifests/live-asset-manifest.json` is generated during startup and CI after the canonical gift SVG/GLTF files and active motion index are built. It records actual file sizes and SHA-256 hashes, artwork dimensions, aggregate GLTF bounds and mesh counts, exact active animation-profile mappings, synthesized sound status, licensing/visual-review gates, component use and device QA state. It is an inventory and validation artifact, not a production-approval certificate. The output is uploaded as a named GitHub Actions artifact for inspection.
