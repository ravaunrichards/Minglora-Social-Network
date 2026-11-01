# MeetWave — Minglora feature

## Canonical repository

**The only active application repository is `ravaunrichards/Minglora-Social-Network`.** MeetWave is a first-class feature inside Minglora, not a separate application, backend, deployment, or ongoing repository. All future MeetWave development, fixes, tests, releases and deployments belong in this repository.

The standalone `ravaunrichards/meetwave-video-conferencing` repository is legacy migration material only. It is not the source of truth and must not receive new feature work or be used as a separate production application. Its GitHub archive status is a separate repository setting; the source repository remains present until that setting is changed.

## Minglora integration

- Reuse Minglora authentication, session cookies, member profiles, privacy settings, notifications and durable application-state persistence.
- Use Minglora's existing LiveKit service as the meeting media/SFU provider. This replaces the standalone unauthenticated WebSocket signaling and peer-to-peer mesh topology.
- Render MeetWave inside Minglora's existing web shell and the existing Minglora Android application. Do not create another Android app or production server for MeetWave.
- Keep MeetWave's own navigation destination, frontend module, API namespace, backend domain module and meeting-specific state. This feature isolation prevents meeting permissions and settings from being mixed with Messages, Group Calls, Creator LIVE, Groups or Events.
- Support instant, scheduled and reusable personal rooms; public, friends-only and invitation-only access; room codes and invite links; host room ending; member invitations; participant chat; and actual participant counts reported by LiveKit.
- Enforce a server-side maximum of eight concurrent participants per room. Scheduled rooms become joinable fifteen minutes before their scheduled start.
- Persist rooms, invitations, attendance and meeting chat through Minglora's existing durable application-state adapter.
- Keep meeting invitation privacy independent: MeetWave uses `privacy.meetWaveAudience` (`everyone`, `friends` or `nobody`). It does not read or inherit the direct-message audience setting.

## Canonical implementation paths

- `backend/modules/meetwave/service.js` — meeting domain rules and invitation audience checks.
- `src/server.js` — authenticated Minglora API routes, provider checks, room lifecycle and LiveKit participant verification.
- `public/meetwave.js` and `public/meetwave.css` — the integrated MeetWave experience.
- `public/settings.js` — independent MeetWave invitation privacy setting.
- `tests/unit/meetwave.test.js` and `tests/api.test.js` — feature and API regression coverage.

## Legacy files intentionally excluded

The standalone repository contains a release signing keystore, a credentials file, an APK build artifact, a separate Android WebView application, and a standalone server. Do not copy these into Minglora:

- Signing keystores and passwords are secrets, not application source. The old repository contains committed signing material; treat it as exposed and rotate/revoke the affected signing credentials. Do not reuse those credentials.
- The APK is a generated build artifact. Build Minglora from its own Android project and release pipeline.
- The standalone Android wrapper and embedded web assets belong to the retired separate application. Minglora's own Android application is the only Android app.
- The standalone server and its unauthenticated WebSocket signaling are replaced by Minglora's authenticated API and shared LiveKit service.

## Provider requirement

MeetWave requires Minglora's existing LiveKit configuration (`LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`). When those settings are absent or the provider is unreachable, the API reports that condition and room creation/joining fails closed. Never invent participant presence or display fabricated viewer/participant counts.

## Remaining scope

The integrated meeting-room foundation is present, but this does not mean every conferencing capability is complete. Breakout rooms, recordings, live transcription, AI summaries, waiting-room admission, co-host delegation and enterprise controls remain follow-on work and must not be represented as implemented until built and tested.
