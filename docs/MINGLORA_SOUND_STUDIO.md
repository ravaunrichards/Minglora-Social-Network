# Minglora Sound & Notifications Studio

The account-level ringtone and notification Sound Studio is separate from the creator Sounds library used for post and Story soundtracks.

## Authentic recording policy

The previous 120-item generated WAV pack (30 voice-call cues, 30 video-call cues and 60 notification cues) was procedurally synthesized. It has been retired and is no longer accepted as real audio. The startup build removes only the legacy generated voice/video/notification folders and preserves the dedicated authentic-recordings folder and all private member uploads.

The active built-in manifest is generated exclusively from \`data/minglora-authentic-audio-library.json\` by \`npm run check:audio-library\`. It includes only recordings whose exact source page and license are documented, commercial use and hosted playback/redistribution are explicitly permitted, the original file exists, its checksum matches, a human reviewer confirms authenticity, and a real playback/listening test has passed. AI voices, robotic voices, synthesized tones, oscillator sounds and procedural effects are rejected.

The 80 candidate source listings and 17 target audio types are available at \`/audio-resources.html\`. Source sites are discovery links only; they do not provide blanket permissions. See [Minglora Authentic Audio Resource Directory](MINGLORA_AUTHENTIC_AUDIO_RESOURCE_DIRECTORY.md) for the required metadata and approval process.

## Preferences and private custom sounds

Account selections, per-category enablement, favorites, selected theme and custom sound metadata are saved on the authenticated member's Minglora account state, persisted through the configured Supabase state store and synchronized when the member signs in on another device.

Custom uploads reuse the existing private \`minglora-ringtones\` bucket and authenticated media upload flow. Uploads are owner-scoped, use the existing accepted audio MIME types and are limited to 20 MB. The existing \`/api/calls/ringtone\` endpoint remains compatible; an existing custom ring is migrated into the new library without deleting it. Private uploads are not counted as third-party curated catalog recordings and are available only to their owner.

Ringtone and notification volumes remain independent. Vibration patterns, silent/vibrate modes, individual sound switches and Do Not Disturb hours/allowed-call policy use Minglora's existing persisted experience settings. Until authentic recordings are approved and installed, no built-in ringtone or notification audio is selected; vibration, silent mode and private custom uploads remain available.

## Offline and platform boundaries

Only approved authentic recordings can be cached by the web client for offline preview and foreground playback. Some browsers/WebViews still require a user interaction before audio can begin.

Web Push/service-worker notifications cannot select arbitrary per-account audio as the operating-system notification tone. When Minglora is backgrounded or the browser is closed, the OS/browser controls system notification tones and vibration. Custom notification cues therefore play on eligible foreground in-app notification events. Native background per-category tones require native Android/iOS notification-channel integration. The existing Android project is a WebView shell, and this repository does not contain a corresponding iOS native app implementation; native background playback is not represented as complete.

Sound preferences affect audio presentation only. They do not suppress security events or override notification delivery policy.
