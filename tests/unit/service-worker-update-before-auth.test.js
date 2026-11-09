import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const meetwave = fs.readFileSync(new URL('../../public/meetwave.js', import.meta.url), 'utf8');

test('the current app shell registers its worker without forcing an update over an active session', () => {
  assert.match(app, /void prepareMingloraServiceWorker\(\)/);
  assert.match(app, /updateViaCache:'none'/);
  assert.match(worker, /cacheCurrentShellAssets/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.doesNotMatch(worker, /self\.skipWaiting\(\)|MINGLORA_ACTIVATE_WHEN_SAFE/);
  const authAsset=html.match(/src="(\/auth-login\.js\?v=[^"]+)"/)?.[1]||'';
  const appAsset=html.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1]||'';
  assert.ok(authAsset&&appAsset&&html.indexOf(authAsset)<html.indexOf(appAsset),'the dedicated authentication handler loads before the main app');
  assert.ok(worker.includes("'"+appAsset+"'"),'the worker shell includes the active app bundle');
  assert.ok(html.includes('profile-established.css'));
  assert.ok(worker.includes('profile-established.css'));
  const clickStart=worker.indexOf("self.addEventListener('notificationclick'");
  const clickHandler=worker.slice(clickStart);
  assert.ok(clickHandler.includes("const isCall=data.type==='call'&&Boolean(data.callId);"));
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('existing.navigate(target)'));
  assert.ok(clickHandler.indexOf('if(isCall)')<clickHandler.indexOf('const exactTarget=windows.find(client=>client.url===target)'));
  assert.ok(clickHandler.includes('await self.clients.openWindow(target)'));
});
});
