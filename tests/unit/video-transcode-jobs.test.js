import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueVideoTranscodeJob,
  claimVideoTranscodeJob,
  completeVideoTranscodeJob,
  failVideoTranscodeJob,
  cancelVideoTranscodeJob,
  isVideoTranscodeLeaseValid,
  VIDEO_TRANSCODE_MAX_ATTEMPTS
} from '../../src/domain/video-transcode-jobs.js';

const base = Date.parse('2026-11-11T12:00:00.000Z');
const asset = { id: 'asset-1', ownerId: 'creator-1', mediaType: 'video', slot: 'post' };

function queue() {
  const jobs = [];
  const result = enqueueVideoTranscodeJob(jobs, {
    assetId: asset.id, ownerId: asset.ownerId, postId: 'post-1',
    id: 'job-1', createdAt: new Date(base).toISOString()
  });
  assert.equal(result.status, 'created');
  return jobs;
}

test('enqueue is idempotent for an asset and updates an unclaimed post reference', () => {
  const jobs = queue();
  const duplicate = enqueueVideoTranscodeJob(jobs, {
    assetId: asset.id, ownerId: asset.ownerId, postId: 'post-2',
    id: 'job-2', createdAt: new Date(base + 1).toISOString()
  });
  assert.equal(duplicate.status, 'exists');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].postId, 'post-2');
});

test('only one valid lease can claim a queued job', () => {
  const jobs = queue();
  const first = claimVideoTranscodeJob(jobs, {
    leaseToken: 'lease-token-abcdefghijklmnopqrstuvwxyz', nowMs: base
  });
  assert.equal(first.status, 'processing');
  assert.equal(first.attempts, 1);
  assert.equal(isVideoTranscodeLeaseValid(first, first.leaseToken, base + 1), true);
  assert.equal(claimVideoTranscodeJob(jobs, {
    leaseToken: 'another-lease-token-abcdefghijklmnop', nowMs: base + 2
  }), null);
});

test('expired leases are recovered without losing the original job identity', () => {
  const jobs = queue();
  const first = claimVideoTranscodeJob(jobs, {
    leaseToken: 'lease-token-abcdefghijklmnopqrstuvwxyz', nowMs: base, leaseMs: 60_000
  });
  const recovered = claimVideoTranscodeJob(jobs, {
    leaseToken: 'new-lease-token-abcdefghijklmnopqrstuvwxyz', nowMs: base + 60_001
  });
  assert.equal(recovered.id, first.id);
  assert.equal(recovered.attempts, 2);
  assert.equal(recovered.leaseToken, 'new-lease-token-abcdefghijklmnopqrstuvwxyz');
  assert.equal(isVideoTranscodeLeaseValid(recovered, first.leaseToken, base + 60_002), false);
});

test('completion requires the current unexpired lease and records the derivative reference', () => {
  const jobs = queue();
  const claimed = claimVideoTranscodeJob(jobs, {
    leaseToken: 'lease-token-abcdefghijklmnopqrstuvwxyz', nowMs: base
  });
  assert.equal(completeVideoTranscodeJob(jobs, {
    jobId: claimed.id, leaseToken: 'wrong-lease-token-abcdefghijklmnop', outputAssetId: 'derivative-1'
  }).status, 'conflict');
  const completed = completeVideoTranscodeJob(jobs, {
    jobId: claimed.id, leaseToken: claimed.leaseToken, outputAssetId: 'derivative-1',
    completedAt: new Date(base + 1000).toISOString()
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.job.derivativeAssetId, 'derivative-1');
  assert.equal(completed.job.leaseToken, null);
});

test('transient failures back off and stop after the configured attempt limit', () => {
  const jobs = queue();
  let nowMs = base;
  for (let attempt = 1; attempt <= VIDEO_TRANSCODE_MAX_ATTEMPTS; attempt += 1) {
    const claimed = claimVideoTranscodeJob(jobs, {
      leaseToken: 'lease-token-attempt-' + attempt + '-abcdefghijklmnopqrstuvwxyz',
      nowMs
    });
    assert.ok(claimed);
    const failed = failVideoTranscodeJob(jobs, {
      jobId: claimed.id, leaseToken: claimed.leaseToken, errorCode: 'FFMPEG_FAILED', nowMs
    });
    assert.equal(failed.status, attempt === VIDEO_TRANSCODE_MAX_ATTEMPTS ? 'failed' : 'queued');
    nowMs = Date.parse(failed.availableAt) + 1;
  }
  assert.equal(jobs[0].status, 'failed');
  assert.equal(jobs[0].attempts, VIDEO_TRANSCODE_MAX_ATTEMPTS);
  assert.equal(claimVideoTranscodeJob(jobs, {
    leaseToken: 'never-claim-this-lease-abcdefghijklmnopqrstuvwxyz', nowMs
  }), null);
});

test('source deletion can cancel a currently leased job', () => {
  const jobs = queue();
  const claimed = claimVideoTranscodeJob(jobs, {
    leaseToken: 'lease-token-abcdefghijklmnopqrstuvwxyz', nowMs: base
  });
  const cancelled = cancelVideoTranscodeJob(jobs, {
    jobId: claimed.id, leaseToken: claimed.leaseToken, reason: 'source_unavailable'
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(jobs[0].leaseToken, null);
});
