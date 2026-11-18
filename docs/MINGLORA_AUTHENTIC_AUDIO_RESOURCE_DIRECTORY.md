# Minglora Authentic Audio Resource Directory

## Purpose

The source directory contains 80 discovery listings supplied for Minglora. Its seven sections and 17 target audio types are available through \`/audio-resources.html\`. A source listing is not an approved recording, license grant, download, or installed file.

## Strict acceptance gate

Only an authentic recording may enter the active Sound Studio. The acceptance process rejects AI-generated voices, robotic voices, synthesized tones, artificial oscillators, procedural sound effects, and recordings represented as real when they are not.

Every approved asset must have all of the following recorded:

1. Original filename.
2. Exact original download page.
3. Source/website name.
4. File format.
5. Recording description.
6. License name and license URL.
7. Attribution requirement and exact attribution text when required.
8. Explicit commercial-use permission.
9. Explicit permission for Minglora to host and stream/redistribute the recording.
10. Download date.
11. SHA-256 checksum.
12. Real-world recording method and human authenticity review.
13. Human listening/playback test and test timestamp.

A general "free download" statement is insufficient. Non-commercial licenses are not acceptable for the commercial-use target. A license that allows use inside a project but prohibits hosting or standalone redistribution is not sufficient for Minglora's hosted sound library.

## Source directory

The complete list is stored at \`public/assets/audio-resource-directory.json\` and rendered by \`public/audio-resources.html\`. The list intentionally preserves all 80 supplied rows, including repeated discovery sites. Each source is marked \`candidate_source_only\`; the source list never turns an asset into an approved recording.

## Asset registry and storage

The curated registry is \`data/minglora-authentic-audio-library.json\`. It starts with an empty \`assets\` array. Place downloaded originals under:

\`public/assets/sound-studio/assets/\`

Do not rename or overwrite the original file. The registry's \`assetPath\` must point to that file, and \`publicUrl\` must be its matching URL under \`/assets/sound-studio/assets/\`.

For every candidate asset, record the fields defined in the registry's \`requiredMetadata\`. Set \`status\` to \`approved\` only after rights review, human authenticity review, file-integrity verification, and actual listening/playback testing. Set each of \`aiGenerated\`, \`robotic\`, \`synthetic\`, \`procedural\`, and \`oscillator\` explicitly to \`false\`. These flags are a declaration by the reviewer, not automated proof of authenticity.

## Validation and release

Run:

\`\`\`sh
npm run check:audio-library
\`\`\`

The validator:
- requires the exact provenance, rights, attribution, format, download-date and checksum metadata;
- requires commercial use and hosted redistribution to be explicitly permitted;
- requires a human authenticity review and actual playback test;
- rejects unsupported formats, synthetic/AI flags, path traversal, missing files, symlinks, signature/extension mismatches, checksum mismatches, duplicate IDs and duplicate checksums;
- publishes only valid \`approved\` records into the Sound Studio manifest.

The validator runs during \`npm start\` before the server starts. An invalid item marked approved blocks startup rather than being silently published. Items not marked approved are not published.

## Current verified status

- Candidate source listings: 80.
- Required target audio categories: 17.
- Approved downloaded recordings: 0.
- Installed authentic recordings: 0.
- SHA-256-verified third-party files: 0.
- Human playback-tested third-party files: 0.

The previous 120-item generated tone pack is retired from active Sound Studio selection. It was generated procedurally and did not satisfy the authentic-recording acceptance rule. Existing member-private sound uploads are retained, and they are not represented as third-party curated assets by this directory.

## Operational limitations

The validator checks file presence, supported container signatures and checksum integrity. It does not claim to identify AI audio automatically or to replace a human listening test. Rights must be reviewed against the actual recording's license and source terms; the source directory does not grant rights or provide blanket commercial permissions.
