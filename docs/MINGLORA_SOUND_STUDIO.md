# Minglora Sound & Notifications Studio

The account-level ringtone and notification Sound Studio is separate from the creator Sounds library used for post and Story soundtracks.

## Original audio pack

The build generator creates 120 original WAV cues: 30 voice-call ringtones (default **Minglora Signature**), 30 separate video-call ringtones (default **Minglora Vision**) and 60 notification sounds for 22 independently configurable categories.

The six sound families are Classic, Modern, Premium, Minimal, Digital and Cinematic. The generator creates actual PCM audio files and a manifest with durations, byte sizes and SHA-256 hashes. It uses no third-party recordings, samples or borrowed melodies. Run npm run build:sounds to regenerate the pack. npm start runs the generator before starting the server.

## Preferences and custom sounds

Account selections, per-category enablement, favorites, selected theme and custom sound metadata are saved on the authenticated member's Minglora account state, persisted through the configured Supabase state store and synchronized when the member signs in on another device.

Custom uploads reuse the existing private minglora-ringtones bucket and authenticated media upload flow. Uploads are owner-scoped, use the existing accepted audio MIME types and are limited to 20 MB. The existing /api/calls/ringtone endpoint remains compatible; an existing custom ring is migrated into the new library without deleting it.

Ringtone and notification volumes remain independent. Vibration patterns, silent/vibrate modes, individual sound switches and Do Not Disturb hours/allowed-call policy use Minglora's existing persisted experience settings.

## Offline and platform boundaries

The web client can cache all 120 built-in WAV files in Cache Storage for offline preview and foreground playback. The service worker serves cached sounds when offline. Some browsers/WebViews still require a user interaction before audio can begin.

Web Push/service-worker notifications cannot select arbitrary per-account audio as the operating-system notification tone. When Minglora is backgrounded or the browser is closed, the OS/browser controls system notification tones and vibration. Custom notification cues therefore play on eligible foreground in-app notification events. Native background per-category tones require native Android/iOS notification-channel integration. The existing Android project is a WebView shell, and this repository does not contain a corresponding iOS native app implementation; native background playback is not represented as complete.

Sound preferences affect audio presentation only. They do not suppress security events or override notification delivery policy.
