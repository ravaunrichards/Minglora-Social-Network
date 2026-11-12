import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import os from 'node:os';
import path from 'node:path';

const API_BASE_URL = String(process.env.MINGLORA_API_BASE_URL || '').trim().replace(/\/+$/, '');
const WORKER_TOKEN = String(process.env.VIDEO_TRANSCODE_WORKER_TOKEN || '').trim();
const FFMPEG_PATH = String(process.env.FFMPEG_PATH || 'ffmpeg').trim();
const POLL_MS = Math.max(2000, Math.min(30000, Number(process.env.VIDEO_TRANSCODE_POLL_MS) || 5000));
const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;

if (!API_BASE_URL || !/^https:\/\//i.test(API_BASE_URL)) throw new Error('MINGLORA_API_BASE_URL must be an HTTPS URL.');
if (WORKER_TOKEN.length < 32) throw new Error('VIDEO_TRANSCODE_WORKER_TOKEN must contain at least 32 characters.');

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function api(pathname, payload) {
  const response = await fetch(API_BASE_URL + pathname, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + WORKER_TOKEN,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(30000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Minglora video worker API returned HTTP ' + response.status + '.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function downloadVideo(url, destination) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error('SOURCE_DOWNLOAD_FAILED');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_MEDIA_BYTES) throw new Error('SOURCE_TOO_LARGE');
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      callback(received > MAX_MEDIA_BYTES ? new Error('SOURCE_TOO_LARGE') : null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(destination, { flags: 'wx' }));
  if (!received) throw new Error('SOURCE_EMPTY');
}

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-protocol_whitelist', 'file,crypto,data',
      '-i', input,
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', "scale=w='min(1280,iw)':h=-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-maxrate', '4M', '-bufsize', '8M',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart', '-max_muxing_queue_size', '1024',
      output
    ];
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60 * 1000);
    child.stderr.on('data', chunk => {
      if (stderr.length < 4000) stderr += chunk.toString('utf8').slice(0, 4000 - stderr.length);
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(code === null ? 'FFMPEG_TIMEOUT' : 'FFMPEG_FAILED'));
    });
  });
}

function encodeMetadata(metadata) {
  return Object.entries(metadata)
    .map(([key, value]) => key + ' ' + Buffer.from(String(value)).toString('base64'))
    .join(',');
}

async function tusUpload(filePath, upload) {
  if (!upload?.endpoint || !upload?.token || !upload?.bucket || !upload?.path) throw new Error('UPLOAD_PREPARATION_INVALID');
  const info = await fs.stat(filePath);
  const created = await fetch(upload.endpoint, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(info.size),
      'Upload-Metadata': encodeMetadata({
        bucketName: upload.bucket,
        objectName: upload.path,
        contentType: 'video/mp4',
        cacheControl: '3600'
      }),
      'x-signature': upload.token
    },
    signal: AbortSignal.timeout(30000)
  });
  if (created.status !== 201) throw new Error('TUS_CREATE_FAILED_' + created.status);
  const location = created.headers.get('location');
  if (!location) throw new Error('TUS_LOCATION_MISSING');
  const uploadUrl = new URL(location, upload.endpoint).toString();
  const handle = await fs.open(filePath, 'r');
  try {
    let offset = 0;
    while (offset < info.size) {
      const length = Math.min(UPLOAD_CHUNK_BYTES, info.size - offset);
      const chunk = Buffer.allocUnsafe(length);
      const read = await handle.read(chunk, 0, length, offset);
      if (read.bytesRead !== length) throw new Error('OUTPUT_READ_FAILED');
      const patched = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
          'x-signature': upload.token
        },
        body: chunk,
        signal: AbortSignal.timeout(120000)
      });
      if (patched.status !== 204) throw new Error('TUS_PATCH_FAILED_' + patched.status);
      const nextOffset = Number(patched.headers.get('upload-offset'));
      if (!Number.isSafeInteger(nextOffset) || nextOffset !== offset + length) throw new Error('TUS_OFFSET_MISMATCH');
      offset = nextOffset;
    }
  } finally {
    await handle.close();
  }
}

async function processJob(claim) {
  const { job, source } = claim;
  let heartbeatInFlight = null;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'minglora-video-'));
  const heartbeatTimer = setInterval(() => {
    if (!heartbeatInFlight) {
      heartbeatInFlight = api('/api/internal/video-transcode/heartbeat', {
        jobId: job.id, leaseToken: job.leaseToken
      }).catch(error => {
        process.stderr.write('Video worker lease heartbeat failed for job ' + job.id + ': ' + String(error?.message || error).slice(0, 120) + '\\n');
      }).finally(() => { heartbeatInFlight = null; });
    }
  }, 5 * 60 * 1000);
  heartbeatTimer.unref?.();
  const input = path.join(directory, 'source.bin');
  const output = path.join(directory, 'optimized.mp4');
  try {
    await downloadVideo(source.url, input);
    await runFfmpeg(input, output);
    const info = await fs.stat(output);
    if (!info.size || info.size > MAX_MEDIA_BYTES) throw new Error('OUTPUT_SIZE_INVALID');
    const prepared = await api('/api/internal/video-transcode/prepare-output', {
      jobId: job.id, leaseToken: job.leaseToken, byteSize: info.size
    });
    await tusUpload(output, prepared.upload);
    await api('/api/internal/video-transcode/complete', {
      jobId: job.id, leaseToken: job.leaseToken, outputAssetId: prepared.assetId
    });
    process.stdout.write('Video transcode completed for job ' + job.id + '.\n');
  } catch (error) {
    const errorCode = String(error?.message || 'TRANSCODE_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 48) || 'TRANSCODE_FAILED';
    try {
      await api('/api/internal/video-transcode/fail', {
        jobId: job.id, leaseToken: job.leaseToken, errorCode
      });
    } catch (reportError) {
      process.stderr.write('Could not report video processing failure: ' + String(reportError?.message || reportError).slice(0, 160) + '\n');
    }
    process.stderr.write('Video transcode failed for job ' + job.id + ': ' + errorCode + '\n');
  } finally {
    clearInterval(heartbeatTimer);
    if (heartbeatInFlight) await heartbeatInFlight;
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  process.stdout.write('Minglora video transcode worker started.\n');
  for (;;) {
    try {
      const claim = await api('/api/internal/video-transcode/claim', {});
      if (claim.job && claim.source?.url) await processJob(claim);
      else await sleep(POLL_MS);
    } catch (error) {
      process.stderr.write('Worker poll failed: ' + String(error?.message || error).slice(0, 180) + '\n');
      await sleep(POLL_MS);
    }
  }
}

main().catch(error => {
  process.stderr.write('Minglora video worker stopped: ' + String(error?.message || error) + '\n');
  process.exitCode = 1;
});
