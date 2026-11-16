# Minglora live video and calls — LiveKit integration

## Provider isolation

Minglora uses its own LiveKit Cloud project named **Minglora**. Do not reuse ZUNO, Zovara, or another product's LiveKit URL, API key, API secret, room names, or credentials.

LiveKit Cloud project creation is performed in the LiveKit Cloud dashboard. The LiveKit CLI's project commands configure local CLI references; they do not create a Cloud project.

## Server integration

The current Node.js API integrates the official \`livekit-server-sdk\` package. API keys and secrets are read only from server environment variables:

- \`LIVEKIT_URL\`
- \`LIVEKIT_API_KEY\`
- \`LIVEKIT_API_SECRET\`

Never expose \`LIVEKIT_API_SECRET\` in browser code, public build variables, API responses, repository files, or logs.

## Implemented API foundation

All routes below require a signed-in Minglora account.

- \`GET /api/live/status\`: reports whether the three server-side LiveKit settings are present; it never returns secrets.
- \`GET /api/live/sessions\`: lists currently live sessions visible to the signed-in member.
- \`POST /api/live/sessions\`: creates a Minglora live session and returns a host access token.
- \`POST /api/live/sessions/:id/join\`: checks session visibility and returns a subscriber-only viewer token, or a publishing token for the host.
- \`POST /api/live/sessions/:id/leave\`: marks the signed-in participant as having left.
- \`POST /api/live/sessions/:id/end\`: lets only the host end the Minglora session.

Session state is persisted with the existing application persistence adapter. Rooms are created by LiveKit when the first authorized client connects. Host tokens can publish; viewer tokens can subscribe but cannot publish audio, video, or data. Tokens have a two-hour expiry. The client must disconnect on leave/end and request a fresh token when reconnecting after expiry.

## Browser LIVE experience

The browser client connects to LiveKit rooms with the official `livekit-client` SDK. Hosts and approved guests receive media publish permissions appropriate to the broadcast type; viewers can subscribe and send allow-listed ephemeral LIVE reaction data packets but cannot publish microphone or camera tracks. The UI attaches remote audio/video tracks, reports room participants from LiveKit events, provides camera/microphone controls, multi-guest seats, live chat, host-pinned comments, shared reactions, room themes, gifts and LIVE reward tools. The LIVE directory verifies that the host is currently connected before listing a session and displays provider-reported participant counts rather than fabricated counts.

The directory and stream player must remain usable when the optional Coins catalogue or wallet endpoint is temporarily unavailable. Gifting and balance details may display a recoverable unavailable state, but must never prevent a viewer from entering or continuing to watch a real LIVE room.

## Remaining limitations

Co-host roles beyond the eight approved guest seats, stream recording/egress, and a verified LiveKit webhook receiver are not yet implemented. Do not advertise those features as complete until implemented and tested. Ended sessions are no longer listed or joinable through Minglora's API; clients should disconnect when the host ends a session.

## Cloud project setup

1. Sign in to [LiveKit Cloud](https://cloud.livekit.io/).
2. Create exactly one Cloud project named **Minglora**.
3. In project Settings, create an API key and secret.
4. Configure the three environment variables above in Minglora's server hosting environment.
5. Do not commit the secret or paste it into source files.

LiveKit's Build plan currently starts at US$0/month with no credit card required. See [LiveKit pricing](https://livekit.com/pricing).


## Independent audio LIVE and speaker stage

Each broadcast stores `broadcast_type` as `video_audio` or `audio_only`. Audio-only hosts receive a LiveKit token limited to the microphone track source and the stage uses Minglora's original embedded golden-microphone glTF model; camera permissions are not granted. Video+audio hosts receive microphone and camera publishing permissions. Viewers remain subscribe-only.

Signed-in listeners can request a guest seat through `POST /api/live/sessions/:id/speaker-requests`. The host can list requests with `GET /api/live/sessions/:id/speaker-requests` and accept or reject a request with `PATCH /api/live/sessions/:id/speaker-requests/:userId` using `{ "decision": "accept" | "reject" }`. A maximum of eight guest speakers can be approved per room. Approved guests reconnect through the normal join route and receive microphone plus camera publishing access in video+audio LIVE rooms. Audio-only rooms restrict guests to microphone publishing. Their stage state is recorded in `live_participants` and Minglora's durable application state.

The `GET /api/live/sessions/:id/speaker-request` endpoint returns the signed-in member's request status so the browser can offer the Join stage action after acceptance. The host can change the active room appearance inside the LIVE settings drawer. Theme choices are persisted by the `PATCH /api/live/sessions/:id/theme` endpoint.


### Presence and speaker connection integrity

Minglora only records a participant as connected after the client has connected to its LiveKit room and the server verifies that identity through the LiveKit Room Service API. A connected listener can still create a hand-raise request; that request transitions the relational participant row from viewer/connected to guest/requested. Host approval moves it to guest/accepted, and a successful microphone-enabled speaker join moves it to guest/connected. The client roster shows published microphone participants regardless of whether they are currently speaking, with separate muted/speaking states.

### LIVE reactions and viewer data permissions

Video+audio and audio-only LIVE rooms support shared lightweight reactions (hearts, applause, fire and laughter) over LiveKit data packets. Viewer tokens may publish data packets for these allow-listed in-room reactions while remaining unable to publish microphone or camera tracks. Reaction packets are ephemeral, client-validated and are not Coins, gifts, earnings or a persisted engagement ledger. Audio-only broadcasts continue to withhold camera publishing permissions from every role.

### Host-pinned comments

The LIVE host may pin one current chat comment to the stage. Pin and unpin actions are sent as reliable LiveKit room data packets and viewers accept them only when the sender identity matches the session host. The host may also remove a comment from the active chat; the trusted runtime verifies host ownership before deleting that room-scoped comment. Pin state is transient for the active room; it is not presented as a permanent chat record.

### In-room controls and host moderation

The main room layout keeps the video/audio stage, guest seats, reactions, compact controls and chat visible. Goody Bags, Treasure Boxes, gift browsing, guest management and room appearance are opened from the LIVE settings drawer instead of permanently occupying the community column.

In video+audio rooms, approved guests can publish microphone and camera tracks and use their own mute/camera controls. In audio-only rooms, guests are restricted to the microphone. The host can accept or decline speaker requests, remove an accepted/connected guest from the stage, and continue the broadcast. Removing a guest disconnects their LiveKit participant and changes their persisted guest-stage status to `left`; they return to the audience and may request a new stage place.

The host may pin or unpin a current chat comment. That pin is an in-room data message, accepted only when its sender identity matches the session host; it is transient and not a permanent chat record. Hearts, applause, fire and laughter are likewise sent as ephemeral data packets. Viewer tokens may publish data only for this interaction path and still cannot publish audio or video.


### Host screen sharing

Video+audio LIVE hosts may publish a screen-share track in addition to microphone and camera tracks. The share is rendered as the main stage while the participant seat strip remains visible. Screen-share publishing is not granted to viewers or guest speakers, and audio-only LIVE does not request display capture. Browser display-capture support and the user's explicit screen/window/tab selection are required. A screen share ends when the host stops sharing or the browser/provider reports the capture track as ended.


## Pre-LIVE setup and broadcast modes

The pre-LIVE form saves a compact setup object on the session before a room is opened. It includes the LIVE board, title/About me text, audience, practice mode, capture quality, microphone noise suppression, stability optimization, viewer-count visibility, the community-safety reminder, gift availability, audience-control availability, content disclosure and an optional client call-to-action.

The product mode is stored separately from the relational media type so the existing `broadcast_type` constraint remains `video_audio` or `audio_only`. LiveKit publish-track permissions are derived from the stored mode and participant role on both initial room creation and reconnect; Mobile Gaming hosts get microphone/screen-share, approved guests get microphone only, and audio-only participants never get camera permission:

- **Video + Audio** publishes camera and microphone tracks.
- **Audio Only** publishes a microphone track and does not request camera access.
- **Mobile Gaming** uses microphone plus a screen-share track and keeps the camera off. The browser/device must expose `navigator.mediaDevices.getDisplayMedia`; this browser path is not a substitute for native Android MediaProjection/game capture.
- **Live Studio** uses camera, microphone and host screen sharing in the existing browser LIVE room. It is not yet a multi-scene production compositor or a separate desktop broadcast application.

The room's `audioCaptureDefaults` applies the saved echo-cancellation, noise-suppression and automatic-gain settings. The selected 720p/1080p preset is applied when the installed LiveKit client exposes that preset; Auto leaves the SDK's default capture selection intact. The stability setting controls LiveKit adaptive stream and dynacast options. Screen-share capture uses the selected resolution when the browser and installed client support it.

Practice Mode is enforced by the API: its session audience is forced to private, public follower notifications are not sent, and Coins gifts plus reward drops are rejected by the server. The LIVE Gifts switch is also checked by the gift and reward-drop endpoints, not only by the browser controls. Audience control off forces the session audience to public; when on, the host's selected public/friends/private audience is applied.

The viewer-count option hides the in-room count and directory presence for that session. Content disclosure and the optional client call-to-action are displayed in the room; client links must be HTTPS and are validated server-side.

The Community safety option controls the room's safety reminder. Existing platform reporting/blocking protections remain separate and are not disabled by this visual preference.

### Host-assigned LIVE moderators and Group LIVE chat

Group LIVE chat is enabled by default for new broadcasts and can be disabled in the pre-LIVE setup. The preference is saved in the broadcast's `liveSettings.groupChatEnabled` value. Both the room UI and authenticated `/api/live/sessions/:id/chat` GET/POST routes enforce the stored preference; a disabled room omits its chat composer and does not poll for messages.

The host can assign up to 10 existing Minglora members by username from the LIVE settings drawer. Assignments are room-scoped and stored on the active LIVE session. The host can list, add and remove assignments through:

- `GET /api/live/sessions/:id/moderators`
- `POST /api/live/sessions/:id/moderators` with `{ username }`
- `DELETE /api/live/sessions/:id/moderators/:memberId`

Only the host can change assignments. The host and assigned room moderators may remove inappropriate comments from that LIVE's chat; only the host can pin or unpin comments, manage the guest stage, change room settings or end the broadcast. Moderator assignments do not grant platform-admin or account-wide moderation privileges.

### Features intentionally not exposed as working switches yet

Guardian/family controls, stream recording/egress, advanced visual effects, LIVE Services and Fan Club require their own provider, storage, safety and creator workflows. They are not shown as active controls until those workflows are implemented and verified. Full Android mobile-game capture also requires native Android integration; browser screen sharing alone cannot provide that capability.
