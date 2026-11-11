# Minglora individual gift animations

Generated from the user-provided gallery captures in `assets/Gifts/`.

Each gift has its own category folder containing:
- `poster.webp`: transparent, normalized 256 × 256 artwork crop.
- `animation.svg`: individually keyed, reduced-motion-aware animated SVG presentation.

See `manifest.json` for gift IDs, categories, source screenshots, crop coordinates, OCR confidence, catalog matches and per-gift asset paths. See `extraction-report.json` for processing totals and any failures.

`catalog-motion-index.json` is the small served runtime map for exact active catalogue-code matches. It carries the canonical gift name, Coin price, original `image_url`, original `model_url`, sound preset and original animation preset alongside the additional motion profile. The same file is mirrored to `public/assets/animations/gifts/catalog-motion-index.json` for the app and service worker. Runtime never swaps in a screenshot crop for the original gift artwork or 3D model. The Artwork manifest path, hash, capture source and review warnings remain available for traceability.

**Source limitation:** the supplied inputs are still gallery screenshots, not original animation videos or 3D animation files. The SVG motion is an original presentation effect applied to each extracted still; it is not TikTok's proprietary animation. Original 3D motion can only be integrated when the corresponding animation/model sources are supplied. Generated gifts are marked `needs_visual_review` and must not be published automatically.

The extractor is repeatable and writes only under `assets/animations/gifts/`. It does not modify the source captures, active gift catalog, coin prices, wallets, gift transactions or creator earnings.
