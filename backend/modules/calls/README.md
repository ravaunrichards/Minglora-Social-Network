# Voice and video calls

Calls use authenticated invitation and participant state with Minglora's shared LiveKit media service.

The lifecycle is **ringing → active → ended**. Invitations expire after 45 seconds. Answer, decline, caller cancellation, missed calls, participant departure and host ending are explicit states. A caller and recipient cannot be placed into overlapping active calls. Calls support up to eight participants, enforced by a LiveKit room provisioned with the eight-person participant limit.

The server prepares the LiveKit room before persisting a new invitation and prepares the room/token before changing a participant to joined. If provider provisioning fails, Minglora returns a service error instead of creating an unusable call. Cancelled, declined, expired and ended calls trigger LiveKit room cleanup. Unexpected client disconnects update the participant/call state rather than leaving a stale joined record.

Members can upload a personal ringtone or song into the private `minglora-ringtones` Storage bucket. Supported formats: MP3, M4A, OGG, WebM, WAV, FLAC and AAC. Uploads are limited to 20 MB and checked against their file signatures. Playback URLs are short-lived; storage keys remain private.

While Minglora is open, the custom ringtone and caller ringback play in the page. When the browser/PWA is backgrounded or closed, configured Web Push supplies a persistent system call notification and vibration. Browsers do not permit a service worker to stream a user's uploaded song as the operating-system ringtone. Full-screen Android CallStyle ringing with a custom song while the process is stopped requires a native push/call-notification integration beyond the current WebView shell.

See [the call API contract](../../../docs/API.md#voice-and-video-calls) for the endpoint lifecycle and payload boundaries.
