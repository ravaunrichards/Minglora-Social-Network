import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeCreatorVideoAnalytics } from '../../src/domain/video-analytics.js';

const now = Date.parse('2026-11-11T12:00:00.000Z');
const recent = new Date(now - 60_000).toISOString();
const video = (id, userId, extra = {}) => ({
  id, userId, text: 'Video ' + id, createdAt: recent, status: 'published', ...extra
});
const watch = (postId, userId, watchedMs, completed, ageMs = 60_000) => ({
  postId, userId, watchedMs, durationMs: 10_000, completed,
  createdAt: new Date(now - ageMs).toISOString()
});

test('creator analytics aggregate real watch time and unique viewer-video pairs', () => {
  const posts = [video('one', 'creator'), video('two', 'creator', { createdAt: new Date(now - 30_000).toISOString() })];
  const events = [
    watch('one', 'viewer-a', 4_000, false),
    watch('one', 'viewer-a', 5_000, true),
    watch('one', 'viewer-b', 3_000, false),
    watch('two', 'viewer-a', 8_000, true)
  ];
  const result = summarizeCreatorVideoAnalytics(posts, events, 'creator', now, 30);

  assert.deepEqual(result.summary, {
    publishedVideos: 2,
    uniqueViewers: 2,
    uniqueVideoViews: 3,
    totalWatchSeconds: 20,
    averageWatchSecondsPerViewer: 6.7,
    completionRate: 2 / 3
  });
  assert.equal(result.videos[0].postId, 'two');
  assert.equal(result.videos[1].uniqueViewers, 2);
  assert.equal(result.videos[1].completedViewers, 1);
});

test('creator analytics exclude other creators, self-views and events outside the period', () => {
  const posts = [video('own', 'creator'), video('other', 'someone-else'), video('archived', 'creator', { archivedAt: recent })];
  const events = [
    watch('own', 'viewer', 5_000, true),
    watch('own', 'creator', 10_000, true),
    watch('other', 'viewer', 10_000, true),
    watch('own', 'old-viewer', 10_000, true, 40 * 24 * 60 * 60 * 1000),
    { ...watch('own', 'future-viewer', 10_000, true), createdAt: new Date(now + 60_000).toISOString() }
  ];
  const result = summarizeCreatorVideoAnalytics(posts, events, 'creator', now, 30);

  assert.equal(result.summary.publishedVideos, 1);
  assert.equal(result.summary.uniqueViewers, 1);
  assert.equal(result.summary.totalWatchSeconds, 5);
  assert.equal(result.videos[0].uniqueViewers, 1);
});

test('creator analytics return empty real metrics without exposing viewer identifiers', () => {
  const result = summarizeCreatorVideoAnalytics([video('new', 'creator')], [], 'creator', now, 7);

  assert.equal(result.periodDays, 7);
  assert.equal(result.summary.uniqueViewers, 0);
  assert.equal(result.summary.completionRate, 0);
  assert.equal(result.videos[0].uniqueViewers, 0);
  assert.equal(Object.hasOwn(result.videos[0], 'viewers'), false);
  assert.equal(Object.hasOwn(result.videos[0], 'viewerIds'), false);
});

test('creator analytics enforce the supported reporting periods', () => {
  const result = summarizeCreatorVideoAnalytics([], [], 'creator', now, 365);
  assert.equal(result.periodDays, 30);
});

test('Creator Studio and its authenticated API expose the same real analytics contract', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  assert.match(server, /p===['"]\/api\/creator\/video-analytics['"]/);
  assert.match(server, /post\.userId===user\.id/);
  assert.match(server, /asset\.status==='attached'&&asset\.mediaType==='video'/);
  assert.match(app, /api\(["']\/creator\/video-analytics\?days=/);
  assert.match(app, /creator-video-analytics-period/);
  assert.match(index, /creator-video-analytics\.css/);
  assert.match(worker, /creator-video-analytics\.css/);
});


test('Creator Studio displays anonymous audience countries with opt-in and five-member privacy safeguards', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'public/settings.js'), 'utf8');
  const domain = fs.readFileSync(path.join(root, 'src/domain/video-analytics.js'), 'utf8');

  assert.match(app, /const demographics=analytics\?\.demographics\|\|\{\}/);
  assert.match(app, /Anonymous audience countries/);
  assert.match(app, /No country group currently meets the minimum of five members/);
  assert.match(app, /Smaller country groups are hidden to protect member privacy/);
  assert.match(settings, /shareAudienceDemographics: false/);
  assert.match(settings, /name="shareAudienceDemographics"/);
  assert.match(settings, /Off by default/);
  assert.match(domain, /VIDEO_DEMOGRAPHICS_MIN_SAMPLE_SIZE\s*=\s*5/);
});
