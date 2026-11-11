# Minglora Gift Sounds

- **Collection title:** Minglora Gift Sounds
- **Artwork source of truth:** `assets/Artwork/`
- **Artwork folders indexed:** **1,509**
- **Matching layout:** one slug-named folder per artwork item, with `sound.mp3` as the primary audio filename.
- **Real source recordings:** **33** downloaded and integrity-checked into the source review pool.
- **Mapped gift folders:** **101** matching Artwork folders now contain their own `sound.mp3` candidate.
- **Active live-gift code mappings:** **71** exact active gift codes resolve to their matching recorded sound candidate.
- **Gift sound preview:** real candidate MP3s can be auditioned with the Gifts Studio preview control.
- **LIVE/send playback:** remains approval-gated; unapproved candidate recordings are silent in sent gifts and LIVE rooms.
- **MP3 format validation:** passed; every source MP3 is decodable MP3, stereo, 44.1 kHz and 192 kbps.
- **Human listening approval:** **NOT COMPLETED**.
- **Production-ready gift sounds:** **0** until the 101 candidate clips are listened to, confirmed against the visible gift/animation and approved.
- **Robotic text-to-speech and synthetic placeholder tones:** not included.

## Folder convention

```text
assets/
├── Artwork/
│   └── <gift-slug>/artwork.png
└── Gift Sounds/
    ├── README.md
    ├── SOUND_SOURCES.md
    ├── manifest.json
    ├── source-catalog.json
    ├── candidate-mappings.json
    ├── ingested-sources.json
    ├── _sources/
    │   └── mp3/<source-id>.mp3
    ├── tools/
    │   └── ingest-sources.mjs
    └── <gift-slug>/
        └── sound.mp3
```

## What the library contains

The source review pool contains genuine animal calls, wildlife recordings, natural ambience, fireworks, applause/celebration effects, bell and other recorded effects. Each source is catalogued with creator/source page, declared licence, original file checksum or immutable source metadata, and converted MP3 checksum.

Gift folders are mapped by direct artwork subject or close event theme. Where more than one gift uses the same natural sound source (for example, several cat gifts), each folder has its own correctly named `sound.mp3` while the source master remains in `_sources/mp3/`.

## 3D/spatial playback

The MP3 assets retain stereo sound. They are intended to be played at the same time as the matching gift animation. Minglora's playback layer should apply real-time listener-relative positioning (pan/azimuth, distance attenuation, optional room reverb and Doppler only where the animation justifies it). These transforms should be applied at playback time rather than permanently baked into the source MP3, so the same natural recording remains correct for different listener positions and devices.

## Runtime integration

The existing Gifts Studio preview and animated gift presentation use `public/gift-effects.js`. The sound player resolves active gifts by their exact catalogue gift code through `gift-code-map.json`; it does not infer the sound from category alone. The current map covers 71 active gift codes. The service serves only the map and slug-specific `sound.mp3` paths through a restricted route. Unmapped gifts remain silent. Candidate audio can be auditioned in Gifts Studio, but normal send/LIVE playback requires `playbackApproved: true` for that exact mapping. Do not enable a candidate until it has been listened to and matched with the gift animation.

## Review and production gate

1. Listen to every candidate, including repeated copies, and confirm that the clip genuinely fits the gift.
2. Reject any imitation, synthetic-sounding or misleadingly labelled clip.
3. Check timing against the actual animation; trim only unnecessary silence or lead-in.
4. Confirm perceived loudness and avoid peaks or clipping across the gift collection.
5. Confirm licence/provenance, credit requirements and commercial/app redistribution permissions for every source.
6. Mark a gift production-ready only after its audio file, source record, listening approval and animation match are complete.

## Current checkpoint

- 33 genuine/public-domain source MP3s in `_sources/mp3/`.
- 101 individual per-gift MP3 candidate files aligned to 101 existing Artwork folders.
- 1,509 total gift records are indexed in `manifest.json`.
- Source ingestion and MP3 format validation passed in GitHub Actions.
- 0 candidate clips have human listening approval; 0 are marked production-ready.
