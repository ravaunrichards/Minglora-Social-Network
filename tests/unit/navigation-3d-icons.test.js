import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [html, css, sprite, serviceWorker] = await Promise.all([
  read('public/index.html'),
  read('public/styles.css'),
  read('public/assets/icons/navigation-3d.svg'),
  read('public/sw.js')
]);

const useIcon = id => `<use href="/assets/icons/navigation-3d.svg?v=${id==='recharge'?'20261104-recharge-wallet-3d-3':'20261102-navigation-3d-2'}#${id}"></use>`;

test('desktop navigation keeps its existing destinations and uses 3D icons', () => {
  const nav = html.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.ok(nav, 'desktop navigation exists');

  for (const [view, icon, label] of [
    ['feed', 'home', 'Home'],
    ['for-you', 'explore', 'For You'],
    ['live', 'live', 'LIVE'],
    ['meetwave', 'meetwave', 'MeetWave'],
  ]) {
    assert.match(nav, new RegExp(`data-view="${view}"`));
    assert.ok(nav.includes(useIcon(icon)), `${label} has its matching dimensional icon`);
    assert.ok(nav.includes(`<small>${label}</small>`), `${label} label remains visible`);
  }
  assert.match(nav,/data-view="leagues"/);
  assert.ok(nav.includes('<span>🏆</span><small>Leagues</small>'));
});

test('mobile navigation keeps five clear destinations and secondary features in the organised More page', () => {
  const navStart = html.indexOf('<div class="mobile-nav"');
  const navEnd = html.indexOf('</div>', navStart);
  const nav = html.slice(navStart, navEnd);
  assert.ok(navStart >= 0 && navEnd > navStart, 'mobile navigation exists');
  for (const [view, icon] of [
    ['feed', 'home'],
    ['for-you', 'explore'],
    ['live', 'live'],
    ['messages', 'messages'],
  ]) {
    assert.ok(nav.includes('data-view="' + view + '"'), view + ' is a primary destination');
    assert.ok(nav.includes(useIcon(icon)), view + ' uses the shared 3D artwork');
  }
  assert.ok(nav.includes('data-view="more"'), 'More is the fifth primary destination');
  assert.ok(nav.includes('id="mobile-more-nav"'), 'More is a proper navigation item');
  assert.ok(!html.includes('id="mobile-more-menu"'), 'the cramped floating More menu is removed');
  assert.ok(html.includes('/mobile-layout.css?v=20261104-mobile-navigation-1'));
});
test('utility rail and header actions use the matching rendered icon assets', () => {
  for (const icon of ['live', 'recharge', 'creator', 'friends', 'groups', 'pages', 'messages', 'saved', 'activity', 'settings']) {
    assert.ok(html.includes(useIcon(icon)), `utility icon ${icon} is wired into the interface`);
  }
  assert.ok(html.includes('id="notifications-btn"') && html.includes(useIcon('activity')));
  assert.ok(html.includes('id="settings-btn"') && html.includes(useIcon('settings')));
  assert.ok(html.includes('nav-search-icon') && html.includes(useIcon('search')));
});

test('the SVG sprite contains finished dimensional artwork for primary and supporting actions', () => {
  for (const id of ['home', 'explore', 'create', 'live', 'friends', 'messages', 'coins', 'creator', 'groups', 'pages', 'saved', 'activity', 'settings', 'search', 'profile', 'microphone', 'palette', 'share', 'photo', 'feeling', 'call', 'sound', 'privacy', 'request', 'archive', 'delivery', 'lock', 'block', 'external-link', 'more', 'close', 'restore', 'unlock', 'arrow-left', 'arrow-right']) {
    assert.match(sprite, new RegExp(`<symbol id="${id}" viewBox="0 0 64 64">`), `sprite contains ${id}`);
  }
  assert.match(sprite, /<linearGradient id="blue-front"/);
  assert.match(sprite, /<linearGradient id="silver-front"/);
  assert.match(sprite, /<linearGradient id="gold-front"/);
  assert.match(sprite, /<radialGradient id="lens"/);
  assert.doesNotMatch(sprite, /<text\b|<image\b/i, 'icon artwork is vector-rendered, not text glyphs or bitmap placeholders');
});

test('3D icon presentation uses depth, lighting and reduced-motion-safe transitions', () => {
  assert.match(css, /\.nav-3d-icon\s*\{/);
  assert.match(css, /drop-shadow\(/);
  assert.match(css, /linear-gradient\(/);
  assert.match(css, /\.nav-item\.active \.nav-3d-icon/);
  assert.match(css, /\.mobile-nav button \.nav-3d-icon/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('service-worker shell pre-caches the latest icon sprite and refreshed stylesheet', () => {
  assert.match(serviceWorker, /minglora-shell-v89-live-full-screen-default-2/);
  assert.match(serviceWorker, /styles\.css\?v=20261105-live-full-screen-default-2/);
  assert.match(serviceWorker, /\/assets\/icons\/navigation-3d\.svg/);
});
