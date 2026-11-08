import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('the overlay contract loads after mobile styles and is included in the service worker cache', async () => {
  const [html, sw] = await Promise.all([read('public/index.html'), read('public/sw.js')]);
  const mobileLink = html.indexOf('mobile-layout.css?v=20261108-mobile-overlay-panels-1');
  const safetyLink = html.indexOf('/layout-safety.css?v=20261108-facebook-overlay-principles-1');
  const liveLink = html.indexOf('live-room-compact.css?v=20261107-live-layout-1');
  const phoneLink = html.indexOf('phone-experience.css?v=20261108-phone-overlay-panels-1');
  const appLockLink = html.indexOf('app-lock.css?v=20261107-app-lock-1');
  assert.ok(mobileLink >= 0 && safetyLink > mobileLink && liveLink > safetyLink);
  assert.ok(phoneLink > appLockLink && appLockLink >= 0);
  for (const asset of [
    'layout-safety.css?v=20261108-facebook-overlay-principles-1',
    'phone-experience.css?v=20261108-phone-overlay-panels-1',
    'meetwave.css?v=20261108-meetwave-dialog-overlays-1'
  ]) assert.ok(sw.includes("'" + asset + "'"), 'service worker caches ' + asset);
  assert.match(sw, /CACHE_NAME='minglora-shell-v\\d+-self-updating-1'/);
});

test('open menus, chat panels, drawers and dialogs are never forced into normal page flow', async () => {
  const css = await read('public/layout-safety.css');
  assert.doesNotMatch(css, /position\\s*:\\s*static\\s*!important/i);
  for (const selector of [
    '#message-window-dock', '.messenger-panel', '.palette-switcher-panel',
    '.modal-backdrop', '.mw-modal-backdrop', '.live-tools-backdrop'
  ]) assert.ok(css.includes(selector), 'overlay rules include ' + selector);
  assert.ok(css.includes('position:fixed!important'));
  assert.ok(css.includes('position:fixed!important'));
});

test('Messenger chat windows and popovers stay anchored and scroll inside their own panel', async () => {
  const css = await read('public/layout-safety.css');
  assert.ok(css.includes('#message-window-dock,\nbody:has(#settings-form) #message-window-dock'));
  assert.ok(css.includes('bottom:0!important'));
  assert.ok(css.includes('.messenger-panel{\n  position:fixed!important'));
  assert.ok(css.includes('overflow-y:auto!important'));
  assert.ok(css.includes('.profile-account-menu.is-top-layer'));
});

test('dialogs remain centered, fixed to the viewport and internally scrollable', async () => {
  const [css, phone, mobile, meetwave] = await Promise.all([
    read('public/layout-safety.css'), read('public/phone-experience.css'),
    read('public/mobile-layout.css'), read('public/meetwave.css')
  ]);
  assert.ok(css.includes('.modal-backdrop,.about-section-editor-backdrop,.story-viewer-backdrop,'));
  assert.ok(css.includes('position:fixed!important'));
  assert.ok(css.includes('max-height:calc(100dvh - env(safe-area-inset-top)'));
  assert.ok(css.includes('overflow-y:auto!important'));
  assert.ok(phone.includes('body:not(:has(#live-player-shell)) .modal{'));
  assert.ok(phone.includes('overflow-y:auto!important'));
  assert.ok(!mobile.includes('.modal-backdrop{align-items:stretch'));
  assert.ok(meetwave.includes('.mw-modal-backdrop{position:fixed'));
  assert.ok(meetwave.includes('max-height:calc(100dvh - 28px)'));
});

test('LIVE tools open in an anchored side drawer or mobile bottom sheet', async () => {
  const css = await read('public/layout-safety.css');
  assert.ok(css.includes('.live-tools-backdrop{\n  position:fixed!important'));
  assert.ok(css.includes('.live-tools-drawer{\n  position:relative!important'));
  assert.ok(css.includes('overflow-y:auto!important'));
  assert.ok(css.includes('align-items:flex-end!important'));
});

test('hidden panels remain hidden and inactive toasts reserve no document space', async () => {
  const css = await read('public/layout-safety.css');
  assert.ok(css.includes('.hidden,[hidden]'));
  assert.ok(css.includes('.modal-backdrop.hidden'));
  assert.ok(css.includes('.messenger-panel.hidden'));
  assert.ok(css.includes('.toast:not(.show){display:none!important}'));
  assert.ok(css.includes('.toast.show{pointer-events:auto!important}'));
});

test('long names and profile statistics wrap without widening the viewport', async () => {
  const css = await read('public/layout-safety.css');
  assert.ok(css.includes('overflow-wrap:anywhere!important'));
  assert.ok(css.includes('white-space:normal!important'));
  assert.ok(css.includes('.profile-counts'));
});
