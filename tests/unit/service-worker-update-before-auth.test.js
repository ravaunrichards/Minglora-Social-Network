import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

test('registers the service worker without forcing an open page to refresh or change screens', () => {
  const registerCall = app.indexOf('void prepareMingloraServiceWorker();');
  const authBootstrap = app.indexOf("(async()=>{await finishPasswordRecoveryFromLink();if(await finishMagicLinkFromUrl())return;try{const me=await api('/auth/me')");
  assert.notEqual(registerCall, -1, 'service-worker registration must start at app boot');
  assert.notEqual(authBootstrap, -1, 'auth bootstrap must exist');
  assert.ok(registerCall < authBootstrap, 'registration must remain available before auth bootstrap');
  assert.match(app, /updateViaCache:'none'/, 'service-worker script updates must bypass stale HTTP cache');
  assert.doesNotMatch(app, /await registration\.update\(\)/, 'do not force an update check during the active session');
  assert.doesNotMatch(worker, /self\.skipWaiting\(\)/, 'new worker must wait for existing app tabs to close');
  assert.doesNotMatch(worker, /self\.clients\.claim\(\)/, 'new worker must not take over open tabs');
  assert.doesNotMatch(worker, /existing\.navigate\(target\)/, 'notification clicks must not redirect the existing tab');
  assert.match(worker, /await self\.clients\.openWindow\(target\)/, 'notification destinations must open separately');
  assert.ok(html.includes('/app.js?v=20261106-auto-sync-no-refresh-1'), 'keep the established app URL; service-worker revalidation refreshes code without forcing an active page reload');
  assert.ok(worker.includes('/app.js?v=20261106-auto-sync-no-refresh-1'), 'the service-worker shell must cache the same established app asset');
  assert.ok(worker.includes('/profile-established.css?v=20261106-established-profile-1'), 'the established profile styles must be included in the offline shell');
});
