import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, js, html, serviceWorker, server, livekit] = await Promise.all([
  readFile(new URL('../../public/meetwave.css', import.meta.url), 'utf8'),
  readFile(new URL('../../public/meetwave.js', import.meta.url), 'utf8'),
  readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../../backend/modules/live/livekit.js', import.meta.url), 'utf8')
]);

test('MeetWave keeps a fixed host seat and ten guest seats', () => {
  assert.ok(js.includes('data-grid-role="fixed-host-ten-guest-seats"'));
  assert.ok(js.includes('Array.from({length:10}'));
  assert.ok(js.includes('function ensureParticipantSeat(participant)'));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(css.includes('#mw-grid.live-guest-layout'));
  assert.ok(server.includes('participantLimit:11,createdAt:now()'));
  assert.ok(server.includes('maxParticipants:11'));
});

test('All nine screen presets affect the screen wrapper, never the grid state', () => {
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']) {
    assert.ok(js.includes('data-mw-layout="'+layout+'"'), layout+' is selectable');
    assert.ok(css.includes('#mw-screen-stage[data-screen-layout="'+layout+'"]'), layout+' has a screen presentation');
  }
  assert.ok(js.includes('screen.dataset.screenLayout=layout'));
  assert.ok(js.includes("screen.classList.toggle('live-full-screen-layout',layout==='full-screen')"));
  assert.ok(!js.includes('grid.dataset.layout=layout'));
  assert.ok(!js.includes("layout==='full-screen'&&!document.fullscreenElement"));
});

test('MeetWave panel has Chat, People, Layouts and Settings tabs', () => {
  for (const id of ['mw-panel-chat-tab','mw-panel-people-tab','mw-panel-layouts-tab','mw-panel-settings-tab']) {
    assert.ok(js.includes('id="'+id+'"'), id+' tab is present');
  }
  assert.ok(js.includes("layouts:$('#mw-layout-picker')"));
  assert.ok(js.includes("$('#mw-panel-layouts-tab').onclick=()=>setMeetWaveSideTab('layouts')"));
});

test('Settings gear and Settings tab open the same MeetWave settings', () => {
  assert.ok(js.includes('id="mw-settings"'));
  assert.ok(js.includes("$('#mw-settings').onclick=()=>setMeetWaveSideTab('settings')"));
  assert.ok(js.includes("$('#mw-panel-settings-tab').onclick=()=>setMeetWaveSideTab('settings')"));
  assert.ok(js.includes('id="mw-layout-picker" class="mw-tool-panel mw-layout-panel" hidden'));
  assert.ok(js.includes('id="mw-settings-panel"'));
  assert.ok(js.includes('id="mw-audio-input"'));
  assert.ok(js.includes('id="mw-video-input"'));
});

test('Host uses the LIVE circular power control; attendees retain Leave', () => {
  assert.ok(js.includes('id="mw-power-off" class="live-control-button is-danger live-host-power-button"'));
  assert.ok(js.includes('Power off MeetWave for everyone'));
  assert.ok(js.includes("$('#mw-power-off')?.addEventListener('click'"));
  assert.ok(js.includes('await leaveRoom(true)'));
  assert.ok(js.includes("!host?'<button type="));
  assert.ok(js.includes('id="mw-leave"'));
  assert.ok(!js.includes('id="mw-end"'));
});

test('MeetWave layout controls fit as a complete grid without a separate scroll area', () => {
  const fit = css.slice(css.lastIndexOf('/* Final MeetWave fit-to-view overrides:'));
  assert.ok(css.includes('minmax(250px,280px)'));
  assert.ok(fit.includes('overflow:visible!important'),'layout panel does not create its own scroll container');
  assert.ok(fit.includes('max-height:none!important'),'layout panel is not artificially shortened');
  assert.ok(fit.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'),'nine layout choices use three columns');
  assert.ok(fit.includes('gap:7px!important'),'layout buttons keep consistent separation');
  assert.ok(fit.includes('min-height:44px!important'),'layout buttons remain touch friendly');
});

test('Guest seats invite members and return to the same seat when a participant leaves', () => {
  assert.ok(js.includes('data-open-guest-invite'));
  assert.ok(js.includes("$('#mw-grid').onclick=event=>"));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(js.includes('ParticipantDisconnected'));
  assert.ok(js.includes('function inviteMembers(id)'));
});

test('Screen sharing uses a separate stage outside participant seats', () => {
  assert.ok(js.includes('id="mw-screen-share-stage"'));
  assert.ok(js.includes("$('#mw-screen-share-stage')?.append(element)"));
  assert.ok(js.includes("$('#mw-screen-stage')?.classList.add('has-screen-share')"));
});

test('MeetWave scripts and styles use the current cache version', () => {
  const current = '20261107-meetwave-guest-spotlight-10';
  assert.ok(html.includes('/meetwave.css?v='+current));
  assert.ok(html.includes('/meetwave.js?v='+current));
  assert.ok(serviceWorker.includes('minglora-shell-v148-profile-actions-blue-1'));
  assert.ok(serviceWorker.includes('/meetwave.css?v='+current));
  assert.ok(serviceWorker.includes('/meetwave.js?v='+current));
});


test('MeetWave layouts fit all eleven participants inside the non-scrolling stage', () => {
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']) {
    assert.ok(css.includes('data-screen-layout="'+layout+'"'), layout+' has a fit-to-view layout rule');
  }
  assert.ok(css.includes('height:min(60dvh,calc(100dvh - 260px),680px)!important'));
  assert.ok(css.includes('overflow:hidden!important;box-sizing:border-box!important'));
  assert.ok(css.includes('grid-template-rows:24px repeat(4,minmax(0,1fr))!important'));
  assert.ok(css.includes('grid-template-rows:24px repeat(6,minmax(0,1fr))!important'));
  assert.ok(css.includes('repeat(6,minmax(0,1fr))!important'));
});

test('Spotlight allows selecting any guest and returning focus to host', () => {
  assert.ok(js.includes('id="mw-spotlight-host"'));
  assert.ok(js.includes("applySpotlightSelection(tile.dataset.identity)"));
  assert.ok(js.includes("applySpotlightSelection(hostTile?.dataset.identity||activeRoom?.ownerId||state.user.id)"));
  assert.ok(js.includes("activeLayout==='spotlight'"));
  assert.ok(css.includes('#mw-screen-stage[data-screen-layout="spotlight"] #mw-grid>.live-guest-seat.is-spotlight'));
});

test('Legacy placement rules cannot stack guest tiles in panel or spotlight layouts', () => {
  assert.ok(css.includes('#mw-screen-stage[data-screen-layout="fluid-panel"] #mw-grid>.live-guest-seat.is-guest'));
  assert.ok(css.includes('#mw-screen-stage[data-screen-layout="fluid-panel"] #mw-grid>.live-guest-seat.is-host'));
  assert.ok(css.includes('#mw-screen-stage[data-screen-layout="spotlight"] #mw-grid>.live-guest-seat.is-spotlight'));
  assert.ok(css.includes('#mw-screen-stage.has-screen-share #mw-grid'));
});


test('MeetWave regular, full-screen and panel grids fit all eleven seats without stage scrolling or oversized host tiles',()=>{
  const fit=css.slice(css.lastIndexOf('/* Final MeetWave fit-to-view overrides:'));
  assert.ok(fit.includes('overflow:hidden!important'));
  assert.ok(fit.includes('height:min(60dvh,calc(100dvh - 260px),680px)!important'));
  assert.ok(fit.includes('gap:clamp(7px,.9vw,11px)!important'));
  assert.ok(fit.includes('grid-template-rows:24px repeat(3,minmax(0,1fr))!important'));
  assert.ok(fit.includes('grid-template-rows:24px repeat(4,minmax(0,1fr))!important'));
  assert.ok(fit.includes('grid-row:2/span 2!important'));
  assert.ok(!fit.includes('grid-row:2/span 4!important'));
  assert.ok(!fit.includes('overflow:auto!important'));
});


test('MeetWave Guest Spotlight selector is live, selectable, and can return focus to host',()=>{
  assert.ok(js.includes('id="mw-spotlight-select"'));
  assert.ok(js.includes("$('#mw-spotlight-select')?.addEventListener('change'"));
  assert.ok(js.includes('function renderSpotlightOptions()'));
  assert.ok(js.includes("Guest '+tile.dataset.guestNumber+' — '+esc(name)"));
  assert.ok(js.includes('id="mw-spotlight-host"'));
  assert.ok(js.includes("applySpotlightSelection(identity)"));
});

test('MeetWave supports ten guest tiles plus the host and upgrades empty LiveKit rooms',()=>{
  assert.ok(js.includes('Array.from({length:10}'));
  assert.ok(js.includes("count+' / 11 participants'"));
  assert.ok(server.includes('participantLimit:11'));
  assert.ok(server.includes('ensureLiveKitRoom(room.roomName,11)'));
  assert.ok(server.includes('participants.length>=roomParticipantLimit'));
  assert.ok(livekit.includes('currentParticipants > 0'));
  assert.ok(livekit.includes('await service.deleteRoom(roomName)'));
});

test('MeetWave room heading shows the room title and reserves the top host position',()=>{
  assert.ok(js.includes('class="mw-stage-room-title"'));
  assert.ok(js.includes("esc(room.title)"));
  assert.ok(js.includes("if(identity===activeRoom?.ownerId)"));
  assert.ok(css.includes('.live-guest-seat.is-host .live-guest-seat-meta'));
});

test('MeetWave host power button is right-docked with space from the panel edge',()=>{
  assert.ok(js.includes('class="mw-host-power-dock"'));
  assert.ok(css.includes('.mw-host-power-dock'));
  assert.ok(css.includes('margin:3px 8px 3px 2px'));
});

test('MeetWave screen-share thumbnails can show all eleven participant seats',()=>{
  assert.ok(css.includes('#mw-screen-stage.has-screen-share #mw-grid'));
  assert.ok(css.includes('grid-template-columns:repeat(6,minmax(0,1fr))!important'));
});
