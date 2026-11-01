# MeetWave — Video Conferencing

MeetWave is an independent browser-based meeting application with an Android
client that uses the same website UI and production meeting server.

## Features

- Responsive meeting lobby with create/join by room code.
- Browser microphone/camera permissions and local preview.
- WebRTC peer-to-peer audio/video and screen sharing.
- Real-time meeting chat and participant updates over WebSockets.
- Mute/unmute, camera toggle, leave meeting, invite-link copy.
- Server-side room validation and a maximum of 8 participants per room in
  this starter.
- Health and room-status endpoints.
- Android WebView client with camera/microphone permissions and a persistent
  production server URL.

## Production website

The main branch is connected to the existing Render web service:

https://meetwave-video-conferencing.onrender.com

Health endpoint:

https://meetwave-video-conferencing.onrender.com/api/health

Render automatically deploys commits pushed to `main`. The server listens on
Render's assigned `PORT` and serves the website and WebSocket signaling from
the same origin.

## Website and Android synchronization

**The `public/` directory is the canonical UI source.** Do not edit the
Android asset copy separately.

Run:

```bash
npm install
npm test
```

The test command first runs `scripts/sync-android-assets.js`, which recreates
`meetwave-release-keystore/app/src/main/assets/` from `public/`, then runs
the automated tests. This prevents the website and packaged Android UI from
drifting apart.

Every push to `main` triggers `.github/workflows/meetwave-ci.yml`:

1. Install the supported Node.js 24 runtime and server dependencies.
2. Synchronize the canonical website files into Android assets.
3. Run HTTP, room-validation, WebSocket join, and chat integration tests.
4. Build the Android application with a monotonically increasing version code.
5. Verify the APK and publish it as a GitHub Actions artifact.
6. Publish/update the stable Android download release only when release
   signing secrets are configured.

The Android app defaults to the same live Render service URL. It therefore
opens the currently deployed website when online; its bundled copy remains a
fallback UI. The pipeline also packages the current `public/` files into each
APK so the embedded copy is kept current.

Latest signed Android download (available after signing is configured):

https://github.com/ravaunrichards/meetwave-video-conferencing/releases/download/android-latest/meetwave-video-conferencing.apk

## Enable signed Android releases

Add the four secrets listed in [SECURITY.md](SECURITY.md) under the GitHub
repository's Settings → Secrets and variables → Actions. Do not put signing
passwords or keystore files in source control. If the secrets are not yet
configured, CI still produces a debug APK artifact to prove the Android
project compiles, but that debug APK cannot update an existing release-signed
installation.

## Local development

Requirements: Node.js 24 and Java 17.

```bash
npm install
npm test
npm start
```

Then open http://localhost:3000. Use a second browser/device on the same
reachable server and enter the same room code.

## Current prototype limitations

MeetWave currently uses peer-to-peer WebRTC with a public STUN server and no
TURN relay or SFU. The eight-participant room cap is intentional for this
starter. Connections can fail on restrictive networks, and mesh performance
degrades as participant count grows. There are not yet accounts, waiting rooms,
moderator permissions, meeting passwords, recordings, calendar integration,
end-to-end encryption review, abuse controls, or enterprise access
management. Do not use for sensitive meetings without a security review.
