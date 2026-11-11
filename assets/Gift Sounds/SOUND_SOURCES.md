# Minglora Gift Sound Sources

This source register collects real recordings and sound effects from openly licensed sources for review and later ingestion into the Artwork-aligned gift-audio library.

## Source pools

### Published CC0 field recordings
The Ambient Sounds by Leminno public library documents seven third-party CC0 recordings with creator, original source page, release URL, sample rate, duration, byte count and SHA-256. The source README distinguishes these real field recordings from its separately generated procedural sound-design material. **Only the seven third-party recording entries are listed here; procedural material is excluded.**

### CC0 recorded effects
The sound-cc0 repository describes its files as real sound effects dedicated to CC0 1.0/public domain and provides a per-file CSV. Candidate types include bell, cracker/pop, metal rack, steel pan, switch click and laughter. Listen and select the right clip before assigning a gift.

### Freesound CC0 candidates
Several source pages explicitly display CC0 and describe genuine recordings (lion roar, firework, applause, ocean waves, rocket launch). Their source pages are recorded here. The direct media preview/download URL is not available in this execution environment, so these entries are candidates only and are not activated in the app.

## Strict acceptance gate

1. Download the original or a permitted high-quality preview from the source.
2. Re-check the per-file licence on the actual source page at ingestion time.
3. Listen to the clip and confirm it is a real recording and appropriate for the exact gift.
4. Record creator, source URL, licence, format, duration, sample rate, SHA-256 and any required attribution.
5. Trim only silence/unneeded lead-in and apply conservative loudness matching; preserve the original source in a review archive.
6. Do not mark a gift sound as production-ready until its local audio file exists and has passed decoding/integrity checks.
7. Keep every sound under the matching `assets/Artwork/<gift-slug>/` directory convention: `assets/Gift Sounds/<gift-slug>/sound.mp3`.
8. No files are marked production-ready by this source register alone.

## Current status

- 7 real CC0 field recordings have immutable release URLs and source metadata.
- 9 CC0 public-domain effect files are identified with raw file URLs and source CSV names.
- 6 further Freesound CC0 candidates have verified source pages.
- **No external audio binary was downloaded in this environment**, so no audio files are claimed as bundled or tested.
