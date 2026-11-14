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
