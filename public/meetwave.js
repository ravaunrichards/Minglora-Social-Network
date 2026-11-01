(() => {
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let activeRoom = null, roomClient = null, poller = null, screenOn = false, chatBusy = false, messageIds = new Set();
  const endpoint = id => '/meetwave/rooms/' + encodeURIComponent(id);
  const note = (message, error=false) => { const target=$('#mw-status')||$('#mw-room-status'); if(target){target.textContent=message;target.classList.toggle('is-error',error);} };
  function lobbyMarkup(){
    return '<section class="mw-page"><header class="mw-hero"><div><span class="mw-eyebrow">MINGLORA MEETWAVE</span><h1>Make room for <em>real connection.</em></h1><p>Meet, collaborate, teach, study and connect — all inside Minglora.</p><div class="mw-hero-chips"><span>Live video &amp; audio</span><span>Screen sharing</span><span>Meeting chat</span><span>Up to 8 people</span></div></div><div class="mw-hero-orb"><div class="mw-orb-ring"></div><div class="mw-orb-core">MW</div></div></header><div class="mw-actions-grid"><button class="mw-action-card" data-new="instant"><b>▶ Start instant meeting</b><small>Create a room and meet now</small></button><button class="mw-action-card" data-new="scheduled"><b>▦ Schedule a meeting</b><small>Pick a time and invite people</small></button><button class="mw-action-card" data-new="personal"><b>⌂ Personal meeting room</b><small>Keep a reusable room link</small></button></div><section class="mw-join-panel"><div><span class="mw-eyebrow">ROOM CODE</span><h2>Join a meeting</h2></div><form id="mw-code-form" class="mw-join-form"><input id="mw-code" placeholder="MW-12AB34CD" required aria-label="Meeting code"><button class="mw-primary">Join</button></form></section><section class="mw-section"><div class="mw-section-heading"><h2>Rooms you can access</h2><button id="mw-refresh" class="mw-secondary">Refresh</button></div><div id="mw-rooms" class="mw-room-grid"><div class="mw-empty">Loading rooms…</div></div></section><section class="mw-section"><h2>Meeting invitations</h2><div id="mw-invites" class="mw-invite-list"><div class="mw-empty">Loading invitations…</div></div></section><p id="mw-status" class="mw-status">MeetWave uses Minglora accounts and meeting services.</p></section>';
  }
  function roomCard(room){
    const date=room.scheduledAt?new Date(room.scheduledAt).toLocaleString():'Ready now';
    const visibility=room.visibility==='private'?'Invite only':room.visibility;
    const presence=room.participantCountVerified?(room.status==='active'?room.participantCount+' in room':'Not started'):'Live count unavailable';
    return '<article class="mw-room-card"><div class="mw-room-card-top"><span class="mw-room-badge">'+esc(room.mode)+'</span><span class="mw-privacy">'+esc(visibility)+'</span></div><h3>'+esc(room.title)+'</h3><p>'+esc(room.description||'Minglora meeting room')+'</p><div class="mw-room-meta"><span>Host: '+esc(room.owner?.name||'Minglora member')+'</span><span>'+esc(date)+'</span><span>'+esc(presence)+'</span></div><div class="mw-room-code-row"><code>'+esc(room.id)+'</code><button class="mw-text-button" data-copy="'+esc(room.id)+'">Copy link</button></div><div class="mw-room-actions"><button class="mw-primary" data-join="'+esc(room.id)+'">'+(room.isHost?'Start meeting':'Join room')+'</button>'+(room.isHost?'<button class="mw-secondary" data-invite="'+esc(room.id)+'">Invite</button>':'')+'</div></article>';
  }
  async function refreshLobby(){
    const [rooms,invitations,provider]=await Promise.all([api('/meetwave/rooms'),api('/meetwave/invitations'),api('/meetwave/status')]);
    $('#mw-rooms').innerHTML=rooms.rooms.length?rooms.rooms.map(roomCard).join(''):'<div class="mw-empty">No rooms yet. Create a MeetWave room to begin.</div>';
    $('#mw-invites').innerHTML=invitations.invitations.length?invitations.invitations.map(item=>'<article class="mw-invite-card"><b>'+esc(item.room.title)+'</b><span>'+esc(item.room.id)+'</span><button class="mw-primary" data-accept="'+esc(item.id)+'">Accept</button><button class="mw-secondary" data-decline="'+esc(item.id)+'">Decline</button></article>').join(''):'<div class="mw-empty">No pending invitations.</div>';
    note(provider.configured&&provider.connected?'MeetWave is connected and ready.':provider.configured?'LiveKit is unreachable. Check the Minglora provider connection.':'MeetWave requires Minglora LiveKit credentials.',!provider.connected);
    document.querySelectorAll('[data-join]').forEach(button=>button.onclick=()=>joinRoom(button.dataset.join));
    document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=()=>copyInvite(button.dataset.copy));
    document.querySelectorAll('[data-invite]').forEach(button=>button.onclick=()=>inviteMembers(button.dataset.invite));
    document.querySelectorAll('[data-accept]').forEach(button=>button.onclick=()=>respondInvite(button.dataset.accept,'accept'));
    document.querySelectorAll('[data-decline]').forEach(button=>button.onclick=()=>respondInvite(button.dataset.decline,'decline'));
  }
  async function respondInvite(id,action){try{await api('/meetwave/invitations/'+encodeURIComponent(id)+'/'+action,{method:'POST',body:'{}'});await refreshLobby();}catch(error){note(error.message,true);}}
  function bindLobby(){
    document.querySelectorAll('[data-new]').forEach(button=>button.onclick=()=>createRoom(button.dataset.new));
    $('#mw-refresh').onclick=()=>refreshLobby().catch(error=>note(error.message,true));
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
    return '<section class="mw-meeting"><header class="mw-meeting-head"><div><span class="mw-eyebrow">MEETWAVE ROOM</span><h1>'+esc(room.title)+'</h1><small>Room '+esc(room.id)+'</small></div><b id="mw-count">Connecting…</b></header><div class="mw-meeting-layout"><section class="mw-stage-column"><div id="mw-grid" class="mw-video-grid"><div class="mw-video-tile" id="mw-local"><div class="mw-video-placeholder">'+esc(state.user.name)+'</div><span class="mw-name-tag">You</span></div></div><div class="mw-controls"><button id="mw-mic">🎙<small>Mute</small></button><button id="mw-camera">▣<small>Camera</small></button><button id="mw-screen">▤<small>Share screen</small></button><button id="mw-copy">↗<small>Invite</small></button><button id="mw-leave" class="mw-leave">☎<small>Leave</small></button>'+(role==='host'?'<button id="mw-end" class="mw-end">■<small>End room</small></button>':'')+'</div><div id="mw-audio"></div></section><aside class="mw-chat-panel"><b>Meeting chat</b><div id="mw-messages" class="mw-chat-messages"></div><form id="mw-chat-form" class="mw-chat-form"><input id="mw-chat-input" maxlength="1000" placeholder="Message…" required><button>Send</button></form></aside></div><p id="mw-room-status" class="mw-status">Connecting to meeting…</p></section>';
  }
  function updateCount(){if(roomClient)$('#mw-count').textContent=(1+roomClient.remoteParticipants.size)+' / 8 participants';}
  function addTile(participant){
    const id='mw-tile-'+participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_');let element=$('#'+CSS.escape(id));
    if(!element){element=document.createElement('div');element.id=id;element.className='mw-video-tile';element.innerHTML='<div class="mw-video-placeholder">'+esc(participant.name||participant.identity)+'</div><span class="mw-name-tag">'+esc(participant.name||participant.identity)+'</span>';$('#mw-grid').append(element);}
    return element;
  }
  function attachTrack(track,participant){
    if(track.kind==='audio'){const audio=track.attach();audio.autoplay=true;$('#mw-audio').append(audio);return;}
    const tile=addTile(participant),video=track.attach();video.autoplay=true;video.playsInline=true;tile.querySelector('.mw-video-placeholder')?.remove();tile.querySelector('video')?.remove();tile.prepend(video);
  }
  async function refreshChat(){
    if(!activeRoom||chatBusy)return;chatBusy=true;
    try{const result=await api(endpoint(activeRoom.id)+'/messages');if(result.messages.some(message=>!messageIds.has(message.id))){result.messages.forEach(message=>messageIds.add(message.id));$('#mw-messages').innerHTML=result.messages.map(message=>'<p class="mw-chat-message"><b>'+esc(message.author?.name||'Member')+'</b> '+esc(message.text)+'</p>').join('');$('#mw-messages').scrollTop=$('#mw-messages').scrollHeight;}}
    catch{}finally{chatBusy=false;}
  }
  async function joinRoom(id){
    const client=window.LivekitClient;
    if(!client?.Room)throw new Error('MeetWave media client failed to load. Refresh Minglora before joining.');
    const info=await api(endpoint(id));
    const result=await api(endpoint(id)+'/join',{method:'POST',body:'{}'});
    activeRoom=info.room;setContent(meetingMarkup(activeRoom,result.role));messageIds=new Set();screenOn=false;
    roomClient=new client.Room({adaptiveStream:true,dynacast:true});
    roomClient.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>{attachTrack(track,participant);updateCount();});
    roomClient.on(client.RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(element=>element.remove()));
    roomClient.on(client.RoomEvent.ParticipantConnected,updateCount);
    roomClient.on(client.RoomEvent.ParticipantDisconnected,participant=>{$('#mw-tile-'+participant.identity.replace(/[^a-zA-Z0-9_-]/g,'_'))?.remove();updateCount();});
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
    updateCount();
    $('#mw-mic').onclick=()=>roomClient.localParticipant.setMicrophoneEnabled(!roomClient.localParticipant.isMicrophoneEnabled);
    $('#mw-camera').onclick=()=>roomClient.localParticipant.setCameraEnabled(!roomClient.localParticipant.isCameraEnabled);
    $('#mw-screen').onclick=()=>{screenOn=!screenOn;roomClient.localParticipant.setScreenShareEnabled(screenOn).catch(error=>{screenOn=false;note(error.message,true);});};
    $('#mw-copy').onclick=()=>copyInvite(activeRoom.id);$('#mw-leave').onclick=()=>leaveRoom(false);$('#mw-end')?.addEventListener('click',()=>leaveRoom(true));
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
    if(activeRoom)return;setContent(lobbyMarkup());bindLobby();
    try{await refreshLobby();}catch(error){note(error.message,true);}
    const roomId=new URLSearchParams(location.search).get('meetwave');
    if(roomId){history.replaceState(null,'',location.pathname+location.hash);try{await joinRoom(roomId);}catch(error){note(error.message,true);}}
  }
  async function onNavigateAway(){
    if(!activeRoom)return;const room=activeRoom;activeRoom=null;await disconnect();
    await api(endpoint(room.id)+'/leave',{method:'POST',body:'{}'}).catch(()=>{});
  }
  window.MingloraMeetWave={render,onNavigateAway};
})();