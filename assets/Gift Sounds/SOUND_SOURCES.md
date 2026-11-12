# Minglora Gift Sound Sources

This source register collects real recordings and recorded sound effects for later use in the Artwork-aligned gift-audio library.

## Source pools

### Published CC0 field recordings
The Ambient Sounds by Leminno public library documents **7 third-party CC0 recordings** with creator, original source page, immutable release URL, sample rate, duration, byte count and SHA-256. Its README distinguishes these recordings from separately generated procedural sound-design assets. **Only the 7 genuine third-party field recordings are in this catalogue; procedural audio is excluded.**

### CC0 recorded effects
The `code4fukui/sound-cc0` repository declares its sound files public-domain/CC0 and lists the individual recordings in its CSV. **9 file records** are catalogued: bell, cracker/pop, metal rack, steel pan, switch click and laughter. File byte counts and Git blob hashes are recorded in `source-catalog.json`.

### Additional CC0/public-domain recordings
A further **17 real recordings** are catalogued and present as verified MP3 review files: 14 CC0 animal recordings and 3 public-domain/CC0 wildlife or celebration recordings from Wikimedia Commons. Their creator, source page, licence, source URL and integrity metadata are retained in `source-catalog.json`. These files are downloaded and format-verified but have not been auditioned.

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
- Gifts Studio preview can audition mapped candidates. Sent gifts and LIVE rooms remain silent for candidates until the individual mapping is human-approved.
- 0 clips have human listening approval and 0 gift sounds are marked production-ready. Natural recordings can still be a poor semantic match or have unwanted background noise, so each candidate requires listening review.

The 33 public CC0/public-domain recordings are already downloaded and verified in the source pool, and 101 per-gift candidate files are already copied into their artwork-matched folders. What remains is human audition and approval. The separate 20 Freesound source-page candidates are not downloaded; they require the optional `FREESOUND_API_KEY`.

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
