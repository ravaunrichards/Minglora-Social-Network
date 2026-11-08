import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('normal page sections remain in document flow while transient panels float above them', async () => {
  const [styles,safety] = await Promise.all([read('public/styles.css'),read('public/layout-safety.css')]);
  assert.ok(styles.includes('.settings-save-bar{'));
  assert.ok(styles.includes('position:static!important'));
  assert.ok(safety.includes('.modal-backdrop,.about-section-editor-backdrop'));
  assert.ok(safety.includes('position:fixed!important'));
  assert.ok(safety.includes('.messenger-panel{\n  position:fixed!important'));
  assert.ok(safety.includes('.live-tools-backdrop{\n  position:fixed!important'));
  assert.doesNotMatch(safety,/position\\s*:\\s*static\\s*!important/i);
});

test('phone navigation stays accessible while Messenger and modal surfaces remain above the page', async () => {
  const [mobile,phone,safety,meetwave] = await Promise.all([
    read('public/mobile-layout.css'),read('public/phone-experience.css'),
    read('public/layout-safety.css'),read('public/meetwave.css')
  ]);
  assert.ok(mobile.includes('.mobile-nav{position:static!important'));
  assert.ok(phone.includes('.mobile-nav{'));
  assert.ok(phone.includes('position:fixed!important'));
  assert.ok(safety.includes('#message-window-dock'));
  assert.ok(safety.includes('bottom:calc(var(--minglora-phone-nav-height'));
  assert.ok(meetwave.includes('.mw-modal-backdrop{position:fixed'));
  assert.ok(meetwave.includes('overflow-y:auto'));
});

test('LIVE stage controls keep their dedicated video-stage placement and popups do not enter the page flow', async () => {
  const [styles,safety] = await Promise.all([read('public/styles.css'),read('public/layout-safety.css')]);
  assert.ok(styles.includes('.live-video-stage>.live-stage-topbar{'));
  assert.ok(styles.includes('position:absolute!important'));
  assert.ok(!safety.includes('.live-chat-overlay{'));
  assert.ok(!safety.includes('.live-stage-topbar,'));
});
