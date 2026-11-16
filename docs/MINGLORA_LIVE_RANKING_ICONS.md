# Minglora LIVE discovery ranking tab icons

## Purpose

Provide an original, consistent Minglora visual icon for each of the three existing LIVE discovery ranking tabs. These icons are visual labels only; they do not change navigation targets, ranking data, score computation, APIs or permissions.

## Mapping

| Existing destination | Visible label | SVG |
|---|---|---|
| `daily` | Daily | `daily.svg` |
| `popular` | Popular LIVE | `popular.svg` |
| `league` | League | `league.svg` |

## Asset files

- `public/assets/icons/live-ranking-discovery/manifest.json`
- `public/assets/icons/live-ranking-discovery/daily.svg`
- `public/assets/icons/live-ranking-discovery/popular.svg`
- `public/assets/icons/live-ranking-discovery/league.svg`

Each SVG has a 24×24 viewBox, one external-use symbol named `icon`, and currentColor stroke. The symbols are decorative and aria-hidden; the visible text labels remain in the buttons.

## Integration

- Runtime: `public/app.js` immutable allow-list and `liveDiscoveryIcon()`.
- Existing selection/handlers: `data-live-discovery`, `loadLiveDiscoveryBoard()`, existing `.active` class.
- Styling: `public/styles.css`, 16×16 inline glyph.
- Unified inventory: `scripts/generate-minglora-live-asset-manifest.mjs`.
- Offline behavior: `public/sw.js` shell v331; manifest and three SVGs are precached.
- Asset versions: `public/index.html` uses the new stylesheet and application script URLs.
- Tests: `tests/unit/live-ranking-discovery-icons.test.js` and the expanded LIVE asset manifest test.

## Acceptance boundary

Assets remain `design-review-pending`. Automated file/hash checks do not establish human design approval, accessibility user testing or rights review. No new ranking backend, scoring, API or real-time data behavior was added.
