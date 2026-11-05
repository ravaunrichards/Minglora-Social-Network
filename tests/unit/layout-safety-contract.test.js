import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('the final layout stylesheet loads after every feature stylesheet', async () => {
  const [html, sw, safety] = await Promise.all([
    read('public/index.html'), read('public/sw.js'), read('public/layout-safety.css')
  ]);
  const mobileLink = html.indexOf('mobile-layout.css?v=20261105-flow-navigation-1');
  const safetyLink = html.indexOf('layout-safety.css?v=20261105-page-flow-contract-1');
  const lastFeatureLink = html.indexOf('gifter-badge-3d.css?v=20261105-gifter-badge-3d-1');
  assert.ok(lastFeatureLink >= 0 && mobileLink > lastFeatureLink && safetyLink > mobileLink);
  assert.ok(sw.includes("layout-safety.css?v=20261105-page-flow-contract-1"));
  assert.ok(sw.includes("minglora-shell-v93-flow-layout-safety-1"));
  assert.doesNotMatch(safety, /position\s*:\s*(?:fixed|sticky)/i);
});

test('shared navigation and workspace bars stay in normal page flow', async () => {
  const css = await read('public/layout-safety.css');
  for (const selector of ['.topbar', '.left-rail,.right-rail', '.settings-nav,.settings-save-bar',
    '.creator-studio-nav', '.profile-tabs,.recharge-checkout-card,.mobile-nav']) {
    assert.ok(css.includes(selector), 'flow contract includes ' + selector);
  }
  assert.match(css, /position:static!important/);
  assert.match(css, /max-height:none!important/);
});

test('dialogs, floating panels, menus, message windows and LIVE tools expand in page flow', async () => {
  const css = await read('public/layout-safety.css');
  for (const selector of ['#message-window-dock', '.messenger-panel', '.call-overlay',
    '.palette-switcher-panel', '.profile-overflow-menu', '.mobile-more-menu',
    '.modal-backdrop', '.mw-modal-backdrop', '.live-tools-backdrop']) {
    assert.ok(css.includes(selector), 'flow contract includes ' + selector);
  }
  for (const selector of ['.message-scroll,.message-window,.message-window-scroll',
    '.messenger-panel-list', '.live-community-panel,.live-chat-list,.live-gift-grid']) {
    assert.ok(css.includes(selector), 'scroll region uses page flow: ' + selector);
  }
  assert.match(css, /overflow:visible!important/);
});

test('LIVE stage identity, controls and chat sit outside the video layer', async () => {
  const css = await read('public/layout-safety.css');
  assert.match(css, /\.live-video-stage>\.live-stage-topbar/);
  assert.match(css, /\.live-chat-overlay\{/);
  assert.match(css, /\.live-chat-overlay \.live-chat-list\{[\s\S]*?overflow:visible!important/);
  assert.doesNotMatch(css, /\.live-player-shell\.live-full-screen-active/);
});

test('long names and profile statistics wrap instead of disappearing at narrow widths', async () => {
  const css = await read('public/layout-safety.css');
  assert.match(css, /\.profile-counts\{[\s\S]*?overflow:visible!important/);
  assert.match(css, /overflow-wrap:anywhere!important/);
  assert.match(css, /white-space:normal!important/);
  assert.match(css, /@media\(max-width:760px\)/);
});
