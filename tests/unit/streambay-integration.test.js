import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('StreamBay is retired from Minglora navigation, APIs, and persisted state', async () => {
  const [html, server, store] = await Promise.all([
    readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/server.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/store.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /streambay/i);
  assert.doesNotMatch(server, /handleStreamBayApi|\/api\/streambay/i);
  const collections = store.slice(store.indexOf('const COLLECTIONS'), store.indexOf('const requestedDriver'));
  assert.doesNotMatch(collections, /streambayChannels|streambayVideos/);
  assert.match(store, /Permanently retire StreamBay-only collections/);
});
