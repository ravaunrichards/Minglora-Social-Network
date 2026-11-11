#!/usr/bin/env node
/**
 * Ingest authentic CC0 recordings into a local review pool.
 * Node 20+ and ffmpeg are required.
 *
 * Dry run:
 *   node "assets/Gift Sounds/tools/ingest-sources.mjs" --dry-run --download-public
 *
 * Download public GitHub-hosted CC0 assets:
 *   node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-public
 *
 * Download Freesound CC0 previews (requires a Freesound API key):
 *   FREESOUND_API_KEY=... node "assets/Gift Sounds/tools/ingest-sources.mjs" --download-freesound
 *
 * Nothing is copied into an individual gift folder by this script. Human
 * listening and an approved gift-to-sound map are required before activation.
 */
import fs from 'node:fs/promises';
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

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function gitBlobHash(bytes) {
  return crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function cc0(value) {
  return /cc0|publicdomain\/zero\/1\.0|creative commons zero/i.test(value || '');
}
async function fetchBytes(url, expectedBytes) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Minglora-Gift-Sound-Ingest/1.0' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  const type = response.headers.get('content-type') || '';
  if (/text\/html|application\/json/i.test(type)) throw new Error('Expected audio but received ' + type);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) throw new Error('Audio file is too small: ' + bytes.length + ' bytes');
  if (expectedBytes != null && bytes.length !== expectedBytes) throw new Error('Expected ' + expectedBytes + ' bytes, received ' + bytes.length);
  return bytes;
}
async function saveNew(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await fs.readFile(file);
    if (hash(existing) !== hash(bytes)) throw new Error('Refusing to overwrite different file: ' + file);
  }
}
function toMp3(input, output) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-n', '-i', input,
    '-vn', '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '192k', output
  ], { encoding: 'utf8' });
  if (result.error) throw new Error('ffmpeg unavailable: ' + result.error.message);
  if (result.status !== 0) throw new Error('ffmpeg failed: ' + (result.stderr || result.stdout));
}
const report = {
  title: 'Minglora Gift Sound Ingestion',
  status: dry ? 'dry_run' : 'download_attempted',
  downloaded: [],
  skipped: [],
  errors: []
};

if (!publicMode && !fsMode) {
  console.log(JSON.stringify({
    message: 'Choose --dry-run, --download-public, --download-freesound, or --download-all.',
    publicRecordingCount: (catalog.publishedCC0Recordings || []).length + (catalog.publicDomainEffects || []).length,
    FreesoundCandidateCount: (catalog.FreesoundCC0ReviewCandidates || []).length,
    FreesoundApiKeyConfigured: Boolean(process.env.FREESOUND_API_KEY)
  }, null, 2));
} else if (dry) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    publicSources: publicMode ? [
      ...(catalog.publishedCC0Recordings || []).map(x => ({ id: x.id, url: x.releaseUrl, license: x.license })),
      ...(catalog.publicDomainEffects || []).map(x => ({ id: x.id, url: x.audioUrl, license: x.license }))
    ] : [],
    FreesoundSources: fsMode ? (catalog.FreesoundCC0ReviewCandidates || []).map(x => ({ id: x.id, page: x.sourcePage, license: x.license })) : [],
    changedFiles: []
  }, null, 2));
} else {
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(mp3Dir, { recursive: true });

  if (publicMode) {
    const sources = [
      ...(catalog.publishedCC0Recordings || []).map(x => ({
        ...x, url: x.releaseUrl, expectedBytes: x.bytes, expectedSha256: x.sha256
      })),
      ...(catalog.publicDomainEffects || []).map(x => ({
        ...x, url: x.audioUrl, expectedBytes: x.bytes, expectedGitBlobSha: x.githubBlobSha
      }))
    ];
    for (const source of sources) {
      try {
        if (!cc0(source.license)) throw new Error('Source is not declared CC0');
        if (!source.url) throw new Error('No direct audio URL');
        const ext = path.extname(new URL(source.url).pathname) || '.bin';
        const original = path.join(sourceDir, source.id + ext);
        const bytes = await fetchBytes(source.url, source.expectedBytes ?? null);
        const digest = hash(bytes);
        if (source.expectedSha256 && digest !== source.expectedSha256) throw new Error('SHA-256 mismatch');
        if (source.expectedGitBlobSha && gitBlobHash(bytes) !== source.expectedGitBlobSha) throw new Error('Git blob SHA mismatch');
        await saveNew(original, bytes);
        const mp3 = path.join(mp3Dir, source.id + '.mp3');
        if (ext.toLowerCase() === '.mp3') {
          await saveNew(mp3, bytes);
        } else {
          try { await fs.access(mp3); }
          catch { toMp3(original, mp3); }
        }
        report.downloaded.push({
          id: source.id, original: path.relative(repoRoot, original), mp3: path.relative(repoRoot, mp3),
          sourcePage: source.sourcePage, sourceUrl: source.url, license: source.license,
          bytes: bytes.length, sha256: digest, status: 'downloaded_and_transcoded'
        });
      } catch (error) {
        report.errors.push({ id: source.id, message: error.message });
      }
    }
  }

  if (fsMode) {
    const key = process.env.FREESOUND_API_KEY;
    if (!key) {
      report.skipped.push({ group: 'Freesound', count: (catalog.FreesoundCC0ReviewCandidates || []).length, reason: 'FREESOUND_API_KEY is not set' });
    } else {
      for (const source of (catalog.FreesoundCC0ReviewCandidates || [])) {
        try {
          const match = String(source.id).match(/(\d+)(?!.*\d)/);
          if (!match) throw new Error('Cannot parse sound ID');
          const id = match[1];
          const endpoint = 'https://freesound.org/apiv2/sounds/' + id + '/?token=' + encodeURIComponent(key) + '&fields=id,name,username,license,previews,duration,samplerate,channels';
          const response = await fetch(endpoint, { headers: { 'User-Agent': 'Minglora-Gift-Sound-Ingest/1.0' } });
          if (!response.ok) throw new Error('Freesound API HTTP ' + response.status);
          const metadata = await response.json();
          if (!cc0(metadata.license)) throw new Error('API did not confirm CC0: ' + metadata.license);
          const preview = metadata.previews && metadata.previews['preview-hq-mp3'];
          if (!preview) throw new Error('No high-quality MP3 preview in API response');
          const bytes = await fetchBytes(preview, null);
          const mp3 = path.join(mp3Dir, source.id + '.mp3');
          await saveNew(mp3, bytes);
          report.downloaded.push({
            id: source.id, mp3: path.relative(repoRoot, mp3), sourcePage: source.sourcePage,
            sourceUrl: preview, license: metadata.license, creator: metadata.username,
            duration: metadata.duration, sampleRate: metadata.samplerate, channels: metadata.channels,
            bytes: bytes.length, sha256: hash(bytes), status: 'api_cc0_verified_preview_downloaded'
          });
        } catch (error) {
          report.errors.push({ id: source.id, message: error.message });
        }
      }
    }
  }
  const reportPath = path.join(root, 'ingested-sources.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    report: path.relative(repoRoot, reportPath),
    downloaded: report.downloaded.length,
    skipped: report.skipped.length,
    errors: report.errors.length,
    note: 'Downloaded source clips remain in a review pool; no gift is activated without listening approval.'
  }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
