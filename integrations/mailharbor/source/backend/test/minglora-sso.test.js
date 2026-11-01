'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyMingloraRequest } = require('../src/security');

function signedRequest({ secret, method = 'GET', path = '/api/messages', userId = '12345678-1234-1234-1234-123456789abc', body = '', timestamp = Date.now() }) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const signed = [String(timestamp), method, path, userId, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  const headers = {
    'x-minglora-user-id': userId,
    'x-minglora-timestamp': String(timestamp),
    'x-minglora-signature': signature
  };
  return { method, originalUrl: path, rawBody: Buffer.from(body), get(name) { return headers[name.toLowerCase()]; } };
}

test('accepts a valid recent Minglora service signature', () => {
  const secret = 'mailharbor-minglora-integration-secret-2026';
  const req = signedRequest({ secret, method: 'POST', path: '/api/sso/provision', body: '{"username":"member"}' });
  assert.equal(verifyMingloraRequest(req, secret), true);
});

test('rejects changed paths, bodies and expired timestamps', () => {
  const secret = 'mailharbor-minglora-integration-secret-2026';
  const req = signedRequest({ secret, method: 'POST', path: '/api/sso/provision', body: '{"username":"member"}' });
  assert.equal(verifyMingloraRequest({ ...req, originalUrl: '/api/messages' }, secret), false);
  assert.equal(verifyMingloraRequest({ ...req, rawBody: Buffer.from('{"username":"attacker"}') }, secret), false);
  assert.equal(verifyMingloraRequest(req, secret, Date.now() + 121000), false);
});

test('rejects requests when the shared secret is not configured', () => {
  const req = signedRequest({ secret: 'mailharbor-minglora-integration-secret-2026' });
  assert.equal(verifyMingloraRequest(req, ''), false);
});
