(() => {
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let activeRoom = null, roomClient = null, poller = null, lobbyPoller = null, lobbyRefreshBusy = false, screenOn = false, chatBusy = false, messageIds = new Set(), activeRole = 'participant', activeLayout = 'fluid-grid', meetingSettings = { mirrorSelf: true, showNames: true, videoFit: 'cover', echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const endpoint = id => '/meetwave/rooms/' + encodeURIComponent(id);
  const MEETING_LAYOUTS = { 'full-screen':'Full Screen', 'fluid-panel':'Fluid Panel', 'fluid-grid':'Fluid Grid', 'fixed-grid':'Fixed Grid', 'fixed-panel':'Fixed Panel', 'side-by-side':'Side by Side', spotlight:'Spotlight', 'roundtable-1':'Roundtable 1', 'roundtable-2':'Roundtable 2' };
  const note = (message, error=false) => { const target=$('#mw-status')||$('#mw-room-status'); if(target){target.textContent=message;target.classList.toggle('is-error',error);} };
  function setRoomControlState(id,active,caption,actionLabel){
    const button=$('#'+id);
    if(!button)return;
    button.classList.toggle('is-active',Boolean(active));
    button.setAttribute('aria-pressed',String(Boolean(active)));
    const label=button.querySelector('.live-control-caption');
    if(label&&caption)label.textContent=caption;
    if(actionLabel){button.setAttribute('aria-label',actionLabel);button.title=actionLabel;}
  }
  function toggleSupportPanel(name){
    const id=name==='people'?'mw-participants-panel':'mw-chat-panel';
    const panel=$('#'+id);
    if(!panel)return;
    panel.hidden=!panel.hidden;
    const button=$('#mw-'+name+'-toggle');
    if(button){button.setAttribute('aria-expanded',String(!panel.hidden));button.classList.toggle('is-active',!panel.hidden);}
  }
  function toggleMeetingLayout(){
    const panel=$('#mw-layout-picker');
    if(!panel)return;
    panel.hidden=!panel.hidden;
    const settings=$('#mw-settings-panel');
    if(settings)settings.hidden=true;
  }
  function applyMeetingLayout(layout){
    if(!Object.prototype.hasOwnProperty.call(MEETING_LAYOUTS,layout))return;
    activeLayout=layout;
    const grid=$('#mw-grid');
    if(grid)grid.dataset.layout=layout;
    document.querySelectorAll('[data-mw-layout]').forEach(button=>{
      const active=button.dataset.mwLayout===layout;
      button.classList.toggle('is-selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
    if(layout==='full-screen'&&!document.fullscreenElement)void toggleMeetingFullscreen();
    else if(layout!=='full-screen'&&document.fullscreenElement)void toggleMeetingFullscreen();
    note('MeetWave layout: '+MEETING_LAYOUTS[layout]+'. This changes only your local screen arrangement.');
  }
  function toggleMeetingSettings(){
    const panel=$('#mw-settings-panel');
    if(!panel)return;
    panel.hidden=!panel.hidden;
    const layouts=$('#mw-layout-picker');
    if(layouts)layouts.hidden=true;
    if(!panel.hidden)populateMeetingDevices();
    const button=$('#mw-settings');
    if(button){button.classList.toggle('is-active',!panel.hidden);button.setAttribute('aria-expanded',String(!panel.hidden));}
  }
  function audioCaptureOptions(){return {echoCancellation:meetingSettings.echoCancellation,noiseSuppression:meetingSettings.noiseSuppression,autoGainControl:meetingSettings.autoGainControl};}
  async function applyAudioProcessingSettings(){
    const participant=roomClient?.localParticipant;
    if(!participant?.isMicrophoneEnabled){note('Audio processing preferences saved for the next time your microphone is enabled.');return;}
    try{await participant.setMicrophoneEnabled(false);await participant.setMicrophoneEnabled(true,audioCaptureOptions());setRoomControlState('mw-mic',true,'Mute','Mute microphone');note('Microphone settings applied.');}
    catch(error){note('Could not apply microphone settings: '+error.message,true);}
  }
  function applyMeetingVisualSettings(){
    document.querySelectorAll('#mw-grid .mw-video-tile').forEach(tile=>{
      tile.classList.toggle('mw-names-hidden',!meetingSettings.showNames);
      const video=tile.querySelector('video');
      if(video){video.style.objectFit=meetingSettings.videoFit;video.style.transform=tile.id==='mw-local'&&meetingSettings.mirrorSelf?'scaleX(-1)':'';}
    });
  }
  async function populateMeetingDevices(){
    if(!navigator.mediaDevices?.enumerateDevices)return;
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      const definitions={'mw-audio-input':['audioinput','audioinput'],'mw-video-input':['videoinput','videoinput'],'mw-audio-output':['audiooutput','audiooutput']};
      Object.entries(definitions).forEach(([id,[kind,filter]])=>{
        const select=$('#'+id);if(!select)return;
        const previous=select.value;
        const list=devices.filter(device=>device.kind===filter);
        select.innerHTML='<option value="">System default</option>'+list.map((device,index)=>'<option value="'+esc(device.deviceId)+'">'+esc(device.label||('Device '+(index+1)))+'</option>').join('');
        const active=roomClient?.getActiveDevice?.(kind);
        if(active&&list.some(device=>device.deviceId===active))select.value=active;
        else if(previous&&list.some(device=>device.deviceId===previous))select.value=previous;
      });
    }catch(error){note('Device list unavailable: '+error.message,true);}
  }
  async function switchMeetingDevice(kind,deviceId){
    if(!roomClient)return;
    const selected=deviceId||'';
    try{
      if(kind==='audiooutput'){
        const elements=Array.from(document.querySelectorAll('#mw-audio audio'));
        if(!elements.length&&roomClient.switchActiveDevice)await roomClient.switchActiveDevice(kind,selected);
        else{if(elements.some(element=>typeof element.setSinkId!=='function'))throw new Error('This browser does not support choosing an audio output.');await Promise.all(elements.map(element=>element.setSinkId(selected)));}
      }else{if(typeof roomClient.switchActiveDevice!=='function')throw new Error('Device switching is not supported by this browser.');await roomClient.switchActiveDevice(kind,selected);}
      note(selected?'Meeting device updated.':'Returned to the system default device.');
    }catch(error){note(error.message,true);}
  }
  function lobbyMarkup(){
    return '<section class="mw-page"><header class="mw-hero"><div><span class="mw-eyebrow">MINGLORA MEETWAVE</span><h1>Make room for <em>real connection.</em></h1><p>Meet, collaborate, teach, study and connect — all inside Minglora.</p><div class="mw-hero-chips"><span>Live video &amp; audio</span><span>Screen sharing</span><span>Meeting chat</span><span>Up to 8 people</span></div></div><div class="mw-hero-orb"><div class="mw-orb-ring"></div><div class="mw-orb-core"><svg class="mw-brand-icon" viewBox="0 0 64 64" role="img" aria-label="MeetWave"><use href="/assets/icons/navigation-3d.svg?v=20261101-messenger-right-panel-2#meetwave"></use></svg></div></div></header><div class="mw-actions-grid"><button class="mw-action-card" data-new="instant"><b>▶ Start instant meeting</b><small>Create a room and meet now</small></button><button class="mw-action-card" data-new="scheduled"><b>▦ Schedule a meeting</b><small>Pick a time and invite people</small></button><button class="mw-action-card" data-new="personal"><b>⌂ Personal meeting room</b><small>Keep a reusable room link</small></button></div><section class="mw-join-panel"><div><span class="mw-eyebrow">ROOM CODE</span><h2>Join a meeting</h2></div><form id="mw-code-form" class="mw-join-form"><input id="mw-code" placeholder="MW-12AB34CD" required aria-label="Meeting code"><button class="mw-primary">Join</button></form></section><section class="mw-section"><div class="mw-section-heading"><h2>Rooms you can access</h2><p class="mw-section-note">Rooms and invitations update automatically.</p></div><div id="mw-rooms" class="mw-room-grid"><div class="mw-empty">Loading rooms…</div></div></section><section class="mw-section"><h2>Meeting invitations</h2><div id="mw-invites" class="mw-invite-list"><div class="mw-empty">Loading invitations…</div></div></section><p id="mw-status" class="mw-status">MeetWave uses Minglora accounts and meeting services.</p></section>';
  }
  function roomCard(room){
    const date=room.scheduledAt?new Date(room.scheduledAt).toLocaleString():'Ready now';
    const visibility=room.visibility==='private'?'Invite only':room.visibility;
    const presence=room.participantCountVerified?(room.status==='active'?room.participantCount+' in room':'Not started'):'Live count unavailable';
    return '<article class="mw-room-card"><div class="mw-room-card-top"><span class="mw-room-badge">'+esc(room.mode)+'</span><span class="mw-privacy">'+esc(visibility)+'</span></div><h3>'+esc(room.title)+'</h3><p>'+esc(room.description||'Minglora meeting room')+'</p><div class="mw-room-meta"><span>Host: '+esc(room.owner?.name||'Minglora member')+'</span><span>'+esc(date)+'</span><span>'+esc(presence)+'</span></div><div class="mw-room-code-row"><code>'+esc(room.id)+'</code><button class="mw-text-button" data-copy="'+esc(room.id)+'">Copy link</button></div><div class="mw-room-actions"><button class="mw-primary" data-join="'+esc(room.id)+'">'+(room.isHost?'Start meeting':'Join room')+'</button>'+(room.isHost?'<button class="mw-secondary" data-invite="'+esc(room.id)+'">Invite</button>':'')+'</div></article>';
  }
  async function refreshLobby({quiet=false}={}){
    if(lobbyRefreshBusy)return;
    const active=document.activeElement;
    if(quiet&&((active&&($('#mw-rooms')?.contains(active)||$('#mw-invites')?.contains(active)))||active?.id==='mw-code'))return;
    lobbyRefreshBusy=true;
    try{
    const [rooms,invitations,provider]=await Promise.all([api('/meetwave/rooms'),api('/meetwave/invitations'),api('/meetwave/status')]);
    $('#mw-rooms').innerHTML=rooms.rooms.length?rooms.rooms.map(roomCard).join(''):'<div class="mw-empty">No rooms yet. Create a MeetWave room to begin.</div>';
    $('#mw-invites').innerHTML=invitations.invitations.length?invitations.invitations.map(item=>'<article class="mw-invite-card"><b>'+esc(item.room.title)+'</b><span>'+esc(item.room.id)+'</span><button class="mw-primary" data-accept="'+esc(item.id)+'">Accept</button><button class="mw-secondary" data-decline="'+esc(item.id)+'">Decline</button></article>').join(''):'<div class="mw-empty">No pending invitations.</div>';
    if(!quiet)note(provider.configured&&provider.connected?'MeetWave is connected and ready.':provider.configured?'LiveKit is unreachable. Check the Minglora provider connection.':'MeetWave requires Minglora LiveKit credentials.',!provider.connected);
    document.querySelectorAll('[data-join]').forEach(button=>button.onclick=()=>joinRoom(button.dataset.join));
    document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=()=>copyInvite(button.dataset.copy));
    document.querySelectorAll('[data-invite]').forEach(button=>button.onclick=()=>inviteMembers(button.dataset.invite));
    document.querySelectorAll('[data-accept]').forEach(button=>button.onclick=()=>respondInvite(button.dataset.accept,'accept'));
    document.querySelectorAll('[data-decline]').forEach(button=>button.onclick=()=>respondInvite(button.dataset.decline,'decline'));
    }finally{lobbyRefreshBusy=false;}
  }
  async function respondInvite(id,action){try{await api('/meetwave/invitations/'+encodeURIComponent(id)+'/'+action,{method:'POST',body:'{}'});await refreshLobby();}catch(error){note(error.message,true);}}
  function bindLobby(){
    document.querySelectorAll('[data-new]').forEach(button=>button.onclick=()=>createRoom(button.dataset.new));
    $('#mw-code-form').onsubmit=event=>{event.preventDefault();joinRoom($('#mw-code').value.trim().toUpperCase());};
  }
  async function createRoom(mode){
    document.querySelector('.mw-modal-backdrop')?.remove();
    const scheduled=mode==='scheduled';
    const minimumDate=new Date(Date.now()+60_000);
    minimumDate.setMinutes(minimumDate.getMinutes()-minimumDate.getTimezoneOffset());
    const minimum=minimumDate.toISOString().slice(0,16);
    const title=mode==='personal'?'My personal room':'Minglora meeting';
    const heading=scheduled?'Schedule a meeting':mode==='personal'?'Set up your personal room':'Start an instant meeting';
    const modal=document.createElement('div');
    modal.className='mw-modal-backdrop';
    modal.innerHTML='<section class="mw-create-dialog" role="dialog" aria-modal="true" aria-labelledby="mw-create-title"><header><div><span class="mw-eyebrow">MEETWAVE SETUP</span><h2 id="mw-create-title">'+heading+'</h2></div><button type="button" class="mw-modal-close" aria-label="Close" data-close>×</button></header><form id="mw-create-form"><label>Meeting name<input name="title" minlength="2" maxlength="100" value="'+esc(title)+'" required autocomplete="off"></label><label>Description <span>(optional)</span><textarea name="description" maxlength="1000" rows="3" placeholder="What is this meeting about?"></textarea></label><label>Who can access this room<select name="visibility"><option value="private">Invite only</option><option value="friends">Friends</option><option value="public">Public</option></select></label>'+(scheduled?'<label>Meeting date and time<input type="datetime-local" name="scheduledAt" min="'+minimum+'" required><small>Participants can join 15 minutes before the scheduled start.</small></label>':'')+'<p class="mw-modal-error" id="mw-create-error" role="alert"></p><div class="mw-modal-actions"><button type="button" class="mw-secondary" data-close>Cancel</button><button type="submit" class="mw-primary" id="mw-create-submit">'+(scheduled?'Save meeting':mode==='personal'?'Save personal room':'Create meeting')+'</button></div></form></section>';
    document.body.append(modal);
    const close=()=>modal.remove();
    modal.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    const form=modal.querySelector('#mw-create-form');
    form.elements.title.focus();
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const formData=new FormData(form);
      const payload={title:String(formData.get('title')||'').trim(),description:String(formData.get('description')||'').trim(),mode,visibility:String(formData.get('visibility')||'private')};
      if(scheduled){
        const timestamp=Date.parse(String(formData.get('scheduledAt')||''));
        if(!Number.isFinite(timestamp)||timestamp<Date.now()+60_000){$('#mw-create-error').textContent='Choose a meeting time at least one minute in the future.';return;}
        payload.scheduledAt=new Date(timestamp).toISOString();
      }
      const submit=modal.querySelector('#mw-create-submit');
      submit.disabled=true;submit.textContent='Creating…';
      try{
        const result=await api('/meetwave/rooms',{method:'POST',body:JSON.stringify(payload)});
        close();await joinRoom(result.room.id);
      }catch(error){
        if(modal.isConnected){
          const message=modal.querySelector('#mw-create-error');
          if(message)message.textContent=error.message;
          submit.disabled=false;submit.textContent=scheduled?'Save meeting':mode==='personal'?'Save personal room':'Create meeting';
        }else{
          note(error.message,true);
          await refreshLobby().catch(()=>{});
          note(error.message,true);
        }
      }
    });
  }
  async function copyInvite(id){
    const url=location.origin+'/?meetwave='+encodeURIComponent(id);
    try{await navigator.clipboard.writeText('MeetWave room '+id+': '+url);note('Invite copied.');}catch{note('Room code: '+id);}
  }
  async function inviteMembers(id){
    const names=prompt('Minglora usernames, separated by commas:');if(!names)return;
    try{const result=await api(endpoint(id)+'/invitations',{method:'POST',body:JSON.stringify({usernames:names.split(',').map(x=>x.trim().replace(/^@/,''))})});note('Invitations sent: '+result.sent.length+'. Skipped: '+result.skipped+'.');}
    catch(error){note(error.message,true);}
  }
  function meetingMarkup(room,role){
    const host=role==='host';
    return '<section class="mw-meeting live-player-shell"><header class="mw-meeting-head live-player-header"><div><span class="mw-eyebrow">MINGLORA MEETWAVE · SECURE ROOM</span><h1>'+esc(room.title)+'</h1><small>Room '+esc(room.id)+' · '+(host?'Host':'Participant')+'</small></div><b id="mw-count" class="mw-meeting-count">Connecting…</b></header><div class="mw-meeting-layout live-player-layout"><section class="mw-stage-column live-video-column"><div id="mw-grid" class="mw-video-grid live-video-stage" data-layout="fluid-grid"><div class="mw-video-tile is-focused" id="mw-local" data-identity="'+esc(state.user.id)+'"><div class="mw-video-placeholder">'+esc(state.user.name)+'</div><span class="mw-name-tag">You</span></div></div><div id="mw-audio" class="mw-audio"></div><div class="mw-controls live-player-controls live-icon-controls" role="group" aria-label="MeetWave meeting controls"><button type="button" id="mw-mic" class="live-control-button is-active" aria-label="Mute microphone" title="Mute microphone" aria-pressed="true"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3M8 21h8"/></svg></span><small class="live-control-caption">Mute</small></button><button type="button" id="mw-camera" class="live-control-button is-active" aria-label="Turn camera off" title="Turn camera off" aria-pressed="true"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></span><small class="live-control-caption">Camera on</small></button><button type="button" id="mw-screen" class="live-control-button" aria-label="Share screen" title="Share screen" aria-pressed="false"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/></svg></span><small class="live-control-caption">Share</small></button><button type="button" id="mw-layout" class="live-control-button" aria-label="Switch to speaker view" title="Switch to speaker view" aria-pressed="false"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg></span><small class="live-control-caption">Layout</small></button><button type="button" id="mw-fullscreen" class="live-control-button" aria-label="Enter full screen" title="Enter full screen" aria-pressed="false"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg></span><small class="live-control-caption">Full</small></button><button type="button" id="mw-copy" class="live-control-button" aria-label="Copy meeting invite link" title="Copy meeting invite link"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.07 0l-2 2A5 5 0 0 0 12 20.07l1.15-1.15"/></svg></span><small class="live-control-caption">Copy link</small></button>'+(host?'<button type="button" id="mw-invite-members" class="live-control-button" aria-label="Invite members" title="Invite members"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6"/></svg></span><small class="live-control-caption">Invite</small></button>':'')+'<button type="button" id="mw-settings" class="live-control-button" aria-label="Open meeting settings" title="Open meeting settings" aria-expanded="false"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.7v-2.4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h2.4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.4 1z"/></svg></span><small class="live-control-caption">Settings</small></button><button type="button" id="mw-people-toggle" class="live-control-button" aria-label="Show meeting participants" title="Show meeting participants" aria-expanded="false"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/></svg></span><small class="live-control-caption">People</small></button><button type="button" id="mw-chat-toggle" class="live-control-button is-active" aria-label="Hide meeting chat" title="Hide meeting chat" aria-expanded="true"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg></span><small class="live-control-caption">Chat</small></button><button type="button" id="mw-leave" class="live-control-button is-danger" aria-label="Leave meeting" title="Leave meeting"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L7 10a16 16 0 0 0 6 6l1.8-1.9a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.7 2Z"/></svg></span><small class="live-control-caption">Leave</small></button>'+(host?'<button type="button" id="mw-end" class="live-control-button is-danger" aria-label="End meeting for everyone" title="End meeting for everyone"><span class="live-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></span><small class="live-control-caption">End room</small></button>':'')+'</div></section><aside id="mw-support-column" class="mw-support-column live-fullscreen-chat-slot" aria-label="MeetWave side panel"><div class="live-fullscreen-side-head"><strong>MEETWAVE PANEL</strong><nav class="live-fullscreen-side-tabs" aria-label="Switch MeetWave side panel"><button id="mw-panel-chat-tab" type="button" data-mw-tab="chat" class="active" aria-pressed="true">Chat</button><button id="mw-panel-people-tab" type="button" data-mw-tab="people" aria-pressed="false">People</button><button id="mw-panel-layouts-tab" type="button" data-mw-tab="layouts" aria-pressed="false">Layouts</button><button id="mw-panel-settings-tab" type="button" data-mw-tab="settings" aria-pressed="false">Settings</button></nav></div><section id="mw-participants-panel" class="mw-participants-panel" hidden><header><b>Participants</b><span id="mw-participant-count">1</span></header><div id="mw-participants" class="mw-participant-list"></div>'+(host?'<button type="button" id="mw-room-invite" class="mw-secondary mw-panel-invite">Invite members</button>':'')+'</section><section id="mw-chat-panel" class="mw-chat-panel"><b>Meeting chat</b><div id="mw-messages" class="mw-chat-messages"></div><form id="mw-chat-form" class="mw-chat-form"><input id="mw-chat-input" maxlength="1000" placeholder="Message…" required><button>Send</button></form></section><section id="mw-layout-picker" class="mw-tool-panel mw-layout-picker" hidden aria-label="Choose meeting layout"><header><b>MeetWave room layouts</b><button type="button" id="mw-layout-picker-close" aria-label="Close layouts">×</button></header><div class="mw-layout-options"><button type="button" data-mw-layout="full-screen" aria-pressed="false"><b>Full Screen</b><small>Expand the meeting view while keeping the room controls available</small></button><button type="button" data-mw-layout="fluid-panel" aria-pressed="false"><b>Fluid Panel</b><small>Flexible featured tile with a responsive attendee panel</small></button><button type="button" data-mw-layout="fluid-grid" aria-pressed="true"><b>Fluid Grid</b><small>Automatically fit every participant to the available space</small></button><button type="button" data-mw-layout="fixed-grid" aria-pressed="false"><b>Fixed Grid</b><small>Consistent equal-sized participant tiles</small></button><button type="button" data-mw-layout="fixed-panel" aria-pressed="false"><b>Fixed Panel</b><small>Featured participant with a stable thumbnail rail</small></button><button type="button" data-mw-layout="side-by-side" aria-pressed="false"><b>Side by Side</b><small>Two equal columns for balanced conversations</small></button><button type="button" data-mw-layout="spotlight" aria-pressed="false"><b>Spotlight</b><small>Emphasize the active speaker and keep others visible</small></button><button type="button" data-mw-layout="roundtable-1" aria-pressed="false"><b>Roundtable 1</b><small>Open roundtable seating for a collaborative discussion</small></button><button type="button" data-mw-layout="roundtable-2" aria-pressed="false"><b>Roundtable 2</b><small>Compact roundtable seating for larger groups</small></button></div></section><section id="mw-settings-panel" class="mw-tool-panel mw-settings-panel" hidden aria-label="MeetWave settings"><header><b>MeetWave settings</b><button type="button" id="mw-settings-close" aria-label="Close settings">×</button></header><div class="mw-settings-content"><section class="mw-settings-section"><h3>Audio devices</h3><label>Microphone<select id="mw-audio-input"><option value="">System default</option></select></label><label>Speaker / output<select id="mw-audio-output"><option value="">System default</option></select></label><label class="mw-setting-check"><input id="mw-echo-cancellation" type="checkbox" checked> Echo cancellation</label><label class="mw-setting-check"><input id="mw-noise-suppression" type="checkbox" checked> Noise suppression</label><label class="mw-setting-check"><input id="mw-auto-gain" type="checkbox" checked> Automatic microphone level</label></section><section class="mw-settings-section"><h3>Camera and appearance</h3><label>Camera<select id="mw-video-input"><option value="">System default</option></select></label><label>Video framing<select id="mw-video-fit"><option value="cover">Fill tile</option><option value="contain">Fit entire video</option></select></label><label class="mw-setting-check"><input id="mw-mirror-self" type="checkbox" checked> Mirror my camera preview</label><label class="mw-setting-check"><input id="mw-show-names" type="checkbox" checked> Show participant names</label></section><section class="mw-settings-section"><h3>Meeting information</h3><p><b>Room:</b> '+esc(room.title)+'</p><p><b>Room code:</b> <code>'+esc(room.id)+'</code></p><p><b>Your role:</b> '+(host?'Host':'Participant')+'</p><button type="button" class="mw-secondary" id="mw-settings-copy">Copy meeting invite</button></section></div></section></aside></div><p id="mw-room-status" class="mw-status">Connecting to meeting…</p></section>';
  }
  function updateCount(){
    if(!roomClient)return;
    const count=1+roomClient.remoteParticipants.size;
    $('#mw-count').textContent=count+' / 8 participants';
    renderParticipants();
  }
  function renderParticipants(){
    if(!roomClient||!$('#mw-participants'))return;
    const people=[{identity:state.user.id,name:state.user.name,isLocal:true},...Array.from(roomClient.remoteParticipants.values()).map(participant=>({identity:participant.identity,name:participant.name||participant.identity,isLocal:false}))];
    $('#mw-participant-count').textContent=String(people.length);
    $('#mw-participants').innerHTML=people.map(person=>'<div class="mw-participant-item"><span class="mw-participant-avatar">'+esc((person.name||'?').trim().charAt(0).toUpperCase())+'</span><span class="mw-participant-name"><b>'+esc(person.name)+'</b><small>'+(person.isLocal?(activeRole==='host'?'You · Host':'You · Participant'):(activeRoom?.ownerId===person.identity?'Host':'In meeting'))+'</small></span>'+(activeRole==='host'&&!person.isLocal?'<button type="button" class="mw-remove-person" data-remove-participant="'+esc(person.identity)+'" aria-label="Remove '+esc(person.name)+'">Remove</button>':'')+'</div>').join('');
    document.querySelectorAll('[data-remove-participant]').forEach(button=>button.onclick=()=>removeParticipant(button.dataset.removeParticipant));
  }
  async function removeParticipant(identity){
    if(!activeRoom||activeRole!=='host'||!identity||identity===state.user.id)return;
    try{
      await api(endpoint(activeRoom.id)+'/participants/'+encodeURIComponent(identity)+'/remove',{method:'POST',body:'{}'});
      note('Participant removed from this meeting.');
    }catch(error){note(error.message,true);}
  }
  function setSpeakerFocus(speakers=[]){
    const identity=speakers[0]?.identity||state.user.id;
    const shared=activeLayout==='presentation'?$('#mw-grid .mw-video-tile[data-source="screen-share"]'):null;
    document.querySelectorAll('#mw-grid .mw-video-tile').forEach(tile=>tile.classList.toggle('is-focused',shared?tile===shared:tile.dataset.identity===identity));
  }
  async function toggleMeetingFullscreen(){
    const meeting=$('.mw-meeting');
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(meeting?.requestFullscreen)await meeting.requestFullscreen();
      else note('Full-screen mode is not supported by this browser.',true);
      const active=Boolean(document.fullscreenElement);
      setRoomControlState('mw-fullscreen',active,active?'Exit full':'Full',active?'Exit full screen':'Enter full screen');
    }catch(error){note(error.message,true);}
  }
  document.addEventListener('fullscreenchange',()=>{
    const active=Boolean(document.fullscreenElement&&document.fullscreenElement.querySelector?.('#mw-grid'));
    document.querySelector('.mw-meeting')?.classList.toggle('live-full-screen-active',active);
    setRoomControlState('mw-fullscreen',active,active?'Exit full':'Full',active?'Exit full screen':'Enter full screen');
  });
  function addTile(participant,source='camera'){
    const identity=participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_');
    const id='mw-tile-'+identity+(source==='screen-share'?'-screen':'');let element=$('#'+CSS.escape(id));
    if(!element){element=document.createElement('div');element.id=id;element.dataset.identity=participant.identity;element.dataset.source=source;element.className='mw-video-tile';element.innerHTML='<div class="mw-video-placeholder">'+esc(participant.name||participant.identity)+(source==='screen-share'?' · Screen':'')+'</div><span class="mw-name-tag">'+esc(participant.name||participant.identity)+(source==='screen-share'?' · Screen':'')+'</span>';$('#mw-grid').append(element);}
    return element;
  }
  function attachTrack(track,participant){
    if(track.kind==='audio'){const audio=track.attach();audio.autoplay=true;const output=$('#mw-audio-output')?.value;if(output&&typeof audio.setSinkId==='function')audio.setSinkId(output).catch(()=>{});$('#mw-audio').append(audio);return;}
    const source=String(track.source||'').toLowerCase().includes('screen')?'screen-share':'camera';
    const tile=addTile(participant,source),video=track.attach();video.autoplay=true;video.playsInline=true;video.dataset.mwTrackSource=source;
    tile.querySelector('.mw-video-placeholder')?.remove();tile.querySelector('video[data-mw-track-source="'+source+'"]')?.remove();tile.prepend(video);applyMeetingVisualSettings();
  }
  async function refreshChat(){
    if(!activeRoom||chatBusy)return;chatBusy=true;
    try{const result=await api(endpoint(activeRoom.id)+'/messages');if(result.messages.some(message=>!messageIds.has(message.id))){result.messages.forEach(message=>messageIds.add(message.id));$('#mw-messages').innerHTML=result.messages.map(message=>'<p class="mw-chat-message"><b>'+esc(message.author?.name||'Member')+'</b> '+esc(message.text)+'</p>').join('');$('#mw-messages').scrollTop=$('#mw-messages').scrollHeight;}}
    catch{}finally{chatBusy=false;}
  }
  async function joinRoom(id){
    const client=window.LivekitClient;
    if(!client?.Room)throw new Error('MeetWave media client failed to load. Check your connection and try again.');
    const info=await api(endpoint(id));
    const result=await api(endpoint(id)+'/join',{method:'POST',body:'{}'});
    activeRoom=info.room;activeRole=result.role||'participant';activeLayout='fluid-grid';setContent(meetingMarkup(activeRoom,activeRole));messageIds=new Set();screenOn=false;
    roomClient=new client.Room({adaptiveStream:true,dynacast:true});
    roomClient.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>{attachTrack(track,participant);updateCount();});
    roomClient.on(client.RoomEvent.TrackUnsubscribed,(track,publication,participant)=>{track.detach().forEach(element=>element.remove());if(track.kind==='video'&&participant){const identity=participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_');const source=String(track.source||'').toLowerCase().includes('screen')?'screen-share':'camera';const tile=$('#mw-tile-'+identity+(source==='screen-share'?'-screen':''));if(tile&&!tile.querySelector('video'))tile.remove();if(source==='screen-share'&&activeLayout==='presentation')setSpeakerFocus([]);}});
    roomClient.on(client.RoomEvent.ParticipantConnected,()=>updateCount());
    roomClient.on(client.RoomEvent.ParticipantDisconnected,participant=>{$('#mw-tile-'+participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_'))?.remove();$('#mw-tile-'+participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_')+'-screen')?.remove();updateCount();});
    if(client.RoomEvent.ActiveSpeakersChanged)roomClient.on(client.RoomEvent.ActiveSpeakersChanged,speakers=>setSpeakerFocus(speakers));
    if(client.RoomEvent.Disconnected)roomClient.on(client.RoomEvent.Disconnected,async()=>{
      if(!activeRoom)return;
      activeRoom=null;
      if(poller){clearInterval(poller);poller=null;}
      roomClient=null;
      state.view='meetwave';
      await render();
      note('Your meeting connection ended. Rejoin from the room list or accept a new host invitation.',true);
    });
    try{await roomClient.connect(result.liveKit.url,result.liveKit.token);}
    catch(error){await disconnect();activeRoom=null;await api(endpoint(id)+'/leave',{method:'POST',body:'{}'}).catch(()=>{});throw error;}
    try{
      await roomClient.localParticipant.enableCameraAndMicrophone();
      for(const publication of roomClient.localParticipant.trackPublications.values()){
        if(publication.track&&publication.track.kind==='video'){
          const tile=$('#mw-local'),video=publication.track.attach();video.autoplay=true;video.playsInline=true;
          tile.querySelector('.mw-video-placeholder')?.remove();tile.prepend(video);
        }
      }
    }catch(error){note('Joined, but camera/microphone permission was not granted. Chat and listening remain available.',true);}
    for(const participant of roomClient.remoteParticipants.values()){
      for(const publication of participant.trackPublications.values())if(publication.track)attachTrack(publication.track,participant);
    }
    updateCount();setSpeakerFocus([]);applyMeetingLayout(activeLayout);applyMeetingVisualSettings();
    const localParticipant=roomClient.localParticipant;
    setRoomControlState('mw-mic',Boolean(localParticipant.isMicrophoneEnabled),localParticipant.isMicrophoneEnabled?'Mute':'Unmute',localParticipant.isMicrophoneEnabled?'Mute microphone':'Unmute microphone');
    setRoomControlState('mw-camera',Boolean(localParticipant.isCameraEnabled),localParticipant.isCameraEnabled?'Camera on':'Camera off',localParticipant.isCameraEnabled?'Turn camera off':'Turn camera on');
    setRoomControlState('mw-screen',screenOn,'Share','Share screen');
    $('#mw-mic').onclick=async()=>{try{const enabled=!roomClient.localParticipant.isMicrophoneEnabled;await roomClient.localParticipant.setMicrophoneEnabled(enabled,enabled?audioCaptureOptions():undefined);setRoomControlState('mw-mic',enabled,enabled?'Mute':'Unmute',enabled?'Mute microphone':'Unmute microphone');}catch(error){note(error.message,true);}};
    $('#mw-camera').onclick=async()=>{try{const enabled=!roomClient.localParticipant.isCameraEnabled;const publication=await roomClient.localParticipant.setCameraEnabled(enabled);setRoomControlState('mw-camera',enabled,enabled?'Camera on':'Camera off',enabled?'Turn camera off':'Turn camera on');const tile=$('#mw-local');tile.querySelector('video')?.remove();if(enabled){const track=publication?.track||Array.from(roomClient.localParticipant.trackPublications.values()).find(item=>item.track?.kind==='video')?.track;if(track){const video=track.attach();video.autoplay=true;video.playsInline=true;tile.querySelector('.mw-video-placeholder')?.remove();tile.prepend(video);}}else if(!tile.querySelector('.mw-video-placeholder')){const placeholder=document.createElement('div');placeholder.className='mw-video-placeholder';placeholder.textContent='Camera off';tile.prepend(placeholder);}}catch(error){note(error.message,true);}};
    $('#mw-screen').onclick=async()=>{const next=!screenOn;try{const publication=await roomClient.localParticipant.setScreenShareEnabled(next);screenOn=next;if(next&&publication?.track)attachTrack(publication.track,roomClient.localParticipant);if(!next)$('#mw-tile-'+state.user.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'-screen')?.remove();setRoomControlState('mw-screen',screenOn,screenOn?'Stop share':'Share',screenOn?'Stop screen sharing':'Share screen');}catch(error){note(error.message,true);}};
    const setMeetWaveSideTab=name=>{
      const panels={chat:$('#mw-chat-panel'),people:$('#mw-participants-panel'),layouts:$('#mw-layout-picker'),settings:$('#mw-settings-panel')};
      Object.entries(panels).forEach(([key,panel])=>{if(panel)panel.hidden=key!==name;});
      [['chat','#mw-panel-chat-tab'],['people','#mw-panel-people-tab'],['layouts','#mw-panel-layouts-tab'],['settings','#mw-panel-settings-tab']].forEach(([key,selector])=>{const button=$(selector);if(button){button.classList.toggle('active',key===name);button.setAttribute('aria-pressed',String(key===name));}});
      if(name==='settings')populateMeetingDevices();
      const toolbarState={chat:'mw-chat-toggle',people:'mw-people-toggle',layouts:'mw-layout',settings:'mw-settings'};
      Object.entries(toolbarState).forEach(([key,id])=>{const button=$('#'+id);if(button){const active=key===name;button.classList.toggle('is-active',active);button.setAttribute('aria-expanded',String(active));}});
    };
    $('#mw-layout').onclick=()=>setMeetWaveSideTab('layouts');
    $('#mw-fullscreen').onclick=toggleMeetingFullscreen;
    $('#mw-settings').onclick=()=>setMeetWaveSideTab('settings');
    $('#mw-layout-picker-close').onclick=()=>setMeetWaveSideTab('chat');
    $('#mw-settings-close').onclick=()=>setMeetWaveSideTab('chat');
    document.querySelectorAll('[data-mw-layout]').forEach(button=>button.onclick=()=>applyMeetingLayout(button.dataset.mwLayout));
    $('#mw-people-toggle').onclick=()=>setMeetWaveSideTab('people');
    $('#mw-chat-toggle').onclick=()=>setMeetWaveSideTab('chat');
    $('#mw-panel-chat-tab').onclick=()=>setMeetWaveSideTab('chat');
    $('#mw-panel-people-tab').onclick=()=>setMeetWaveSideTab('people');
    $('#mw-panel-layouts-tab').onclick=()=>setMeetWaveSideTab('layouts');
    $('#mw-panel-settings-tab').onclick=()=>setMeetWaveSideTab('settings');

    $('#mw-audio-input').onchange=event=>switchMeetingDevice('audioinput',event.target.value);
    $('#mw-video-input').onchange=event=>switchMeetingDevice('videoinput',event.target.value);
    $('#mw-audio-output').onchange=event=>switchMeetingDevice('audiooutput',event.target.value);
    $('#mw-video-fit').onchange=event=>{meetingSettings.videoFit=event.target.value==='contain'?'contain':'cover';applyMeetingVisualSettings();};
    $('#mw-mirror-self').onchange=event=>{meetingSettings.mirrorSelf=event.target.checked;applyMeetingVisualSettings();};
    $('#mw-show-names').onchange=event=>{meetingSettings.showNames=event.target.checked;applyMeetingVisualSettings();};
    $('#mw-echo-cancellation').onchange=async event=>{meetingSettings.echoCancellation=event.target.checked;await applyAudioProcessingSettings();};
    $('#mw-noise-suppression').onchange=async event=>{meetingSettings.noiseSuppression=event.target.checked;await applyAudioProcessingSettings();};
    $('#mw-auto-gain').onchange=async event=>{meetingSettings.autoGainControl=event.target.checked;await applyAudioProcessingSettings();};
    $('#mw-settings-copy').onclick=()=>copyInvite(activeRoom.id);
    await populateMeetingDevices();
    $('#mw-room-invite')?.addEventListener('click',()=>inviteMembers(activeRoom.id));
    $('#mw-invite-members')?.addEventListener('click',()=>inviteMembers(activeRoom.id));
    $('#mw-copy').onclick=()=>copyInvite(activeRoom.id);
    $('#mw-leave').onclick=()=>leaveRoom(false);
    $('#mw-end')?.addEventListener('click',()=>leaveRoom(true));
    $('#mw-chat-form').onsubmit=async event=>{event.preventDefault();const input=$('#mw-chat-input');try{await api(endpoint(activeRoom.id)+'/messages',{method:'POST',body:JSON.stringify({text:input.value})});input.value='';await refreshChat();}catch(error){note(error.message,true);}};
    await refreshChat();poller=setInterval(refreshChat,3500);
  }
  async function disconnect(){if(poller){clearInterval(poller);poller=null;}if(roomClient){try{for(const publication of roomClient.localParticipant.trackPublications.values())publication.track?.stop();await roomClient.disconnect();}catch{}}roomClient=null;}
  async function leaveRoom(end){
    if(!activeRoom)return;const room=activeRoom;activeRoom=null;await disconnect();
    try{
      if(end)await api(endpoint(room.id),{method:'DELETE',body:'{}'});
      else await api(endpoint(room.id)+'/leave',{method:'POST',body:'{}'});
    }catch(error){note('You left the meeting, but Minglora could not confirm the room update: '+error.message,true);}
    state.view='meetwave';await render();
  }
  async function render(){
    if(activeRoom)return;
    if(lobbyPoller)window.clearInterval(lobbyPoller);
    lobbyPoller=null;
    setContent(lobbyMarkup());bindLobby();
    try{await refreshLobby();}catch(error){note(error.message,true);}
    if(!activeRoom)lobbyPoller=window.setInterval(()=>{
      if(state.view==='meetwave'&&!activeRoom)void refreshLobby({quiet:true}).catch(error=>console.warn('[Minglora MeetWave] Automatic lobby sync failed:',error?.message||error));
    },20000);
    const roomId=new URLSearchParams(location.search).get('meetwave');
    if(roomId){history.replaceState(null,'',location.pathname+location.hash);try{await joinRoom(roomId);}catch(error){note(error.message,true);}}
  }
  async function onNavigateAway(){
    if(lobbyPoller)window.clearInterval(lobbyPoller);
    lobbyPoller=null;
    if(!activeRoom)return;const room=activeRoom;activeRoom=null;await disconnect();
    await api(endpoint(room.id)+'/leave',{method:'POST',body:'{}'}).catch(()=>{});
  }
  window.MingloraMeetWave={render,onNavigateAway};
})();