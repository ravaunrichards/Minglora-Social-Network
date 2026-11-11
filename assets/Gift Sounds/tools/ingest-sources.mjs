#!/usr/bin/env node
/**
 * Ingest genuine CC0/public-domain recordings for the Minglora gift library.
 * Node 20+ and FFmpeg are required.
 *
 * Dry run:
 *   node "assets/Gift Sounds/tools/ingest-sources.mjs" --dry-run --download-public
 *
 * Download, verify, transcode, and make candidate per-gift copies:
 *   node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-public
 *
 * Optional Freesound preview ingestion (requires FREESOUND_API_KEY):
 *   FREESOUND_API_KEY=... node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-freesound
 *
 * Source binaries are downloaded to a temporary directory, verified, transcoded
 * to MP3, and removed from the temporary directory. Only MP3 review assets,
 * provenance reports, and exact-title gift candidates remain in the repository.
 * Every candidate remains unapproved until a human listens to it.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repoRoot = path.resolve(root, '..', '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'source-catalog.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const dry = args.has('--dry-run');
const publicMode = args.has('--download-public') || args.has('--download-all');
const fsMode = args.has('--download-freesound') || args.has('--download-all');
const sourceDir = path.join(root, '_sources');
const mp3Dir = path.join(sourceDir, 'mp3');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function sha1(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex');
}
function gitBlobHash(bytes) {
  return crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function permittedLicense(value) {
  return /cc0|publicdomain\/zero\/1\.0|creative commons zero|public domain|unlicense/i.test(value || '');
}
async function fetchBytes(url, expectedBytes) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Minglora-Gift-Sound-Ingest/1.0 (licensed audio asset ingestion)' }
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  const type = response.headers.get('content-type') || '';
  if (/text\/html|application\/json/i.test(type)) throw new Error('Expected audio but received ' + type);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) throw new Error('Audio file is too small: ' + bytes.length + ' bytes');
  if (expectedBytes != null && bytes.length !== expectedBytes) {
    throw new Error('Expected ' + expectedBytes + ' bytes, received ' + bytes.length);
  }
  return bytes;
}
async function saveNew(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await fs.readFile(file);
    if (sha256(existing) !== sha256(bytes)) throw new Error('Refusing to overwrite different file: ' + file);
  }
}
function toMp3(input, output) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-vn', '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '192k', output
  ], { encoding: 'utf8' });
  if (result.error) throw new Error('ffmpeg unavailable: ' + result.error.message);
  if (result.status !== 0) throw new Error('ffmpeg failed: ' + (result.stderr || result.stdout));
}
function publicSources() {
  return [
    ...(catalog.publishedCC0Recordings || []).map(x => ({
      ...x, url: x.releaseUrl, expectedBytes: x.bytes, expectedSha256: x.sha256
    })),
    ...(catalog.publicDomainEffects || []).map(x => ({
      ...x, url: x.audioUrl, expectedBytes: x.bytes, expectedGitBlobSha: x.githubBlobSha
    })),
    ...(catalog.additionalCC0Recordings || []).map(x => ({
      ...x, url: x.audioUrl
    }))
  ];
}
const report = {
  title: 'Minglora Gift Sound Ingestion',
  status: dry ? 'dry_run' : 'download_attempted',
  downloaded: [],
  mappedGiftFiles: [],
  skipped: [],
  errors: []
};

if (!publicMode && !fsMode) {
  console.log(JSON.stringify({
    message: 'Choose --dry-run, --download-public, --download-freesound, or --download-all.',
    publicSourceCount: publicSources().length,
    candidateGiftFolderCount: catalog.summary?.candidateGiftFolderCount ?? null,
    FreesoundCandidateCount: (catalog.FreesoundCC0ReviewCandidates || []).length,
    FreesoundApiKeyConfigured: Boolean(process.env.FREESOUND_API_KEY)
  }, null, 2));
} else if (dry) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    publicSources: publicMode ? publicSources().map(x => ({
      id: x.id, url: x.url, license: x.license,
      expectedBytes: x.expectedBytes ?? null,
      checksum: x.expectedSha256 || x.expectedSha1 || x.expectedGitBlobSha || null
    })) : [],
    candidateGiftMappings: publicMode ? (catalog.candidateGiftMappings || []) : [],
    FreesoundSources: fsMode ? (catalog.FreesoundCC0ReviewCandidates || []).map(x => ({
      id: x.id, page: x.sourcePage, license: x.license
    })) : [],
    changedFiles: []
  }, null, 2));
} else {
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(mp3Dir, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'minglora-gift-audio-'));

  try {
    if (publicMode) {
      for (const source of publicSources()) {
        let tempInput = null;
        let tempOutput = null;
        try {
          if (!permittedLicense(source.license)) throw new Error('Source licence is not CC0/public-domain: ' + source.license);
          if (!source.url) throw new Error('No direct audio URL');
          const ext = path.extname(new URL(source.url).pathname).toLowerCase() || '.bin';
          const bytes = await fetchBytes(source.url, source.expectedBytes ?? null);
          const digest = sha256(bytes);
          if (source.expectedSha256 && digest !== source.expectedSha256) throw new Error('SHA-256 mismatch');
          if (source.expectedSha1 && sha1(bytes) !== source.expectedSha1) throw new Error('SHA-1 mismatch');
          if (source.expectedGitBlobSha && gitBlobHash(bytes) !== source.expectedGitBlobSha) {
            throw new Error('Git blob SHA mismatch');
          }

          const mp3 = path.join(mp3Dir, source.id + '.mp3');
          try {
            const current = await fs.readFile(mp3);
            report.skipped.push({ id: source.id, reason: 'verified MP3 already exists', sha256: sha256(current) });
            continue;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }

          tempInput = path.join(tempRoot, source.id + ext);
          await fs.writeFile(tempInput, bytes, { flag: 'wx' });
          if (ext === '.mp3') {
            await saveNew(mp3, bytes);
          } else {
            tempOutput = path.join(tempRoot, source.id + '.mp3');
            toMp3(tempInput, tempOutput);
            const encoded = await fs.readFile(tempOutput);
            if (encoded.length < 1024) throw new Error('FFmpeg output is unexpectedly small');
            await saveNew(mp3, encoded);
          }
          const encodedBytes = await fs.readFile(mp3);
          report.downloaded.push({
            id: source.id,
            mp3: path.relative(repoRoot, mp3),
            sourcePage: source.sourcePage,
            sourceUrl: source.url,
            creator: source.creator || null,
            license: source.license,
            originalBytes: bytes.length,
            originalSha256: digest,
            mp3Bytes: encodedBytes.length,
            mp3Sha256: sha256(encodedBytes),
            originalFormat: ext,
            status: 'downloaded_verified_transcoded_review_only'
          });
        } catch (error) {
          report.errors.push({ id: source.id, message: error.message });
        }
      }
    }

    if (fsMode) {
      const key = process.env.FREESOUND_API_KEY;
      if (!key) {
        report.skipped.push({
          group: 'Freesound API',
          count: (catalog.FreesoundCC0ReviewCandidates || []).length,
          reason: 'FREESOUND_API_KEY is not set; direct public source assets are still ingested.'
        });
      } else {
        for (const source of (catalog.FreesoundCC0ReviewCandidates || [])) {
          try {
            const match = String(source.id).match(/(\d+)(?!.*\d)/);
            if (!match) throw new Error('Cannot parse sound ID');
            const id = match[1];
            const endpoint = 'https://freesound.org/apiv2/sounds/' + id + '/?token=' +
              encodeURIComponent(key) + '&fields=id,name,username,license,previews,duration,samplerate,channels';
            const response = await fetch(endpoint, { headers: { 'User-Agent': 'Minglora-Gift-Sound-Ingest/1.0' } });
            if (!response.ok) throw new Error('Freesound API HTTP ' + response.status);
            const metadata = await response.json();
            if (!/cc0|creative commons zero|publicdomain\/zero\/1\.0/i.test(metadata.license || '')) {
              throw new Error('API did not confirm CC0: ' + metadata.license);
            }
            const preview = metadata.previews && metadata.previews['preview-hq-mp3'];
            if (!preview) throw new Error('No high-quality MP3 preview in API response');
            const bytes = await fetchBytes(preview, null);
            const mp3 = path.join(mp3Dir, source.id + '.mp3');
            await saveNew(mp3, bytes);
            report.downloaded.push({
              id: source.id, mp3: path.relative(repoRoot, mp3), sourcePage: source.sourcePage,
              sourceUrl: preview, license: metadata.license, creator: metadata.username,
              duration: metadata.duration, sampleRate: metadata.samplerate, channels: metadata.channels,
              bytes: bytes.length, sha256: sha256(bytes), status: 'api_cc0_verified_preview_downloaded'
            });
          } catch (error) {
            report.errors.push({ id: source.id, message: error.message });
          }
        }
      }
    }

    // Copy only exact-title or directly related sound candidates into their
    // matching artwork folders. These remain review candidates, not production-approved.
    for (const mapping of (catalog.candidateGiftMappings || [])) {
      const sourceMp3 = path.join(mp3Dir, mapping.sourceId + '.mp3');
      let bytes;
      try {
        bytes = await fs.readFile(sourceMp3);
      } catch {
        report.skipped.push({ sourceId: mapping.sourceId, reason: 'source MP3 was not downloaded' });
        continue;
      }
      for (const giftSlug of mapping.giftSlugs || []) {
        const target = path.join(root, giftSlug, 'sound.mp3');
        try {
          await saveNew(target, bytes);
          report.mappedGiftFiles.push({
            giftSlug,
            file: path.relative(repoRoot, target),
            sourceId: mapping.sourceId,
            sha256: sha256(bytes),
            bytes: bytes.length,
            status: 'candidate_real_recording_needs_listening_review'
          });
        } catch (error) {
          report.errors.push({ id: mapping.sourceId, giftSlug, message: error.message });
        }
      }
    }

    const manifestPath = path.join(root, 'manifest.json');
    const giftManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const mappedBySlug = new Map(report.mappedGiftFiles.map(x => [x.giftSlug, x]));
    for (const gift of (giftManifest.gifts || [])) {
      const mapped = mappedBySlug.get(gift.slug);
      if (mapped) {
        gift.audioStatus = 'candidate_real_recording_downloaded_not_auditioned';
        gift.candidateSourceId = mapped.sourceId;
        gift.candidateSoundFile = mapped.file;
        gift.candidateMappingStatus = mapped.status;
      }
    }
    giftManifest.lastIngestion = {
      status: 'candidate_recordings_downloaded_review_only',
      downloadedSourceCount: report.downloaded.length,
      mappedGiftFileCount: report.mappedGiftFiles.length,
      productionReadyGiftCount: 0
    };
    await fs.writeFile(manifestPath, JSON.stringify(giftManifest, null, 2) + '\n');
    const candidateReportPath = path.join(root, 'candidate-mappings.json');
    await fs.writeFile(candidateReportPath, JSON.stringify({
      title: 'Minglora Gift Sound Candidate Mappings',
      status: 'review_required_not_production_approved',
      mappedGiftCount: report.mappedGiftFiles.length,
      mappings: report.mappedGiftFiles
    }, null, 2) + '\n');

    const reportPath = path.join(root, 'ingested-sources.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({
      report: path.relative(repoRoot, reportPath),
      downloaded: report.downloaded.length,
      mappedGiftFiles: report.mappedGiftFiles.length,
      skipped: report.skipped.length,
      errors: report.errors.length,
      productionReady: 0,
      note: 'Real recordings are copied as review candidates only; listening approval is still required.'
    }, null, 2));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
