import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = 3146;
const testDataDir = path.join(os.tmpdir(), `minglora-video-playlists-${randomUUID()}`);
let server;

async function request(sessionCookie, url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload };
}

test('video playlists persist, enforce ownership and respect public/unlisted/private visibility', async t => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      AUTH_PROVIDER: 'legacy',
      PERSISTENCE_DRIVER: 'json',
      DATA_DIR: testDataDir,
      SESSION_SECRET: 'playlist-test-secret-with-sufficient-entropy-and-length',
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      TENOR_API_KEY: ''
    },
    stdio: 'ignore'
  });
  t.after(() => {
    server?.kill('SIGTERM');
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      health = await request('', '/api/health');
      if (health.status === 200) break;
    } catch {}
    await delay(100);
  }
  assert.equal(health?.status, 200);
  assert.equal((await request('', '/api/video-playlists')).status, 401);

  const ownerRegistration = await request('', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Playlist Owner', username: 'playlistowner', email: 'playlist-owner@example.test', password: 'PlaylistPassword123!' })
  });
  assert.equal(ownerRegistration.status, 201, JSON.stringify(ownerRegistration.body));
  const ownerSetCookie = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'playlist-owner@example.test', password: 'PlaylistPassword123!' })
  });
  const ownerCookieHeader = ownerSetCookie.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(ownerCookieHeader);
  const ownerId = ownerRegistration.body.user.id;

  const empty = await request(ownerCookieHeader, '/api/video-playlists');
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.playlists, []);

  const invalid = await request(ownerCookieHeader, '/api/video-playlists', {
    method: 'POST', body: JSON.stringify({ title: '', visibility: 'public' })
  });
  assert.equal(invalid.status, 400);

  const publicCreate = await request(ownerCookieHeader, '/api/video-playlists', {
    method: 'POST', body: JSON.stringify({ title: 'Public Road Trips', description: 'Real creator travel videos', visibility: 'public' })
  });
  assert.equal(publicCreate.status, 201, JSON.stringify(publicCreate.body));
  const publicId = publicCreate.body.playlist.id;

  const unlistedCreate = await request(ownerCookieHeader, '/api/video-playlists', {
    method: 'POST', body: JSON.stringify({ title: 'Shared Privately', visibility: 'unlisted' })
  });
  assert.equal(unlistedCreate.status, 201);
  const unlistedId = unlistedCreate.body.playlist.id;

  const privateCreate = await request(ownerCookieHeader, '/api/video-playlists', {
    method: 'POST', body: JSON.stringify({ title: 'Personal Queue' })
  });
  assert.equal(privateCreate.status, 201);
  const privateId = privateCreate.body.playlist.id;

  const ownerList = await request(ownerCookieHeader, '/api/video-playlists');
  assert.equal(ownerList.body.playlists.length, 3);
  assert.equal(ownerList.body.playlists.find(item => item.id === privateId).visibility, 'private');

  const viewerRegistration = await request('', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Playlist Viewer', username: 'playlistviewer', email: 'playlist-viewer@example.test', password: 'ViewerPassword123!' })
  });
  assert.equal(viewerRegistration.status, 201, JSON.stringify(viewerRegistration.body));
  const viewerLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'playlist-viewer@example.test', password: 'ViewerPassword123!' })
  });
  const viewerCookie = viewerLogin.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(viewerCookie);

  const discoverable = await request(viewerCookie, `/api/video-playlists?ownerId=${encodeURIComponent(ownerId)}`);
  assert.equal(discoverable.status, 200);
  assert.deepEqual(discoverable.body.playlists.map(item => item.id), [publicId]);

  assert.equal((await request(viewerCookie, `/api/video-playlists/${publicId}`)).status, 200);
  assert.equal((await request(viewerCookie, `/api/video-playlists/${unlistedId}`)).status, 200);
  assert.equal((await request(viewerCookie, `/api/video-playlists/${privateId}`)).status, 404);

  const forbiddenUpdate = await request(viewerCookie, `/api/video-playlists/${publicId}`, {
    method: 'PATCH', body: JSON.stringify({ title: 'Hijacked playlist' })
  });
  assert.equal(forbiddenUpdate.status, 403);
  const forbiddenDelete = await request(viewerCookie, `/api/video-playlists/${publicId}`, { method: 'DELETE' });
  assert.equal(forbiddenDelete.status, 403);

  const unavailableVideo = await request(ownerCookieHeader, `/api/video-playlists/${publicId}/items`, {
    method: 'POST', body: JSON.stringify({ postId: 'not-a-real-video' })
  });
  assert.equal(unavailableVideo.status, 404);

  const invalidOrder = await request(ownerCookieHeader, `/api/video-playlists/${publicId}/order`, {
    method: 'PUT', body: JSON.stringify({ orderedPostIds: ['not-a-real-video'] })
  });
  assert.equal(invalidOrder.status, 400);

  const changed = await request(ownerCookieHeader, `/api/video-playlists/${publicId}`, {
    method: 'PATCH', body: JSON.stringify({ title: 'Updated Road Trips', description: 'Updated description', visibility: 'friends' })
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.playlist.title, 'Updated Road Trips');
  assert.equal((await request(viewerCookie, `/api/video-playlists/${publicId}`)).status, 404);

  const restored = await request(ownerCookieHeader, `/api/video-playlists/${publicId}`, {
    method: 'PATCH', body: JSON.stringify({ visibility: 'public' })
  });
  assert.equal(restored.status, 200);

  const deleted = await request(ownerCookieHeader, `/api/video-playlists/${privateId}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal((await request(ownerCookieHeader, `/api/video-playlists/${privateId}`)).status, 404);
});
