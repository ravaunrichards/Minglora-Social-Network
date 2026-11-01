# Voice and video calls

Calls use authenticated invitation state and Minglora's shared LiveKit media service.

The lifecycle is **ringing → answered/active → ended**. Invitations expire after 45 seconds. Answer, decline, caller cancellation and missed calls are explicit states. The caller hears ringback while invited recipients hear their configured ringtone.

Members can upload a personal ringtone or song into the private `minglora-ringtones` Storage bucket. Supported formats: MP3, M4A, OGG, WebM, WAV, FLAC and AAC. Uploads are limited to 20 MB and checked against their file signatures. Playback URLs are short-lived; storage keys remain private.

While Minglora is open, the custom ringtone and caller ringback play in the page. When the browser/PWA is backgrounded or closed, Web Push supplies a persistent system call notification and vibration. Browsers do not permit a service worker to stream a user's uploaded song as the operating-system ringtone. Full-screen Android CallStyle ringing with a custom song while the process is stopped requires a native push/call-notification integration beyond the current WebView shell.
