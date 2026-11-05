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


test('Full Screen uses a bounded host stage and a dedicated right-side Chat/Tools panel', () => {
  assert.match(app, /classList\.toggle\('live-full-screen-active',hostOnly\)/);
  assert.ok(app.includes("id='live-fullscreen-chat-tab'")&&app.includes("id='live-fullscreen-tools-tab'"), 'right sidebar must expose Chat and Tools');
  assert.ok(app.includes("id='live-fullscreen-chat-slot'"), 'sidebar must remain separate from the host video column');
  assert.match(styles, /\.live-player-shell\.live-full-screen-active\{[\s\S]*?position:fixed!important[\s\S]*?width:100vw!important[\s\S]*?height:100dvh!important/);
  assert.match(styles, /\.live-full-screen-active \.live-video-column\{[\s\S]*?grid-template-rows:42px minmax\(0,1fr\) auto/);
  assert.match(styles, /width:min\(100%,38\.25dvh,520px\)!important;height:auto!important;aspect-ratio:9 \/ 16!important/);
  assert.match(styles, /max-height:min\(68dvh,720px\)!important/);
  assert.match(styles, /@media\(min-width:760px\)/);
  assert.match(styles, /\.live-full-screen-active #live-fullscreen-chat-slot\{[\s\S]*?display:flex!important/);
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) minmax\(280px,clamp\(300px,30vw,390px\)\)!important/);
  assert.match(styles, /grid-template-columns:repeat\(auto-fit,minmax\(56px,1fr\)\)!important[\s\S]*?overflow-x:hidden!important/);
});

test('Full Screen starts on video for phones and keeps Chat on the right for tablet-width screens', () => {
  assert.match(app, /setLiveFullscreenPanel\(wideLayout\?'chat':'video'\)/);
  assert.match(app, /const wideLandscape=Boolean\(window\.matchMedia\?\.\('\(min-width:760px\)'\)\.matches\)/);
  assert.match(app, /function toggleLiveChatView\(\)[\s\S]*?setLiveFullscreenPanel\('video'\)/);
  assert.match(styles, /@media\(max-width:759px\)\{/);
  assert.match(styles, /\.live-full-screen-active\.live-full-screen-chat-open #live-fullscreen-chat-slot,[\s\S]*?\.live-full-screen-tools-open #live-fullscreen-chat-slot\{[\s\S]*?display:flex!important/);
  assert.match(styles, /\.live-full-screen-active\.live-full-screen-chat-open \.live-video-column>\.live-video-stage,[\s\S]*?\.live-full-screen-tools-open \.live-video-column>\.live-video-stage/);
  assert.match(styles, /\.live-full-screen-active\.live-full-screen-tools-open #live-chat-overlay,[\s\S]*?display:none!important/);
});

test('Full Screen Settings & tools stays inside the sidebar and never covers the video', () => {
  assert.match(app, /moveLiveToolsToFullscreenSidebar\(\)/);
  assert.match(app, /setLiveFullscreenPanel\('tools'\)/);
  assert.match(app, /closeLiveToolsPanel\(\{returnTo:'chat'\}\)/);
  assert.match(styles, /\.live-full-screen-active \.live-tools-backdrop:not\(\.hidden\)\{[\s\S]*?position:static!important[\s\S]*?background:transparent!important/);
  assert.match(styles, /\.live-full-screen-active \.live-tools-drawer\{[\s\S]*?width:100%!important[\s\S]*?box-shadow:none!important/);
  assert.match(styles, /\.live-full-screen-active \.live-tools-content\{[\s\S]*?overflow-y:auto!important/);
});

test('Full Screen layout picker uses a dedicated expand-to-fullscreen icon', () => {
  assert.match(app, /value:'full-screen',label:'Full Screen',icon:'fullscreen'/);
  assert.ok(app.includes(`fullscreen:"<path d='M8 3H5a2 2 0 0 0-2 2v3`));
  assert.ok(styles.includes('.live-layout-option[data-live-screen-layout="full-screen"] svg{'));
  assert.match(app, /LIVE_SCREEN_LAYOUT_OPTIONS\.map\(option=>[\s\S]*?liveLayoutIcon\(option\.icon\)/);
});

test('Full Screen keeps the video moderate and Settings & tools inside the right panel', () => {
  assert.match(styles, /width:min\(100%,38\.25dvh,520px\)!important;height:auto!important;aspect-ratio:9 \/ 16!important/);
  assert.match(styles, /max-height:min\(68dvh,720px\)!important/);
  assert.match(styles, /\.live-full-screen-active \.live-tools-backdrop:not\(\.hidden\)\{[\s\S]*?position:static!important[\s\S]*?background:transparent!important/);
  assert.match(styles, /\.live-full-screen-active \.live-fullscreen-side-head/);
  assert.match(styles, /\.live-full-screen-active \.live-tools-drawer\{[\s\S]*?width:100%!important[\s\S]*?box-shadow:none!important/);
  assert.match(app, /moveLiveToolsToFullscreenSidebar\(\)/);
  assert.match(app, /setLiveFullscreenPanel\('tools'\)/);
  assert.match(app, /closeLiveToolsPanel\(\{returnTo:'chat'\}\)/);
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

test('Full Screen host video fits the available stage row and compact controls never need internal scrolling', () => {
  const fitRules = styles.slice(styles.lastIndexOf('/* Full Screen viewport-fit hardening.'));
  assert.ok(fitRules.includes('max-height:min(68dvh,100%)!important'), 'host video must stay within the available stage row');
  assert.ok(fitRules.includes('@media(max-width:759px)'), 'missing phone and tablet control sizing');
  assert.ok(fitRules.includes('grid-template-columns:repeat(6,minmax(0,1fr))!important'), 'standard phones need a six-column two-row dock');
  assert.ok(fitRules.includes('@media(max-width:359px)'), 'missing narrow-phone layout');
  assert.ok(fitRules.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important'), 'narrow phones need five columns so every action stays within two rows');
  assert.ok(fitRules.includes('overflow:visible!important'), 'mobile controls must not introduce an internal scroll area');
  assert.ok(fitRules.includes('@media(max-height:520px) and (orientation:landscape)'), 'missing short-landscape sizing');
  assert.ok(fitRules.includes('grid-auto-rows:37px!important'), 'short-landscape controls must use compact rows');
  assert.ok(fitRules.includes('max-height:83px!important'), 'short-landscape dock must fit without clipping');
});
