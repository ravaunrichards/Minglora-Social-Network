# Minglora Gift Catalogue Report

**Date:** 2026-11-13  
**Canonical source:** `data/minglora-gift-catalog.json`

## Verified catalogue counts

| Item | Count |
|---|---:|
| Total gift rows | 1,748 |
| Active gifts | 1,737 |
| Retired/inactive gifts | 11 |
| Existing standalone original GLTF models in `public/assets/gifts/` | 45 |
| Read-only catalogue screenshots in `assets/Gifts/` | 131 |
| Extracted artwork crop records in `assets/Artwork/` | 1,509 |

The catalogue generator builds an SVG and GLTF file for every catalogue row into `public/assets/gifts/catalog/` when `npm run build:gifts` or the app's `prestart` lifecycle runs. Those thousands of generated output files are intentionally build-generated rather than committed as duplicate tracked binaries.

## Stored category distribution

| Category | Rows | Category | Rows |
|---|---:|---|---:|
| Other | 455 | Animals | 201 |
| Music | 137 | Food & drinks | 128 |
| Hearts | 115 | Fantasy | 105 |
| Celebrations | 83 | Sports | 78 |
| Community | 73 | Luxury | 71 |
| Nature | 57 | Flowers | 55 |
| Fashion & beauty | 53 | Travel | 47 |
| Vehicles | 44 | Symbols | 25 |
| Games | 18 | Reactions | 3 |

The stored categories are the actual data values. Seasonal, Jamaican/Caribbean, fan-club, creator-milestone and cinematic groupings are best added as editorial collections without changing canonical category IDs or historical Coin values.

## Asset pipeline

- Catalogue metadata: `data/minglora-gift-catalog.json`.
- Generated tile art: `/assets/gifts/catalog/<gift-code>.svg`.
- Generated model: `/assets/gifts/catalog/<gift-code>.gltf`.
- Existing standalone 3D models: `public/assets/gifts/`.
- Motion mapping: `public/assets/animations/gifts/catalog-motion-index.json`.
- New source workspace: `assets/gift-assets/`.
- Source animation catalogue: `assets/animations/gifts/animation-catalog.json`.
- Individual animation assets: `public/assets/animations/gifts/presets/<preset-id>.json`.

## Preservation and review gate

The automated crop audit reports zero hash-integrity errors and zero exact duplicate SHA groups, but flags 1,114 extracted records for human review. Human review and rights/licence clearance are not completed. Do not promote reference crops into production merely because they are present.

This work does not modify gift codes, coin prices, active/retired flags, wallet balances, transaction history, member records, gift ledger entries or broadcast records.
