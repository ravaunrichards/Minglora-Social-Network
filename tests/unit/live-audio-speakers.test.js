import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');
const server = read('src/server.js');
const edge = read('supabase/functions/minglora-runtime-state/index.ts');
const fit = read('public/live-room-fit.css');
const guestLayouts = read('public/live-tiktok-compact.css');
const audioGuardrails = read('public/live-interface-guardrails.css');
const audioVisualMatrix = read('tests/e2e/layout-separation-visual.mjs');
const index = read('public/index.html');
const serviceWorker = read('public/sw.js');

test('Audio LIVE shows connected microphone publishers even when nobody is actively speaking', () => {
  assert.match(app, /function participantHasLiveAudio\(/);
  assert.match(app, /function renderLiveSpeakerRoster\(/);
  assert.match(app, /room\.remoteParticipants/);
  assert.match(app, /RoomEvent\.ParticipantConnected/);
  assert.match(app, /RoomEvent\.ParticipantDisconnected/);
  assert.match(app, /RoomEvent\.ActiveSpeakersChanged/);
  assert.match(app, /refreshSpeakerRoster\(\)/);
  assert.doesNotMatch(app, /list\.innerHTML=active\.length\?active\.map/);
});

test('Minglora confirms actual LiveKit presence before persisting a connected participant', () => {
  assert.match(server, /const liveConnectedMatch = p\.match/);
  assert.match(server, /listLiveKitParticipants\(session\.roomName\)/);
  assert.match(server, /requestSupabaseState\('live_participant_mark_connected'/);
  assert.match(server, /providerParticipants\.some\(participant => participant\.identity === user\.id\)/);
  assert.match(app, /\/live\/sessions\/\"\+encodeURIComponent\(session\.id\)\+\"\/connected/);
});

test('A pending hand-raise is preserved when a listener presence heartbeat is saved', () => {
  assert.match(edge, /if\(role===\"viewer\"&&existing\?\.role===\"guest\"&&existing\.status===\"requested\"\)/);
  assert.match(edge, /requestPending:true/);
  assert.match(edge, /live_participant_mark_connected/);
});

test('Speaker connection is not marked before the LiveKit client has joined', () => {
  const joinStart = server.indexOf("if (method === 'POST' && liveMatch)");
  const connectedStart = server.indexOf("if (method === 'POST' && liveConnectedMatch)");
  assert.ok(joinStart >= 0 && connectedStart > joinStart);
  const joinBlock = server.slice(joinStart, connectedStart);
  assert.doesNotMatch(joinBlock, /live_speaker_mark_connected/);
  assert.doesNotMatch(joinBlock, /db\.liveParticipants\.push/);
});

test('Connected viewers can create a speaker request without being mistaken for approved speakers', () => {
  const requestStart=edge.indexOf('if (action === "live_speaker_request")');
  const requestEnd=edge.indexOf('if (action === "live_speaker_requests_list")',requestStart);
  const requestBlock=edge.slice(requestStart,requestEnd);
  assert.match(requestBlock,/existing\?\.role==="guest"&&\["accepted","connected"\]\.includes\(existing\.status\)/);
  assert.match(requestBlock,/existing\?\.role==="guest"&&existing\.status==="requested"/);
  assert.match(requestBlock,/A connected listener may raise a hand/);
  assert.doesNotMatch(requestBlock,/if\(existing&&\["accepted","connected"\]\.includes\(existing\.status\)\)/);
});

test('The host appears in the speaker roster independently of active speech', () => {
  const rosterStart=app.indexOf('function renderLiveSpeakerRoster(');
  const rosterEnd=app.indexOf('async function openLiveRoom(',rosterStart);
  const roster=app.slice(rosterStart,rosterEnd);
  assert.match(roster,/role==="host"\|\|role==="guest"/);
  assert.match(roster,/You · Host/);
  assert.match(roster,/Microphone connected/);
  assert.match(roster,/person\.speaking/);
});

test('LIVE participant leave records an ended connection for viewers and speakers', () => {
  assert.match(server,/requestSupabaseState\('live_participant_mark_left'/);
  assert.match(edge,/if \(action === "live_participant_mark_left"\)/);
  assert.match(edge,/status:"left",left_at:new Date\(\)\.toISOString\(\)/);
  assert.match(edge,/\.in\("status",\["requested","invited","accepted","connected"\]\)/);
});

test('Audio LIVE roster appears before speech and reflects microphone publication and mute state', () => {
  assert.match(app,/refreshSpeakerRoster\(\);\s*try\{/);
  assert.match(app,/for\(let attempt=0;attempt<5&&!microphonePublished;attempt\+\+\)/);
  assert.match(app,/micControl\?\.addEventListener\("click",async\(\)=>\{/);
  assert.match(app,/await room\.localParticipant\.setMicrophoneEnabled\(nextEnabled,nextEnabled\?captureOptions:undefined\)/);
  assert.match(app,/updateLiveControlButton\(micControl,nextEnabled\?"mic":"mic-off"/);
  assert.match(app,/refreshSpeakerRoster\(\)/);
});

test('LIVE participant confirmation retries until the server verifies LiveKit presence', () => {
  assert.match(app,/async function syncLiveParticipantPresence\(session\)/);
  assert.match(app,/for\(let attempt=0;attempt<4;attempt\+\+\)/);
  assert.match(app,/liveParticipantSyncTimer=setInterval/);
  assert.match(app,/await syncLiveParticipantPresence\(session\)/);
  assert.match(app,/function stopLiveParticipantSync\(\)/);
});

test('Opening another LIVE room clears a previous participant-presence retry', () => {
  assert.match(app,/async function openLiveRoom\(session,role,issuedLiveKit\)\{\s*stopLiveChatRefresh\(\);stopLiveSpeakerRefresh\(\);stopLiveParticipantSync\(\);/);
});


test('Minglora LIVE presents compact accessible icon controls with working room actions', () => {
  assert.match(app, /function liveControlIcon\(/);
  assert.match(app, /class='live-player-controls live-icon-controls'/);
  assert.match(app, /Manage Multi-Guest seats/);
  assert.match(app, /Switch front\/back camera/);
  assert.match(app, /restartTrack\(\{facingMode:nextFacing\}\)/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /live-gifts-toggle/);
  assert.match(styles, /\.live-player-controls\.live-icon-controls/);
  assert.match(styles, /\.live-control-caption/);
  assert.doesNotMatch(app, /class='live-player-controls'><button id='live-mic-toggle'/);
});


test('Audio LIVE fixes bust cached app and stylesheet URLs in the page and service worker', () => {
  assert.ok(index.includes('/app.js?v=20261118-tiktok-ranking-frames-1'));
  assert.ok(index.includes('/live-room-fit.css?v=20261117-audio-only-nine-guest-layout-1'));
  assert.ok(index.includes('/live-tiktok-compact.css?v=20261118-audio-live-reference-priority-3'));
  assert.ok(serviceWorker.includes("'/app.js?v=20261118-tiktok-ranking-frames-1'"));
  assert.ok(serviceWorker.includes("'/live-room-fit.css?v=20261117-audio-only-nine-guest-layout-1'"));
  assert.ok(serviceWorker.includes("SHELL.push('/live-tiktok-compact.css?v=20261118-audio-live-reference-priority-3')"));
  assert.ok(index.includes('/live-interface-guardrails.css?v=20261117-audio-layout-no-overlap-2'));
  assert.ok(serviceWorker.includes("'/live-interface-guardrails.css?v=20261117-audio-layout-no-overlap-2'"));
  assert.doesNotMatch(fit,/data-live-guest-layout=/);
});

test('Audio LIVE uses all nine reference grids without covering seat panels', () => {
  const referenceStart=guestLayouts.indexOf('/* FINAL NINE GUEST LAYOUTS');
  const referenceEnd=guestLayouts.indexOf("/* Responsive fit scales tile proportions without changing a crop's row/column count.",referenceStart);
  const audioStart=guestLayouts.lastIndexOf('/* FINAL AUDIO LIVE REFERENCE PARITY');
  assert.ok(referenceStart>=0&&referenceEnd>referenceStart&&audioStart>referenceEnd);
  const videoReference=guestLayouts.slice(referenceStart,referenceEnd)
    .replaceAll('#live-video-stage:not(.live-audio-stage)','#live-video-stage.live-audio-stage');
  const audioContract=guestLayouts.slice(audioStart);
  const layoutRules=(source,layout)=>[...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(match=>({
      selector:match[1].trim().replaceAll('#live-video-stage:not(.live-audio-stage)','#live-video-stage.live-audio-stage').replaceAll(':is(.audio-guest-layout)',''),
      body:match[2].trim().replace(/\s+/g,' ')
    }))
    .filter(rule=>rule.selector.includes('data-live-layout="'+layout+'"'));
  for(const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']){
    assert.deepEqual(layoutRules(audioContract,layout),layoutRules(videoReference,layout),
      layout+' Audio LIVE guest geometry must match its reference layout');
  }
  assert.match(audioContract,/#live-video-stage\.live-audio-stage\{[\s\S]*?grid-template-rows:minmax\(0,1fr\)!important/);
  assert.ok(audioContract.includes('#live-guest-layout.live-guest-layout{\n  position:relative!important;grid-column:1!important;grid-row:1!important;'),
    'Audio LIVE guest panels must occupy the single full-stage row, not the retired row 2');
  const safeAudioScene=audioGuardrails.slice(audioGuardrails.lastIndexOf('/* Audio LIVE keeps its host identity'));
  assert.match(safeAudioScene,/\.live-video-column\{[\s\S]*?grid-template-rows:48px minmax\(0,1fr\) 54px!important/);
  assert.match(safeAudioScene,/\.live-video-column>\.live-stage-topbar\{[\s\S]*?position:relative!important/);
  assert.match(safeAudioScene,/\.live-video-column #live-video-stage\.live-audio-stage\{[\s\S]*?grid-row:2!important/);
  assert.match(safeAudioScene,/\.live-audio-scene\{[\s\S]*?display:none!important/);
  assert.match(safeAudioScene,/#live-player-shell #live-video-stage\.live-audio-stage #live-guest-layout>\.live-guest-layout-heading\{[\s\S]*?width:1px!important;[\s\S]*?height:1px!important;[\s\S]*?clip-path:inset\(50%\)!important/);
  assert.match(app,/stage\?\.insertAdjacentHTML\("beforebegin",liveStageHud\)/);
  assert.match(audioVisualMatrix,/products:selectedProducts/);
  assert.match(audioVisualMatrix,/MINGLORA_VISUAL_PRODUCTS/);
  assert.match(audioVisualMatrix,/audioHeaderGap/);
  assert.match(audioContract,/#live-speaker-list\{[\s\S]*?clip-path:inset\(50%\)!important/);
  assert.match(app, /class='live-guest-layout audio-guest-layout'/);
  assert.match(app, /function renderLiveGuestLayout\(/);
  assert.match(app, /function renderLiveSpeakerRoster\(/);
});

test('Audio LIVE Full Screen keeps its single full-stage host tile above the mobile header row', () => {
  const start=guestLayouts.lastIndexOf('/* 1. FULL SCREEN — exactly one full-height participant panel. */');
  const end=guestLayouts.indexOf('/* 2. FLUID PANEL',start);
  const rule=guestLayouts.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.ok(rule.includes('#live-guest-layout[data-live-layout="full-screen"]:is(.audio-guest-layout){grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important}'));
  assert.ok(rule.includes('#live-guest-layout[data-live-layout="full-screen"]:is(.audio-guest-layout)>.live-guest-seat.is-host{grid-column:1!important;grid-row:1!important}'));
  assert.ok(rule.includes('>:is(.live-guest-seat.is-guest,.live-guest-seat.empty,.mw-empty-seat){display:none!important}'));
  assert.ok(index.includes('/live-tiktok-compact.css?v=20261118-audio-live-reference-priority-3'));
  assert.ok(serviceWorker.includes("'/live-tiktok-compact.css?v=20261118-audio-live-reference-priority-3'"));
});

test('Audio Only LIVE Side by Side alone exposes and enforces a ninth guest seat', () => {
  const start=app.indexOf('function renderLiveGuestLayout(');
  const end=app.indexOf('\nfunction renderLiveViewerPanel(',start);
  const renderer=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(renderer,/const guestSeatLimit=audioOnly&&activeLiveScreenLayout==='side-by-side'\?9:8/);
  assert.match(renderer,/guests\.slice\(0,guestSeatLimit\)/);
  assert.match(renderer,/while\(specs\.length<guestSeatLimit\+1\)/);
  assert.match(renderer,/if\(!audioOnly&&activeLiveScreenLayout==='side-by-side'\)specs\.push/);
  assert.match(renderer,/Guest seat "\+esc\(spec\.seatNumber\)/);
  assert.match(renderer,/guestSeatLimit\+1/);
  assert.match(app,/Manage up to 8 guest seats in Video \+ Audio and the other Audio Only layouts\. Audio Only Side by Side supports 9\./);
  assert.equal((server.match(/activeSpeakers >= guestSeatLimit/g)||[]).length,4,
    'requests, invitations, invitation acceptance, and host approvals use the active layout capacity');
  assert.match(server,/session\.broadcastType === 'audio_only' && session\.liveLayout === 'side-by-side' \? 9 : 8/);
  assert.match(server,/guestSeatLimit: session\.broadcastType === 'audio_only' && session\.liveLayout === 'side-by-side' \? 9 : 8/);
  assert.match(server,/if \(layout !== 'side-by-side'\) \{[\s\S]*?if \(activeSpeakers > 8\)[\s\S]*?Remove one guest from the stage before switching/);
  assert.match(server,/if \(activeSpeakers > 8\)[\s\S]*?Remove one guest from the stage before switching/);
  assert.match(edge,/Number\(input\.guestSeatLimit\)===9\?9:8/);
  assert.match(edge,/Number\(count\|\|0\)>=guestSeatLimit/);
});

test('Audio-only guest seats use microphone publishers while video LIVE keeps its media-track check', () => {
  const guestStart=app.indexOf('function renderLiveGuestLayout(');
  const guestEnd=app.indexOf('\nfunction renderLiveViewerPanel(',guestStart);
  const guestRenderer=app.slice(guestStart,guestEnd);
  assert.ok(guestStart>=0&&guestEnd>guestStart);
  assert.match(guestRenderer,/const audioOnly=Boolean\(root\.closest\("\.live-audio-stage"\)\)/);
  assert.match(guestRenderer,/const hasGuestStageMedia=audioOnly\?participantHasLiveAudio:participantHasLiveStageMedia/);
  assert.match(guestRenderer,/hasGuestStageMedia\(local\)/);
  assert.match(guestRenderer,/hasGuestStageMedia\(person\)/);
});

const AUDIO_LIVE_LAYOUTS = [
  'full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel',
  'side-by-side','spotlight','roundtable-1','roundtable-2'
];

test('Audio LIVE defines a real rounded grid template for all nine guest layouts', () => {
  for (const layout of AUDIO_LIVE_LAYOUTS) {
    const selectorIndex = fit.indexOf(`data-live-layout="${layout}"`);
    assert.ok(selectorIndex >= 0, layout + ' selector must exist');
    const ruleEnd = fit.indexOf('}', selectorIndex);
    const rule = fit.slice(selectorIndex, ruleEnd);
    assert.match(rule, /grid-template-columns:[^;]+!important/, layout + ' columns must override compact grid');
    assert.match(rule, /grid-template-rows:[^;]+!important/, layout + ' rows must override compact grid');
  }
  assert.match(fit, /grid-auto-flow:row dense!important/);
  assert.match(fit, /border-radius:18px!important/);
  assert.match(fit, /border-radius:50%!important/);
  assert.match(fit, /\.live-audio-stage #live-guest-layout\.audio-guest-layout/);
  assert.match(fit, /data-live-layout="roundtable-1"[^}]*grid-template-columns:[^;]+!important[^}]*grid-template-rows:22px repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(fit, /data-live-layout="roundtable-2"[^}]*grid-template-columns:[^;]+!important[^}]*grid-template-rows:22px repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('All nine Audio LIVE guest presets share the unified layout state and synchronization', () => {
  const layouts=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
  const registry=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(registry);
  assert.deepEqual([...registry[1].matchAll(/value:'([^']+)'/g)].map(match=>match[1]),layouts);
  for(const layout of layouts){
    assert.ok(server.includes("'" + layout + "'"),layout+' must be accepted by the server');
    assert.ok(guestLayouts.includes('data-live-layout="'+layout+'"'),layout+' must have its own grid rules');
  }
  assert.match(server,/LIVE_SCREEN_LAYOUTS\.includes\(layout\)/);
  assert.match(server,/session\.liveLayout = layout/);
  assert.equal((app.match(/id='live-layout-options'/g)||[]).length,1);
  assert.doesNotMatch(app,/live-guest-layout-options|data-live-guest-layout=/);
  assert.match(app,/topic:"minglora-live-layout"/);
  assert.match(app,/applyLiveScreenLayout\(nextLayout\)/);
});
