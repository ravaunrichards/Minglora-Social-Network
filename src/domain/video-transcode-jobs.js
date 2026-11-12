export const VIDEO_TRANSCODE_MAX_ATTEMPTS = 4;
export const VIDEO_TRANSCODE_LEASE_MS = 30 * 60 * 1000;
const RETRY_BASE_MS = 30 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

function parseTime(value, fallback = 0) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function enqueueVideoTranscodeJob(jobs, {
  assetId, ownerId, postId, id, createdAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(jobs) || !assetId || !ownerId || !postId || !id) return { status: 'invalid', job: null };
  const existing = jobs.find(job =>
    job.assetId === assetId && !['failed', 'cancelled'].includes(job.status)
  );
  if (existing) {
    if (existing.status === 'queued') {
      existing.postId = String(postId);
      existing.updatedAt = String(createdAt);
    }
    return { status: 'exists', job: existing };
  }
  const job = {
    id: String(id),
    assetId: String(assetId),
    ownerId: String(ownerId),
    postId: String(postId),
    status: 'queued',
    attempts: 0,
    availableAt: String(createdAt),
    createdAt: String(createdAt),
    updatedAt: String(createdAt),
    leaseToken: null,
    leaseExpiresAt: null,
    outputAssetId: null,
    derivativeAssetId: null,
    errorCode: null
  };
  jobs.push(job);
  return { status: 'created', job };
}

export function claimVideoTranscodeJob(jobs, {
  leaseToken,
  nowMs = Date.now(),
  leaseMs = VIDEO_TRANSCODE_LEASE_MS
} = {}) {
  if (!Array.isArray(jobs) || typeof leaseToken !== 'string' || leaseToken.length < 24) return null;
  for (const job of jobs) {
    if (job?.status === 'processing' && parseTime(job.leaseExpiresAt) <= nowMs && Number(job.attempts || 0) >= VIDEO_TRANSCODE_MAX_ATTEMPTS) {
      job.status = 'failed';
      job.errorCode = job.errorCode || 'LEASE_EXPIRED';
      job.leaseToken = null;
      job.leaseExpiresAt = null;
      job.updatedAt = new Date(nowMs).toISOString();
    }
  }
  const available = jobs
    .filter(job => {
      if (!job || ['completed', 'failed', 'cancelled'].includes(job.status) || Number(job.attempts || 0) >= VIDEO_TRANSCODE_MAX_ATTEMPTS) return false;
      if (job.status === 'queued') return parseTime(job.availableAt) <= nowMs;
      return job.status === 'processing' && parseTime(job.leaseExpiresAt) <= nowMs;
    })
    .sort((a, b) => parseTime(a.createdAt) - parseTime(b.createdAt));
  const job = available[0];
  if (!job) return null;
  job.status = 'processing';
  job.attempts = Math.max(0, Math.floor(Number(job.attempts) || 0)) + 1;
  job.leaseToken = leaseToken;
  job.leaseExpiresAt = new Date(nowMs + Math.max(60_000, Number(leaseMs) || VIDEO_TRANSCODE_LEASE_MS)).toISOString();
  job.updatedAt = new Date(nowMs).toISOString();
  return job;
}

export function isVideoTranscodeLeaseValid(job, leaseToken, nowMs = Date.now()) {
  return Boolean(
    job &&
    job.status === 'processing' &&
    typeof leaseToken === 'string' &&
    typeof job.leaseToken === 'string' &&
    leaseToken.length >= 24 &&
    leaseToken === job.leaseToken &&
    parseTime(job.leaseExpiresAt) > nowMs
  );
}

export function renewVideoTranscodeLease(jobs, {
  jobId, leaseToken, nowMs = Date.now(), leaseMs = VIDEO_TRANSCODE_LEASE_MS
} = {}) {
  const job = Array.isArray(jobs) ? jobs.find(item => item.id === jobId) : null;
  if (!isVideoTranscodeLeaseValid(job, leaseToken, nowMs)) return { status: 'conflict', job: null };
  job.leaseExpiresAt = new Date(nowMs + Math.max(60_000, Number(leaseMs) || VIDEO_TRANSCODE_LEASE_MS)).toISOString();
  job.updatedAt = new Date(nowMs).toISOString();
  return { status: 'renewed', leaseExpiresAt: job.leaseExpiresAt, job };
}

export function completeVideoTranscodeJob(jobs, {
  jobId, leaseToken, outputAssetId, completedAt = new Date().toISOString(), nowMs = Date.now()
} = {}) {
  const job = Array.isArray(jobs) ? jobs.find(item => item.id === jobId) : null;
  if (!isVideoTranscodeLeaseValid(job, leaseToken, nowMs) || !outputAssetId) return { status: 'conflict', job: null };
  job.status = 'completed';
  job.derivativeAssetId = String(outputAssetId);
  job.completedAt = String(completedAt);
  job.updatedAt = String(completedAt);
  job.leaseToken = null;
  job.leaseExpiresAt = null;
  job.errorCode = null;
  return { status: 'completed', job };
}

export function failVideoTranscodeJob(jobs, {
  jobId, leaseToken, errorCode = 'TRANSCODE_FAILED', nowMs = Date.now()
} = {}) {
  const job = Array.isArray(jobs) ? jobs.find(item => item.id === jobId) : null;
  if (!isVideoTranscodeLeaseValid(job, leaseToken, nowMs)) return { status: 'conflict', job: null };
  const attempts = Math.max(1, Math.floor(Number(job.attempts) || 1));
  const retryDelay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
  job.status = attempts >= VIDEO_TRANSCODE_MAX_ATTEMPTS ? 'failed' : 'queued';
  job.availableAt = new Date(nowMs + retryDelay).toISOString();
  job.updatedAt = new Date(nowMs).toISOString();
  job.errorCode = String(errorCode || 'TRANSCODE_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 48) || 'TRANSCODE_FAILED';
  job.leaseToken = null;
  job.leaseExpiresAt = null;
  return { status: job.status, availableAt: job.availableAt, job };
}

export function cancelVideoTranscodeJob(jobs, { jobId, leaseToken, reason = 'cancelled' } = {}) {
  const job = Array.isArray(jobs) ? jobs.find(item => item.id === jobId) : null;
  if (!job || job.status !== 'processing' || job.leaseToken !== leaseToken) return { status: 'conflict', job: null };
  job.status = 'cancelled';
  job.errorCode = String(reason).replace(/[^A-Z0-9_]/gi, '').slice(0, 48) || 'CANCELLED';
  job.leaseToken = null;
  job.leaseExpiresAt = null;
  job.updatedAt = new Date().toISOString();
  return { status: 'cancelled', job };
}
