# MeetWave — Minglora feature

## Canonical repository

**The only active application repository is `ravaunrichards/Minglora-Social-Network`.** MeetWave is a first-class feature inside Minglora, not a separate application, backend, deployment, or ongoing repository. All future MeetWave development, fixes, tests, releases and deployments belong in this repository.

The standalone `ravaunrichards/meetwave-video-conferencing` repository is legacy migration material only. Its non-secret tracked source and artifacts have been preserved in this repository under `docs/migrations/meetwave-legacy-source/`. The legacy repository's Git history is not mirrored; this is a complete point-in-time snapshot of its tracked non-secret files from source commit `5d830ba9b202f82f4c43b4a8d0f466a3643e0916`.

## Minglora integration

- Reuse Minglora authentication, session cookies, member profiles, privacy settings, notifications and durable application-state persistence.
- Use Minglora's existing LiveKit service as the meeting media/SFU provider. This replaces the standalone unauthenticated WebSocket signaling and peer-to-peer mesh topology.
- Render MeetWave inside Minglora's existing web shell and existing Minglora Android application. Do not create another Android app or production server for MeetWave.
- Keep MeetWave's own navigation destination, frontend module, API namespace, backend domain module and meeting-specific state. This feature isolation prevents meeting permissions and settings from being mixed with Messages, Group Calls, Creator LIVE, Groups or Events.
- Support instant, scheduled and reusable personal rooms; public, friends-only and invitation-only access; room codes and invite links; host room ending; member invitations; participant chat; and actual participant counts reported by LiveKit.
- Enforce a server-side maximum of eight concurrent participants per room. Scheduled rooms become joinable fifteen minutes before their scheduled start.
- Persist rooms, invitations, attendance and meeting chat through Minglora's existing durable application-state adapter.
- Keep meeting invitation privacy independent: MeetWave uses `privacy.meetWaveAudience` (`everyone`, `friends` or `nobody`). It does not read or inherit the direct-message audience setting.

## Canonical active implementation paths

- `backend/modules/meetwave/service.js` — meeting domain rules and invitation audience checks.
- `src/server.js` — authenticated Minglora API routes, provider checks, room lifecycle and LiveKit participant verification.
- `public/meetwave.js` and `public/meetwave.css` — the integrated MeetWave experience.
- `public/settings.js` — independent MeetWave invitation privacy setting.
- `tests/unit/meetwave.test.js` and `tests/api.test.js` — feature and API regression coverage.

## Preserved legacy source archive

`docs/migrations/meetwave-legacy-source/` retains 39 of the original 41 tracked files byte-for-byte, including:

- Original browser UI, JavaScript, stylesheets and synchronized Android web assets.
- Standalone Android WebView source, manifest, Java activity, launcher images and Gradle build/wrapper files.
- Original server, package metadata, scripts, tests, CI workflow and security/development documentation.
- Historical APK and its checksum, marked archival only.

The archive's `MIGRATION_MANIFEST.md` documents its source commit and preservation rules. Archived files are reference material only: do not deploy the archived `server.js`, enable the archived workflow, or install/distribute its APK as a Minglora client. The original Android wrapper is retained for source reference; Minglora's own Android app remains the only active client.

## Signing-secret exclusions

The following two files were intentionally not duplicated:

- `meetwave-android-source/credentials.txt`
- `meetwave-android-source/meetwave-release.jks`

They contain release-signing credentials/key material that were committed to a public repository. Treat them as compromised. Do not reuse the legacy key or credentials; establish a new Minglora signing identity and keep release secrets only in protected CI secrets. This archive does not include the standalone repository's complete Git history.

## Provider requirement

MeetWave requires Minglora's existing LiveKit configuration (`LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`). When those settings are absent or the provider is unreachable, the API reports that condition and room creation/joining fails closed. Never invent participant presence or display fabricated viewer/participant counts.

## Remaining scope

The integrated meeting-room foundation is present, but this does not mean every conferencing capability is complete. Breakout rooms, recordings, live transcription, AI summaries, waiting-room admission, co-host delegation and enterprise controls remain follow-on work and must not be represented as implemented until built and tested.
