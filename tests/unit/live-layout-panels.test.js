import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const compact = fs.readFileSync(path.join(root, 'public/live-room-compact.css'), 'utf8');
const tiktok = fs.readFileSync(path.join(root, 'public/live-tiktok-compact.css'), 'utf8');
const liveSettings = fs.readFileSync(path.join(root, 'backend/modules/live/settings.js'), 'utf8');

test('LIVE exposes all nine supplied guest layouts in one host selector', () => {
  const match=app.match(/const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(match,'missing canonical guest layout registry');
  const expected=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
  assert.deepEqual([...match[1].matchAll(/value:'([^']+)'/g)].map(item=>item[1]),expected);
  assert.equal((app.match(/id='live-layout-options'/g)||[]).length,1);
  assert.doesNotMatch(app,/live-guest-layout-options/);
  assert.match(app,/aria-label='Choose LIVE guest layout'/);
  assert.match(app,/let activeLiveScreenLayout='full-screen'/);
  assert.match(app,/normalizeLiveScreenLayout\(session\.liveLayout/);
  assert.match(server,/LIVE_SCREEN_LAYOUTS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'\]/);
});

test('All nine guest layout choices use one host-authorized endpoint and realtime selection', () => {
  assert.match(app,/data-live-screen-layout=/);
  assert.match(app,/\/layout",\{method:"PATCH"/);
  assert.match(app,/topic:"minglora-live-layout"/);
  assert.match(app,/type:"minglora\.live\.layout"/);
  assert.match(server,/Only the LIVE host can change the screen layout/);
  assert.match(server,/LIVE_SCREEN_LAYOUTS\.includes\(layout\)/);
  assert.match(app,/function applyLiveGuestLayout\(value\)\{applyLiveScreenLayout\(value\);\}/);
  assert.match(server,/Only the LIVE host can change the guest-box layout/);
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
  for (const panel of ['layouts', 'guests', 'viewers', 'gifts', 'rewards', 'moderators', 'appearance', 'devices']) {
    assert.ok(app.includes("data-live-tools-panel='" + panel + "'"), 'missing ' + panel + ' panel');
  }
  assert.match(app, /function renderLiveViewerPanel\(/);
  assert.match(app, /room\.remoteParticipants/);
  assert.match(app, /id='live-fullscreen-chat-slot'/);
  assert.doesNotMatch(app, /data-live-tools-panel='chat'/, 'the only Chat panel is the persistent side panel');
  assert.match(app, /data-live-tools-panel-target='devices'/);
  assert.doesNotMatch(app, /live-chat-panel-body/, 'the drawer must not mount a second chat body');
  assert.match(app, /restoreLiveChatToStage/);
  assert.match(app, /data-live-tools-panel-target/);
  assert.match(styles, /\.live-viewer-roster/);
  assert.match(compact, /body:has\(#live-player-shell\) \.live-chat-overlay \.live-chat-list/);
  assert.match(styles, /\.live-tools-content \[data-live-tools-panel\]\[hidden\]/);
});


test('Full Screen matches the one-tile reference with no extra guest overlay seats', () => {
  assert.ok(app.includes("root.setAttribute('aria-label','LIVE guest layout · '+label)"));
  assert.ok(app.includes("classList.toggle('live-full-screen-layout',activeLiveScreenLayout==='full-screen')"));
  assert.ok(app.includes("'full-screen':1"));
  assert.ok(app.includes('const fullScreenHostOnly=activeLiveScreenLayout==="full-screen"&&!audioGuestLayout'));
  const contract=tiktok.slice(tiktok.indexOf('/* FINAL NINE GUEST LAYOUTS'));
  const fullScreen=contract.slice(contract.indexOf('data-live-layout="full-screen"'),contract.indexOf('data-live-layout="fluid-panel"'));
  assert.ok(fullScreen.includes('display:block!important'));
  assert.ok(fullScreen.includes('inset:0!important'));
  assert.ok(!fullScreen.includes('nth-child(n+2)'));
});

test('The host has a persistent master Guest stage ON/OFF control', () => {
  assert.match(liveSettings, /guestStageEnabled: true/);
  assert.match(liveSettings, /'guestStageEnabled'/);
  assert.match(app, /id='live-guest-stage-toggle' data-live-room-setting='guestStageEnabled'/);
  assert.match(app, /setting:key,enabled:input\.checked/);
  assert.match(app, /packet\.setting==='guestStageEnabled'/);
  assert.match(app, /Turn OFF to block requests and remove current speakers/);
  assert.match(app, /Turn ON permits requests when Allow guest requests and Allow co-host are also enabled/);
});

test('Disabling Guest stage blocks requests, approvals, joins and connected guest sessions', () => {
  assert.match(server, /patch\.guestStageEnabled === false/);
  assert.match(server, /if \(request\.status === 'connected'\)/);
  assert.match(server, /request\.status = 'left'/);
  assert.match(server, /live_speaker_mark_left/);
  assert.match(server, /removeLiveKitParticipant\(session\.roomName, request\.userId\)/);
  assert.match(server, /session\.liveSettings\?\.guestStageEnabled === false/);
  assert.match(server, /The host has disabled the guest stage for this LIVE/);
  assert.match(server, /if \(role === 'guest' && session\.liveSettings\?\.guestStageEnabled === false\)/);
});

test('The Guest section shows request identity, status, time, counts and usable actions', () => {
  for (const selector of ['live-guest-pending-count','live-guest-approved-count','live-guest-active-count','live-guest-history-count','live-speaker-username','live-speaker-status','live-speaker-timeline','statusLabels','data-speaker-accept','data-speaker-reject','data-speaker-remove']) {
    assert.ok(app.includes(selector), 'missing Guest section detail: '+selector);
  }
  assert.match(server, /item\.sessionId === session\.id && item\.role === 'guest'/);
  assert.match(app, /statusLabels=\{requested:/);
  assert.match(app, /rejected:"Declined",left:"Removed or left stage"/);
  assert.match(app, /Connected · /);
  assert.match(app, /Reviewed · /);
  assert.match(styles, /\.live-speaker-timeline\{/);
  assert.match(styles, /\.live-guest-stage-overview\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
  assert.match(styles, /\.live-speaker-request-row\{[\s\S]*?overflow:visible/);
  assert.match(styles, /\.live-speaker-meta strong\{[\s\S]*?white-space:normal/);
  assert.match(styles, /\.live-speaker-actions button\{[\s\S]*?min-height:34px/);
  assert.match(styles, /\.live-guest-seat-meta strong,\.live-guest-seat-meta small\{[\s\S]*?white-space:normal!important/);
  assert.match(styles, /overflow-wrap:anywhere!important/);
  assert.match(styles, /repeat\(3,minmax\(92px,\.55fr\)\)/);
  assert.match(styles, /min-height:480px!important/);
  assert.match(styles, /position:relative!important;inset:auto!important;z-index:4!important/);
});

test('LIVE gift catalogue is visible from the room for viewers, guests and host previews', () => {
  assert.ok(!app.includes("id='live-stage-gift-open' class='live-stage-gift-open"), 'LIVE Gifts must not be duplicated beside the host Power control; use the Gifts panel navigation instead.');
  assert.match(app, /liveControlButton\(\"live-gifts-toggle\"/);
  assert.match(app, /id='live-gift-panel' class='live-gift-panel/);
  assert.match(app, /data-live-tools-panel-target='gifts'/);
  assert.match(app, /role===\"host\"\?\"LIVE gift catalogue\"/);
  assert.match(app, /role===\"host\"\?\"Viewer preview · sending to your own LIVE is disabled\"/);
  assert.match(app, /const loadLiveGiftCatalogue=async\(\)=>/);
  assert.match(app, /liveGiftCatalogue=\[\];liveGiftScope='all';refreshLiveGiftGrid=null/);
  assert.match(app, /api\(\"\/coins\/catalog\"\)/);
  assert.match(app, /giftGrid\.innerHTML=shown\.length\?/);
  assert.match(app, /Retry gift catalogue/);
  assert.match(app, /const giftsEnabled=liveSettings\.liveGifts!==false&&!liveSettings\.practiceMode/);
  assert.match(app, /live-gift-disabled-note/);
  assert.match(app, /The host has turned off gifts for this LIVE/);
  assert.match(styles, /\.live-stage-gift-open\{/);
  assert.match(styles, /\.live-gift-empty\{/);
});

test('LIVE gift animations use server-confirmed gift ledger events, not client messages', () => {
  assert.ok(server.includes("if(method==='GET'&&liveAction)"), 'missing authenticated LIVE gifts read route');
  assert.ok(server.includes("event.broadcastId===session.id&&event.creatorId===session.hostId"), 'gift history must be scoped to this broadcast and host');
  assert.ok(server.includes("id:String(event.giftId||event.id||'')"), 'events must expose their confirmed transaction id');
  assert.ok(app.includes('function startLiveGiftEvents(session)'), 'missing room gift event polling');
  assert.ok(app.includes('function stopLiveGiftEvents()'), 'missing LIVE gift polling cleanup');
  assert.ok(app.includes("'/gifts?since='") && app.includes('refreshLiveGiftEvents(session)'), 'poller must fetch newer confirmed events');
  assert.ok(app.includes('window.MingloraGiftFX?.mount(stage,gift)'), 'confirmed gifts must animate in the LIVE room');
  assert.ok(app.includes('topic==="minglora-live-gift"&&!participant?.identity'), 'only server-originated room gift packets animate immediately');
  assert.ok(server.includes("broadcastLiveKitData(session.roomName,{type:'minglora.live.gift',version:1,event:liveGiftEvent},'minglora-live-gift')"), 'server must broadcast only its confirmed gift ledger event');
});
test('Every Full Screen LIVE control icon has its expected working event handler', () => {
  for (const id of ['live-mic-toggle','live-camera-toggle','live-camera-flip','live-screen-share-toggle','live-guests-toggle','live-audio-toggle','live-chat-toggle','live-gifts-toggle','live-cohost-toggle','live-share-toggle','live-fullscreen-toggle','live-leave']) {
    assert.ok(app.includes('liveControlButton("'+id+'"'), 'missing control '+id);
  }
  for (const handler of ['micControl?.addEventListener("click"','cameraControl?.addEventListener("click"','flipCameraControl?.addEventListener("click"','screenShareControl?.addEventListener("click"','roomAudioControl?.addEventListener("click"','$("#live-chat-toggle")?.addEventListener','$("#live-guests-toggle")?.addEventListener','$("#live-gifts-toggle")?.addEventListener','$("#live-cohost-toggle")?.addEventListener','$("#live-share-toggle")?.addEventListener','liveFullscreenControl?.addEventListener("click"','$("#live-leave")?.addEventListener']) {
    assert.ok(app.includes(handler), 'missing working control handler: '+handler);
  }
  assert.match(app, /typeof navigator\.mediaDevices\?\.getDisplayMedia!=="function"/);
});;


test('All nine supplied guest arrangements independently match their reference geometry',()=>{
  const contract=tiktok.slice(tiktok.indexOf('/* FINAL NINE GUEST LAYOUTS'));
  const layouts=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];
  for(const layout of layouts)assert.ok(contract.includes('data-live-layout="'+layout+'"'),layout+' geometry missing');

  // The exact placeholder count follows each individual supplied diagram.
  const capacities={
    'full-screen':1,'fluid-panel':3,'fluid-grid':3,'fixed-grid':9,
    'fixed-panel':4,'side-by-side':10,'spotlight':9,'roundtable-1':9,'roundtable-2':9
  };
  for(const [layout,count] of Object.entries(capacities))assert.ok(app.includes("'"+layout+"':"+count),layout+' seat count');

  assert.ok(contract.includes('right:7%!important'));
  assert.ok(contract.includes('bottom:28%!important'));
  assert.ok(contract.includes('bottom:7%!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important'));
  assert.ok(contract.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(contract.includes('grid-template-columns:minmax(0,2.1fr) minmax(0,.9fr)!important'));
  assert.ok(contract.includes('grid-column:1/3!important'));
  assert.ok(contract.includes('grid-column:3/5!important'));
  assert.ok(contract.includes('grid-column:1/5!important'));
  assert.ok(contract.includes('nth-child(2){left:8%!important'));
  assert.ok(contract.includes('nth-child(3){right:8%!important'));
  assert.ok(contract.includes('left:29%!important'));
  assert.ok(contract.includes('width:42%!important'));
  assert.ok(contract.includes('nth-child(2){left:6%!important'));
  assert.ok(contract.includes('nth-child(3){right:6%!important'));
  assert.ok(contract.includes('.live-guest-layout-heading{\n  display:none!important;'));
  assert.ok(!contract.includes('data-live-guest-layout'));
});

test('Full Screen has its own expand icon with no guest panels; Fluid Panel keeps its panel icon', () => {
  assert.ok(app.includes("value:'full-screen',label:'Full Screen',icon:'fullscreen'"));
  assert.ok(app.includes("value:'fluid-panel',label:'Fluid Panel',icon:'fluidPanel'"));
  const iconMap=app.slice(app.indexOf('function liveLayoutIcon'),app.indexOf('function applyLiveScreenLayout'));
  const fullScreenIcon=iconMap.match(/fullscreen:"([^"]+)"/)?.[1]||'';
  assert.ok(fullScreenIcon.includes("M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"));
  assert.doesNotMatch(fullScreenIcon, /<rect/);
});

test('Full Screen keeps the compact centered host stage and visible guest seats', () => {
  assert.match(app, /value:'full-screen',label:'Full Screen',icon:'fullscreen'/);
  assert.match(app, /classList\.toggle\('live-full-screen-layout',activeLiveScreenLayout==='full-screen'\)/);
  assert.doesNotMatch(app, /classList\.toggle\('live-full-screen-active',hostOnly\)/);
  assert.match(styles, /\.live-video-stage\.live-full-screen-layout:not\(\.live-audio-stage\)\{/);
  assert.match(styles, /width:min\(100%,62\.4dvh,608px\)/);
  assert.match(styles, /max-height:min\(78dvh,760px\)/);
  assert.match(styles, /aspect-ratio:4 \/ 5/);
  assert.match(styles, /#live-guest-layout\[data-live-layout="full-screen"\]>.live-guest-seat\.is-host\{[\s\S]*?width:100%[\s\S]*?height:100%/);
});
