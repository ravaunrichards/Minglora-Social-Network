import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

function ruleFor(css, selector) {
  const blocks = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const open = blocks[index].lastIndexOf('{');
    if (open < 0) continue;
    const names = blocks[index].slice(0, open).split(',').map(name => name.trim());
    if (names.includes(selector)) return blocks[index].slice(open + 1);
  }
  return '';
}

test('shared content containers can shrink without pushing the page out of alignment', async () => {
  const css = await read('public/styles.css');
  assert.ok(ruleFor(css, 'html').includes('overflow-x:clip'));
  assert.ok(ruleFor(css, 'body').includes('overflow-x:clip'));
  for (const selector of ['.layout', '.main-content', '.profile-body', '.settings-panels', '.message-layout']) {
    assert.ok(ruleFor(css, selector).includes('min-width:0'), selector + ' must be allowed to shrink inside its parent');
  }
  assert.ok(ruleFor(css, '.page-heading').includes('flex-wrap:wrap'));
  assert.ok(ruleFor(css, '.profile-counts').includes('flex-wrap:wrap'));
  assert.ok(ruleFor(css, '.profile-tabs').includes('overflow-x:auto'));
});

test('phone overlays stay clear of the fixed bottom navigation and device safe areas', async () => {
  const css = await read('public/styles.css');
  assert.ok(css.includes('body{padding-bottom:calc(72px + env(safe-area-inset-bottom))}'));
  assert.ok(css.includes('#message-window-dock{bottom:calc(60px + env(safe-area-inset-bottom))!important'));
  assert.ok(css.includes('.toast{bottom:calc(72px + env(safe-area-inset-bottom))}'));
  assert.ok(css.includes('@media(max-width:760px){.mobile-nav{height:calc(60px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}}'));
});

test('desktop navigation is centred in the available lane between search and notifications', async () => {
  const css = await read('public/styles.css');
  const html = await read('public/index.html');
  const desktopLayout = css.slice(css.lastIndexOf('/* Desktop header: reserve the true middle lane'));
  assert.match(desktopLayout, /\.topbar\{\s*display:flex!important/);
  assert.match(desktopLayout, /\.top-left\{\s*flex:0 1 410px/);
  assert.match(desktopLayout, /\.search-box\{\s*flex:1 1 180px/);
  assert.match(desktopLayout, /\.top-nav\{\s*flex:1 1 0/);
  assert.match(desktopLayout, /justify-content:safe center/);
  assert.match(desktopLayout, /overflow-x:auto/);
  assert.match(desktopLayout, /\.top-nav \.nav-item\{\s*flex:1 1 72px/);
  assert.match(desktopLayout, /min-width:52px/);
  assert.match(desktopLayout, /\.top-actions\{\s*flex:0 0 auto/);
  assert.ok(html.indexOf('id="search-form"') < html.indexOf('class="top-nav"'));
  assert.ok(html.indexOf('class="top-nav"') < html.indexOf('id="notifications-btn"'));
});

test('Settings is flattened without decorative category rails or nested card layers', async () => {
  const css = await read('public/styles.css');
  const settings = await read('public/settings.js');
  const flat = css.slice(css.lastIndexOf('/* Flat Settings presentation'));
  assert.match(flat, /\.settings-nav\{display:none!important/);
  assert.match(flat, /\.settings-card\{[\s\S]*?border:0!important/);
  assert.match(flat, /\.settings-card\{[\s\S]*?background:transparent!important/);
  assert.match(flat, /\.settings-section-title\{[\s\S]*?display:block!important/);
  assert.match(flat, /\.settings-save-bar\{[\s\S]*?position:static!important/);
  assert.match(flat, /body:has\(#settings-form\) #message-window-dock\{[\s\S]*?position:static!important/);
  assert.doesNotMatch(settings, /class="settings-layout"|class="settings-nav"|class="settings-icon"|settings-icon/);
  assert.doesNotMatch(settings, /sectionHeading\('[^']*',/);
  assert.match(settings, /function sectionHeading\(title\)/);
  assert.match(settings, /<form id="settings-form"/);
  assert.match(settings, /id="settings-security"/);
  assert.match(settings, /id="settings-help"/);
});
 
test('dialogs can scroll on short screens instead of being cut off', async () => {
  const css = await read('public/styles.css');
  assert.ok(ruleFor(css, '.modal-backdrop').includes('overflow-y:auto'));
  assert.ok(ruleFor(css, '.modal').includes('100dvh'));
});

test('the responsive stylesheet and service-worker shell are versioned together', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  assert.ok(html.includes('styles.css?v=20261101-marketplace-core-1'));
  assert.ok(worker.includes('minglora-shell-v37-profile-expansion'));
  assert.ok(worker.includes('styles.css?v=20261101-marketplace-core-1'));
});


test('login and account creation have separate full-size responsive entry panels', async () => {
  const html = await read('public/index.html');
  const css = await read('public/styles.css');
  const authScript = await read('public/auth-screen.js');
  assert.ok(html.includes('id="login-panel" class="auth-card auth-login-card"'));
  assert.ok(html.includes('id="register-panel" class="auth-card auth-register-card hidden"'));
  assert.ok(html.includes('id="show-register" data-auth-mode="register"'));
  assert.ok(html.includes('id="show-login" data-auth-mode="login"'));
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) 432px'));
  assert.ok(css.includes('@media(max-width:900px)'));
  assert.ok(authScript.includes('new MutationObserver'));
  assert.ok(authScript.includes('[data-auth-mode]'));
});
