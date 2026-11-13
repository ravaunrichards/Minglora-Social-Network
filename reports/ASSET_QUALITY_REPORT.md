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


## Individual per-gift keyframe delivery

The LIVE motion generator now emits one distinct, same-origin Web Animations keyframe JSON for each active gift code (1,737 at the current canonical catalogue revision). A stable code-derived variation plus unique sorted ordinal differentiates each keyframe sequence. Files are fetched lazily on gift preview/play, validated against the expected gift code and animation identity, and fall back to the existing 17 preset files on any missing/invalid response. CI tests validate the full inventory and uniqueness of keyframe signatures, along with deterministic output. This improves per-gift animation identity and separation; it does **not** replace original artwork, produce photorealistic/cinematic models, create individual mastered sound effects, or satisfy real-device QA.


## Standalone model rights and integrity register

The 45 standalone GLTF files present in `public/assets/gifts/` are now indexed with verified repository paths, byte sizes and Git blob identities. Automated tests recompute each Git blob SHA from the checked-out bytes. This confirms file identity and repository presence only. All 45 matching rights records remain **UNVERIFIED**; no licence or production, commercial, modification or redistribution rights are inferred from the filenames or repository location.


## Complete-artwork display gate — 2026-11-13

The Gift Studio artwork tile previously used `object-fit: cover`, which could crop the edges of a square gift image. It now uses `object-fit: contain`, centered with preserved aspect ratio. The gift-effect model/image layer also uses containment, and the existing LIVE gift picker already uses containment for its artwork.

A fail-closed eligibility manifest was added at `assets/gift-assets/manifests/artwork-eligibility.json`, generated from the read-only screenshot extraction manifest and the exact canonical gift catalogue. It inventories all 1,509 extracted PNG records, their SHA-256, source screenshot/cell, source warnings and exact/ambiguous/unmatched catalogue-name mapping. It marks all 1,509 as not production-eligible until human inspection and rights evidence exist. Of those records, 1,058 have the extractor's source-edge warning and are marked `BLOCKED_POTENTIAL_CLIP`; 451 have no edge warning, which is explicitly **not proof of completeness**. The audit found 995 exact unique catalogue-name matches, 512 unmatched labels and 2 ambiguous name matches. It does not guess a catalogue mapping or invent any gift metadata.

Gift Studio and LIVE now require canonical local artwork/model paths for the usable picker. A broken artwork load removes the gift from the display list, removes its preview and disables send; no emoji/generic gift image is used as a substitute. The backend catalogue remains intact for record copy/export and historical integrity. Sending is not enabled until the actual artwork image has loaded with non-zero intrinsic dimensions. CI tests verify the containment rules, fail-closed behavior, and matching HTML/service-worker asset cache versions.

The new gate checks file loading and intrinsic dimensions; it does not replace a human review of every artwork's full silhouette and detail. Premium hand-authored models, rights clearance, full manual visual inspection and physical-device QA remain outstanding.


## LIVE reward-drop artwork — 2026-11-13

Two original Minglora vector symbols were added for the Goody Bag and Treasure Box room cards, plus the empty reward-drop state. They use individual shapes, layered gradients, metallic trim and highlight/shadow details; they replace the previous emoji illustrations in those three reward-art positions. The asset is same-origin and service-worker precached. A focused regression test verifies symbol identity, geometry, renderer references and cache wiring.

This is original vector UI artwork, not the requested premium 3D gift-model library. It does not establish completion of all LIVE icon states or the broader gift animation, audio, filter/effect and device-validation requirements.
