# Minglora LIVE — Gift Catalogue

**Canonical source:** `data/minglora-gift-catalog.json`  
**Generated asset builder:** `scripts/generate-minglora-gifts.mjs`

## Verified catalogue totals

- Catalogue rows: **1,748**
- Active/selectable records: **1,737**
- Retired/inactive records retained in history: **11**
- Unique gift codes: validated by the existing generator and catalogue tests
- Coin price range in the configured catalogue: **1–60,999 Coins**
- Every row has a category, original animation identity, animation preset, sound preset, duration, local SVG path and local GLTF path.
- The catalog generator emits 1,748 SVG artworks and 1,748 GLTF models.

This report does not change coin pricing or activate retired items. Pricing remains sourced from the canonical catalogue and backend.

## Stored categories and mapping to the requested themes

| Stored catalogue category | Rows | Closest requested theme |
|---|---:|---|
| flowers | 55 | Flowers and Romance |
| hearts | 115 | Flowers and Romance |
| animals | 201 | Cute and Fun; Animals and Wildlife |
| community | 73 | Cute and Fun; Supporter and Fan Club themes |
| food_drink | 128 | Cute and Fun; Caribbean and Culture where source-tagged |
| fashion_beauty | 53 | Luxury and Lifestyle; Royal and VIP |
| luxury | 71 | Luxury and Lifestyle; Royal and VIP |
| vehicles | 44 | Luxury and Lifestyle; Gaming and Technology |
| sports | 78 | Sports and Achievement |
| celebrations | 83 | Celebration and Events; Seasonal |
| music | 137 | Music and Entertainment |
| games | 18 | Gaming and Technology |
| fantasy | 105 | Fantasy and Magic; Universe and Space |
| nature | 57 | Animals and Wildlife; Seasonal |
| travel | 47 | Caribbean and Culture; Cinematic themes where applicable |
| symbols | 25 | Gaming and Technology; Supporter and Fan Club themes |
| reactions | 3 | Interactive reactions |
| other | 455 | Mixed themes; requires gift-level tagging/review |

The theme mapping is editorial guidance, not a new catalogue taxonomy. Seasonal, Caribbean, exclusive/limited, cinematic, interactive, supporter/fan-club and creator-custom collections need explicit gift-level tags and review before they can be presented as distinct, complete curated collections. The current catalogue does not prove that every example in the brief has a dedicated original 3D model or animation.

## Per-gift asset contract

For each catalogue row the canonical paths are:

- SVG artwork: `/assets/gifts/catalog/<code>.svg`
- GLTF model: `/assets/gifts/catalog/<code>.gltf`
- Animation: `animation_key`, `animation_preset`, `animation_duration_ms`
- Sound profile: `sound_preset`

The generator and tests validate unique codes and animation keys, safe local paths, required metadata and price validity. The LIVE motion index introduced in this branch contains active gifts only and points at these same canonical paths.

## Rights and review

The 1,509 extracted screenshot crops in `assets/Artwork/` are explicitly marked review-only. Their extraction did not establish commercial use permission. They must not be activated as production gifts until each asset's rights/provenance is established or it is replaced by original Minglora artwork.
