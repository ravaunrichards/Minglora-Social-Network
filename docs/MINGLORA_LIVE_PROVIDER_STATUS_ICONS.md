# Minglora LIVE provider status icon pack

## Purpose

These icons are attached to the existing LIVE setup provider-readiness pill. They are not a new source of connectivity information and do not represent the LiveKit media room's live connection/reconnect events.

## State mapping

| State key | Existing response condition | Text retained in the UI | Asset |
|---|---|---|---|
| `ready` | `status.configured && status.connected === true` | LiveKit ready | `provider-ready.svg` |
| `not-configured` | `!status.configured` | Live provider not configured | `provider-not-configured.svg` |
| `unavailable` | provider configured, but `status.connected !== true` | Live provider connection failed | `provider-unavailable.svg` |

## Source files

- `public/assets/icons/live-provider-status/manifest.json`
- `public/assets/icons/live-provider-status/provider-ready.svg`
- `public/assets/icons/live-provider-status/provider-not-configured.svg`
- `public/assets/icons/live-provider-status/provider-unavailable.svg`

Each image has a single 24×24 `icon` symbol with a currentColor stroke. The inline symbol is decorative and `aria-hidden`; status text remains visible and accessible.

## Integration

- UI mapping: `public/app.js`
- Sizing and flex alignment: `public/styles.css`
- Versioned app/style references: `public/index.html`
- Offline precache: `public/sw.js` (shell v331)
- Unified generated inventory and SHA-256: `scripts/generate-minglora-live-asset-manifest.mjs`
- Tests: `tests/unit/live-provider-status-icons.test.js` and `tests/unit/live-asset-manifest.test.js`

## Review boundary

The icons are original source vector graphics but remain `design-review-pending`. SVG lint/test and manifest hashes are not premium visual approval, accessibility user research, or rights clearance. These three states only reflect the existing provider preflight result. They do not report room-level reconnection, audio/video track quality, guest invitation, moderation or gift transaction status.
