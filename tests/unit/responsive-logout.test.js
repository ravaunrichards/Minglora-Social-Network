import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('logout is reachable from desktop, tablet and phone navigation', () => {
  assert.match(html, /id="logout-btn"[^>]*data-logout/);

  const mobileNavStart = html.indexOf('<div class="mobile-nav">');
  const mobileNavEnd = html.indexOf('</div>', mobileNavStart);
  const mobileNav = html.slice(mobileNavStart, mobileNavEnd);
  assert.match(mobileNav, /data-logout[^>]*aria-label="Log out"/);
  assert.match(mobileNav, /<small>Log out<\/small>/);

  const sideRailStart = html.indexOf('<aside class="left-rail">');
  const sideRailEnd = html.indexOf('</aside>', sideRailStart);
  const sideRail = html.slice(sideRailStart, sideRailEnd);
  assert.match(sideRail, /class="rail-link logout-rail-link"[^>]*data-logout/);
  assert.match(sideRail, /Log out/);
});

test('every logout entry uses the same sign-out and cleanup handler', () => {
  assert.match(app, /document\.querySelectorAll\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logout\)\)/);
  assert.match(app, /api\('\/auth\/logout',\{method:'POST',body:'\{\}'\}\)/);
  assert.match(app, /messagePickers\.forEach\(picker=>picker\.destroy\(\)\)/);
  assert.match(app, /showAuth\(\)/);
});

test('responsive navigation exposes an alternative where the top logout button is hidden', () => {
  assert.ok(css.includes('.logout-btn{display:none}'), 'the top action is hidden at tablet widths');
  const phoneBreakpoint = css.indexOf('@media(max-width:760px)');
  const hiddenRail = css.indexOf('.left-rail{display:none}', phoneBreakpoint);
  const visibleMobileNav = css.indexOf('.mobile-nav{position:fixed', phoneBreakpoint);
  assert.ok(phoneBreakpoint >= 0 && hiddenRail > phoneBreakpoint, 'the side rail is hidden on phones');
  assert.ok(visibleMobileNav > phoneBreakpoint, 'the phone bottom navigation is visible');
  assert.match(css, /\.logout-rail-link\{/);
  assert.match(css, /\.mobile-nav \[data-logout\]\{/);
  assert.match(serviceWorker, /minglora-shell-v6-responsive-logout/);
});
