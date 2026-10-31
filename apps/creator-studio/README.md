# Minglora Creator Studio

The active Creator Studio is implemented in the main Minglora browser client at `public/app.js` through `renderCreator()` and `renderCreatorSection()`. Its styling lives in `public/styles.css`. The `apps/creator-studio/` directory is reserved for a future separately packaged app shell; it is not the current runtime entry point.

## Active workspace

- The Creator Studio section navigation reuses the same LIVE broadcast-format card structure and dimensional icon treatment; the Studio also offers direct Video LIVE and Audio LIVE handoffs using the same controls as the LIVE start screen.
- A global header palette switcher gives members immediate access to all supported app colour palettes and LIVE room palettes. Changes are persisted through the authenticated settings API; a host can also update the active room through the host-only LIVE theme endpoint.

Creator Studio is part of Minglora's shared application experience, not a separate visual product. It keeps the global desktop navigation and app sidebar, uses the account's Theme Centre palette for its workspace surfaces and controls, and exposes its creator sections through an in-app workspace bar. Audio LIVE and Video LIVE remain separate broadcast formats inside the same LIVE player and use one selected room-theme system.

- Overview with creator profile metrics, recent publications, creator tool shortcuts and a real WebGL-rendered 3D production-stage scene.
- Content library for the member's actual profile posts and media attached to those posts, including edit and delete through authenticated post APIs.
- Create and publish using the existing secure media picker, resumable upload preparation/completion flow and `POST /api/posts`.
- Audience with actual followers, following and profile-activity data returned by the member-profile API.
- Analytics showing only existing profile insights: 30-day profile views, current active profile viewers, followers and published posts.
- Pages and channels using real Page ownership/role checks, Page details, Page publishing and Page post/Page deletion routes.
- Monetization using the existing creator-earnings and PayPal payout-account/withdrawal routes.
- Studio settings using the authenticated `GET/PATCH /api/settings` endpoints for privacy, notification, theme, colour, feed-order and reduced-motion preferences.
- A dedicated handoff to the separate LIVE experience. The studio does not duplicate LiveKit camera, microphone, participant, chat or guest-session controls.

## Honest implementation boundaries

- Creator Studio's section navigation is pinned below the global app header while scrolling on desktop and mobile. The global header, desktop rails, Settings category rail, profile tabs and mobile bottom navigation retain their anchored positions.
- The production-stage scene prefers WebGL, but includes an interactive SVG-based 3D compatibility renderer for browsers or devices where WebGL cannot be created or is lost. The scene remains visible instead of showing an unavailable message.

The current backend does not expose scheduled publishing, creator membership tier management, post-level impression/watch-time/retention analytics, audience demographics, Page analytics, campaign/brand-deal management or Page admin/editor assignment UI. These are not presented as working tools in the current studio.

An empty account remains empty. Counts, audience members, earnings, uploads and publication records are read from Minglora's APIs; no sample or generated activity is inserted to fill the workspace.

The production-stage canvas is rendered with WebGL geometry, lighting and camera transforms in the browser. It reports a WebGL unavailable state instead of substituting a static picture when the browser cannot create a WebGL context.

## Main runtime and verification

- Browser view: `public/app.js`
- Studio styling: `public/styles.css`
- API: `src/server.js`
- Feature inventory: `docs/FEATURES.md`
- Route inventory: `docs/API.md`

Run the repository's normal checks before deploying changes. A code commit is not itself proof that the hosted application or external provider environment has been deployed and verified.
