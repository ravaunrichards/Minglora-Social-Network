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
  const clickStart=worker.indexOf("self.addEventListener('notificationclick'");
  const clickHandler=worker.slice(clickStart);
  assert.ok(clickHandler.includes("const isCall=data.type==='call'&&Boolean(data.callId);"));
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('existing.navigate(target)'), 'only call notifications may navigate the current app tab');
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('const exactTarget=windows.find(client=>client.url===target)'), 'other notifications only focus an exact target tab');
  assert.ok(clickHandler.includes('await self.clients.openWindow(target)'), 'other notification destinations still open separately');
  const appAsset=html.match(/src="(\\/app\\.js\\?v=[^"]+)"/)?.[1]||'';
  assert.ok(appAsset,'the latest call-enabled app URL is loaded');
  assert.ok(worker.includes("'"+appAsset+"'"), 'the service-worker shell caches the same latest app asset');
  assert.ok(html.includes('profile-established.css'), 'the established profile stylesheet is linked');
  assert.ok(worker.includes('profile-established.css'), 'the established profile stylesheet is included in the offline shell');
});
