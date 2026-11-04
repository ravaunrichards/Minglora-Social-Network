import test from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin, isAllowedAppOrigin } from '../../src/app-origin.js';

const request = {
  headers: {
    host: 'localhost:3000',
    'x-forwarded-host': 'localhost:3000',
    'x-forwarded-proto': 'http'
  },
  socket: {}
};

test('production auth redirects ignore forwarded localhost request headers', () => {
  assert.equal(
    appOrigin(request, { NODE_ENV: 'production' }),
    'https://minglora-social-network.onrender.com'
  );
});

test('production auth redirects reject localhost APP_ORIGIN and use the live app origin', () => {
  assert.equal(
    appOrigin(request, { NODE_ENV: 'production', APP_ORIGIN: 'http://localhost:3000' }),
    'https://minglora-social-network.onrender.com'
  );
});

test('production auth redirects preserve a valid configured HTTPS custom origin', () => {
  assert.equal(
    appOrigin(request, { NODE_ENV: 'production', APP_ORIGIN: 'https://social.example.com/some/path' }),
    'https://social.example.com'
  );
});

test('development auth redirects continue to use the local forwarded origin', () => {
  assert.equal(appOrigin(request, { NODE_ENV: 'development' }), 'http://localhost:3000');
});

test('invalid development forwarded hosts fall back safely to local development', () => {
  assert.equal(
    appOrigin({ headers: { 'x-forwarded-host': 'not a valid host' }, socket: {} }, { NODE_ENV: 'development' }),
    'http://localhost:3000'
  );
});


test('same-origin writes accept the canonical Render domain alongside a configured custom domain', () => {
  const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://social.example.com' };
  assert.equal(isAllowedAppOrigin('https://minglora-social-network.onrender.com', request, env), true);
  assert.equal(isAllowedAppOrigin('https://social.example.com', request, env), true);
});

test('same-origin writes reject unconfigured domains and lookalike hosts', () => {
  const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://social.example.com' };
  assert.equal(isAllowedAppOrigin('https://attacker.example', request, env), false);
  assert.equal(isAllowedAppOrigin('https://minglora-social-network.onrender.com.attacker.example', request, env), false);
  assert.equal(isAllowedAppOrigin('javascript:alert(1)', request, env), false);
});

test('development same-origin writes continue to match the forwarded local origin', () => {
  assert.equal(isAllowedAppOrigin('http://localhost:3000', request, { NODE_ENV: 'development' }), true);
  assert.equal(isAllowedAppOrigin('http://attacker.example', request, { NODE_ENV: 'development' }), false);
});
