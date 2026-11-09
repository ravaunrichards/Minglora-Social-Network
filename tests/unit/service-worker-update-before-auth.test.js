import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const login = fs.readFileSync(new URL('../../public/auth-login.js', import.meta.url), 'utf8');

test('registers the current shell before session restoration and leaves updates to the browser lifecycle', () => {
  const registerCall = app.indexOf('void prepareMingloraServiceWorker();');
  const authBootstrap = app.indexOf("const me=await api('/auth/me',options)");
  const loginScript = html.indexOf('auth-login.js?v=20261109-oauth-pkce-buttons-1');
  const appScript = html.indexOf('/app.js?');

  assert.notEqual(registerCall, -1, 'service-worker registration must start at app boot');
  assert.notEqual(authBootstrap, -1, 'session restoration must still run');
  assert.ok(registerCall < authBootstrap, 'the app shell is registered before session restoration');
  assert.ok(loginScript >= 0 && appScript > loginScript, 'independent login and registration handlers load before app.js');
  assert.ok(login.includes('submitLogin(form)'), 'the independent auth handler owns sign-in');
  assert.ok(login.includes('submitRegistration(form)'), 'the independent auth handler owns registration');
  assert.match(app, /navigator\.serviceWorker\.register\([^;]+updateViaCache:'none'/, 'the service-worker script bypasses stale HTTP cache');
  assert.match(app, /startMingloraServiceWorkerUpdates\(registration\)/, 'the installed registration is retained for normal lifecycle handling');
  assert.match(app, /Use the browser's normal service-worker lifecycle/, 'updates use the browser lifecycle rather than forced reloads');
  assert.doesNotMatch(app, /registration\.update\(\)/, 'the page does not force periodic worker updates');
  assert.doesNotMatch(app, /MINGLORA_UPDATE_CHECK_INTERVAL_MS|MINGLORA_UPDATE_IDLE_MS/, 'the obsolete forced-refresh scheduler is absent');
  assert.match(worker, /No skipWaiting message handler/, 'waiting workers do not force takeover of an open app');
  assert.doesNotMatch(worker, /self\.skipWaiting\(\)/, 'the worker follows the browser lifecycle');
  assert.match(worker, /self\.clients\.claim\(\)/, 'an activated worker controls clients normally');
  assert.match(worker, /cacheCurrentShellAssets/, 'the worker pre-caches current versioned assets from the live HTML');

  const clickStart = worker.indexOf("self.addEventListener('notificationclick'");
  const clickHandler = worker.slice(clickStart);
  assert.ok(clickHandler.includes("const isCall=data.type==='call'&&Boolean(data.callId);"));
  assert.ok(clickHandler.indexOf('if(isCall)') < clickHandler.indexOf('existing.navigate(target)'), 'only call notifications may navigate the current app tab');
  assert.ok(clickHandler.indexOf('if(isCall)') < clickHandler.indexOf('const exactTarget=windows.find(client=>client.url===target)'), 'other notifications only focus an exact target tab');
  assert.ok(clickHandler.includes('await self.clients.openWindow(target)'), 'other notification destinations still open separately');

  const currentAppAsset = html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1] || '';
  assert.ok(currentAppAsset, 'the current app script uses a versioned URL');
  assert.ok(worker.includes("'" + currentAppAsset + "'"), 'the current app script remains in the offline shell');
  assert.ok(html.includes('auth-login.js?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(worker.includes('auth-login.js?v=20261109-oauth-pkce-buttons-1'), 'the independent login handler is available offline');
  assert.ok(html.includes('auth-oauth.css?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(worker.includes('auth-oauth.css?v=20261109-oauth-pkce-buttons-1'), 'social OAuth styles are available offline');
  assert.ok(html.includes('profile-established.css'), 'the established profile stylesheet is linked');
  assert.ok(worker.includes('profile-established.css'), 'the established profile stylesheet is included in the offline shell');
});
