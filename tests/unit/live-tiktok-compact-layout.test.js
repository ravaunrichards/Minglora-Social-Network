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

test('LIVE compact presentation is scoped to the active room and loaded after existing layout styles', () => {
  assert.match(compact, /body:has\(#live-player-shell\)/);
  const compactStylesheet = index.match(/href="(\/live-tiktok-compact\.css\?v=[^"]+)"/)?.[1] || "";
  assert.ok(compactStylesheet, "the compact LIVE stylesheet is linked by the page");
  assert.ok(worker.includes("SHELL.push('" + compactStylesheet + "')"), "the service worker precaches the exact current stylesheet URL");
});

test('Phones and portrait tablets use one immersive stage with overlays, not stacked video and chat rows', () => {
  assert.match(compact, /@media\(max-width:900px\)/);
  assert.match(compact, /\.live-player-layout\{[\s\S]*?inset:0!important[\s\S]*?display:block!important/);
  assert.match(compact, /\.live-video-column\{[\s\S]*?position:absolute!important;inset:0!important/);
  assert.match(compact, /\.live-fullscreen-chat-slot\{[\s\S]*?position:absolute!important;inset:auto 72px/);
  assert.match(compact, /\.live-player-controls\.live-icon-controls\{[\s\S]*?overflow-x:auto!important/);
  assert.match(compact, /env\(safe-area-inset-bottom/);
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

test('The nine supplied guest layout IDs use one selector and one live layout attribute', () => {
  const registry=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),[
    'full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel',
    'side-by-side','spotlight','roundtable-1','roundtable-2'
  ]);
  assert.equal((app.match(/id='live-layout-options'/g)||[]).length,1);
  assert.doesNotMatch(app,/live-guest-layout-options|data-live-guest-layout=/);
  assert.match(compact,/FINAL NINE GUEST LAYOUTS/);
  assert.match(compact,/data-live-layout="roundtable-1"/);
  assert.match(compact,/data-live-layout="roundtable-2"/);
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


test('LIVE multi-guest stage reserves its heading row instead of covering the host panel', () => {
  const correction=compact.slice(compact.lastIndexOf('/* LIVE stage-safe multi-guest geometry'));
  assert.match(correction, /#live-guest-layout>\.live-guest-layout-heading\{[\s\S]*?position:relative!important[\s\S]*?grid-row:1!important/);
  assert.match(correction, /data-live-layout="full-screen"\]\{\s*grid-template-rows:22px minmax\(0,1fr\)!important/);
  assert.match(correction, /data-live-layout="full-screen"\]>.live-guest-seat\.is-host\{\s*grid-column:1!important;grid-row:2!important/);
  assert.match(correction, /data-live-layout="fluid-panel"\]\{\s*grid-template-rows:22px minmax\(0,1fr\)!important/);
  assert.match(correction, /data-live-layout="fluid-grid"\]\{[\s\S]*?grid-template-rows:22px repeat\(2,minmax\(0,1fr\)\)!important/);
});

test('LIVE Fluid Panel guest seats are inset and size-clamped inside the video-stage border', () => {
  const correction=compact.slice(compact.lastIndexOf('/* LIVE stage-safe multi-guest geometry'));
  assert.match(correction, /data-live-layout="fluid-panel"\][\s\S]*?right:clamp\(8px,1vw,12px\)!important/);
  assert.match(correction, /width:clamp\(48px,15vw,120px\)!important;height:clamp\(44px,15vw,120px\)!important/);
  assert.match(correction, /max-width:none!important;max-height:none!important/);
  assert.match(correction, /nth-child\(3\)\{\s*bottom:clamp\(4px,1vw,8px\)!important/);
  assert.match(correction, /nth-child\(4\)\{\s*bottom:calc\(clamp\(4px,1vw,8px\)/);
  assert.match(correction, /@media\(min-width:901px\)\{[\s\S]*?\}\s*$/);
  assert.match(correction, /\{right:2px!important\}/);
  assert.match(correction, /nth-child\(3\)\{bottom:2px!important\}/);
  assert.match(correction, /nth-child\(4\)\{bottom:calc\(2px \+ clamp\(44px,15vw,120px\)/);
});
