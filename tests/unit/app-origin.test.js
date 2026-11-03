import test from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin } from '../../src/app-origin.js';

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
