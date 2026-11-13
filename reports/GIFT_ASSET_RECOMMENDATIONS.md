# Minglora Gift Asset Recommendations

## Recommended directory and asset standards

The source workspace has been created at `assets/gift-assets/`:

```text
assets/gift-assets/
  artwork/
    source/
    approved/
  models/
    source/
    approved/
  audio/
    source/
    mastered/
  manifests/
    asset-register.json
    rights-register.json
assets/animations/gifts/
  README.md
  animation-catalog.json
public/assets/animations/gifts/
  catalog-motion-index.json
  preset-index.json
  presets/                 # 17 individually served keyframe assets
public/assets/audio/gifts/ # reserved for approved per-gift audio
```

The source, approved and mastered asset folders are empty apart from their instructions and manifests. This establishes the delivery structure; it does not claim that premium art or mastered audio has already been produced.

## Recommended editorial collections

Keep editorial collections separate from the canonical database categories:

1. Flowers and botanicals
2. Love and hearts
3. Animals and companions
4. Vehicles and speed
5. Music and performance
6. Sports and victory
7. Food and drinks
8. Fashion and beauty
9. Luxury and jewellery
10. Celebrations and events
11. Fantasy and cosmic
12. Nature and island life
13. Travel and destinations
14. Gaming and digital culture
15. Community and friendship
16. Symbols and reactions
17. Seasonal and cultural festivals
18. Jamaican and Caribbean heritage

## Per-gift production checklist

| Asset | Recommended standard |
|---|---|
| Catalogue | Stable gift code, title, category, Coin value and active state |
| Listing art | Original transparent square artwork, designed to read at small tile size |
| Preview poster | Consistent framing; optimized PNG/WebP |
| 3D model | GLTF/GLB, centered origin, named nodes, PBR materials and bounded textures |
| Animation | Gift-specific choreography for hero gifts; shared preset for ordinary catalogue gifts |
| Effects | Appropriate particle layer without excessive visual noise |
| Audio | Original mastered cue, normalized, short, previewable and muted by default until user interaction |
| Provenance | Author, source, licence, territory, modification and distribution permissions |

## Priority order

**P0 — Protect production data:** retain canonical IDs/prices/flags, wallet and ledger behavior; keep same-origin asset delivery; do not promote extracted crops without rights review.

**P1 — Premium hero gifts:** create high-detail original models, curated textures, gift-specific animation scenes and mastered synchronized sound for the highest-visibility gifts first.

**P2 — Full catalogue:** refine original artwork and model quality across all active gifts; add seasonal and Caribbean editorial collections; create localization-ready labels and descriptions.

## Starting performance targets (recommendations, not measurements)

Aim for 512×512 listing artwork; keep ordinary GLB delivery around 1–2 MB where visual quality permits; reserve 2K textures for selected hero assets; keep short gift cues approximately 0.5–2.5 seconds. Measure actual download, GPU, memory, battery and thermal impact on low/mid-range Android hardware before adopting these as release gates.

## Existing gaps

The 1,509 extracted artwork crops still need human review and rights/licence clearance. Existing generated 3D scenes are not evidence of photorealistic handcrafted models for every gift. The new 17-file animation catalogue provides real file-based choreography presets, but not 1,737 unique cinematic animations or Lottie/Rive packs. The Web Audio tone generator and separate Sound Studio library are not a mastered per-gift sound collection. Physical Android/iOS/tablet/foldable/TV validation remains outstanding.
