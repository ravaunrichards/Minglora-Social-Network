import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyAIRequestRoute,
  createAIRequestSecurityGuard,
  createAIOperationalMonitor,
  sanitizeAIErrorCode
} from '../../backend/modules/ai-network/security-reliability.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI operational error logging uses a strict safe-code allowlist', () => {
  assert.equal(sanitizeAIErrorCode('provider_error'), 'provider_error');
  assert.equal(sanitizeAIErrorCode('timeout'), 'timeout');
  assert.equal(sanitizeAIErrorCode('sk-proj-secret-material-that-must-not-be-logged'), 'unhandled_error');
  assert.equal(sanitizeAIErrorCode('arbitrary-database-error-text'), 'unhandled_error');
});

test('AI Network route classification assigns specific abuse policies', () => {
  assert.equal(classifyAIRequestRoute('/api/ai-network', 'GET'), 'read');
  assert.equal(classifyAIRequestRoute('/api/ai-network/bots/id/chat', 'POST'), 'chat');
  assert.equal(classifyAIRequestRoute('/api/ai-network/provider-health', 'POST'), 'provider');
  assert.equal(classifyAIRequestRoute('/api/ai-network/settings', 'PATCH'), 'write');
  assert.equal(classifyAIRequestRoute('/api/ai-network/email/webhook', 'POST'), 'webhook');
});

test('authenticated bot chat is limited to six calls per minute', () => {
  let time = 1_000;
  const guard = createAIRequestSecurityGuard({ now: () => time });
  const request = {
    actorId: 'designated-owner',
    clientAddress: '127.0.0.1',
    pathname: '/api/ai-network/bots/example/chat',
    method: 'POST'
  };
  for (let i = 0; i < 6; i += 1) assert.equal(guard.check(request).allowed, true);
  const blocked = guard.check(request);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.policy, 'chat');
  assert.equal(blocked.retryAfterSeconds, 60);
  time += 60_001;
  assert.equal(guard.check(request).allowed, true);
});

test('provider health probes have a separate low-volume limit', () => {
  const guard = createAIRequestSecurityGuard({ now: () => 5_000 });
  const request = { actorId: 'designated-owner', pathname: '/api/ai-network/provider-health', method: 'POST' };
  for (let i = 0; i < 4; i += 1) assert.equal(guard.check(request).allowed, true);
  const blocked = guard.check(request);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.policy, 'providerProbe');
  assert.equal(blocked.retryAfterSeconds, 300);
});

test('mutating requests remain limited across burst-window resets', () => {
  let time = 10_000;
  const guard = createAIRequestSecurityGuard({ now: () => time });
  const request = { actorId: 'designated-owner', pathname: '/api/ai-network/settings', method: 'PATCH' };
  for (let i = 0; i < 20; i += 1) assert.equal(guard.check(request).allowed, true);
  time += 10_001;
  for (let i = 0; i < 10; i += 1) assert.equal(guard.check(request).allowed, true);
  const blocked = guard.check(request);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.policy, 'write');
});

test('unauthenticated requests are limited by socket address, not forwarded headers', () => {
  let time = 20_000;
  const guard = createAIRequestSecurityGuard({ now: () => time });
  const request = { clientAddress: '203.0.113.10', pathname: '/api/ai-network', method: 'GET' };
  for (let window = 0; window < 3; window += 1) {
    for (let i = 0; i < 8; i += 1) assert.equal(guard.check(request).allowed, true);
    if (window < 2) time += 10_001;
  }
  const blocked = guard.check(request);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.policy, 'principal');
  assert.equal(guard.check({ ...request, clientAddress: '203.0.113.11' }).allowed, true);
});

test('rate-limit memory remains strictly bounded for high-cardinality traffic', () => {
  const guard = createAIRequestSecurityGuard({ now: () => 50_000, maxEntries: 32 });
  for (let i = 0; i < 1_000; i += 1) {
    guard.check({ actorId: 'owner-' + i, pathname: '/api/ai-network', method: 'GET' });
    assert.ok(guard.snapshot().activeBuckets <= guard.snapshot().maxBuckets);
  }
  assert.equal(guard.snapshot().maxBuckets, 32);
});

test('operational metrics contain only aggregate status and latency data', () => {
  let time = Date.parse('2026-11-20T18:00:00.000Z');
  const monitor = createAIOperationalMonitor({ now: () => time, maxLatencySamples: 10 });
  monitor.recordResponse({ routeGroup: 'chat', statusCode: 200, durationMs: 12 });
  monitor.recordResponse({ routeGroup: 'write', statusCode: 403, durationMs: 30 });
  monitor.recordResponse({ routeGroup: 'provider', statusCode: 429, durationMs: 8 });
  monitor.recordResponse({ routeGroup: 'chat', statusCode: 500, durationMs: 100 });
  monitor.recordUnexpectedError();
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.counters.requests, 4);
  assert.equal(snapshot.counters.successfulResponses, 1);
  assert.equal(snapshot.counters.clientErrors, 2);
  assert.equal(snapshot.counters.serverErrors, 1);
  assert.equal(snapshot.counters.authorizationDenied, 1);
  assert.equal(snapshot.counters.rateLimited, 1);
  assert.equal(snapshot.counters.unexpectedErrors, 1);
  assert.equal(snapshot.routes.chat, 2);
  assert.equal(snapshot.latencyMs.p50, 12);
  assert.equal(snapshot.latencyMs.p95, 100);
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['owner-', 'api_key', 'prompt', 'requestBody', 'authorization', 'cookie']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('AI API limits run before authentication without weakening designated-admin MFA authorization', () => {
  const server = read('src/server.js');
  const start = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  const rate = route.indexOf('aiRequestSecurityGuard.check');
  const auth = route.indexOf('requireAuth(user)');
  const designated = route.indexOf('isDesignatedCreatorHubAdmin(user)');
  const moderator = route.indexOf('isModerator(user, req)');
  const mfa = route.indexOf('hasActiveReviewerSession(user)');
  assert.ok(rate >= 0 && auth > rate && designated > auth && moderator > designated && mfa > moderator);
  assert.ok(route.includes('user?.isAI === true'));
  assert.ok(route.includes('user?.aiAccount === true'));
  assert.ok(route.includes("p === '/api/ai-network/health'"));
  assert.ok(route.includes('persistenceHealth()'));
  assert.ok(route.includes('process.memoryUsage()'));
  assert.ok(route.includes('aiOperationalMonitor.snapshot()'));
});

test('protected AI health response contains no credential-bearing values', () => {
  const server = read('src/server.js');
  const start = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))");
  const gate = server.indexOf('hasActiveReviewerSession(user)', start);
  const health = server.indexOf("if (method === 'GET' && p === '/api/ai-network/health')", start);
  const end = server.indexOf('const providerReady', health);
  assert.ok(health > gate && end > health);
  const block = server.slice(health, end);
  for (const secretName of ['OPENAI_API_KEY', 'MINGLORA_AI_API_KEY', 'access_token', 'apiKey', 'Authorization']) {
    assert.equal(block.includes(secretName), false);
  }
});

test('signed AI email webhook is rate-limited before signature-verified processing', () => {
  const server = read('src/server.js');
  const start = server.indexOf("if (p === '/api/ai-network/email/webhook')");
  const end = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.ok(route.indexOf('aiRequestSecurityGuard.check') < route.indexOf('verifyResendWebhook'));
  assert.ok(route.includes('verifyResendWebhook'));
});

test('unexpected AI API errors include correlation IDs and omit raw diagnostics', () => {
  const server = read('src/server.js');
  const start = server.indexOf('const server=http.createServer((req,res)=>');
  const end = server.indexOf('const messengerRealtime=', start);
  assert.ok(start >= 0 && end > start);
  const handler = server.slice(start, end);
  assert.ok(handler.includes('X-Minglora-Request-ID'));
  assert.ok(handler.includes('requestId'));
  assert.ok(handler.includes('aiOperationalMonitor.recordUnexpectedError()'));
  assert.ok(handler.includes("event: 'request_unhandled'"));
  assert.equal(handler.includes('error.message'), false);
  assert.equal(handler.includes('error.stack'), false);
  assert.equal(handler.includes('req.rawBody'), false);
  assert.equal(handler.includes('req.headers.authorization'), false);
});

test('security runbook distinguishes source controls from unverified live backups', () => {
  const runbook = read('docs/AI_BOT_NETWORK_SECURITY_RELIABILITY.md');
  assert.ok(runbook.includes('Process-local abuse guard'));
  assert.ok(runbook.includes('AI identities cannot authenticate'));
  assert.ok(runbook.includes('service_role'));
  assert.ok(runbook.includes('Backup and restore acceptance remains open'));
  assert.ok(runbook.includes('global_paused=true'));
  assert.ok(runbook.includes('Do not restore directly over the active production project'));
});
