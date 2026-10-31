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

const useIcon = id => `<use href="/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-1#${id}"></use>`;

test('desktop navigation keeps its existing destinations and uses 3D icons', () => {
  const nav = html.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.ok(nav, 'desktop navigation exists');

  for (const [view, icon, label] of [
    ['feed', 'home', 'Home'],
    ['live', 'live', 'LIVE'],
    ['creator', 'creator', 'Studio'],
    ['friends', 'friends', 'Friends'],
    ['messages', 'messages', 'Messages'],
    ['coins', 'coins', 'Coins']
  ]) {
    assert.match(nav, new RegExp(`data-view="${view}"`));
    assert.ok(nav.includes(useIcon(icon)), `${label} has its matching dimensional icon`);
    assert.ok(nav.includes(`<small>${label}</small>`), `${label} label remains visible`);
  }
});

test('mobile navigation uses the same 3D icon artwork and keeps all six destinations', () => {
  const nav = html.match(/<div class="mobile-nav"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(nav, 'mobile navigation exists');

  for (const [view, icon] of [
    ['feed', 'home'],
    ['live', 'live'],
    ['creator', 'creator'],
    ['friends', 'friends'],
    ['messages', 'messages'],
    ['coins', 'coins']
  ]) {
    assert.match(nav, new RegExp(`data-view="${view}"`));
    assert.ok(nav.includes(useIcon(icon)), `${view} uses the shared 3D artwork`);
  }
});

test('utility rail and header actions use the matching rendered icon assets', () => {
  for (const icon of ['live', 'coins', 'creator', 'friends', 'groups', 'pages', 'messages', 'saved', 'activity', 'settings']) {
    assert.ok(html.includes(useIcon(icon)), `utility icon ${icon} is wired into the interface`);
  }
  assert.ok(html.includes('id="notifications-btn"') && html.includes(useIcon('activity')));
  assert.ok(html.includes('id="settings-btn"') && html.includes(useIcon('settings')));
  assert.ok(html.includes('nav-search-icon') && html.includes(useIcon('search')));
});

test('the SVG sprite contains finished dimensional artwork for primary and supporting actions', () => {
  for (const id of ['home', 'explore', 'create', 'live', 'friends', 'messages', 'coins', 'creator', 'groups', 'pages', 'saved', 'activity', 'settings', 'search', 'profile', 'microphone', 'palette']) {
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

test('service-worker shell pre-caches the new icon sprite and refreshed stylesheet', () => {
  assert.match(serviceWorker, /minglora-shell-v24-creator-stage-sticky-fallback/);
  assert.match(serviceWorker, /styles\.css\?v=20261031-audio-speaker-connection-5/);
  assert.match(serviceWorker, /\/assets\/icons\/navigation-3d\.svg/);
});
