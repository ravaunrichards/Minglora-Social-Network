# Minglora individual gift animations

Generated from the user-provided gallery captures in `assets/Gifts/`.

Each gift has its own category folder containing:
- `poster.webp`: transparent, normalized 256 × 256 artwork crop.
- `animation.svg`: individually keyed, reduced-motion-aware animated SVG presentation.

See `manifest.json` for gift IDs, categories, source screenshots, crop coordinates, OCR confidence, catalog matches and per-gift asset paths. See `extraction-report.json` for processing totals and any failures.

**Source limitation:** the supplied inputs are still gallery screenshots, not original animation videos or 3D animation files. The SVG motion is an original presentation effect applied to each extracted still; it is not TikTok's proprietary animation. Original 3D motion can only be integrated when the corresponding animation/model sources are supplied. Generated gifts are marked `needs_visual_review` and must not be published automatically.

The extractor is repeatable and writes only under `assets/animations/gifts/`. It does not modify the source captures, active gift catalog, coin prices, wallets, gift transactions or creator earnings.
