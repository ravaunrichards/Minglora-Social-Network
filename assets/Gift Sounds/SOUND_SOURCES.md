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
- **33 source MP3 files are now downloaded and verified** in `assets/Gift Sounds/_sources/mp3/`; all decode as stereo 44.1 kHz, 192 kbps MP3.
- **101 per-gift `sound.mp3` candidate files** have been created in folders matching `assets/Artwork/<gift-slug>/`.
- **71 active catalogue gift codes** are mapped by exact gift code to their matching candidate recordings in `gift-code-map.json`.
- Gifts Studio preview can audition mapped candidates. Sent gifts and LIVE rooms play the 71 exact code mappings; human listening QA remains pending.
- Human listening QA is pending; 71 exact gift-code sound mappings are enabled from the verified CC0/public-domain source pool. Natural recordings can still be a poor semantic match or have unwanted background noise, so each candidate requires listening review.

The actual files still need to be downloaded from their sources and auditioned before being copied into per-gift folders.

## Source ingestion helper

The repository includes `tools/ingest-sources.mjs` for a repeatable, licence-aware source-ingestion step. It verifies fixed-release WAV assets by byte count/SHA-256, verifies public-domain repository files by Git blob hash, and checks the Freesound API licence before downloading an MP3 preview.

Dry-run the public source list:

```bash
node "assets/Gift Sounds/tools/ingest-sources.mjs" --dry-run --download-public
```

Download public GitHub-hosted sources and transcode them to 192 kbps MP3 (requires Node 20+ and FFmpeg):

```bash
node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-public
```

Freesound previews require a developer API key in `FREESOUND_API_KEY`:

```bash
FREESOUND_API_KEY=... node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-all
```

The script stores originals and MP3 review copies under `assets/Gift Sounds/_sources/`. It deliberately does **not** activate or copy sounds into gift folders; a human must audition each recording and approve the corresponding gift mapping first.
