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

const finalFit = css.slice(css.lastIndexOf('/* MeetWave 8-guest layout system'));

test('MeetWave reserves one host seat and exactly eight guest seats', () => {
  assert.ok(js.includes('MEETWAVE_GUEST_LIMIT = 8'));
  assert.ok(js.includes('MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT + 1'));
  assert.ok(js.includes('data-grid-role="host-eight-guest-seats"'));
  assert.ok(js.includes('Array.from({length:MEETWAVE_GUEST_LIMIT}'));
  assert.ok(js.includes('1 / 9 seats in use'));
  assert.ok(js.includes('function ensureParticipantSeat(participant)'));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(server.includes('participantLimit:MEETWAVE_PARTICIPANT_LIMIT'));
  assert.ok(server.includes('maxParticipants:MEETWAVE_PARTICIPANT_LIMIT'));
  assert.ok(server.includes('ensureLiveKitRoom(room.roomName,MEETWAVE_PARTICIPANT_LIMIT)'));
  assert.ok(server.includes('participants.length>=roomParticipantLimit'));
});

test('All seven screen layouts apply to the MeetWave stage and video grid', () => {
  const layouts = ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
  for (const layout of layouts) {
    assert.ok(js.includes('data-mw-layout="'+layout+'"'), layout+' is selectable');
    assert.ok(css.includes('#mw-grid[data-layout="'+layout+'"]'), layout+' has a video-grid presentation');
  }
  assert.ok(js.includes('data-mw-layout="side-by-side"'));
  assert.ok(js.includes('screen.dataset.screenLayout=layout'));
  assert.ok(js.includes('grid.dataset.layout=layout'));
  assert.ok(js.includes("grid.dataset.gridRole='host-eight-guest-seats'"));
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

test('Host can end the meeting for everyone; attendees retain Leave', () => {
  assert.ok(js.includes('id="mw-power-off" class="live-control-button is-danger live-host-power-button"'));
  assert.ok(js.includes('End MeetWave meeting for everyone'));
  assert.ok(js.includes('<small class="live-control-caption">End meeting</small>'));
  assert.ok(js.includes("$('#mw-power-off')?.addEventListener('click'"));
  assert.ok(js.includes('await leaveRoom(true)'));
  assert.ok(js.includes("!host?'<button type="));
  assert.ok(js.includes('id="mw-leave"'));
});

test('The control dock wraps into equal visible controls without horizontal scrolling', () => {
  assert.ok(finalFit.includes('display:grid!important'));
  assert.ok(finalFit.includes('grid-template-columns:repeat(auto-fit,minmax(48px,1fr))!important'));
  assert.ok(finalFit.includes('overflow:visible!important'));
  assert.ok(finalFit.includes('flex:initial!important'));
  assert.ok(finalFit.includes('width:100%!important'));
  assert.ok(finalFit.includes('white-space:normal!important'));
});

test('Guest seats invite members and return to the same seat when a participant leaves', () => {
  assert.ok(js.includes('data-open-guest-invite'));
  assert.ok(js.includes("$('#mw-grid').onclick=event=>"));
  assert.ok(js.includes('function resetGuestSeat(identity)'));
  assert.ok(js.includes('ParticipantDisconnected'));
  assert.ok(js.includes('function inviteMembers(id)'));
});

test('Screen sharing uses a separate stage outside the nine participant seats', () => {
  assert.ok(js.includes('id="mw-screen-share-stage"'));
  assert.ok(js.includes("$('#mw-screen-share-stage')?.append(element)"));
  assert.ok(js.includes("$('#mw-screen-stage')?.classList.add('has-screen-share')"));
  assert.ok(server.includes('MEETWAVE_PARTICIPANT_LIMIT'));
});

test('MeetWave scripts and styles share the current browser cache version', () => {
  const cssAsset=html.match(/href="(\/meetwave\.css\?v=[^"]+)"/)?.[1]||'';
  const jsAsset=html.match(/src="(\/meetwave\.js\?v=[^"]+)"/)?.[1]||'';
  assert.ok(cssAsset&&jsAsset,'HTML loads current MeetWave assets');
  assert.ok(serviceWorker.includes("'"+cssAsset+"'"));
  assert.ok(serviceWorker.includes("'"+jsAsset+"'"));
  assert.match(serviceWorker,/CACHE_NAME='minglora-shell-v\d+-/);
});

test('Roundtable 1 and 2 are guest-box layouts, never screen layouts', () => {
  for (const layout of ['roundtable-1','roundtable-2']) {
    assert.ok(js.includes('data-mw-guest-layout="'+layout+'"'), layout+' is selectable for guest boxes');
    assert.ok(css.includes('#mw-grid[data-guest-layout="'+layout+'"]'), layout+' has independent guest-box CSS');
  }
  assert.ok(js.includes('MEETING_GUEST_LAYOUTS'));
  assert.ok(js.includes('function applyMeetingGuestLayout(layout)'));
  assert.ok(js.includes('if(grid)grid.dataset.guestLayout=layout;'));
  assert.ok(js.includes('grid.dataset.guestLayout=layout'));
  assert.ok(!js.includes('data-mw-layout="roundtable-1"'));
  assert.ok(!js.includes('data-mw-layout="roundtable-2"'));
});

test('All seven screen layouts place the host and guest seats inside the same grid stage', () => {
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight']) {
    assert.ok(css.includes('#mw-grid[data-layout="'+layout+'"]'), layout+' has an explicit grid rule');
  }
  assert.ok(finalFit.includes('min-width:0!important'));
  assert.ok(finalFit.includes('overflow:visible!important'));
  assert.ok(finalFit.includes('grid-auto-rows:minmax'));
});

test('Spotlight lights the selected guest while keeping the other guest seats visible', () => {
  assert.ok(js.includes("applySpotlightSelection(tile.dataset.identity)"));
  assert.ok(js.includes("setSpeakerFocus([{identity:tile.dataset.identity}])"));
  assert.ok(js.includes("const activeIdentity=speakers[0]?.identity||spotlightIdentity||activeRoom?.ownerId||state.user.id"));
  assert.ok(js.includes("target.classList.add('is-focused')"));
  assert.ok(js.includes("activeLayout=layout")&&js.includes("applySpotlightSelection(spotlightIdentity)"));
  assert.ok(finalFit.includes('#mw-grid[data-layout="spotlight"] .mw-video-tile.is-spotlight'));
  assert.ok(finalFit.includes('box-shadow:0 0 0 2px rgba(114,224,203,.2),0 0 28px rgba(77,213,189,.48)'));
  assert.ok(finalFit.includes('.mw-video-tile:not(.is-spotlight){display:grid!important}'));
});

test('Every host and guest seat keeps equal dimensions across seven screen layouts and two guest-box layouts', () => {
  for (const layout of ['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight']) {
    assert.ok(css.includes('#mw-grid[data-layout="'+layout+'"]'), layout+' screen selector is present');
  }
  for (const layout of ['roundtable-1','roundtable-2']) {
    assert.ok(css.includes('#mw-grid[data-guest-layout="'+layout+'"]'), layout+' guest-box selector is present');
  }
  }
  assert.ok(finalFit.includes('.mw-video-tile{'));
  assert.ok(finalFit.includes('width:100%!important'));
  assert.ok(finalFit.includes('height:100%!important'));
  assert.ok(finalFit.includes('min-width:0!important'));
  assert.ok(finalFit.includes('min-height:104px!important'));
  assert.ok(finalFit.includes('#mw-grid[data-layout="spotlight"] .mw-video-tile.is-spotlight'));
  assert.ok(finalFit.includes('grid-column:auto!important'));
  assert.ok(finalFit.includes('grid-row:auto!important'));
});

test('Active guest focus is selectable in every layout', () => {
  assert.ok(js.includes('function setSpeakerFocus(speakers=[])'));
  assert.ok(js.includes('applySpotlightSelection(activeIdentity)'));
  assert.ok(js.includes('setSpeakerFocus([{identity:tile.dataset.identity}])'));
  assert.ok(css.includes('.mw-meeting #mw-grid .mw-video-tile.is-focused'));
  assert.ok(!js.includes('id="mw-spotlight-select"'));
  assert.ok(!js.includes('id="mw-spotlight-host"'));
});

test('MeetWave uses the nine-participant limit when checking LiveKit capacity', () => {
  assert.ok(js.includes("count+' / '+MEETWAVE_PARTICIPANT_LIMIT+' participants'"));
  assert.ok(server.includes('participantLimit:MEETWAVE_PARTICIPANT_LIMIT'));
  assert.ok(server.includes('ensureLiveKitRoom(room.roomName,MEETWAVE_PARTICIPANT_LIMIT)'));
  assert.ok(server.includes('Math.min(MEETWAVE_PARTICIPANT_LIMIT'));
  assert.ok(server.includes('participants.length>=roomParticipantLimit'));
  assert.ok(livekit.includes('currentParticipants > 0'));
  assert.ok(livekit.includes('await service.deleteRoom(roomName)'));
});

test('MeetWave room heading shows the room title and reserves the top host position', () => {
  assert.ok(js.includes('class="mw-stage-room-title"'));
  assert.ok(js.includes("esc(room.title)"));
  assert.ok(js.includes("if(identity===activeRoom?.ownerId)"));
  assert.ok(css.includes('.live-guest-seat.is-host .live-guest-seat-meta'));
});

test('The host end-meeting control stays in the same shared toolbar', () => {
  assert.ok(js.includes('id="mw-power-off"'));
  assert.ok(!js.includes('mw-host-power-dock'));
  assert.ok(finalFit.includes('display:grid!important'));
  assert.ok(finalFit.includes('grid-template-columns:repeat(auto-fit,minmax(48px,1fr))!important'));
  assert.ok(finalFit.includes('overflow:visible!important'));
  assert.ok(!css.includes('.mw-host-power-dock{'));
});

test('All nine total seats fit and spotlight has a visible focus treatment', () => {
  assert.ok(js.includes('MEETWAVE_PARTICIPANT_LIMIT = MEETWAVE_GUEST_LIMIT + 1'));
  assert.ok(js.includes('Array.from({length:MEETWAVE_GUEST_LIMIT}'));
  assert.ok(finalFit.includes('#mw-grid[data-layout="spotlight"] .mw-video-tile.is-spotlight'));
  assert.ok(finalFit.includes('grid-column:auto!important'));
  assert.ok(finalFit.includes('grid-row:auto!important'));
  assert.ok(finalFit.includes('border:2px solid #72e0cb!important'));
  assert.ok(finalFit.includes('filter:brightness(1.1)'));
});

test('MeetWave layout choices display only their horizontal name labels', () => {
  for (const label of ['Full Screen','Fluid Panel','Fluid Grid','Fixed Grid','Fixed Panel','Side by Side','Spotlight','Roundtable 1','Roundtable 2']) {
    assert.ok(js.includes('>'+label+'</button>'), label+' is name-only');
  }
  assert.ok(!js.includes('8 guests ·'));
  assert.ok(!js.includes('mw-spotlight-tools'));
  assert.ok(css.includes('flex-direction:row!important'));
  assert.ok(css.includes('.mw-layout-options button small{display:none!important}'));
});
test('Public viewers request a guest seat and the host can approve or decline', () => {
  assert.ok(js.includes("endpoint(id)+'/guest-requests'"));
  assert.ok(js.includes('watchPendingGuestJoin(id)'));
  assert.ok(js.includes('function refreshGuestRequests()'));
  assert.ok(js.includes('data-guest-request-action'));
  assert.ok(server.includes('/guest-requests'));
  assert.ok(server.includes("request.status='accepted'"));
  assert.ok(server.includes("request.status='declined'"));
  assert.ok(server.includes('wait for the host to approve you before joining'));
  assert.ok(server.includes('db.meetWaveGuestRequests=(db.meetWaveGuestRequests||[]).filter'));
});
test('MeetWave host power glyph is centered and fits inside the red button', () => {
  assert.ok(css.includes('place-items:center!important'));
  assert.ok(css.includes('width:30px!important;height:30px!important'));
  assert.ok(css.includes('overflow:hidden!important'));
  assert.ok(css.includes('background:linear-gradient(155deg,#f24b62,#c92340)!important'));
});

test('All seven MeetWave screen presets and two guest-box arrangements keep all seats visible', () => {
  const layouts=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'];
  for(const layout of layouts){
    assert.ok(css.includes('#mw-grid[data-layout="'+layout+'"]'),layout+' has an explicit screen layout rule');
  }
  for(const layout of ['roundtable-1','roundtable-2']){
    assert.ok(css.includes('#mw-grid[data-guest-layout="'+layout+'"]'),layout+' has an explicit guest-box layout rule');
  }
  assert.ok(finalFit.includes('visibility:visible!important'));
  assert.ok(finalFit.includes('opacity:1!important'));
  assert.ok(finalFit.includes('overflow:visible!important'));
  assert.ok(finalFit.includes('grid-auto-rows:minmax(0,1fr)!important'));
  assert.ok(js.includes("Guest seat '+(index+1)"));
  assert.ok(js.includes('Array.from({length:MEETWAVE_GUEST_LIMIT}'));
});

test('MeetWave layout and participant panels do not introduce inner scrolling', () => {
  assert.ok(finalFit.includes('.mw-support-column>.mw-layout-panel'));
  assert.ok(finalFit.includes('overflow:visible!important'));
  assert.ok(finalFit.includes('max-height:none!important'));
  assert.ok(finalFit.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
});
test('MeetWave Full Screen shows Guest Seats 1–8 in the normal, non-expanded player', () => {
  const fit=css.slice(css.lastIndexOf('/* Full Screen normal-window fit:'));
  assert.ok(fit.includes(':not(.live-full-screen-active)'));
  assert.ok(fit.includes('height:min(66dvh,calc(100dvh - 210px),760px)!important'));
  assert.ok(fit.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'));
  for(let seat=1;seat<=8;seat++){
    assert.ok(fit.includes('.live-guest-seat[data-seat-index="'+seat+'"]'), 'Guest Seat '+seat+' has an explicit grid cell');
  }
  assert.ok(fit.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(fit.includes('grid-template-rows:22px minmax(0,1.08fr) repeat(3,minmax(0,.82fr))!important'));
});
