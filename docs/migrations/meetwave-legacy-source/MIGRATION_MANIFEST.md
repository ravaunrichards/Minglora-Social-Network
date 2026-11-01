# MeetWave legacy source preservation

This archive preserves the tracked file contents from
`ravaunrichards/meetwave-video-conferencing` at source commit
`5d830ba9b202f82f4c43b4a8d0f466a3643e0916`.

## Preservation boundary

- Original tracked files: 41.
- Copied as-is: 39 files, including the old web UI, Android app source/assets,
  Gradle build files, scripts, tests, documentation, CI workflow, and the
  historical APK plus checksum.
- Intentionally not copied: `meetwave-android-source/credentials.txt` and
  `meetwave-android-source/meetwave-release.jks`. These contain release-signing
  credentials/key material that were committed to a public repository. They
  must be treated as compromised, not duplicated into Minglora. Establish a
  new Minglora signing identity and keep all release secrets in protected CI
  secrets; do not reuse the old key.
- The source repository's complete Git history is not mirrored; this is a
  point-in-time snapshot of all non-secret tracked files from the commit above.

## How to use this archive

This directory is archival/reference material only. The active MeetWave feature
is implemented inside Minglora in `backend/modules/meetwave/`,
`public/meetwave.js`, `public/meetwave.css`, and the existing Minglora route,
settings, shared authentication, media-provider integration and tests.

Do not deploy the archived `server.js`, run the archived workflow, or release
the archived APK as the Minglora application. The legacy app used its own
standalone in-memory WebSocket signaling and peer-to-peer WebRTC mesh service;
Minglora must continue to use its authenticated platform services and shared
media provider.

The APK is retained solely as a historical build artifact and must not be
installed or distributed as a current Minglora build.
