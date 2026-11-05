import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../public/styles.css', import.meta.url), 'utf8');
const layoutContract = css.slice(css.lastIndexOf('/* Minglora accessibility/layout contract:'));

test('shared navigation and settings never stay pinned while scrolling', () => {
  for (const selector of ['.topbar', '.left-rail', '.right-rail', '.settings-nav',
    '.settings-save-bar', '.creator-studio-nav', '.profile-tabs', '.mobile-nav']) {
    assert.ok(layoutContract.includes(selector), 'layout contract includes ' + selector);
  }
  assert.match(layoutContract, /position:static!important/);
});

test('dialogs, chat panels, call controls and drawers do not cover page content', () => {
  for (const selector of ['#message-window-dock', '.call-overlay', '.messenger-panel',
    '.live-tools-backdrop', '.modal-backdrop', '.toast']) {
    assert.ok(layoutContract.includes(selector), 'layout contract includes ' + selector);
  }
  assert.match(layoutContract, /background:transparent!important/);
  assert.match(layoutContract, /overflow:visible!important/);
});

test('LIVE video controls and chat follow normal document flow instead of overlaying the stage', () => {
  assert.match(layoutContract, /\.live-stage-topbar,\.live-chat-overlay\{position:static!important/);
  assert.match(layoutContract, /\.live-video-stage\{display:flex!important;flex-direction:column!important/);
  assert.match(layoutContract, /\.live-chat-overlay \.live-chat-list\{max-height:none!important;overflow:visible!important/);
});

test('mobile navigation and MeetWave dialogs cannot cover page content', async () => {
  const mobile = await readFile(new URL('../../public/mobile-layout.css', import.meta.url), 'utf8');
  const meetwave = await readFile(new URL('../../public/meetwave.css', import.meta.url), 'utf8');
  assert.match(mobile, /\.mobile-nav\{position:static!important/);
  assert.doesNotMatch(mobile, /\.mobile-nav\{position:fixed/);
  assert.match(mobile, /body\{padding-bottom:0!important\}/);
  assert.match(meetwave, /\.mw-modal-backdrop\{position:static!important/);
  assert.match(meetwave, /\.mw-create-dialog\{[^}]*max-height:none!important;overflow:visible!important/);
});
