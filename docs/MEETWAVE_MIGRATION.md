# MeetWave integration into Minglora

MeetWave is now a first-class Minglora feature. The canonical application repository is `ravaunrichards/Minglora-Social-Network`; the original source project is `ravaunrichards/meetwave-video-conferencing`.

## Integration decisions

- Reuse Minglora authentication, session cookies, member profiles, privacy settings, notifications and durable application-state persistence.
- Use Minglora's existing LiveKit service as the meeting media/SFU provider. This replaces MeetWave's standalone unauthenticated WebSocket signaling and mesh WebRTC topology.
- Keep the MeetWave experience inside Minglora's existing web shell and Android WebView application rather than starting a second production server.
- Support instant, scheduled and reusable personal rooms; public, friends-only and invitation-only access; room codes and invite links; host room ending; member invitations; participant chat; and real participant counts from LiveKit.
- Enforce a server-side maximum of eight concurrent participants per room. Scheduled rooms become joinable fifteen minutes before the scheduled start.
- Persist rooms, invitations, attendance and meeting chat in Minglora's existing durable application-state collections.

## Source material excluded for security and product integrity

The original repository contains an Android release keystore, a credentials text file, an APK, and a separate application server. These are not copied into Minglora. The keystore and credentials must never be committed to an application repository; the APK is a build artifact, not source. The separate server is intentionally replaced by Minglora's authenticated API and existing LiveKit integration.

The original MeetWave repository is retained as a source/archive copy. It is not deleted or modified by this migration.

## Provider requirement

MeetWave requires the existing Minglora LiveKit configuration (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`). When those settings are absent or the provider is unreachable, the API reports that status and room creation/joining fails closed rather than generating fake meeting presence or fake participant counts.

## Current scope

This migration delivers the integrated meeting-room foundation. Breakout rooms, recordings, live transcription, AI summaries, waiting-room admission, co-host delegation and enterprise controls remain follow-on work and must not be presented as already implemented.
