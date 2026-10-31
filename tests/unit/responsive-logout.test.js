import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'public/settings.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('logout is kept out of mobile and tablet primary navigation and placed in Settings', () => {
  assert.ok(html.includes('href="/styles.css?v=20261031-audio-live-type-1"'));
  assert.ok(html.includes('src="/app.js?v=20261031-audio-live-type-1"'));
  assert.ok(html.includes('src="/settings.js?v=20261031-logout-in-settings-1"'));
  assert.match(html, /id="logout-btn"[^>]*data-logout/);

  const mobileNavStart = html.indexOf('<div class="mobile-nav"');
  const mobileNavEnd = html.indexOf('</div>', mobileNavStart);
  const mobileNav = html.slice(mobileNavStart, mobileNavEnd);
  assert.doesNotMatch(mobileNav, /data-logout|Log out/);

  const sideRailStart = html.indexOf('<aside class="left-rail">');
  const sideRailEnd = html.indexOf('</aside>', sideRailStart);
  const sideRail = html.slice(sideRailStart, sideRailEnd);
  assert.doesNotMatch(sideRail, /data-logout|logout-rail-link|Log out/);

  assert.ok(html.includes('id="settings-btn" aria-label="Settings & privacy"'), "Settings button is available in the top action area");
  assert.match(settings, /id="settings-signout"/);
  assert.match(settings, /id="settings-logout-btn"/);
  assert.match(settings, /Sign out of Minglora on this device/);
  assert.match(settings, /href="#settings-signout">Log out/);
  assert.match(settings, /document\.querySelector\('#logout-btn'\)\?\.click\(\)/);
});

test('Settings sign-out invokes the existing shared sign-out and cleanup action', () => {
  assert.match(settings, /document\.querySelector\('#settings-logout-btn'\)\?\.addEventListener\('click',\(\)=>document\.querySelector\('#logout-btn'\)\?\.click\(\)\)/);
  assert.match(app, /document\.querySelectorAll\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logout\)\)/);
  assert.match(app, /api\('\x2fauth\x2flogout',\{method:'POST',body:'\{\}'\}\)/);
  assert.match(app, /messagePickers\.forEach\(picker=>picker\.destroy\(\)\)/);
  assert.match(app, /showAuth\(\)/);
});

test('responsive Settings entry remains available after removing navigation logout tabs', () => {
  assert.ok(css.includes('.logout-btn{display:none}'), 'desktop top logout remains hidden below tablet width');
  assert.ok(css.includes('.left-rail{display:none}'), 'tablet side rail is hidden on phones');
  assert.ok(css.includes('.mobile-nav{position:fixed'), 'phone bottom navigation remains available');
  assert.ok(!css.includes('.logout-rail-link{'), 'no detached tablet logout styling remains');
  assert.ok(!css.includes('.mobile-nav [data-logout]'), 'no detached phone logout styling remains');
  assert.match(css, /\.settings-signout-card/);
  assert.match(css, /\.settings-logout-button/);
  assert.match(serviceWorker, /minglora-shell-v18-audio-live/);
  assert.ok(serviceWorker.includes('styles.css?v=20261031-audio-live-type-1'));
  assert.ok(serviceWorker.includes('app.js?v=20261031-audio-live-type-1'));
  assert.ok(serviceWorker.includes('settings.js?v=20261031-logout-in-settings-1'));
});
