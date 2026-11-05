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


test('Full Screen fills the viewport and adapts to phones, tablets, laptops and desktop screens', () => {
  assert.match(app, /live-player-shell[^\n]*live-full-screen-active|classList\.toggle\('live-full-screen-active',hostOnly\)/);
  assert.ok(app.includes("id='live-fullscreen-chat-slot'"), 'wide-screen chat must have its own destination outside the host video');
  assert.ok(app.includes(`liveControls+"</div></div><aside id='live-fullscreen-chat-slot'`), 'desktop chat must be a sibling of the video column, not a child that shrinks the host stage');
  assert.ok(app.includes('liveControlButton("live-chat-toggle","message","Open LIVE chat","Chat")'), 'small screens need an explicit Chat control');
  assert.match(app, /live-chat-toggle[\s\S]*?openLiveToolsPanel\("#live-chat-panel"\)/);
  assert.match(styles, /\.live-player-shell\.live-full-screen-active\{[\s\S]*?position:fixed!important[\s\S]*?width:100vw!important[\s\S]*?height:100dvh!important/);
  assert.match(styles, /\.live-full-screen-active \.live-video-column\{[\s\S]*?grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(styles, /\.live-full-screen-active \.live-video-column>\.live-video-stage:not\(\.live-audio-stage\)\{[\s\S]*?height:100%[\s\S]*?max-height:none!important[\s\S]*?aspect-ratio:auto!important/);
  assert.match(styles, /object-fit:contain!important/);
  assert.match(styles, /@media\(min-width:1024px\) and \(orientation:landscape\)/);
  assert.match(styles, /\.live-full-screen-active \.live-fullscreen-chat-slot\{[\s\S]*?display:flex!important/);
  assert.match(styles, /\.live-full-screen-active #live-chat-overlay,[\s\S]*?display:none!important/);
  assert.match(styles, /\.live-full-screen-active \.live-player-controls\{[\s\S]*?overflow-x:auto!important/);
});

test('Full Screen moves chat out of the host video and restores it according to the selected layout', () => {
  assert.match(app, /function restoreLiveChatToStage\(\)[\s\S]*?const slot=\$\('#live-fullscreen-chat-slot'\)/);
  assert.match(app, /activeLiveScreenLayout==='full-screen'&&slot\?slot:stage/);
  assert.match(app, /const chat=\$\('#live-chat-overlay'\)\|\|\$\('#live-chat-disabled-note'\)/);
  assert.match(app, /if\(name==='chat'\)[\s\S]*?body\.append\(chat\)/);
});


test('Full Screen layout picker uses a dedicated expand-to-fullscreen icon', () => {
  assert.match(app, /value:'full-screen',label:'Full Screen',icon:'fullscreen'/);
  assert.ok(app.includes(`fullscreen:"<path d='M8 3H5a2 2 0 0 0-2 2v3`));
  assert.ok(styles.includes('.live-layout-option[data-live-screen-layout="full-screen"] svg{'));
  assert.match(app, /LIVE_SCREEN_LAYOUT_OPTIONS\.map\(option=>[\s\S]*?liveLayoutIcon\(option\.icon\)/);
});
