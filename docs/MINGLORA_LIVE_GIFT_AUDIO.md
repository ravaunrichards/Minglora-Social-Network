# Minglora LIVE — original gift-specific WAV cues

## Scope and status

This increment adds a generated, gift-specific WAV cue pack for the **15 individually authored Minglora gift model identities** currently routed through the bespoke 3D catalogue. It does not claim mastered, human-recorded sound or cover all 1,748 source-catalogue gifts.

The generator creates 15 distinct original procedural compositions. No third-party recording, sample, logo, brand identifier or external audio URL is used.

## Gift-to-cue inventory

| Gift | Canonical code | Generated cue | Sound treatment |
|---|---|---|---|
| Rose | `rose-4ieccm` | `rose.wav` | Petal/chime motif with a light high-frequency shimmer |
| Hibiscus | `hibiscus-5-mgl` | `hibiscus.wav` | Bright floral chime with a separate melodic contour |
| Djembe Master | `djembe-master-1v3jzkm` | `djembe-master.wav` | Low hand-drum hits, resonant body and syncopated accents |
| Palm Breeze | `palm-breeze-gknyt0` | `palm-breeze.wav` | Airy broadband breeze and bright chime tones |
| Gamer Otter | `gamer-otter-100-mgl` | `gamer-otter.wav` | Short arcade-like ascending/descending note sequence |
| LIVE Island | `live-island-rmn3mc` | `live-island.wav` | Soft surf-like noise and warm ascending chimes |
| Crystal Crown | `crystal-crown-1itryeu` | `crystal-crown.wav` | Bright multi-part glassy chime sequence |
| Phoenix | `phoenix-wep6uk` | `phoenix.wav` | Rising low harmonic with a controlled airy swell |
| Beach Maracas | `beach-maracas-1exxoag` | `beach-maracas.wav` | Alternating shaker pulses with a tonal accent |
| Royal Lions Scepter | `royal-lions-scepter-15000-mgl` | `royal-lions-scepter.wav` | Low resonant growl-like synthesized bed and regal tones |
| Baseball | `baseball-orcdx9` | `baseball.wav` | Short impact transient followed by a pitched celebration |
| Crocodile | `crocodile-tnyf2j` | `crocodile.wav` | Low rumble with three differentiated jaw-snap transients |
| Dolphin | `dolphin-4bkejj` | `dolphin.wav` | High-register rising whistle calls and a light water-like wash |
| Maracas | `maracas-1wegi7n` | `maracas.wav` | Separate fast alternating shaker rhythm and short tonal accent |
| Pop Parrot | `pop-parrot-alp4e8` | `pop-parrot.wav` | Distinct rising/falling whistle calls with short beak-click accents |

## File and manifest contract

- Generated directory: `public/assets/gift-sounds/`.
- Audio files: `public/assets/gift-sounds/gifts/{slug}.wav`.
- Manifest: `public/assets/gift-sounds/manifest.json`.
- Container: WAV / RIFF.
- Encoding: signed 16-bit little-endian PCM.
- Sample rate: 44,100 Hz.
- Channels: 2 (stereo).
- Each manifest record includes the stable gift code, asset ID, filename, same-origin hashed URL, sample format, duration, byte length, SHA-256, original-composition license statement, source generator and `generated-review-required` review status.
- Output bytes and manifest are ignored by Git and regenerated deterministically from the checked-in source generator at `npm start`/prestart or by `npm run build:gift-sounds`. The generated build pack is uploaded as a CI artifact for inspection.

## Runtime integration

The existing `window.MingloraGiftFX` runtime remains the single playback path.

1. When a user selects a gift in Gift Center, Minglora preloads only that gift's same-origin manifest entry and WAV file.
2. On an audio-enabled user gesture, `prime(gift)` resumes the existing AudioContext and decodes the selected cue.
3. Decoded AudioBuffers are cached by canonical gift code; in-flight manifest, file and decode requests are shared rather than duplicated.
4. Gift playback uses the cached WAV when available. Existing gift-specific Web Audio synths and category synthesis remain the immediate-play and failure/device fallback.
5. The send request, gift event, Coin values, price, balance and wallet path are unchanged. Missing or invalid audio must never block sending.
6. The service worker caches hashed same-origin WAV requests by full request URL, so a new content hash cannot silently resolve to an older cached cue.

The loader validates the allow-listed code, path prefix, format, encoding, 44.1 kHz stereo/16-bit header, manifest byte length and decoded-buffer format. No remote audio URLs are accepted.

## Build and verification

- `npm run build:gift-sounds` generates all 15 cues and the machine-readable manifest.
- `prestart` generates the audio pack before the unified LIVE asset manifest is produced.
- `tests/unit/gift-sound-library.test.js` checks the 15-code inventory, unique cue hashes/URLs, RIFF/WAVE headers, PCM format, duration, manifest checksums, per-subject composition branches, runtime cache/fallback wiring and service-worker version route.
- The CI test job generates the files and uploads `public/assets/gift-sounds/` as `minglora-live-gift-audio-{run_number}`.

## Quality and release boundaries

These are original procedural synth compositions rendered to WAV—not human-recorded or professionally mastered recordings. Automated tests verify byte structure and unique generated content, not perceived mix quality, loudness balance, cultural accuracy, sound suitability, licensing sign-off or listening quality. All cues remain `generated-review-required`.

Professional listening review, mix/loudness review, mastering, hearing-accessibility review and testing on real Android/iPhone/tablet/desktop/TV hardware remain outstanding. The 15-cue pack does not provide bespoke WAVs for the remaining 1,733 source-catalogue records. No production gift activation, catalogue price, balance, wallet, transaction, payout, Supabase row or deployment is changed by this work.
