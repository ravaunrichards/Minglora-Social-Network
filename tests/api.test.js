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

  const editedPost = await request(`/api/posts/${post.body.post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text: 'Edited integration post' })
  });
  assert.equal(editedPost.status, 200);
  assert.equal(editedPost.body.post.text, 'Edited integration post');

  const saved = await request(`/api/posts/${post.body.post.id}/save`, { method: 'POST', body: '{}' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.saved, true);
  const savedPosts = await request('/api/saved-posts');
  assert.equal(savedPosts.status, 200);
  assert.equal(savedPosts.body.posts.length, 1);
  const unsaved = await request(`/api/posts/${post.body.post.id}/save`, { method: 'DELETE', body: '{}' });
  assert.equal(unsaved.body.saved, false);

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

  const firstCookie = cookie;
  const firstUserId = registration.body.user.id;
  cookie = '';
  const secondRegistration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Second Test User',
      username: 'secondtest',
      email: 'second-user@example.test',
      password: 'AnotherPassword123!'
    })
  });
  assert.equal(secondRegistration.status, 201);
  const secondUserId = secondRegistration.body.user.id;
  const secondCookie = cookie;

  const follow = await request(`/api/users/${firstUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(follow.status, 200);
  assert.equal(follow.body.following, true);
  const followers = await request(`/api/users/${firstUserId}/followers`);
  assert.equal(followers.body.count, 1);
  assert.equal(followers.body.users[0].id, secondUserId);

  const followingFeed = await request('/api/feed?scope=following');
  assert.equal(followingFeed.status, 200);
  assert.deepEqual(followingFeed.body.posts.map(item => item.id), [post.body.post.id]);
  assert.equal(followingFeed.body.scope, 'following');
  const friendsFeed = await request('/api/feed?scope=friends');
  assert.equal(friendsFeed.status, 200);
  assert.equal(friendsFeed.body.posts.length, 0);
  const invalidScope = await request('/api/feed?scope=secret');
  assert.equal(invalidScope.status, 400);

  const forbiddenEdit = await request(`/api/posts/${post.body.post.id}`, { method: 'PATCH', body: JSON.stringify({ text: 'Not the owner' }) });
  assert.equal(forbiddenEdit.status, 403);
  const forbiddenDelete = await request(`/api/posts/${post.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(forbiddenDelete.status, 403);

  const otherSave = await request(`/api/posts/${post.body.post.id}/save`, { method: 'POST', body: '{}' });
  assert.equal(otherSave.body.saved, true);
  assert.equal((await request('/api/saved-posts')).body.posts.length, 1);

  const block = await request(`/api/users/${firstUserId}/block`, { method: 'POST', body: '{}' });
  assert.equal(block.body.blocked, true);
  assert.equal((await request('/api/feed')).body.posts.length, 0);
  assert.equal((await request(`/api/users/${firstUserId}`)).status, 404);
  assert.equal((await request('/api/blocks')).body.users.length, 1);
  const blockedMessage = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: firstUserId, text: 'This should be rejected while blocked.' })
  });
  assert.equal(blockedMessage.status, 400);

  const unblock = await request(`/api/users/${firstUserId}/block`, { method: 'DELETE', body: '{}' });
  assert.equal(unblock.body.blocked, false);
  assert.equal((await request(`/api/users/${firstUserId}`)).status, 200);
  const refollow = await request(`/api/users/${firstUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(refollow.body.following, true);
  assert.equal((await request(`/api/users/${firstUserId}/followers`)).body.count, 1);

  cookie = firstCookie;
  const deleteOwnPost = await request(`/api/posts/${post.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOwnPost.status, 200);
  cookie = secondCookie;
  assert.equal((await request('/api/saved-posts')).body.posts.length, 0);

  cookie = firstCookie;
  const logout = await request('/api/auth/logout', { method: 'POST', body: '{}' });
  assert.equal(logout.status, 200);
  cookie = '';
  const protectedFeed = await request('/api/feed');
  assert.equal(protectedFeed.status, 401);
});
