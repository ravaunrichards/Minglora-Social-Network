# Creator Hub Live frontend style migration

This directory preserves the original Creator Hub Live `frontend/styles/app.css` source stylesheet.

The original file is intentionally not linked directly into Minglora's global page because it defines global selectors, root tokens and generic class names that overlap Minglora's existing interface. Minglora exposes the imported Creator Hub Live palette tokens through `/experience-center.css` and the account-backed Style Library in Settings → Experience Center instead. This keeps the source intact while preventing CSS collisions.

Imported palettes:
- CHL Night
- Ocean Studio
- Violet Creator
- Emerald Studio
- Rose Premium
- Light Professional

The source stylesheet is retained for future component-by-component adoption. Do not add it as a global stylesheet without first scoping its selectors and keyframes.
