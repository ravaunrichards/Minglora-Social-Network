import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = 3147;
const testDataDir = path.join(os.tmpdir(), `minglora-video-channels-${randomUUID()}`);
let server;

async function request(cookie, url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function startServer() {
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      AUTH_PROVIDER: 'legacy',
      PERSISTENCE_DRIVER: 'json',
      DATA_DIR: testDataDir,
      SESSION_SECRET: 'channel-test-secret-with-sufficient-entropy-and-length',
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      TENOR_API_KEY: ''
    },
    stdio: 'ignore'
  });
  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      health = await request('', '/api/health');
      if (health.status === 200) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Minglora test server did not become healthy.');
}

test('creator channels discover real visible videos and persist independent subscriptions', async t => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  t.after(() => {
    server?.kill('SIGTERM');
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });
  await startServer();

  assert.equal((await request('', '/api/video-channels')).status, 401);
  const owner = await request('', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Channel Creator', username: 'channelcreator', email: 'channel-creator@example.test', password: 'ChannelCreator123!' })
  });
  assert.equal(owner.status, 201, JSON.stringify(owner.body));
  const ownerLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'channel-creator@example.test', password: 'ChannelCreator123!' })
  });
  const ownerCookie = ownerLogin.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(ownerCookie);

  const viewer = await request('', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Channel Viewer', username: 'channelviewer', email: 'channel-viewer@example.test', password: 'ChannelViewer123!' })
  });
  assert.equal(viewer.status, 201, JSON.stringify(viewer.body));
  const viewerLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'channel-viewer@example.test', password: 'ChannelViewer123!' })
  });
  const viewerCookie = viewerLogin.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(viewerCookie);

  const ownerId = owner.body.user.id;
  const viewerId = viewer.body.user.id;
  assert.deepEqual((await request(viewerCookie, '/api/video-channels?scope=discover')).body.channels, []);

  // A temporary, isolated real media/post fixture makes sure discovery derives
  // channel availability from persisted video records rather than sample users.
  await new Promise(resolve => {
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
  const statePath = path.join(testDataDir, 'db.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.mediaAssets.push(
    {
      id: 'channel-video-public-asset', ownerId, slot: 'post', bucket: 'test', path: 'test/public.mp4',
      mimeType: 'video/mp4', mediaType: 'video', byteSize: 4096, originalName: 'public.mp4',
      status: 'attached', url: 'https://cdn.example.test/test/public.mp4', createdAt: new Date().toISOString()
    },
    {
      id: 'channel-video-friends-asset', ownerId, slot: 'post', bucket: 'test', path: 'test/friends.mp4',
      mimeType: 'video/mp4', mediaType: 'video', byteSize: 4096, originalName: 'friends.mp4',
      status: 'attached', url: 'https://cdn.example.test/test/friends.mp4', createdAt: new Date().toISOString()
    }
  );
  state.posts.unshift(
    {
      id: 'channel-video-public', userId: ownerId, text: 'Public creator upload',
      mediaIds: ['channel-video-public-asset'], audience: 'public', createdAt: new Date().toISOString(),
      reactions: {}, comments: []
    },
    {
      id: 'channel-video-friends', userId: ownerId, text: 'Friends-only creator upload',
      mediaIds: ['channel-video-friends-asset'], audience: 'friends', createdAt: new Date().toISOString(),
      reactions: {}, comments: []
    }
  );
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  await startServer();

  const discover = await request(viewerCookie, '/api/video-channels?scope=discover');
  assert.equal(discover.status, 200);
  assert.equal(discover.body.channels.length, 1);
  assert.equal(discover.body.channels[0].id, ownerId);
  assert.equal(discover.body.channels[0].videoCount, 1);
  assert.equal(discover.body.channels[0].isSubscribed, false);

  const channelDetail = await request(viewerCookie, `/api/video-channels/${ownerId}`);
  assert.equal(channelDetail.status, 200);
  assert.deepEqual(channelDetail.body.channel.videos.map(post => post.id), ['channel-video-public']);
  assert.equal(channelDetail.body.channel.videos.some(post => post.text === 'Friends-only creator upload'), false);

  const selfSubscribe = await request(ownerCookie, `/api/video-channels/${ownerId}/subscription`, { method: 'POST', body: '{}' });
  assert.equal(selfSubscribe.status, 400);
  const subscribe = await request(viewerCookie, `/api/video-channels/${ownerId}/subscription`, { method: 'POST', body: '{}' });
  assert.equal(subscribe.status, 201, JSON.stringify(subscribe.body));
  const duplicateSubscribe = await request(viewerCookie, `/api/video-channels/${ownerId}/subscription`, { method: 'POST', body: '{}' });
  assert.equal(duplicateSubscribe.status, 200);
  assert.equal(duplicateSubscribe.body.alreadySubscribed, true);

  const subscriptions = await request(viewerCookie, '/api/video-channels?scope=subscriptions');
  assert.equal(subscriptions.status, 200);
  assert.deepEqual(subscriptions.body.channels.map(channel => channel.id), [ownerId]);
  assert.equal(subscriptions.body.channels[0].isSubscribed, true);

  const ownerMine = await request(ownerCookie, '/api/video-channels?scope=mine');
  assert.equal(ownerMine.status, 200);
  assert.deepEqual(ownerMine.body.channels.map(channel => channel.id), [ownerId]);

  const unsubscribe = await request(viewerCookie, `/api/video-channels/${ownerId}/subscription`, { method: 'DELETE' });
  assert.equal(unsubscribe.status, 200);
  const unsubscribeAgain = await request(viewerCookie, `/api/video-channels/${ownerId}/subscription`, { method: 'DELETE' });
  assert.equal(unsubscribeAgain.status, 200);
  assert.equal((await request(viewerCookie, '/api/video-channels?scope=subscriptions')).body.channels.length, 0);

  const invalidScope = await request(viewerCookie, '/api/video-channels?scope=everything');
  assert.equal(invalidScope.status, 400);
  const notFound = await request(viewerCookie, '/api/video-channels/not-a-channel');
  assert.equal(notFound.status, 404);
});
