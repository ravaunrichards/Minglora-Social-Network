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

The generated `catalog-motion-index.json` links all **1,737 active gift codes** to local SVG/model paths, a unique animation identity, the existing category choreography, duration, one of seven effect layers, a sound preset and an exact same-origin `motion_asset_url`.

The LIVE motion builder also creates **one distinct keyframe JSON file per active gift** under `public/assets/animations/gifts/per-gift/<gift-code>.json`. Each file carries the canonical gift code and animation key, its source semantic preset, duration, reduced-motion metadata and a stable subject/ordinal-specific keyframe variation. The generated files are lazy-loaded when a gift is previewed or played; they are not all downloaded with the initial room. The existing 17 preset files remain as a compatibility fallback if an individual file cannot be loaded.

The generator's `--check` mode verifies the motion index and every generated per-gift file byte-for-byte. The unit suite checks that all active gifts have a corresponding asset and that no two active gifts share the same keyframe signature. Retired gift rows are excluded from the runtime motion index and no catalogue prices, gift status flags, transactions or balances are edited.

## Runtime and accessibility

- The native Web Animations API is used; no new animation package is required.
- Preset JSON is loaded from exact same-origin paths.
- Each preset has reduced-motion metadata. The runtime still checks `prefers-reduced-motion`.
- The service worker precaches the index and all 17 preset files.
- Existing inline frames remain a fallback.

## Honest format boundary

These are separately stored and runtime-loaded animation definitions—not Lottie/Rive files, recorded animated video, or embedded GLTF skeletal clips. The current audio runtime synthesizes category-based Web Audio cues. A full mastered, synchronized per-gift sound library and cinematic custom scenes have not been produced.


## Individual motion asset scope

The per-gift files are individualized Web Animations API keyframes applied to each gift's existing generated SVG or GLTF model. They provide a unique motion variation and a separate runtime asset for every active gift; they are **not** individually modelled cinematic 3D scenes, Lottie/Rive files, rendered video, or authored GLTF skeletal clips. Premium high-detail models, transparent original artwork, dedicated mastered gift audio and physical-device rendering/performance checks remain separate release gates.
