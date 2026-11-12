import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const compact = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const forYouStylesheet = fs.readFileSync(path.join(root, 'public/for-you-tiktok.css'), 'utf8');

test('LIVE compact presentation is scoped to the active room and loaded after existing layout styles', () => {
  assert.match(compact, /body:has\(#live-player-shell\)/);
  assert.ok(index.includes('/live-tiktok-compact.css?v=20261111-live-tiktok-compact-1'));
  assert.ok(worker.includes("SHELL.push('/live-tiktok-compact.css?v=20261111-live-tiktok-compact-1')"));
});

test('Phones and portrait tablets use one immersive stage with overlays, not stacked video and chat rows', () => {
  assert.match(compact, /@media\(max-width:900px\)/);
  assert.match(compact, /\.live-player-layout\{[\s\S]*?inset:0!important[\s\S]*?display:block!important/);
  assert.match(compact, /\.live-video-column\{[\s\S]*?position:absolute!important;inset:0!important/);
  assert.match(compact, /\.live-fullscreen-chat-slot\{[\s\S]*?position:absolute!important;inset:auto 72px/);
  assert.match(compact, /\.live-player-controls\.live-icon-controls\{[\s\S]*?overflow-x:auto!important/);
  assert.match(compact, /env\(safe-area-inset-bottom/);
});

test('For You video menu offers positive and negative recommendation feedback', () => {
  assert.match(app, /data-fyp-feedback-menu/);
  assert.match(app, /data-fyp-interested/);
  assert.match(app, /data-fyp-not-interested/);
  assert.match(forYouStylesheet, /fyp-feedback-menu/);
  assert.ok(index.includes('/for-you-tiktok.css?v=20261111-tiktok-video-layout-2'));
  assert.ok(worker.includes('/for-you-tiktok.css?v=20261111-tiktok-video-layout-2'));
  assert.match(app, /action:'interested'/);
});

test('Desktop keeps chat integrated beside the stage and uses one compact horizontal control dock', () => {
  assert.match(compact, /grid-template-columns:minmax\(0,1fr\) clamp\(270px,25vw,340px\)/);
  assert.match(compact, /grid-template-rows:minmax\(0,1fr\) 54px/);
  assert.match(compact, /\.live-player-controls\.live-icon-controls\{[\s\S]*?display:flex!important[\s\S]*?flex-wrap:nowrap!important/);
  assert.match(compact, /\.live-fullscreen-chat-slot\{[\s\S]*?width:100%!important;height:100%!important/);
});

test('All existing LIVE actions, chat, guest management and role-specific behavior remain mounted', () => {
  for (const id of [
    'live-mic-toggle','live-camera-toggle','live-camera-flip','live-screen-share-toggle',
    'live-guests-toggle','live-audio-toggle','live-chat-toggle','live-gifts-toggle',
    'live-cohost-toggle','live-share-toggle','live-fullscreen-toggle','live-leave',
    'live-fullscreen-chat-slot','live-chat-overlay','live-tools-backdrop'
  ]) assert.ok(app.includes(id), 'missing established LIVE control or panel: ' + id);
  assert.match(app, /function openLiveRoom\(session,role,issuedLiveKit\)/);
  assert.match(app, /new client\.Room\(roomOptions\)/);
  assert.match(app, /topic:"minglora-live-layout"/);
});

test('The established nine layout IDs are not replaced by responsive presentation rules', () => {
  for (const layout of [
    'full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel',
    'side-by-side','spotlight','roundtable-1','roundtable-2'
  ]) assert.ok(app.includes("value:'" + layout + "'"), 'missing saved layout ID: ' + layout);
  assert.match(compact, /#live-guest-layout\.live-guest-layout/);
});

test('Compact tools remain usable as a bottom sheet on touch devices and respect reduced motion', () => {
  assert.match(compact, /align-items:flex-end!important/);
  assert.match(compact, /max-height:min\(82dvh,760px\)/);
  assert.match(compact, /@media\(hover:none\) and \(pointer:coarse\)/);
  assert.match(compact, /@media\(prefers-reduced-motion:reduce\)/);
});

test('Audio-only LIVE keeps its original speaker grid instead of becoming a flattened video block', () => {
  assert.match(compact, /#live-video-stage\.live-audio-stage\{[\s\S]*?display:grid!important/);
  assert.match(compact, /grid-template-rows:minmax\(36px,auto\) minmax\(0,1fr\) minmax\(32px,auto\)/);
  assert.match(compact, /#live-video-stage\.live-audio-stage #live-speaker-list/);
});

test('Mobile audio-only LIVE reserves space above the bottom control dock', () => {
  assert.match(compact, /\.live-video-column #live-video-stage\.live-audio-stage\{[\s\S]*?inset:0 0 60px/);
});
