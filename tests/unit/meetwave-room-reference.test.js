import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, js, html, serviceWorker, server] = await Promise.all([
  readFile(new URL('../../public/meetwave.css', import.meta.url), 'utf8'),
  readFile(new URL('../../public/meetwave.js', import.meta.url), 'utf8'),
  readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/server.js', import.meta.url), 'utf8')
]);

test('MeetWave keeps a fixed host seat and eight guest seats', () => {
  assert.ok(js.includes('data-grid-role="fixed-host-eight-guest-seats"'));
  assert.ok(js.includes('Array.from({length:8}'));
  assert.ok(js.includes('function ensureParticipantSeat(participant)'));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(css.includes('#mw-grid.live-guest-layout'));
  assert.ok(server.includes('participantLimit:9,createdAt:now()'));
  assert.ok(server.includes('maxParticipants:9'));
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

test('MeetWave panel and layout tiles keep consistent gaps, sizes and independent scrolling', () => {
  assert.ok(css.includes('minmax(250px,280px)'));
  assert.ok(css.includes('max-height:290px!important'));
  assert.ok(css.includes('overflow:auto!important'));
  assert.ok(css.includes('gap:12px!important;padding:14px!important'));
  assert.ok(css.includes('.mw-screen-stage{') && css.includes('overflow:auto!important;overscroll-behavior:contain!important'));
  assert.ok(css.includes('.mw-screen-stage.has-screen-share #mw-grid .live-guest-seat') && css.includes('min-height:0!important'));
  assert.ok(css.includes('min-height:clamp(88px,11vh,132px)!important'));
  assert.ok(css.includes('.mw-support-column>.mw-layout-panel[hidden]{display:none!important}'));
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
  const current = '20261107-meetwave-panel-layout-tab-7';
  assert.ok(html.includes('/meetwave.css?v='+current));
  assert.ok(html.includes('/meetwave.js?v='+current));
  assert.ok(serviceWorker.includes('minglora-shell-v129-meetwave-panel-layout-tab-7'));
  assert.ok(serviceWorker.includes('/meetwave.css?v='+current));
  assert.ok(serviceWorker.includes('/meetwave.js?v='+current));
});
