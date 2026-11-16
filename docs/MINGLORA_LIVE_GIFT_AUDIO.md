# Minglora LIVE — Gift-specific original audio pack

## Scope

This pack adds dedicated original procedural WAV cues to the eleven gifts that already have individually art-directed Minglora GLTF source models. It does not claim that all 1,748 catalogue entries have bespoke mastered audio.

## Included gift identities

| Gift | Catalogue code | Asset |
|---|---|---|
| Rose | `rose-4ieccm` | `gifts/rose.wav` |
| Hibiscus | `hibiscus-5-mgl` | `gifts/hibiscus.wav` |
| Djembe Master | `djembe-master-1v3jzkm` | `gifts/djembe-master.wav` |
| Palm Breeze | `palm-breeze-gknyt0` | `gifts/palm-breeze.wav` |
| Gamer Otter | `gamer-otter-100-mgl` | `gifts/gamer-otter.wav` |
| LIVE Island | `live-island-rmn3mc` | `gifts/live-island.wav` |
| Crystal Crown | `crystal-crown-1itryeu` | `gifts/crystal-crown.wav` |
| Phoenix | `phoenix-wep6uk` | `gifts/phoenix.wav` |
| Beach Maracas | `beach-maracas-1exxoag` | `gifts/beach-maracas.wav` |
| Royal Lions Scepter | `royal-lions-scepter-15000-mgl` | `gifts/royal-lions-scepter.wav` |
| Baseball | `baseball-orcdx9` | `gifts/baseball.wav` |

## Asset contract

- WAV container; PCM signed 16-bit little-endian; 44.1 kHz; stereo.
- Each cue has a unique SHA-256 and a manifest record in `public/assets/gift-sounds/manifest.json`.
- Each record includes gift code, asset ID, path/URL, duration, bytes, hash, license statement, source generator and review status.
- Cues are original synthesized compositions; no third-party recordings or samples are included.
- `npm run build:gift-sounds` creates the eleven sound files and manifest. `npm start` also generates them through `prestart`.
- CI uploads the generated pack as a reviewable workflow artifact.

## Runtime integration

The existing `window.MingloraGiftFX` system owns playback. The Gift Center preloads a selected gift's manifest entry, decodes the WAV after the audio context is primed by a user interaction, caches the decoded AudioBuffer and uses it from the existing preview/show/play calls. The existing per-gift/category Web Audio synth remains the immediate-play and unsupported-device fallback. No parallel gift event bus or transaction is introduced.

The runtime loads only same-origin manifest URLs under `/assets/gift-sounds/gifts/` with a generated hash query. Failed fetch/decode falls back without blocking gift sending or the transaction.

## Quality status and limitations

All eleven WAVs are generated and structurally validated by automated tests. They are **not** human-recorded, human-mastered or audio-artist-approved. Every record therefore uses `generated-review-required`. Professional listening review, device loudness/mix review and final mastering are still required before describing the cues as premium mastered audio.

This pack is an 11-gift subset, not all 1,748 catalogue gifts. It changes no coin price, production catalogue activation, balance, refund, creator earnings or gift transaction.
