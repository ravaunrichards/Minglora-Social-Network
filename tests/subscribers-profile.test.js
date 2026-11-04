import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(os.tmpdir(), 'minglora-subscriber-profile-' + randomUUID());
let port = 0;
let server = null;

async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const value = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return value;
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
      DATA_DIR: dataDir,
      SESSION_SECRET: 'minglora-subscriber-profile-test-secret',
      TENOR_API_KEY: ''
    },
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/health');
      if (response.status === 200) return;
    } catch {}
    await delay(75);
  }
  throw new Error('Minglora test API did not become ready.');
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = null;
  if (child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2500);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function request(cookie, url, options = {}) {
  const response = await fetch('http://127.0.0.1:' + port + url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return {
    status: response.status,
    body,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie
  };
}

async function register(name, username, email) {
  const result = await request('', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, username, email, password: 'SubscriberTestPass123!' })
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { id: result.body.user.id, cookie: result.cookie };
}

test('profile subscriber count and list use distinct active subscription records', async t => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  port = await reservePort();
  await startServer();
  t.after(async () => {
    await stopServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const creator = await register('Minglora Creator', 'subscribercreator', 'subscriber-creator@example.test');
  const memberA = await register('Minglora Member A', 'subscribermembera', 'subscriber-member-a@example.test');
  const memberB = await register('Minglora Member B', 'subscribermemberb', 'subscriber-member-b@example.test');
  const expiredMember = await register('Expired Member', 'expiredsubscriber', 'expired-subscriber@example.test');
  const cancelledMember = await register('Cancelled Member', 'cancelledsubscriber', 'cancelled-subscriber@example.test');

  const emptyProfile = await request(creator.cookie, '/api/users/' + creator.id);
  assert.equal(emptyProfile.status, 200, JSON.stringify(emptyProfile.body));
  assert.equal(emptyProfile.body.subscribersCount, 0);
  const emptyList = await request(creator.cookie, '/api/users/' + creator.id + '/subscribers');
  assert.equal(emptyList.status, 200, JSON.stringify(emptyList.body));
  assert.equal(emptyList.body.count, 0);

  await stopServer();
  const dbPath = path.join(dataDir, 'db.json');
  const persisted = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  persisted.creatorSubscriptions = [
    { id: randomUUID(), creatorId: creator.id, subscriberId: memberA.id, status: 'active', createdAt: '2026-10-01T00:00:00.000Z', currentPeriodEnd: future },
    { id: randomUUID(), creatorId: creator.id, subscriberId: memberA.id, status: 'active', createdAt: '2026-10-02T00:00:00.000Z', currentPeriodEnd: future },
    { id: randomUUID(), creatorId: creator.id, subscriberId: memberB.id, status: 'active', cancelAtPeriodEnd: true, createdAt: new Date().toISOString(), currentPeriodEnd: future },
    { id: randomUUID(), creatorId: creator.id, subscriberId: expiredMember.id, status: 'active', currentPeriodEnd: past },
    { id: randomUUID(), creatorId: creator.id, subscriberId: cancelledMember.id, status: 'cancelled', currentPeriodEnd: future }
  ];
  fs.writeFileSync(dbPath, JSON.stringify(persisted, null, 2));
  await startServer();

  const profile = await request(creator.cookie, '/api/users/' + creator.id);
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  assert.equal(profile.body.subscribersCount, 2);

  const subscribers = await request(creator.cookie, '/api/users/' + creator.id + '/subscribers');
  assert.equal(subscribers.status, 200, JSON.stringify(subscribers.body));
  assert.equal(subscribers.body.count, 2);
  assert.deepEqual(subscribers.body.users.map(member => member.id).sort(), [memberA.id, memberB.id].sort());
});
