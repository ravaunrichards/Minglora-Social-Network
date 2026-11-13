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

The current generator produces distinct SVG files and GLTF scenes from per-gift identity, category, colour palette and subject-specific original shape routines. GLTF scenes use generated meshes and PBR metallic/roughness material fields. The current implementation is a useful scalable baseline, not proof of photorealistic or cinematic 3D quality: complex mesh detail, high-resolution texture maps, GLB/KTX2 compression and embedded skeletal animation are not evidenced.

## Interface icon and effect quality

The public icon folder has a shared navigation symbol sheet, a push SVG and (added in this branch) a dedicated 16-symbol LIVE control sprite. The LIVE dock now renders its current microphone, camera, camera-switch, multi-guest, co-host, chat, screen-share, full-screen, gift, volume, settings, share and leave states from that local sprite. This covers the existing dock controls; the repository still does not contain a complete individually exported icon pack for every moderator, filter, effect, ranking, fan-club, subscription, notification and accessibility sub-control in the broader request. The animation runtime has effect layers and reduced-motion handling; a full Lottie/Rive pack, audio-synchronized video gift clips and all error/loading/selected state artwork have not been audited to completion.

## Audio quality

Gift effects synthesize short per-gift/category tones using Web Audio. The separate Sound Studio generator creates 120 original WAV cues (30 voice ringtones, 30 video ringtones and 60 notification sounds). Those 120 are not 120 completed gift-specific effects. Dedicated, mastered, synchronized gift sound effects still need a separate production pass.

## Performance and device coverage

LIVE CSS includes phone compact layouts and a desktop room with a distinct stage/chat arrangement. The supplied samples include an Android portrait viewport and 1365-pixel desktop references. Dedicated iPhone, tablet, foldable and Smart TV asset/layout QA matrices and real-device GPU/memory/battery measurements have not been performed in this audit.

## Production gate

The extracted 1,509 catalogue crops remain blocked from production until rights and visual review are documented or original replacements are supplied. No source files were changed or removed.


## LIVE control icon sprite verification scope

The sprite keeps the existing 24×24 line-art geometry and `currentColor` treatment while moving the symbol definitions into one reusable, same-origin SVG file. The application uses a strict 16-name allowlist, and the service worker precaches the sprite. The new unit test checks symbol completeness, vector geometry, renderer wiring, versioned app loading and precache wiring. Full visual contrast checks on physical OLED/LCD devices remain pending.


## Separate animation preset quality gates

The follow-on change adds 17 individual keyframe JSON files and a deterministic generator. The generator validates supported unique IDs, duration bounds, strictly increasing frame offsets spanning 0–1, bounded opacity, local transform/filter fields and explicit reduced-motion metadata. CI builds and checks the pack. The runtime only loads the expected same-origin preset paths and retains its existing inline fallback. These files are native Web Animations API definitions; they are not Lottie/Rive files, recorded video, or animated GLTF channels. Premium per-gift audio, photorealistic models and physical-device GPU/memory testing remain open.
