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


## Gamer Otter action choreography — 2026-11-14

- Canonical gift code: `gamer-otter-100-mgl`.
- Motion preset: `gamer-otter-cheer`, selected by an exact gift-code override in `public/gift-effects.js`; the existing LIVE gift effect trigger runs the Web Animations keyframes.
- Sound design: local synthesized arcade arpeggio (523.25, 659.25, 783.99 and 1046.5 Hz notes with seeded detuning/stereo placement) plus a short low-frequency thump; it runs from the existing gift playback hook.
- Playback remains subject to the existing user sound opt-out and reduced-motion preference. Overlay cleanup remains owned by the shared runtime.
- No standalone Lottie/Rive/WebM/MP4 file or mastered audio file is claimed. Cross-device timing, mix/latency and human animation review remain pending.


## LIVE Island tide choreography — 2026-11-14

- Canonical gift: `live-island-rmn3mc`.
- Motion preset: `island-tide`, selected by exact catalogue code in `public/gift-effects.js`; gentle lateral tide drift and settle use the existing Web Animations trigger.
- Sound design: `live-island-tide-and-chime-v1`; one filtered noise swell (high-pass/low-pass sweep) plus four soft sine chimes at 392, 493.88, 587.33 and 783.99 Hz with seeded detuning and stereo placement.
- Audio is generated through local Web Audio on the existing gift playback path. It is not a mastered recording. Existing sound opt-out and reduced-motion preferences remain respected.
- No standalone Lottie/Rive/WebM/MP4 animation, embedded glTF animation track or recorded audio asset is claimed. Human review and physical-device timing/mix QA remain pending.


## Crystal Crown royal shimmer — 2026-11-14

- Canonical gift: `crystal-crown-1itryeu`.
- Motion preset: `crown-lustre`, selected by exact gift-code override in `public/gift-effects.js`; a soft lift, settle and restrained shimmer run through the existing Web Animations gift event trigger.
- Sound design ID: `crystal-crown-royal-glass-chime-v1`; five softly enveloped sine/triangle tones at 523.25, 659.25, 783.99, 1046.5 and 1318.51 Hz, with seeded stereo placement and a filtered high-frequency noise shimmer.
- Sound is locally synthesized through Web Audio, not a mastered recording. The existing user sound opt-out and reduced-motion preference remain respected.
- No Lottie/Rive/video file or embedded GLTF animation track is claimed. Human timing/mix and physical-device QA remain pending.


## Phoenix firebird rise — 2026-11-14

- Canonical gift: `phoenix-wep6uk`.
- Motion preset: `phoenix-rise`, selected by exact gift-code override; the Web Animations sequence rises from low opacity, blooms upward with restrained rotation, then settles.
- Sound design ID: `phoenix-flame-rise-and-ember-choir-v1`; filtered band-pass noise swell with a five-note ascending tone sequence (220, 293.66, 392, 523.25 and 659.25 Hz) and seeded stereo placement.
- Sound is locally synthesized through Web Audio, not a mastered recording. Existing sound opt-out and reduced-motion preferences remain respected.
- No embedded GLTF skeletal animation, Lottie/Rive file or mastered audio is claimed. Human choreography/audio review and physical-device QA remain pending.


## Beach Maracas Caribbean rhythm — 2026-11-14

- Canonical gift: `beach-maracas-1exxoag`.
- Motion preset: `maraca-rhythm`; alternating lateral and rotational beats run through the existing Web Animations event path.
- Sound ID: `beach-maracas-caribbean-shaker-rhythm-v1`; five pulsed high-pass noise bursts, four soft tonal accents (261.63, 392, 523.25 and 659.25 Hz), and seeded stereo placement.
- Sound is locally synthesized through the existing Web Audio playback path, not a recorded/mastered audio file. Sound opt-out and reduced-motion preferences remain supported.
- No embedded GLTF animation channels, Lottie/Rive file or mastered sound recording are claimed. Human rhythm/audio review and physical-device QA remain pending.
