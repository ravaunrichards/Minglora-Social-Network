import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAIProviderCredentialStatus } from '../../backend/modules/ai-network/provider-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('tracked environment template contains no live credential values', () => {
  const env = read('.env.example');
  const lines = env.split(/\r?\n/);
  const sensitiveName = /(?:API_KEY|API_SECRET|CLIENT_SECRET|CLIENT_ID|_TOKEN|_SECRET|_PASSWORD|PRIVATE_KEY|ANON_KEY|PUBLISHABLE_KEY|STATE_API_KEY)$/i;
  const unsafe = [];
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || !sensitiveName.test(match[1])) continue;
    const value = match[2].trim();
    if (value && !/^(YOUR_|REPLACE_|<[^>]+>$)/i.test(value)) unsafe.push(match[1]);
  }
  assert.deepEqual(unsafe, [], 'credential-like values must be blank or unmistakable placeholders');
  assert.match(env, /PAYPAL_MODE=sandbox/);
});

test('private env files remain excluded from version control', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
});

test('production requires Supabase Auth and a strong session secret', () => {
  const server = read('src/server.js');
  assert.match(server, /NODE_ENV === 'production'[\s\S]{0,180}SESSION_SECRET/);
  assert.match(server, /SESSION_SECRET\.length < 32/);
  assert.match(server, /AUTH_PROVIDER !== 'supabase'/);
});

test('AI Network route is authenticated and bound to the designated MFA owner', () => {
  const server = read('src/server.js');
  const start = server.indexOf("if (p === '/api/ai-network'");
  assert.notEqual(start, -1);
  const route = server.slice(start, start + 6500);
  assert.match(route, /const user = sessionUser\(req\)/);
  assert.match(route, /requireAuth\(user\)/);
  assert.match(route, /isDesignatedCreatorHubAdmin\(user\)/);
  assert.match(route, /isModerator\(user, req\)/);
  assert.match(route, /hasActiveReviewerSession\(user\)/);
});

test('health and readiness endpoints are present and readiness checks persistence and auth', () => {
  const server = read('src/server.js');
  assert.match(server, /p === '\/api\/health'/);
  assert.match(server, /p === '\/api\/ready'/);
  const ready = server.slice(server.indexOf("p === '/api/ready'"), server.indexOf("p === '/api/ready'") + 1200);
  assert.match(ready, /persistenceHealth\(\)/);
  assert.match(ready, /supabaseAuthConfigured\(\)/);
});

test('login abuse throttle has a bounded threshold and expiry', () => {
  const server = read('src/server.js');
  assert.match(server, /function checkLoginRateLimit/);
  assert.match(server, /entry\.count<5/);
  assert.match(server, /15\*60\*1000/);
});

test('provider status exposes credential presence but never echoes a secret value', () => {
  const marker = 'phase10-secret-marker-not-for-logs';
  const status = getAIProviderCredentialStatus('openai', {
    OPENAI_API_KEY: marker
  });
  assert.equal(status.credentialsPresent, true);
  assert.equal(JSON.stringify(status).includes(marker), false);
});

test('central error handling emits redacted correlation metadata', () => {
  const server = read('src/server.js');
  assert.match(server, /event:'request_unhandled_error'/);
  assert.match(server, /X-Request-Id/);
  const handler = server.slice(server.indexOf("event:'request_unhandled_error'") - 600, server.indexOf("const messengerRealtime="));
  assert.match(handler, /requestId/);
  assert.match(handler, /errorType/);
  assert.doesNotMatch(handler, /req\.headers\.cookie|req\.headers\.authorization|rawBody|error\.stack|error\.message/);
});
