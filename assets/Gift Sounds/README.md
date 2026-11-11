# Minglora Gift Sounds

- **Collection title:** Minglora Gift Sounds
- **Artwork source of truth:** `assets/Artwork/`
- **Artwork folders indexed:** 1509
- **Matching layout:** one slug-named folder per artwork item, with `sound.mp3` as the primary audio filename.
- **Catalogue status:** all 1509 artwork slugs are indexed; **no audio files are claimed as present in this commit**.
- **Audio quality requirement:** real-world field recordings or authorized human performances; no synthetic placeholder tones or robotic text-to-speech.
- **Playback intent:** each gift's audio starts with its matching gift animation and follows the gift event lifecycle.

## Folder convention

```text
assets/
├── Artwork/
│   └── <gift-slug>/artwork.png
└── Gift Sounds/
    ├── README.md
    ├── manifest.json
    └── <gift-slug>/
        └── sound.mp3
```

## Asset acceptance rules

1. Use a genuine recording or a sound recording with documented permission for Minglora's intended use.
2. Record the source URL, creator, licence, attribution text (when required), and file checksum in the manifest before production use.
3. Do not label synthetic, generated, or placeholder audio as a natural/original recording.
4. Do not copy recordings from third-party platforms without permission.
5. Keep each gift folder aligned with its exact `assets/Artwork/<gift-slug>/` folder.
6. Do not ship an empty or fake MP3. Missing recordings remain explicitly marked as awaiting verified source audio.
7. Confirm the recording matches the gift and animation before activating it in production.

## Current checkpoint

The collection index is aligned to all 1509 Artwork directories. The repository integration is deliberately staged: authentic audio binaries and their licence/provenance evidence still need to be ingested. The previous generated demo audio pack is not used because it does not meet the natural-recording requirement.
