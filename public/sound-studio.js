(() => {
  'use strict';

  const VOICE_SOUNDS = [
    ['voice-minglora-signature','Minglora Signature','Premium','crystal'],
    ['voice-classic-telephone','Classic Telephone','Classic Mobile','bell'],
    ['voice-polyphonic-classic','Classic Polyphonic','Classic Mobile','digital'],
    ['voice-retro-motorola','Retro Mobile Pulse','Classic Mobile','organ'],
    ['voice-premium-piano','Premium Piano','Premium','piano'],
    ['voice-chromatic-bells','Chromatic Bells','Premium','bell'],
    ['voice-digital-pulse','Digital Pulse','Digital','digital'],
    ['voice-orchestral-rise','Orchestral Rise','Cinematic','orchestra'],
    ['voice-electric-wave','Electric Wave','Digital','synth'],
    ['voice-steelpan-island','Island Steelpan','Caribbean','steelpan'],
    ['voice-mento-sunrise','Mento Sunrise','Caribbean','marimba'],
    ['voice-tropical-drum','Tropical Celebration','Caribbean','percussion'],
    ['voice-ocean-breeze','Ocean Breeze','Nature','soft'],
    ['voice-forest-birds','Forest Morning','Nature','bird'],
    ['voice-celestial','Celestial Chimes','Premium','crystal'],
    ['voice-luxury-velvet','Velvet Lounge','Premium','piano'],
    ['voice-symphonic','Symphonic Call','Cinematic','orchestra'],
    ['voice-deep-bell','Deep Resonance','Powerful','bell'],
    ['voice-arcade-8bit','Arcade 8-Bit','Gaming','arcade'],
    ['voice-future-grid','Future Grid','Digital','synth'],
    ['voice-analog-pulse','Analog Pulse','Digital','organ'],
    ['voice-marimba','Warm Marimba','Caribbean','marimba'],
    ['voice-glass-chime','Glass Chime','Premium','crystal'],
    ['voice-minimal-two-tone','Minimal Two-Tone','Minimal','soft'],
    ['voice-bold-horn','Bold Brass','Powerful','brass'],
    ['voice-soft-rain','Soft Rainfall','Nature','soft'],
    ['voice-sunrise-piano','Sunrise Piano','Premium','piano'],
    ['voice-copper-bell','Copper Bell','Classic Mobile','bell'],
    ['voice-neon-call','Neon Call','Gaming','arcade'],
    ['voice-night-sky','Night Sky','Nature','celeste']
  ];

  const VIDEO_SOUNDS = [
    ['video-minglora-vision','Minglora Vision','Premium','celeste'],
    ['video-cinematic-rise','Cinematic Rise','Cinematic','orchestra'],
    ['video-premium-piano','Premium Piano Arrival','Premium','piano'],
    ['video-digital-orbit','Digital Orbit','Digital','synth'],
    ['video-neon-signal','Neon Signal','Gaming','arcade'],
    ['video-glass-spark','Glass Spark','Premium','crystal'],
    ['video-orchestral-call','Orchestral Welcome','Cinematic','orchestra'],
    ['video-ambient-celeste','Ambient Celeste','Nature','celeste'],
    ['video-retro-polyphonic','Retro Polyphonic','Classic Mobile','digital'],
    ['video-arcade-connect','Arcade Connect','Gaming','arcade'],
    ['video-steelpan-greeting','Steelpan Greeting','Caribbean','steelpan'],
    ['video-island-breeze','Island Breeze','Caribbean','marimba'],
    ['video-tropical-sun','Tropical Sun','Caribbean','percussion'],
    ['video-marimba-wave','Marimba Wave','Caribbean','marimba'],
    ['video-deep-space','Deep Space','Digital','synth'],
    ['video-future-vision','Future Vision','Digital','digital'],
    ['video-crystal-bell','Crystal Bell','Premium','crystal'],
    ['video-soft-piano','Soft Piano','Premium','piano'],
    ['video-bold-entry','Bold Entry','Powerful','brass'],
    ['video-elegant-chime','Elegant Chime','Premium','bell'],
    ['video-synth-horizon','Synth Horizon','Digital','synth'],
    ['video-midnight-pulse','Midnight Pulse','Digital','organ'],
    ['video-golden-hour','Golden Hour','Nature','celeste'],
    ['video-ocean-light','Ocean Light','Nature','soft'],
    ['video-forest-dawn','Forest Dawn','Nature','bird'],
    ['video-velvet-orchestra','Velvet Orchestra','Cinematic','orchestra'],
    ['video-minimal-chime','Minimal Chime','Minimal','soft'],
    ['video-silver-bells','Silver Bells','Classic Mobile','bell'],
    ['video-electric-sunrise','Electric Sunrise','Gaming','arcade'],
    ['video-studio-signal','Studio Signal','Digital','digital']
  ];

  const EVENT_ROWS = [
    ['message','New direct message','Messenger','A new one-to-one message'],
    ['groupMessage','Group message','Messenger','A new group conversation message'],
    ['messageRequest','Message request','Messenger','A new message request'],
    ['voiceMessage','Voice message received','Messenger','A new voice note'],
    ['messageReply','Message reply','Messenger','A reply in a conversation'],
    ['messageReaction','Message reaction','Messenger','A reaction to your message'],
    ['missedVoiceCall','Missed voice call','Messenger','A missed audio call'],
    ['missedVideoCall','Missed video call','Messenger','A missed video call'],
    ['friendRequest','Friend request','Social','Someone requests friendship'],
    ['friendAccepted','Friend request accepted','Social','A friendship is accepted'],
    ['newFollower','New follower','Social','Someone follows your profile'],
    ['like','New like','Social','Someone likes your post'],
    ['loveReaction','Love reaction','Social','Someone loves your post'],
    ['hahaReaction','Haha reaction','Social','Someone reacts with Haha'],
    ['wowReaction','Wow reaction','Social','Someone reacts with Wow'],
    ['sadReaction','Sad reaction','Social','Someone reacts with Sad'],
    ['angryReaction','Angry reaction','Social','Someone reacts with Angry'],
    ['comment','New comment','Social','Someone comments on your post'],
    ['commentReply','Comment reply','Social','Someone replies to your comment'],
    ['mention','You were mentioned','Social','Someone mentions you'],
    ['taggedPost','You were tagged','Social','You are tagged in a post'],
    ['postShared','Post shared','Social','Someone shares your post'],
    ['storyReaction','Story reaction','Social','Someone reacts to your Story'],
    ['storyReply','Story reply','Social','Someone replies to your Story'],
    ['creatorLive','Creator goes LIVE','Minglora LIVE','A followed creator starts a broadcast'],
    ['liveInvitation','LIVE invitation','Minglora LIVE','You are invited to a LIVE room'],
    ['guestInvitation','Guest invitation','Minglora LIVE','You are invited to join as a guest'],
    ['guestRequest','Guest request received','Minglora LIVE','Someone requests to join your LIVE'],
    ['guestAccepted','Guest accepted','Minglora LIVE','Your LIVE guest request is accepted'],
    ['viewerJoined','New viewer joined','Minglora LIVE','A viewer joins your broadcast'],
    ['giftReceived','Gift received','Minglora LIVE','A gift arrives during LIVE'],
    ['premiumGift','Premium gift received','Minglora LIVE','A premium gift arrives'],
    ['coinReward','Coin reward received','Minglora LIVE','Coins are credited to your account'],
    ['liveAchievement','LIVE achievement','Minglora LIVE','You unlock a LIVE achievement'],
    ['liveMilestone','LIVE milestone','Minglora LIVE','Your LIVE reaches a milestone'],
    ['liveEnded','LIVE ended','Minglora LIVE','A broadcast has ended'],
    ['meetingInvitation','Meeting invitation','MeetWave','You are invited to a meeting'],
    ['meetingReminder','Meeting reminder','MeetWave','A scheduled meeting is approaching'],
    ['meetingStarting','Meeting starting','MeetWave','A meeting is starting'],
    ['participantJoined','Participant joined','MeetWave','Someone joins your meeting'],
    ['participantLeft','Participant left','MeetWave','Someone leaves your meeting'],
    ['handRaised','Hand raised','MeetWave','A participant raises a hand'],
    ['meetingHosted','Meeting started by host','MeetWave','The host starts the meeting'],
    ['meetingEnded','Meeting ended','MeetWave','A meeting has ended'],
    ['newOrder','New order','Marketplace & Money','A customer places an order'],
    ['newSale','New sale','Marketplace & Money','A product is sold'],
    ['paymentConfirmed','Payment confirmed','Marketplace & Money','A payment is confirmed'],
    ['paymentFailed','Payment failed','Marketplace & Money','A payment needs attention'],
    ['orderShipped','Order shipped','Marketplace & Money','An order is shipped'],
    ['orderDelivered','Order delivered','Marketplace & Money','An order is delivered'],
    ['refundCompleted','Refund completed','Marketplace & Money','A refund is completed'],
    ['creatorEarnings','Creator earnings received','Marketplace & Money','Creator earnings are recorded'],
    ['payoutCompleted','Payout completed','Marketplace & Money','A payout is completed'],
    ['payoutFailed','Payout needs attention','Marketplace & Money','A payout fails or needs review'],
    ['newDeviceLogin','New device login','Account & Security','Your account is accessed from a new device'],
    ['newLoginLocation','New login location','Account & Security','A login is detected from a new location'],
    ['passwordChanged','Password changed','Account & Security','Your password is changed'],
    ['twoFactor','Security verification','Account & Security','A two-factor verification event'],
    ['securityWarning','Security warning','Account & Security','An important security alert'],
    ['accountRestriction','Account restriction','Account & Security','An account restriction is applied'],
    ['accountRestored','Account restored','Account & Security','Account access is restored'],
    ['verificationUpdate','Verification update','Account & Security','Your verification status changes'],
    ['postPublished','Post published','Platform & Activity','Your post is published'],
    ['uploadCompleted','Upload completed','Platform & Activity','A media upload completes'],
    ['downloadCompleted','Download completed','Platform & Activity','A download completes'],
    ['appUpdate','Minglora updated','Platform & Activity','A new app update is available'],
    ['systemAnnouncement','Platform announcement','Platform & Activity','An important platform announcement'],
    ['uploadFailed','Upload failed','Platform & Activity','A media upload fails'],
    ['eventReminder','Event reminder','Platform & Activity','A scheduled event reminder']
  ];

  const PATCHES = ['bell','piano','digital','crystal','steelpan','marimba','synth','orchestra','soft','arcade','organ','celeste','bird','brass','percussion'];
  const VOICE = VOICE_SOUNDS.map(row => ({ id:row[0], name:row[1], pack:row[2], patch:row[3], kind:'voice' }));
  const VIDEO = VIDEO_SOUNDS.map(row => ({ id:row[0], name:row[1], pack:row[2], patch:row[3], kind:'video' }));
  const NOTIFICATIONS = EVENT_ROWS.map((row,index) => ({
    id:'notice-'+row[0], name:row[1]+' Tone', pack:row[2], patch:PATCHES[(index*7+3)%PATCHES.length],
    kind:'notification', eventKey:row[0]
  }));
  const EVENTS = EVENT_ROWS.map(row => ({
    key:row[0], label:row[1], group:row[2], description:row[3], defaultSoundId:'notice-'+row[0]
  }));
  const ALL_SOUNDS = [...VOICE,...VIDEO,...NOTIFICATIONS];
  const SOUND_BY_ID = new Map(ALL_SOUNDS.map(sound => [sound.id,sound]));
  const EVENT_BY_KEY = new Map(EVENTS.map(event => [event.key,event]));
  const PACKS = ['All collections','Classic Mobile','Premium','Digital','Cinematic','Caribbean','Nature','Gaming','Powerful','Minimal','Messenger','Social','Minglora LIVE','MeetWave','Marketplace & Money','Account & Security','Platform & Activity'];

  let root = null;
  let experience = {};
  let customRingtone = null;
  let mySounds = [];
  let activeTab = 'voice';
  let activeEvent = '';
  let librarySearch = '';
  let eventSearch = '';
  let packFilter = 'All collections';
  let context = null;
  let activeNodes = [];
  let activeAudio = null;
  let callTimer = null;
  let playingCall = false;
  let lastNotificationAt = 0;
  let refreshMySoundsAt = 0;

  const $ = (selector,scope=document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  async function api(path,options={}) {
    const response = await fetch('/api'+path,{
      ...options,credentials:'same-origin',
      headers:{'Content-Type':'application/json',...(window.MingloraDeviceContextHeaders?.()||{}),...(options.headers||{})}
    });
    const payload = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||('Request failed ('+response.status+')'));
    return payload;
  }
  function getExperience() {
    const live = window.MingloraExperience?.getSettings?.() || {};
    return {...experience,...live};
  }
  async function getAudioContext() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if(!Context) return null;
    if(!context) context = new Context();
    if(context.state === 'suspended') {
      try { await context.resume(); } catch { return null; }
    }
    return context.state === 'running' ? context : null;
  }
  function hash(value) {
    let result = 2166136261;
    for(let i=0;i<value.length;i++) result = Math.imul(result ^ value.charCodeAt(i),16777619);
    return result >>> 0;
  }
  function phraseFor(id,kind) {
    const seed = hash(id);
    const scales = [[0,2,4,7,9],[0,3,5,7,10],[0,2,5,7,9],[0,3,5,8,10],[0,2,4,6,9]];
    const scale = scales[seed%scales.length];
    const base = 330 + (seed%7)*23;
    const count = kind === 'notification' ? 3+(seed%2) : 6+(seed%3);
    const step = kind === 'notification' ? 0.17+(seed%4)*0.018 : 0.31+(seed%5)*0.035;
    const notes = [];
    let cursor = seed;
    for(let i=0;i<count;i++) {
      cursor = (Math.imul(cursor,1664525)+1013904223)>>>0;
      const scaleIndex = (cursor>>>8)%scale.length;
      const octave = kind === 'notification' ? 1+(i%2) : (i>3&&i%3===0?2:1);
      const semitone = scale[scaleIndex] + ((cursor>>>16)%3===0?12:0);
      const frequency = base * Math.pow(2,(semitone/12)) * octave;
      notes.push({frequency,duration:step*(0.75+((cursor>>>3)%4)*0.1),offset:i*step});
    }
    return {notes,duration:(count-1)*step+step*1.2,base,seed};
  }
  function styleFor(id) {
    return SOUND_BY_ID.get(id)?.patch || PATCHES[hash(id)%PATCHES.length];
  }
  function addVoice(ctx,frequency,start,duration,patch,volume,accent=false) {
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const osc = ctx.createOscillator();
    const partial = ctx.createOscillator();
    const partialGain = ctx.createGain();
    const profile = {
      bell:{wave:'sine',partial:2.76,level:.26,attack:.012,decay:.34,release:.22,filter:5200},
      piano:{wave:'triangle',partial:2.01,level:.11,attack:.008,decay:.2,release:.2,filter:3600},
      digital:{wave:'square',partial:2,level:.08,attack:.008,decay:.16,release:.12,filter:4400},
      crystal:{wave:'sine',partial:3.91,level:.32,attack:.004,decay:.38,release:.32,filter:6500},
      steelpan:{wave:'sine',partial:2.35,level:.24,attack:.006,decay:.3,release:.25,filter:4200},
      marimba:{wave:'triangle',partial:3.01,level:.1,attack:.006,decay:.12,release:.14,filter:3200},
      synth:{wave:'sawtooth',partial:2,level:.1,attack:.025,decay:.14,release:.16,filter:2600},
      orchestra:{wave:'triangle',partial:2,level:.16,attack:.06,decay:.26,release:.25,filter:3000},
      soft:{wave:'sine',partial:2,level:.08,attack:.055,decay:.24,release:.24,filter:2600},
      arcade:{wave:'square',partial:3,level:.04,attack:.003,decay:.08,release:.12,filter:5000},
      organ:{wave:'triangle',partial:2,level:.16,attack:.03,decay:.12,release:.16,filter:3400},
      celeste:{wave:'sine',partial:4.1,level:.2,attack:.008,decay:.4,release:.3,filter:6200},
      bird:{wave:'sine',partial:3.4,level:.18,attack:.018,decay:.22,release:.16,filter:5600},
      brass:{wave:'sawtooth',partial:2,level:.12,attack:.04,decay:.18,release:.15,filter:1700},
      percussion:{wave:'triangle',partial:2.5,level:.05,attack:.003,decay:.07,release:.13,filter:2500}
    }[patch] || {wave:'sine',partial:2,level:.1,attack:.01,decay:.16,release:.16,filter:4000};
    const peak = Math.max(.0001,profile.level*volume*(accent?1.12:1));
    osc.type = profile.wave;
    partial.type = 'sine';
    osc.frequency.setValueAtTime(frequency,start);
    partial.frequency.setValueAtTime(frequency*profile.partial,start);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(profile.filter,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.linearRampToValueAtTime(peak,start+profile.attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*.38),start+profile.attack+profile.decay);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration+profile.release);
    partialGain.gain.setValueAtTime(peak*.27,start);
    osc.connect(filter); partial.connect(partialGain); partialGain.connect(filter);
    filter.connect(gain); gain.connect(ctx.destination);
    osc.start(start); partial.start(start);
    const stopAt = start+duration+profile.release+.025;
    osc.stop(stopAt); partial.stop(stopAt);
    const cleanup=()=>{
      try{osc.disconnect();partial.disconnect();filter.disconnect();gain.disconnect();partialGain.disconnect();}catch{}
      activeNodes=activeNodes.filter(node=>node!==osc&&node!==partial&&node!==filter&&node!==gain&&node!==partialGain);
    };
    osc.onended=cleanup;partial.onended=cleanup;
    activeNodes.push(osc,partial,filter,gain,partialGain);
  }
  async function playSynthOnce(id,kind,volume=0.8) {
    const ctx = await getAudioContext();
    if(!ctx) return false;
    const phrase = phraseFor(id,kind);
    const patch = styleFor(id);
    const amount = Math.max(0,Math.min(1,Number(volume)));
    const start = ctx.currentTime + .025;
    phrase.notes.forEach((note,index) => {
      addVoice(ctx,note.frequency,start+note.offset,note.duration,patch,amount,index===0);
      if(kind!=='notification' && index%2===0) {
        addVoice(ctx,note.frequency*.5,start+note.offset,note.duration*.92,patch,amount*.24,false);
      }
    });
    return phrase.duration;
  }
  function stopPlayback() {
    if(callTimer) { clearInterval(callTimer); callTimer=null; }
    if(activeAudio) { activeAudio.pause(); try{activeAudio.currentTime=0;}catch{} activeAudio=null; }
    for(const node of activeNodes) { try{node.stop?.();node.disconnect?.();}catch{} }
    activeNodes=[];
    playingCall=false;
  }
  function getCustomSound(id) {
    return mySounds.find(sound => 'user:'+sound.id === id) || null;
  }
  async function refreshMySounds(force=false) {
    if(!force && Date.now()-refreshMySoundsAt<45*60*1000) return mySounds;
    try {
      const result=await api('/sounds?sort=mine');
      mySounds=Array.isArray(result.sounds)?result.sounds:[];
      refreshMySoundsAt=Date.now();
    } catch { mySounds=[]; }
    return mySounds;
  }
  async function playCustomSound(sound,volume=0.8,loop=false) {
    if(!sound?.url) return false;
    stopPlayback();
    const audio=new Audio(sound.url);
    audio.preload='auto';audio.loop=loop;audio.volume=Math.max(0,Math.min(1,Number(volume)));
    activeAudio=audio;
    try { await audio.play(); return true; }
    catch { activeAudio=null; return false; }
  }
  async function playCall(kind) {
    const settings=getExperience();
    const key=kind==='voice'?'voiceCallRingtoneId':'videoCallRingtoneId';
    let id=String(settings[key]||'');
    if(!id && customRingtone?.url) id='legacy-custom';
    const volume=Math.max(0,Math.min(100,Number(settings.ringtoneVolume??80)))/100;
    if(id==='legacy-custom' && customRingtone?.url) {
      if(await playCustomSound({url:customRingtone.url},volume,true)) { playingCall=true; return true; }
    }
    if(id.startsWith('user:')) {
      await refreshMySounds();
      const userSound=getCustomSound(id);
      if(userSound && await playCustomSound(userSound,volume,true)) { playingCall=true; return true; }
    }
    const soundId=(kind==='voice'?'voice-minglora-signature':'video-minglora-vision');
    const chosen=SOUND_BY_ID.has(id)?id:soundId;
    stopPlayback();
    const duration=await playSynthOnce(chosen,'call',volume);
    if(!duration) return false;
    playingCall=true;
    callTimer=setInterval(()=>{if(!playingCall)return;void playSynthOnce(chosen,'call',volume);},Math.max(1800,duration*1000+450));
    return true;
  }
  async function playNotification(type) {
    const settings=getExperience();
    if(playingCall || settings.notificationSound===false || settings.soundMode==='mute' || settings.soundMode==='vibrate') return false;
    if(window.MingloraExperience?.shouldSilenceNotifications?.('notification')) return false;
    const key=normalizeEventKey(type);
    if(!key || !EVENT_BY_KEY.has(key)) return false;
    const now=Date.now();
    if(now-lastNotificationAt<650) return false;
    lastNotificationAt=now;
    const volume=Math.max(0,Math.min(100,Number(settings.notificationVolume??80)))/100;
    const id=String(settings.notificationSoundAssignments?.[key]||EVENT_BY_KEY.get(key).defaultSoundId);
    if(id.startsWith('user:')) {
      await refreshMySounds();
      const userSound=getCustomSound(id);
      if(userSound) return playCustomSound(userSound,volume,false);
    }
    const soundId=SOUND_BY_ID.has(id)&&id.startsWith('notice-')?id:EVENT_BY_KEY.get(key).defaultSoundId;
    return Boolean(await playSynthOnce(soundId,'notification',volume));
  }
  function normalizeEventKey(type) {
    const value=String(type||'').toLowerCase();
    const aliases={
      friend:'friendRequest',reaction:'like',follow:'newFollower',profile_view:'eventReminder',
      live:'creatorLive',live_moderator:'liveAchievement',gift:'giftReceived',fan_club:'giftReceived',
      meetwave_invite:'meetingInvitation',league_match:'eventReminder',call:'missedVoiceCall',
      message:'message'
    };
    if(aliases[value]) return aliases[value];
    return EVENTS.find(event=>event.key.toLowerCase()===value)?.key || '';
  }
  function selectedId(kind) {
    const settings=getExperience();
    if(kind==='voice') return String(settings.voiceCallRingtoneId||'voice-minglora-signature');
    if(kind==='video') return String(settings.videoCallRingtoneId||'video-minglora-vision');
    return '';
  }
  async function savePatch(patch) {
    const saved=await api('/settings',{method:'PATCH',body:JSON.stringify({experience:patch})});
    experience={...experience,...(saved.settings?.experience||patch)};
    window.dispatchEvent(new CustomEvent('minglora:settings-loaded',{detail:saved.settings||{experience}}));
    showStatus('Sound preferences saved to your Minglora account.');
    return experience;
  }
  function showStatus(message,isError=false) {
    const status=$('#sound-studio-status',root);
    if(status) { status.textContent=message; status.dataset.error=isError?'true':'false'; }
  }
  function customSoundName(id) {
    if(id==='legacy-custom') return customRingtone?.name||'Your uploaded call ringtone';
    const custom=getCustomSound(id);
    return custom?.title || SOUND_BY_ID.get(id)?.name || 'Minglora default';
  }
  function selectedOptions(id,kind) {
    const items=kind==='voice'?VOICE:VIDEO;
    const options=items.map(sound=>'<option value="'+esc(sound.id)+'" '+(id===sound.id?'selected':'')+'>'+esc(sound.name)+' · '+esc(sound.pack)+'</option>').join('');
    const personal=mySounds.map(sound=>{
      const value='user:'+sound.id;
      return '<option value="'+esc(value)+'" '+(id===value?'selected':'')+'>'+esc(sound.title)+' · My Sounds</option>';
    }).join('');
    const legacy=customRingtone?.url?'<option value="legacy-custom" '+(id==='legacy-custom'?'selected':'')+'>Your uploaded call ringtone</option>':'';
    return legacy+personal+options;
  }
  function renderCallTab(kind) {
    const isVoice=kind==='voice', id=selectedId(kind);
    const sounds=isVoice?VOICE:VIDEO;
    const filtered=sounds.filter(sound=>{
      const match=(sound.name+' '+sound.pack+' '+sound.patch).toLowerCase().includes(librarySearch.toLowerCase());
      return match&&(packFilter==='All collections'||sound.pack===packFilter);
    });
    let html='<div class="sound-studio-intro"><div><span class="sound-studio-kicker">'+(isVoice?'VOICE CALLS':'VIDEO CALLS')+'</span><h3>'+(isVoice?'Incoming voice-call ringtones':'Incoming video-call ringtones')+'</h3><p>'+(isVoice?'Choose a recognizable, melodic phone ring for audio calls.':'Choose a separate welcome melody for video calls.')+'</p></div><label class="sound-studio-field"><span>Selected ringtone</span><select data-call-choice="'+kind+'">'+selectedOptions(id,kind)+'</select></label></div>';
    html+='<div class="sound-studio-toolbar"><input type="search" data-library-search placeholder="Search ringtones" value="'+esc(librarySearch)+'"><select data-pack-filter>'+PACKS.map(pack=>'<option value="'+esc(pack)+'" '+(packFilter===pack?'selected':'')+'>'+esc(pack)+'</option>').join('')+'</select></div>';
    html+='<div class="sound-studio-list">';
    if(customRingtone?.url) html+='<article class="sound-studio-row"><div class="sound-studio-row-copy"><strong>Your uploaded call ringtone</strong><small>Personal recording · private to your account</small></div><button type="button" class="secondary" data-preview-custom-call>Preview</button><button type="button" class="primary" data-use-call="legacy-custom" data-call-kind="'+kind+'">Use this sound</button></article>';
    html+=filtered.map(sound=>'<article class="sound-studio-row '+(id===sound.id?'is-selected':'')+'"><div class="sound-studio-row-copy"><strong>'+esc(sound.name)+'</strong><small>'+esc(sound.pack)+' · '+esc(sound.patch)+' · original Minglora composition</small></div><button type="button" class="secondary" data-preview-sound="'+sound.id+'">Preview</button><button type="button" class="primary" data-use-call="'+sound.id+'" data-call-kind="'+kind+'">'+(id===sound.id?'Selected':'Use sound')+'</button></article>').join('');
    html+=mySounds.map(sound=>{
      const value='user:'+sound.id;
      return '<article class="sound-studio-row '+(id===value?'is-selected':'')+'"><div class="sound-studio-row-copy"><strong>'+esc(sound.title)+'</strong><small>My Sounds · '+esc(sound.attribution||'Your original recording')+'</small></div><button type="button" class="secondary" data-preview-user-sound="'+esc(sound.id)+'">Preview</button><button type="button" class="primary" data-use-call="'+esc(value)+'" data-call-kind="'+kind+'">'+(id===value?'Selected':'Use sound')+'</button></article>';
    }).join('');
    if(!filtered.length&&!mySounds.length) html+='<p class="settings-empty">No sounds match this search. Try another term or collection.</p>';
    return html+'</div>';
  }
  function eventSoundId(key) {
    const settings=getExperience();
    const event=EVENT_BY_KEY.get(key);
    return String(settings.notificationSoundAssignments?.[key]||event?.defaultSoundId||'');
  }
  function renderNotificationTab() {
    const filtered=EVENTS.filter(event=>(event.label+' '+event.group+' '+event.description).toLowerCase().includes(eventSearch.toLowerCase()));
    const groups=[...new Set(EVENTS.map(event=>event.group))];
    let html='<div class="sound-studio-intro"><div><span class="sound-studio-kicker">NOTIFICATION SOUNDS</span><h3>Give every event its own sound</h3><p>Each event starts with a distinct original tone. Change one event without changing the others.</p></div><div class="sound-studio-count">'+EVENTS.length+' event sounds</div></div>';
    html+='<div class="sound-studio-toolbar"><input type="search" data-event-search placeholder="Search notification events" value="'+esc(eventSearch)+'"></div>';
    html+='<div class="sound-studio-event-list">';
    html+=filtered.map(event=>{
      const id=eventSoundId(event.key);
      return '<article class="sound-studio-event-row"><div class="sound-studio-row-copy"><strong>'+esc(event.label)+'</strong><small>'+esc(event.group)+' · '+esc(customSoundName(id))+'</small></div><button type="button" class="secondary" data-preview-event="'+esc(event.key)+'">Preview</button><button type="button" class="primary" data-edit-event="'+esc(event.key)+'">Change sound</button></article>';
    }).join('');
    html+='</div>';
    if(activeEvent && EVENT_BY_KEY.has(activeEvent)) {
      const currentId=eventSoundId(activeEvent), event=EVENT_BY_KEY.get(activeEvent);
      html+='<section class="sound-studio-picker"><div class="sound-studio-inline-heading"><div><h4>Choose sound for '+esc(event.label)+'</h4><p>Only this notification assignment will change.</p></div><button type="button" class="secondary" data-close-picker>Close</button></div>';
      html+='<div class="sound-studio-toolbar"><input type="search" data-picker-search placeholder="Search the full notification library" value="'+esc(librarySearch)+'"></div>';
      html+='<div class="sound-studio-picker-list">';
      const choices=NOTIFICATIONS.filter(sound=>(sound.name+' '+sound.pack+' '+sound.patch).toLowerCase().includes(librarySearch.toLowerCase()));
      html+=choices.map(sound=>'<article class="sound-studio-row '+(currentId===sound.id?'is-selected':'')+'"><div class="sound-studio-row-copy"><strong>'+esc(sound.name)+'</strong><small>'+esc(sound.pack)+' · original Minglora tone</small></div><button type="button" class="secondary" data-preview-sound="'+sound.id+'">Preview</button><button type="button" class="primary" data-assign-event="'+activeEvent+'" data-sound-id="'+sound.id+'">'+(currentId===sound.id?'Selected':'Assign')+'</button></article>').join('');
      html+=mySounds.map(sound=>{
        const value='user:'+sound.id;
        return '<article class="sound-studio-row '+(currentId===value?'is-selected':'')+'"><div class="sound-studio-row-copy"><strong>'+esc(sound.title)+'</strong><small>My Sounds · '+esc(sound.attribution||'Your original recording')+'</small></div><button type="button" class="secondary" data-preview-user-sound="'+esc(sound.id)+'">Preview</button><button type="button" class="primary" data-assign-event="'+activeEvent+'" data-sound-id="'+esc(value)+'">'+(currentId===value?'Selected':'Assign')+'</button></article>';
      }).join('');
      html+='</div></section>';
    }
    return html;
  }
  function renderUploadSection() {
    return '<section class="sound-studio-upload"><div class="sound-studio-inline-heading"><div><h3>My Sounds</h3><p>Upload your own recording and use it for calls or any notification. Only publish audio you own or are licensed to use.</p></div></div>'+
      '<div id="sound-studio-upload-form" class="sound-studio-upload-form">'+
      '<label class="sound-studio-field"><span>Sound title</span><input name="title" minlength="2" maxlength="100" required placeholder="Name your sound"></label>'+
      '<label class="sound-studio-field"><span>Attribution (optional)</span><input name="attribution" maxlength="100" placeholder="Creator or source"></label>'+
      '<label class="sound-studio-field"><span>Audio file</span><input name="file" type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,audio/x-wav,audio/flac,audio/aac,.mp3,.m4a,.ogg,.opus,.webm,.wav,.flac,.aac" required></label>'+
      '<label class="sound-studio-check"><input type="checkbox" name="allowReuse"><span>Allow other Minglora members to reuse this original recording.</span></label>'+
      '<label class="sound-studio-check"><input type="checkbox" name="rightsConfirmed" required><span>I own this recording or have permission to publish and use it.</span></label>'+
      '<button type="button" class="primary" data-upload-sound>Upload to My Sounds</button><p class="settings-form-status" id="sound-studio-upload-status" role="status" aria-live="polite"></p></div>'+
      '<div class="sound-studio-count">'+mySounds.length+' personal recordings available</div></section>';
  }
  function render() {
    if(!root) return;
    const tabs=[
      ['voice','Voice calls','30'],
      ['video','Video calls','30'],
      ['notifications','Notifications',String(EVENTS.length)]
    ];
    let html='<div class="sound-studio-heading"><div><span class="sound-studio-kicker">MINGLORA SOUND STUDIO</span><h2>Your ringtone and notification library</h2><p>Original, recognizable sound styles with individual previews and account-synced assignments.</p></div><div class="sound-studio-total"><strong>'+ALL_SOUNDS.length+'</strong><span>built-in sounds</span></div></div>';
    html+='<div class="sound-studio-metrics"><span>30 voice ringtones</span><span>30 video ringtones</span><span>'+EVENTS.length+' individual notification sounds</span></div>';
    html+='<div class="sound-studio-tabs" role="tablist" aria-label="Sound library">'+tabs.map(tab=>'<button type="button" role="tab" aria-selected="'+(activeTab===tab[0]?'true':'false')+'" class="sound-studio-tab '+(activeTab===tab[0]?'active':'')+'" data-sound-tab="'+tab[0]+'"><strong>'+tab[1]+'</strong><small>'+tab[2]+' sounds</small></button>').join('')+'</div>';
    html+='<div class="sound-studio-panel">';
    if(activeTab==='voice') html+=renderCallTab('voice');
    else if(activeTab==='video') html+=renderCallTab('video');
    else html+=renderNotificationTab();
    html+='</div>'+renderUploadSection();
    html+='<p class="settings-form-status" id="sound-studio-status" role="status" aria-live="polite"></p>';
    html+='<p class="settings-note">These launch sounds are original synthesized Minglora compositions inspired by familiar ringtone genres. They do not copy protected brand melodies or commercial songs. Background push notification audio is still subject to the operating system and browser notification controls.</p>';
    root.innerHTML=html;
  }
  function measureDuration(file) {
    return new Promise(resolve=>{
      const url=URL.createObjectURL(file),audio=new Audio();
      let done=false;
      const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);resolve(value);};
      audio.preload='metadata';
      audio.onloadedmetadata=()=>finish(Number.isFinite(audio.duration)?Math.min(3600000,Math.round(audio.duration*1000)):0);
      audio.onerror=()=>finish(0);
      audio.src=url;
    });
  }
  async function handleUpload(form) {
    const file=form.querySelector('[name="file"]')?.files?.[0];
    const status=$('#sound-studio-upload-status',root);
    const submit=form.querySelector('[data-upload-sound]');
    const title=String(form.querySelector('[name="title"]')?.value||'').trim();
    const attribution=String(form.querySelector('[name="attribution"]')?.value||'').trim();
    const rightsConfirmed=form.querySelector('[name="rightsConfirmed"]')?.checked===true;
    const allowReuse=form.querySelector('[name="allowReuse"]')?.checked===true;
    if(!file) {if(status)status.textContent='Choose an audio recording first.';return;}
    if(title.length<2) {if(status)status.textContent='Give your sound a title of at least two characters.';return;}
    if(!rightsConfirmed) {if(status)status.textContent='Confirm that you own this recording or have permission to publish it.';return;}
    if(submit)submit.disabled=true;
    if(status) status.textContent='Preparing your recording…';
    try {
      if(typeof window.uploadMediaFile!=='function') throw new Error('The Minglora audio upload service is unavailable.');
      const durationMs=await measureDuration(file);
      const asset=await window.uploadMediaFile('sound',file,1,0,progress=>{
        if(status) status.textContent=progress.finalizing?'Upload complete. Publishing your sound…':'Uploading '+progress.percentage+'%';
      });
      await api('/sounds',{method:'POST',body:JSON.stringify({
        assetId:asset.id,title,attribution,rightsConfirmed,allowReuse,durationMs
      })});
      await refreshMySounds(true);
      showStatus('Your original recording is now available in My Sounds.');
      render();
    } catch(error) {
      if(status) status.textContent='The recording was not added. '+error.message;
    } finally {
      const activeForm=$('#sound-studio-upload-form',root);
      if(activeForm?.querySelector('[data-upload-sound]')) activeForm.querySelector('[data-upload-sound]').disabled=false;
    }
  }
  async function assignCall(kind,id) {
    const key=kind==='voice'?'voiceCallRingtoneId':'videoCallRingtoneId';
    try {
      await savePatch({[key]:id});
      render();
    } catch(error) { showStatus('The ringtone could not be saved. '+error.message,true); }
  }
  async function assignEvent(key,id) {
    const assignments={...(getExperience().notificationSoundAssignments||{}),[key]:id};
    try {
      await savePatch({notificationSoundAssignments:assignments});
      activeEvent=key;
      render();
    } catch(error) { showStatus('The notification sound could not be saved. '+error.message,true); }
  }
  async function previewCustomRingtone() {
    if(!customRingtone?.url) return;
    await playCustomSound({url:customRingtone.url},.8,false);
  }
  async function previewSound(id) {
    stopPlayback();
    const sound=SOUND_BY_ID.get(id);
    if(!sound) return;
    await playSynthOnce(id,sound.kind==='notification'?'notification':'call',.8);
  }
  async function previewUserSound(id) {
    await refreshMySounds();
    const sound=mySounds.find(item=>item.id===id);
    if(sound) await playCustomSound(sound,.8,false);
  }
  function handleClick(event) {
    const button=event.target.closest('button');
    if(!button || !root.contains(button)) return;
    if(button.dataset.soundTab) { activeTab=button.dataset.soundTab;activeEvent='';librarySearch='';eventSearch='';packFilter='All collections';render();return; }
    if(button.dataset.previewSound) { void previewSound(button.dataset.previewSound);return; }
    if(button.dataset.previewUserSound) { void previewUserSound(button.dataset.previewUserSound);return; }
    if(button.hasAttribute('data-preview-custom-call')) { void previewCustomRingtone();return; }
    if(button.hasAttribute('data-upload-sound')) { void handleUpload($('#sound-studio-upload-form',root));return; }
    if(button.dataset.useCall) { void assignCall(button.dataset.callKind,button.dataset.useCall);return; }
    if(button.dataset.editEvent) { activeEvent=button.dataset.editEvent;librarySearch='';render();return; }
    if(button.dataset.closePicker!==undefined) { activeEvent='';render();return; }
    if(button.dataset.previewEvent) {
      const id=eventSoundId(button.dataset.previewEvent);
      if(id.startsWith('user:')) void previewUserSound(id.slice(5)); else void previewSound(id);
      return;
    }
    if(button.dataset.assignEvent) { void assignEvent(button.dataset.assignEvent,button.dataset.soundId);return; }
  }
  function handleChange(event) {
    const target=event.target;
    if(target.matches('[data-call-choice]')) { void assignCall(target.dataset.callChoice,target.value);return; }
    if(target.matches('[data-pack-filter]')) { packFilter=target.value;render();return; }
  }
  function handleInput(event) {
    const target=event.target;
    if(target.matches('[data-library-search]')) { librarySearch=target.value;const pos=target.selectionStart;render();const next=$('[data-library-search]',root);next?.focus();next?.setSelectionRange(pos,pos); }
    if(target.matches('[data-event-search]')) { eventSearch=target.value;const pos=target.selectionStart;render();const next=$('[data-event-search]',root);next?.focus();next?.setSelectionRange(pos,pos); }
    if(target.matches('[data-picker-search]')) { librarySearch=target.value;const pos=target.selectionStart;render();const next=$('[data-picker-search]',root);next?.focus();next?.setSelectionRange(pos,pos); }
  }
  function mount(container,options={}) {
    root=container||$('#minglora-sound-studio-root');
    if(!root) return false;
    experience={...(options.experience||{})};
    customRingtone=options.customRingtone||null;
    activeTab='voice';activeEvent='';librarySearch='';eventSearch='';packFilter='All collections';
    root.removeEventListener('click',handleClick);
    root.removeEventListener('change',handleChange);
    root.removeEventListener('input',handleInput);
    root.addEventListener('click',handleClick);
    root.addEventListener('change',handleChange);
    root.addEventListener('input',handleInput);
    render();
    void refreshMySounds(true).then(render);
    return true;
  }

  window.addEventListener('minglora:settings-loaded',event=>{
    const next=event.detail?.experience || event.detail?.settings?.experience;
    if(next && typeof next==='object') experience={...experience,...next};
  });
  window.addEventListener('minglora:call-ringtone-updated',()=>{
    api('/calls/ringtone').then(result=>{customRingtone=result.ringtone||null;render();}).catch(()=>{});
  });

  window.MingloraSoundStudio = {
    mount, playCall, playNotification, previewSound, stopPlayback,
    getCatalog:()=>({voice:VOICE,video:VIDEO,notifications:NOTIFICATIONS,events:EVENTS}),
    getDefaultAssignments:()=>Object.fromEntries(EVENTS.map(event=>[event.key,event.defaultSoundId]))
  };
})();