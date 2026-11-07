import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const meetwave = fs.readFileSync(new URL('../../public/meetwave.js', import.meta.url), 'utf8');

test('registers before auth and refreshes the client automatically at safe idle points', () => {
  const registerCall = app.indexOf('void prepareMingloraServiceWorker();');
  const authBootstrap = app.indexOf("(async()=>{await finishPasswordRecoveryFromLink();if(await finishMagicLinkFromUrl())return;try{const me=await api('/auth/me')");
  assert.notEqual(registerCall, -1, 'service-worker registration must start at app boot');
  assert.notEqual(authBootstrap, -1, 'auth bootstrap must exist');
  assert.ok(registerCall < authBootstrap, 'registration must remain available before auth bootstrap');
  assert.match(app, /updateViaCache:'none'/, 'service-worker script updates must bypass stale HTTP cache');
  assert.match(app, /registration\.update\(\)/, 'the client checks for newer service-worker versions');
  assert.match(app, /MINGLORA_UPDATE_CHECK_INTERVAL_MS=5\*60\*1000/, 'updates are checked every five minutes while visible');
  assert.match(app, /MINGLORA_UPDATE_IDLE_MS=45\*1000/, 'updates wait for a quiet idle window');
  assert.match(app, /querySelectorAll\('video,audio'\)/, 'updates wait while audio or video is playing');
  assert.match(app, /'wheel','scroll'/, 'scrolling postpones automatic reload');
  assert.match(app, /activeCallRoom\|\|activeCallOverlay\|\|activeLiveRoom/, 'active calls and LIVE rooms prevent automatic reload');
  assert.match(app, /MingloraMeetWave\.canAutoUpdate\(\)/, 'active MeetWave rooms prevent automatic reload');
  assert.match(worker, /MINGLORA_ACTIVATE_WHEN_SAFE/, 'worker activation requires a safe client signal');
  assert.match(worker, /self\.skipWaiting\(\)/, 'a waiting worker can activate without waiting for every tab to close');
  assert.match(worker, /self\.clients\.claim\(\)/, 'the updated worker takes control so tabs can refresh when safe');
  assert.match(worker, /cacheCurrentShellAssets/, 'the worker pre-caches current versioned assets from the live HTML');
  assert.match(meetwave, /canAutoUpdate:\(\)=>!activeRoom&&!roomClient&&!pendingGuestJoinRoomId/, 'MeetWave rooms and pending guest joins are protected');

  const clickStart=worker.indexOf("self.addEventListener('notificationclick'");
  const clickHandler=worker.slice(clickStart);
  assert.ok(clickHandler.includes("const isCall=data.type==='call'&&Boolean(data.callId);"));
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('existing.navigate(target)'), 'only call notifications may navigate the current app tab');
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('const exactTarget=windows.find(client=>client.url===target)'), 'other notifications only focus an exact target tab');
  assert.ok(clickHandler.includes('await self.clients.openWindow(target)'), 'other notification destinations still open separately');
  const appAsset=html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1]||'';
  assert.ok(appAsset,'the current app script uses a versioned URL');
  assert.ok(worker.includes("'" + appAsset + "'"), 'the latest app script remains in the offline shell');
  assert.ok(html.includes('profile-established.css'), 'the established profile stylesheet is linked');
  assert.ok(worker.includes('profile-established.css'), 'the established profile stylesheet is included in the offline shell');
});
