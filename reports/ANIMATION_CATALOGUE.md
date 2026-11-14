# Minglora LIVE — Animation Catalogue

## Current animation architecture

- Gift identities carry unique `animation_key` values.
- Gifts carry a subject/category animation preset and duration in the canonical JSON catalogue.
- `public/gift-effects.js` builds Web Animations keyframes, CSS-based motion layers, particle overlays and temporary gift cards.
- The runtime supports reduced-motion preferences and removes completed overlay elements.
- A selected GLTF is presented with the browser's `model-viewer` component. Automatic rotation/autoplay is suppressed when reduced motion is enabled.
- Gift sound profiles are synthesized with the Web Audio API from Minglora-authored parameters. They are not copied TikTok recordings.

## Existing animation families in the gift runtime

The runtime has explicit keyframe families for celebration burst, rocket launch, sky/speed flight, winged flight, blossom/petal bloom, heart pulse, royal shimmer, gentle float/nature rise, music rhythm/soundwave ripple, ocean/island/warm wave, sweet pop/delight pop, victory/power impact and magic/cosmic orbit. Other catalogue presets receive the runtime's deterministic generic entrance animation.

The catalogue contains 17 distinct `animation_preset` families. Each gift still has an individual animation identity and deterministic motion signature, but different gifts can share a choreography family.

## Motion index integration added on this branch

`scripts/generate-live-gift-motion-index.mjs` derives the exact per-gift motion profile from the canonical catalogue, without inventing prices or changing gift records. It writes:

`public/assets/animations/gifts/catalog-motion-index.json`

The generated index includes only active records and carries the exact code, image/model path, animation identity/preset/duration, sound preset and a supported effect layer. The generator refuses to overwrite a file that is not marked as its own generated output. It has a non-writing `--check` mode.

Runtime and service-worker references already use this canonical path. The updated `prestart` and CI steps generate it after the SVG/GLTF catalogue build and before the app/tests run.

## Remaining animation limitations

The existing 3D gift generator builds original primitive mesh scenes with basic metallic/roughness material factors. It does not emit full skeletal animation, GLTF animation channels, rigged characters, physically simulated cloth/liquid, high-resolution PBR texture sets or cinematic environment scenes. No populated Rive/Lottie library or rendered per-gift video/spritesheet fallback set was verified. These remain additional production-art requirements, not completed deliverables.

## Gift icon / animation separation — 2026-11-14

- Transparent gift icons are still images used for catalogue and LIVE picker cards; they do not replace the existing server-confirmed gift motion profiles.
- CI verified 1,748 catalogue records and 1,737 active motion profiles. The current motion implementation remains a procedural JSON profile plus the Web Animations runtime; this change does not create standalone Lottie, Rive, WebM or MP4 gift-preview files.
- The current gift sound path remains synthesized Web Audio category profiles rather than mastered per-gift audio files. Dedicated mastered sound count remains zero.
- Reduced-motion and existing server-confirmed event triggers remain under the existing runtime. Physical-device animation/audio synchronization tests have not been performed.


## Djembe Master and Palm Breeze bespoke Web Animations — 2026-11-14

- Djembe Master (`djembe-master-1v3jzkm`) uses the exact-code preset `djembe-strike`: a compact percussive entry, strike, recoil and settle sequence.
- Palm Breeze (`palm-breeze-gknyt0`) uses `palm-canopy-sway`: a gentle left/right canopy sway with a soft settle.
- `public/gift-effects.js` selects the two bespoke keyframe sequences inside the existing gift effect mount, while all other catalogue gifts continue to use their existing canonical motion preset.
- The same gift event mount schedules the gift-specific Web Audio effect. Existing motion duration clamping, overlay cleanup and `prefers-reduced-motion` handling remain active.
- PR #342 merged as `ab2939e27378d8f02a8dd1a92172105463d6dbd4` after the full CI test workflow and LIVE/MeetWave Chromium layout QA both passed.
- These are runtime Web Animations keyframes. They are not standalone Lottie/Rive files, GLTF animation channels, sprite sheets, or rendered WebM/MP4 assets. Physical-device timing/rendering validation and human animation review remain pending.
