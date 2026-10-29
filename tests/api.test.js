import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = 3137;
const testDataDir = path.join(os.tmpdir(), `minglora-test-${randomUUID()}`);
let server;
let cookie = '';

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

test('API supports empty startup, registration, feed, posting, reactions, comments, groups and logout', async t => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATA_DIR: testDataDir,
      SESSION_SECRET: 'test-secret-with-enough-entropy-for-isolated-tests'
    },
    stdio: 'ignore'
  });
  t.after(() => {
    server?.kill('SIGTERM');
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  let health;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      health = await request('/api/health');
      if (health.status === 200) break;
    } catch {}
    await delay(100);
  }
  assert.equal(health?.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.service, 'minglora-social-network');

  const beforeRegistration = await request('/api/feed');
  assert.equal(beforeRegistration.status, 401);

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Minglora Test User',
      username: 'mingloratest',
      email: 'test-user@example.test',
      password: 'TestPassword123!'
    })
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.username, 'mingloratest');

  const invalidProfile = await request('/api/users/me', { method: 'PATCH', body: JSON.stringify({ avatar: 'javascript:alert(1)' }) });
  assert.equal(invalidProfile.status, 400);

  const feed = await request('/api/feed');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.posts.length, 0);
  const emptyPage = await request('/api/feed?limit=1');
  assert.equal(emptyPage.status, 200);
  assert.equal(emptyPage.body.posts.length, 0);
  assert.equal(emptyPage.body.hasMore, false);

  const post = await request('/api/posts', {
    method: 'POST',
    body: JSON.stringify({ text: 'Automated integration test post' })
  });
  assert.equal(post.status, 201);
  assert.equal(post.body.post.text, 'Automated integration test post');
  const invalidPost = await request('/api/posts', { method: 'POST', body: JSON.stringify({ imageUrl: 'http://example.test/not-secure.jpg' }) });
  assert.equal(invalidPost.status, 400);
  const feedPage = await request('/api/feed?limit=1');
  assert.equal(feedPage.status, 200);
  assert.deepEqual(feedPage.body.posts.map(item => item.id), [post.body.post.id]);
  assert.equal(feedPage.body.hasMore, false);

  const reaction = await request(`/api/posts/${post.body.post.id}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ reaction: 'like' })
  });
  assert.equal(reaction.status, 200);
  assert.equal(reaction.body.post.myReaction, 'like');

  const comment = await request(`/api/posts/${post.body.post.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text: 'Automated test comment' })
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.comment.text, 'Automated test comment');

  const group = await request('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Community', description: 'Created by the isolated integration test' })
  });
  assert.equal(group.status, 201);
  assert.equal(group.body.group.name, 'Test Community');

  const logout = await request('/api/auth/logout', { method: 'POST', body: '{}' });
  assert.equal(logout.status, 200);
  cookie = '';
  const protectedFeed = await request('/api/feed');
  assert.equal(protectedFeed.status, 401);
});
