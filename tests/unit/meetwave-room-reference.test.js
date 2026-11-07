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

test('All nine screen presets affect the screen wrapper, never the participant grid state', () => {
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']) {
    assert.ok(js.includes('data-mw-layout="'+layout+'"'), layout+' is selectable');
    assert.ok(css.includes('#mw-screen-stage[data-screen-layout="'+layout+'"]'), layout+' has a screen presentation');
  }
  assert.ok(js.includes('screen.dataset.screenLayout=layout'));
  assert.ok(js.includes("screen.classList.toggle('live-full-screen-layout',layout==='full-screen')"));
  assert.ok(!js.includes('grid.dataset.layout=layout'));
  assert.ok(!js.includes("layout==='full-screen'&&!document.fullscreenElement"));
});

test('Settings gear contains layouts and the room side tabs remain Chat, People, Settings', () => {
  assert.ok(js.includes('id="mw-settings"'));
  assert.ok(js.includes('id="mw-panel-settings-tab"'));
  assert.ok(js.includes('id="mw-layout-picker" class="mw-settings-section mw-layout-picker"'));
  assert.ok(!js.includes('id="mw-panel-layouts-tab"'));
  assert.ok(!js.includes('id="mw-layout"'));
  for (const id of ['mw-panel-chat-tab','mw-panel-people-tab','mw-panel-settings-tab']) assert.ok(js.includes('id="'+id+'"'));
  assert.ok(js.includes("$('#mw-settings').onclick=()=>setMeetWaveSideTab('settings')"));
  assert.ok(js.includes("$('#mw-panel-settings-tab').onclick=()=>setMeetWaveSideTab('settings')"));
});

test('Host uses the Minglora LIVE circular power control; attendees retain Leave', () => {
  assert.ok(js.includes('id="mw-power-off" class="live-control-button is-danger live-host-power-button"'));
  assert.ok(js.includes('Power off MeetWave for everyone'));
  assert.ok(js.includes("$('#mw-power-off')?.addEventListener('click'"));
  assert.ok(js.includes("await leaveRoom(true)"));
  assert.ok(js.includes("!host?'<button type="));
  assert.ok(js.includes("id=" + '"mw-leave"'));
  assert.ok(!js.includes('id="mw-end"'));
});

test('MeetWave side panel stays compact and scrolls its own content', () => {
  assert.ok(css.includes('minmax(250px,280px)'));
  assert.ok(css.includes('max-height:290px!important'));
  assert.ok(css.includes('overflow:auto!important'));
  for (const id of ['mw-chat-panel','mw-participants-panel','mw-settings-panel','mw-settings-invite','mw-room-invite']) assert.ok(js.includes('id="'+id+'"'));
});

test('Guest seats invite members and preserve seats when camera tracks stop', () => {
  assert.ok(js.includes('data-open-guest-invite'));
  assert.ok(js.includes("$('#mw-grid').onclick=event=>"));
  assert.ok(js.includes("void inviteMembers(activeRoom.id)"));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(js.includes("roomClient.on(client.RoomEvent.ParticipantDisconnected"));
});

test('Screen sharing has a separate presentation stage outside the participant seats', () => {
  assert.ok(js.includes('id="mw-screen-share-stage"'));
  assert.ok(js.includes("$('#mw-screen-share-stage')?.append(element)"));
  assert.ok(js.includes("$('#mw-screen-stage')?.classList.add('has-screen-share')"));
});

test('The displayed room capacity and join guard agree on nine participants', () => {
  assert.ok(server.includes('maxParticipants:9'));
  assert.ok(server.includes('await ensureLiveKitRoom(room.roomName,9)'));
  assert.ok(server.includes('participants.length>=(9)'));
  assert.ok(server.includes('nine participants: one host and up to eight guests'));
});

test('MeetWave scripts and styles use the current cache version', () => {
  const current = '20261107-meetwave-screen-seat-layout-6';
  assert.ok(html.includes('/meetwave.css?v='+current));
  assert.ok(html.includes('/meetwave.js?v='+current));
  assert.ok(serviceWorker.includes('minglora-shell-v126-meetwave-screen-seat-layout-6'));
  assert.ok(serviceWorker.includes('/meetwave.css?v='+current));
  assert.ok(serviceWorker.includes('/meetwave.js?v='+current));
});
