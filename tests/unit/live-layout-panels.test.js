import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

test('LIVE has nine host-selectable screen layouts with a safe default', () => {
  assert.ok(app.includes('const LIVE_SCREEN_LAYOUT_OPTIONS=Object.freeze'), 'missing layout preset registry');
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']) {
    assert.ok(app.includes("value:'" + layout + "'"), 'missing ' + layout + ' layout');
    assert.ok(styles.includes('data-live-layout="' + layout + '"'), 'missing responsive layout rules for ' + layout);
  }
  assert.ok(app.includes('normalizeLiveScreenLayout(session.liveLayout)'), 'session must restore the saved host layout');
  assert.ok(server.includes("liveLayout: 'full-screen'"), 'new sessions must start in Full Screen with guest seats visible');
  assert.ok(app.includes("let activeLiveScreenLayout='full-screen'"), 'client must default to Full Screen');
  assert.ok(app.includes("String(value||'full-screen')"), 'missing saved layout must fall back to Full Screen');
});

test('Only the signed-in LIVE host can persist a valid layout choice', () => {
  assert.match(server, /const LIVE_SCREEN_LAYOUTS=/);
  assert.match(server, /const liveLayoutMatch = p\.match/);
  assert.match(server, /session\.hostId !== user\.id/);
  assert.match(server, /Only the LIVE host can change the screen layout/);
  assert.match(server, /session\.liveLayout = layout/);
  assert.ok(app.includes('/layout",{method:"PATCH"'), 'client must persist layout before broadcasting it');
});

test('The host layout selection is synchronized to viewers and guests via host-authenticated room data', () => {
  assert.match(app, /topic:"minglora-live-layout"/);
  assert.match(app, /type:"minglora\.live\.layout"/);
  assert.match(app, /participant\.identity===session\.hostId/);
  assert.match(app, /applyLiveScreenLayout\(nextLayout\)/);
});

test('Host panels switch without removing the chat, guest tools, gifts or moderator tools', () => {
  for (const panel of ['layouts', 'guests', 'viewers', 'chat', 'gifts', 'rewards', 'moderators', 'appearance']) {
    assert.ok(app.includes("data-live-tools-panel='" + panel + "'"), 'missing ' + panel + ' panel');
  }
  assert.match(app, /function renderLiveViewerPanel\(/);
  assert.match(app, /room\.remoteParticipants/);
  assert.match(app, /live-chat-panel-body/);
  assert.match(app, /restoreLiveChatToStage/);
  assert.match(app, /data-live-tools-panel-target/);
  assert.match(styles, /\.live-viewer-roster/);
  assert.match(styles, /\.live-chat-panel-body/);
  assert.match(styles, /\.live-tools-content \[data-live-tools-panel\]\[hidden\]/);
});


test('Full Screen keeps the host and visible guest and empty-seat windows', () => {
  assert.match(app, /root\.setAttribute\('aria-label','LIVE host and guest seats'\)/);
  assert.match(app, /classList\.toggle\('live-full-screen-layout',activeLiveScreenLayout==='full-screen'\)/);
  assert.ok(styles.includes('#live-guest-layout[data-live-layout="full-screen"]{'), 'missing Full Screen guest layout rules');
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>.live-guest-seat:not\(\.is-host\)\{display:flex!important/);
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>.live-guest-seat\.is-host\{[\s\S]*?grid-row:2/);
  assert.doesNotMatch(styles, /live-audio-stage\.live-host-only-layout/);
});


test('Every Full Screen LIVE control icon has its expected working event handler', () => {
  for (const id of ['live-mic-toggle','live-camera-toggle','live-camera-flip','live-screen-share-toggle','live-guests-toggle','live-audio-toggle','live-chat-toggle','live-gifts-toggle','live-settings-toggle','live-share-toggle','live-leave']) {
    assert.ok(app.includes('liveControlButton("'+id+'"'), 'missing control '+id);
  }
  for (const handler of ['micControl?.addEventListener("click"','cameraControl?.addEventListener("click"','flipCameraControl?.addEventListener("click"','screenShareControl?.addEventListener("click"','roomAudioControl?.addEventListener("click"','$("#live-chat-toggle")?.addEventListener','$("#live-guests-toggle")?.addEventListener','$("#live-gifts-toggle")?.addEventListener','$("#live-settings-toggle")?.addEventListener','$("#live-share-toggle")?.addEventListener','$("#live-leave")?.addEventListener']) {
    assert.ok(app.includes(handler), 'missing working control handler: '+handler);
  }
  assert.match(app, /typeof navigator\.mediaDevices\?\.getDisplayMedia!=="function"/);
});;

test('Full Screen keeps the compact centered host stage and visible guest seats', () => {
  assert.match(app, /value:'full-screen',label:'Full Screen',icon:'featured'/);
  assert.match(app, /classList\.toggle\('live-full-screen-layout',activeLiveScreenLayout==='full-screen'\)/);
  assert.doesNotMatch(app, /classList\.toggle\('live-full-screen-active',hostOnly\)/);
  assert.match(styles, /\.live-video-stage\.live-full-screen-layout:not\(\.live-audio-stage\)\{/);
  assert.match(styles, /width:min\(100%,62\.4dvh,608px\)/);
  assert.match(styles, /max-height:min\(78dvh,760px\)/);
  assert.match(styles, /aspect-ratio:4 \/ 5/);
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>.live-guest-seat\.is-host\{[\s\S]*?width:100%[\s\S]*?height:100%/);
});
