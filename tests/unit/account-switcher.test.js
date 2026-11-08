import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../../public/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../../src/server.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../public/styles.css',import.meta.url),'utf8');

test('account switching is nested inside the existing profile picture dropdown',()=>{
  assert.equal((html.match(/id="profile-menu"/g)||[]).length,1,'keep the existing Creator/profile trigger instead of adding a second header button');
  assert.match(html,/<div class="profile-menu-anchor">\s*<button[^>]*id="profile-menu"/);
  assert.match(html,/id="profile-account-menu"[^>]*role="dialog"/);
  assert.match(html,/id="top-avatar"/);
  assert.match(html,/id="logout-btn"[^>]*data-logout/,'keep the existing logout action separate');
});

test('account menu exposes real switch, add, remove and device-wide sign-out actions',()=>{
  for(const endpoint of ['/auth/accounts','/auth/switch','/auth/accounts/remove','/auth/logout-all'])assert.ok(app.includes(endpoint),endpoint+' must be wired to the client');
  assert.match(app,/function bindAccountSwitcherMenu\(\)/);
  assert.match(app,/function openAccountAccessDialog\(initialMode='login'\)/);
  assert.match(app,/api\('\/auth\/switch'/);
  assert.match(app,/api\('\/auth\/register'/);
  assert.match(app,/api\('\/auth\/login'/);
  assert.match(app,/api\('\/auth\/accounts\/remove'/);
});

test('server binds saved sessions to a signed same-device cookie and preserves each account session',()=>{
  assert.match(server,/function deviceIdFromRequest\(req\)/);
  assert.match(server,/sign\('device:'\+id\)/);
  assert.match(server,/deviceId,createdAt,lastSeenAt/);
  assert.match(server,/session\.deviceId===deviceId/);
  assert.match(server,/p==='\/api\/auth\/switch'/);
  assert.match(server,/p==='\/api\/auth\/accounts\/remove'/);
  assert.match(server,/p==='\/api\/auth\/logout-all'/);
  assert.match(server,/sessionAuth\(targetSession\)/,'switches validate/refresh the saved Supabase session rather than swapping display-only profile data');
});

test('account dropdown and add-account dialog have desktop and phone layouts',()=>{
  assert.match(css,/\.profile-account-menu\[hidden\]/);
  assert.match(css,/\.account-switcher-row/);
  assert.match(css,/\.account-access-modal/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.profile-account-menu\{position:fixed/);
});

test('signed-in accounts persist across restarts and renew while active until the user signs out',()=>{
  assert.match(server,/APP_SESSION_TTL_MS\s*=\s*400 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(server,/APP_SESSION_COOKIE_MAX_AGE_SECONDS\s*=\s*400 \* 24 \* 60 \* 60/);
  assert.match(server,/Max-Age=\$\{APP_SESSION_COOKIE_MAX_AGE_SECONDS\}/);
  assert.match(server,/activeSession\.expiresAt = new Date\(activityTime \+ APP_SESSION_TTL_MS\)/);
  assert.match(server,/res\.setHeader\('Set-Cookie', refreshedCookies\)/);
  assert.match(server,/activityTime - previousActivity >= APP_SESSION_ACTIVITY_PERSIST_INTERVAL_MS/);
  assert.match(server,/p==='\/api\/auth\/logout'/,'explicit sign-out remains the action that removes the active saved session');
  assert.match(server,/db\.sessions=db\.sessions\.filter\(s=>s\.id!==id\)/);
});

test('Creator account switcher escapes header stacking and stays above every application overlay',()=>{
  assert.match(app,/function mountAccountSwitcherTopLayer\(\)/);
  assert.match(app,/document\.body\.appendChild\(panel\)/);
  assert.match(app,/positionAccountSwitcherTopLayer\(\)/);
  assert.match(app,/zIndex='2147483647'/);
  assert.match(app,/!panel\?\.contains\(event\.target\)/);
  assert.match(app,/anchor\.appendChild\(panel\)/);
  assert.match(css,/\.profile-account-menu\.is-top-layer\{[\s\S]*?z-index:2147483647!important/);
});
