import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [css,js,html,serviceWorker]=await Promise.all([
 readFile(new URL('../../public/meetwave.css',import.meta.url),'utf8'),
 readFile(new URL('../../public/meetwave.js',import.meta.url),'utf8'),
 readFile(new URL('../../public/index.html',import.meta.url),'utf8'),
 readFile(new URL('../../public/sw.js',import.meta.url),'utf8')
]);
test('MeetWave has fixed host plus eight persistent guest seats',()=>{
 assert.ok(js.includes('data-grid-role="fixed-host-eight-guest-seats"'));
 assert.ok(js.includes('Array.from({length:8}'));
 assert.ok(js.includes('function ensureParticipantSeat(participant)'));
 assert.ok(js.includes('function resetGuestSeat(identity)'));
 assert.ok(css.includes('#mw-grid.live-guest-layout'));
});
test('Layout choices affect the screen wrapper, not the grid state',()=>{
 for(const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2']){
  assert.ok(js.includes('data-mw-layout="'+layout+'"'),layout);
  assert.ok(css.includes('#mw-screen-stage[data-screen-layout="'+layout+'"]'),layout+' screen style');
 }
 assert.ok(js.includes('screen.dataset.screenLayout=layout'));
 assert.ok(!js.includes('grid.dataset.layout=layout'));
 assert.ok(!js.includes("layout==='full-screen'&&!document.fullscreenElement"));
});
test('Screen layouts are inside the Settings gear with no Layout tab',()=>{
 assert.ok(js.includes('id="mw-settings"'));
 assert.ok(js.includes('id="mw-panel-settings-tab"'));
 assert.ok(js.includes('id="mw-layout-picker" class="mw-settings-section mw-layout-picker"'));
 assert.ok(!js.includes('id="mw-panel-layouts-tab"'));
 assert.ok(!js.includes('id="mw-layout"'));
});
test('Host gets LIVE-style power-off; participant Leave remains separate',()=>{
 assert.ok(js.includes('id="mw-power-off" class="live-control-button is-danger live-host-power-button"'));
  assert.ok(js.includes("screen.classList.toggle('live-full-screen-layout',layout==='full-screen')"));
  assert.ok(js.includes("'+(!host?'") && js.includes("(host?'") && !js.includes('id="mw-end"'));
 assert.ok(js.includes('Power off MeetWave for everyone'));
 assert.ok(js.includes("$('#mw-power-off')?.addEventListener('click'"));
 assert.ok(js.includes('await leaveRoom(true)'));
 assert.ok(!js.includes('id="mw-end"'));
  assert.match(js, /!host\\?'<button type=\\"button\\" id=\\"mw-leave\\"/);
});
test('Compact MeetWave side panel retains Chat, People, Settings and guest invitations',()=>{
 for(const id of ['mw-panel-chat-tab','mw-panel-people-tab','mw-panel-settings-tab','mw-chat-panel','mw-participants-panel','mw-settings-panel','mw-settings-invite','mw-room-invite'])assert.ok(js.includes('id="'+id+'"'),id);
 assert.ok(css.includes('minmax(250px,280px)'));
 assert.ok(css.includes('max-height:290px!important'));
 assert.ok(js.includes('function inviteMembers(id)'));
});
test('Screen sharing has its own stage and does not consume a guest seat',()=>{
 assert.ok(js.includes('id="mw-screen-share-stage"'));
 assert.ok(js.includes("$('#mw-screen-share-stage')?.append(element)"));
 assert.ok(js.includes("$('#mw-screen-stage')?.classList.add('has-screen-share')"));
});
test('MeetWave asset cache versions are current',()=>{
 const current='20261107-meetwave-screen-seat-layout-5';
 assert.ok(html.includes('/meetwave.css?v='+current));
 assert.ok(html.includes('/meetwave.js?v='+current));
 assert.ok(serviceWorker.includes('minglora-shell-v125-meetwave-screen-seat-layout-5'));
 assert.ok(serviceWorker.includes('/meetwave.css?v='+current));
 assert.ok(serviceWorker.includes('/meetwave.js?v='+current));
});
