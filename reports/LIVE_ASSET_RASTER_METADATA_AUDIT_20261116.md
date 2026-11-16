# Minglora LIVE — Source Raster Metadata Audit

**Audit generated:** 2026-11-16 00:16:53 UTC (2026-11-15 evening, Jamaica)  
**Current main checked:** `d273390b08b1fa87f325ced1a223ae65e1d90c29`  
**Audit workflow:** run `43779364162`, test job `133012818970`  
**Scanned workflow head:** `42248cc0e4cee966b5b6e0cf05f31a182b58e9ee` (PR #415, based on main `095a713a742216cf686438357c3129deb75bd523`)  
**CI artifact:** `minglora-live-image-metadata-audit-13358`, artifact ID `14187507020`  
**Audit method:** read-only raster-header parsing; no source files were modified.

## Overall result

| Metric | Verified result |
|---|---:|
| Candidate raster images | 2,863 |
| Successfully parsed | 2,863 |
| Unsupported image files | 0 |
| Parse failures | 0 |
| Total source bytes | 431,981,981 |
| PNG | 1,742 |
| JPEG | 1,121 |
| Encoded alpha channel declared | 1,741 |
| Explicit transparency metadata chunks/flags | 0 |
| Animation metadata declared | 0 |
| Full human visual review | Not performed |
| Rights/licence review | Not performed |
| Per-pixel alpha scan | Not performed |

The image roots scanned were `assets/reference`, `assets/Gifts`, `assets/Guests Layout`, `assets/Gifters Badge Levels`, `assets/League` and `assets/Artwork`.

## Per-folder results

| Source folder | Files | Bytes | Formats | Alpha channel declared | Dimensions observed |
|---|---:|---:|---|---:|---|
| `assets/reference` | 1,121 | 387,820,405 | 1,071 JPEG; 50 PNG | 50 | 94 distinct size pairs; 144–1,366 px wide, 157–2,408 px high |
| `assets/Gifts` | 132 | 27,150,149 | 1 JPEG; 131 PNG | 131 | 128 distinct size pairs; 604–1,080 × 417–890 px |
| `assets/Guests Layout` | 9 | 66,481 | 9 JPEG | 0 | Portrait; 154–170 × 292–323 px |
| `assets/Gifters Badge Levels` | 72 | 2,401,127 | 20 JPEG; 52 PNG | 51 | 20 distinct size pairs; 170–1,080 × 76–1,040 px |
| `assets/League` | 20 | 570,961 | 20 JPEG | 0 | Landscape; 711–1,080 × 216–573 px |
| `assets/Artwork` | 1,509 | 13,972,858 | 1,509 PNG | 1,509 | All 256 × 256 px |

### Reference screenshot sizing

The 1,121 reference images contain 94 distinct encoded dimension pairs. The two dominant Android screenshot sizes are 1,080 × 2,408 (533 files) and 720 × 1,600 (480 files). The remaining reference set includes the desktop screenshots and smaller crops.

## Exact-file duplicate findings

Independent SHA-256 grouping of the 2,863 image records found **31 exact-hash groups spanning 63 files** (32 additional byte-identical copies beyond one canonical member per group). Examples include the nine named guest-layout diagrams also retained in the Android reference archive, and some curated badge/League images repeated in reference folders.

These are provenance/archive duplicates, not automatically removable waste. **No copies were deleted, renamed, consolidated or overwritten.** Keep each supplied reference location intact until an explicit repository-level retention decision is made.

## What this audit establishes — and what it does not

- File headers and image dimensions were readable for all 2,863 raster images. The generated JSON artifact includes each path, format, dimensions, orientation, file size and SHA-256.
- PNG alpha-channel declarations are present in 1,741 files. The scanner does not decode image pixels, so this does **not** prove the background is transparent or that any visible pixel is translucent.
- No explicit transparency chunk/flag or animation metadata was detected in this scanned set. This finding is limited to those six raster roots and the formats present there; it is not an audit of SVG, GLTF, WebM, MP4, Lottie or Rive animations.
- JPEG dimensions are recorded in encoded orientation; EXIF orientation was not applied.
- This is not human visual inspection, quality grading, source-brand removal, rights/licence clearance or production approval. The 1,509 screenshot-derived artwork crops remain review-only. The 1,121 reference screenshots remain layout/behavior evidence, not production gift artwork.
- The workflow's metadata-audit step completed and uploaded the artifact. The enclosing test job later failed in unrelated existing unit tests; this report does not mark repository-wide CI as green.

## Follow-up

1. Visually inspect reference families and the 1,509 quarantined crops in contact sheets, maintaining source paths and human-review dispositions.
2. Perform decoded pixel-alpha inspection only for assets proposed for production transparency.
3. Review source rights and remove any excluded company logo/name/trademark/brand identifiers from newly authored Minglora UI or artwork; preserve originals in the reference archive.
4. Continue original Minglora gift-specific artwork/model/animation work. The existing generated category-template catalogue is not premium approval.
5. Do not activate production gifts until the existing version-3 art, rights, model, audio, pricing and transaction release gates are satisfied.

## Reproduction

```sh
npm run audit:live-image-metadata
```

The scanner writes `reports/live-image-metadata-audit.json` and `reports/live-image-metadata-audit.md`; CI uploads these as `minglora-live-image-metadata-audit-<run-number>`.
