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
  assert.ok(server.includes("liveLayout: 'full-screen'"), 'new sessions must start in host-only Full Screen');
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


test('Full Screen is a host-only layout with no visible guest seats or guest speaker roster', () => {
  assert.match(app, /const hostOnly=activeLiveScreenLayout==='full-screen'/);
  assert.match(app, /Host-only full-screen LIVE stage/);
  assert.ok(app.includes("root.closest('.live-audio-stage')?.classList.toggle('live-host-only-layout',hostOnly)"), 'layout changes must turn host-only audio mode on and off');
  assert.ok(styles.includes('#live-guest-layout[data-live-layout="full-screen"]{'), 'missing full-width host stage rules');
  assert.ok(styles.includes('#live-guest-layout[data-live-layout="full-screen"]>.live-guest-seat:not(.is-host){'), 'guest and empty seats must be hidden in Full Screen');
  assert.ok(styles.includes('.live-audio-stage.live-host-only-layout #live-speaker-list'), 'audio-only speaker roster must be hidden');
});


test('Full Screen occupies the complete viewport and keeps one uninterrupted host feed', () => {
  assert.match(app, /icon:'fullscreen'/);
  assert.match(app, /function syncLiveFullscreenComposition\(hostOnly\)/);
  assert.match(app, /shell\.requestFullscreen\(\{navigationUI:'hide'\}\)/);
  assert.match(app, /Host only · no guest tiles/);
  assert.match(app, /fullscreen:"<rect x='3' y='3' width='18' height='18'/);
  assert.match(styles, /\.live-player-shell\.live-full-screen-mode\{[\s\S]*?position:fixed!important[\s\S]*?width:100vw!important[\s\S]*?height:100dvh!important/);
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>\.live-guest-seat:not\(\.is-host\)\{display:none!important\}/);
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>\.live-guest-seat\.is-host\{[\s\S]*?inset:0!important[\s\S]*?width:100%!important[\s\S]*?height:100%!important/);
});
