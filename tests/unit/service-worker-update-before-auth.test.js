import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');

test('updates the application service worker before the signed-out auth bootstrap', () => {
  const updateCall = app.indexOf('void prepareMingloraServiceWorker();');
  const authBootstrap = app.indexOf("(async()=>{await finishPasswordRecoveryFromLink();try{const me=await api('/auth/me')");
  assert.notEqual(updateCall, -1, 'service-worker update must start at app boot');
  assert.notEqual(authBootstrap, -1, 'auth bootstrap must exist');
  assert.ok(updateCall < authBootstrap, 'service-worker update must start before auth bootstrap');
  assert.match(app, /updateViaCache:'none'/, 'service-worker script updates must bypass the HTTP cache');
  assert.match(app, /await registration\.update\(\)\.catch\(\(\)=>\{\}\);/, 'registration must actively check for a new worker');
  assert.match(app, /if\(!state\.user\)return;/, 'push subscription sync must wait until a user is authenticated');
});
