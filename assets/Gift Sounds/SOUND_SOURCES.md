# Minglora Gift Sound Sources

This source register collects real recordings and recorded sound effects for later use in the Artwork-aligned gift-audio library.

## Source pools

### Published CC0 field recordings
The Ambient Sounds by Leminno public library documents **7 third-party CC0 recordings** with creator, original source page, immutable release URL, sample rate, duration, byte count and SHA-256. Its README distinguishes these recordings from separately generated procedural sound-design assets. **Only the 7 genuine third-party field recordings are in this catalogue; procedural audio is excluded.**

### CC0 recorded effects
The `code4fukui/sound-cc0` repository declares its sound files public-domain/CC0 and lists the individual recordings in its CSV. **9 file records** are catalogued: bell, cracker/pop, metal rack, steel pan, switch click and laughter. File byte counts and Git blob hashes are recorded in `source-catalog.json`.

### Freesound CC0 candidates
**20 source-page candidates** are registered, including recorded cat, bee, bird, duck, frog, goat, rooster, cow, owl, sheep, pig, mouse, horse and dog sounds, plus lion roar, fireworks, applause and ocean waves. CC0 is visible on each source page. Freesound requires an account login to download originals; its API can provide high-quality MP3 previews when an API key is configured. The ingest helper will re-check the API's licence before saving any preview.

One chicken-clucking imitation was explicitly excluded because its uploader describes it as an imitation, not a genuine animal recording.

## Strict acceptance gate

1. Confirm the current per-file licence and creator/source information.
2. Download a genuine recording or licensed source preview; never substitute text-to-speech or an artificial placeholder.
3. Listen to the clip and confirm that its sound actually matches the relevant gift and animation.
4. Record creator, source URL, licence, format, duration, sample rate, SHA-256 and any required attribution.
5. Trim only unwanted silence/lead-in and apply conservative loudness matching; preserve an unedited source copy.
6. Do not activate a gift sound until the local audio file exists and passes decoding/integrity checks.
7. Keep the final gift clip at `assets/Gift Sounds/<gift-slug>/sound.mp3`, matching `assets/Artwork/<gift-slug>/artwork.png`.
8. No file is production-ready merely because its source or licence has been catalogued.

## Current checkpoint

- 7 published CC0 field-recording assets with verified release metadata and hashes.
- 9 public-domain recorded-effect files with verified repository metadata and Git blob hashes.
- 20 CC0 source-page candidates for animal and gift-event recordings.
- 1 imitation excluded from natural-recording consideration.
- **0 audio binaries downloaded, 0 clips auditioned and 0 gift sounds production-ready in this repository branch.**

The actual files still need to be downloaded from their sources and auditioned before being copied into per-gift folders.
