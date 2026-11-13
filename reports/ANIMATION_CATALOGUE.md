# Minglora Gift Animation Catalogue

**Date:** 2026-11-13  
**Format:** Native Web Animations API keyframe assets  
**Source:** `assets/animations/gifts/animation-catalog.json`

## Individual preset files

All 17 presets below have separate runtime JSON files under `public/assets/animations/gifts/presets/`, with a generated `preset-index.json`. The runtime loads them from the same origin and applies their keyframes to the selected gift's existing artwork or 3D model. Existing inline choreography remains the fallback if a file cannot load.

| ID | Intended motion | Target groups |
|---|---|---|
| `petal-bloom` | Petal-like reveal and settle | Flowers, nature |
| `heart-pulse` | Warm pulse and rebound | Hearts, reactions |
| `creature-entrance` | Friendly character entry | Animals |
| `grand-entry` | Rising statement entrance | Vehicles, luxury |
| `soundwave-ripple` | Rhythmic rise and fall | Music |
| `power-impact` | Impact and controlled rebound | Sports, games |
| `delight-pop` | Compact pop | Food and drinks |
| `cosmic-orbit` | Orbit-like turn | Fantasy, symbols |
| `spark-float` | Light floating entry | Community, other |
| `celebration-burst` | Bright burst and settle | Celebrations |
| `gift-reveal` | General-purpose reveal | Other |
| `glam-spin` | Polished spin | Fashion and beauty |
| `royal-shimmer` | Premium shimmer | Luxury, fashion |
| `nature-rise` | Gentle upward motion | Nature, flowers |
| `horizon-sweep` | Lateral sweep | Travel, vehicles |
| `pixel-burst` | Stepped digital reveal | Games |
| `warm-wave` | Friendly wave | Community, travel |

## Per-gift motion mapping

The existing `catalog-motion-index.json` links 1,737 unique active gift codes to local SVG/model paths, animation identity, motion preset, duration, one of seven effect layers and a sound preset. The effect layers are petals, waves, rings, trail, orbits, bubbles and sparkles.

## Runtime and accessibility

- The native Web Animations API is used; no new animation package is required.
- Preset JSON is loaded from exact same-origin paths.
- Each preset has reduced-motion metadata. The runtime still checks `prefers-reduced-motion`.
- The service worker precaches the index and all 17 preset files.
- Existing inline frames remain a fallback.

## Honest format boundary

These are separately stored and runtime-loaded animation definitions—not Lottie/Rive files, recorded animated video, or embedded GLTF skeletal clips. The current audio runtime synthesizes category-based Web Audio cues. A full mastered, synchronized per-gift sound library and cinematic custom scenes have not been produced.
