(() => {
  'use strict';
  const DEFAULTS = {
    style:'minglora', chlStyle:'default', typography:'system', surfaces:'standard', density:'comfortable', motion:'standard', contrast:'standard',
    customAccentColor:'#1769e0', customBackgroundColor:'#f1f3f7',
    wallpaperType:'gradient', wallpaperFit:'cover', wallpaperColor:'#f1f3f7',
    wallpaperGradient:'linear-gradient(135deg, #eaf1ff, #f7f1ff)', wallpaperOpacity:100, wallpaperBlur:0,
    avatarFrame:'none', screenSaverEnabled:false, screenSaverEffect:'bubbles',
    screenSaverWaitValue:60, screenSaverWaitUnit:'minutes', screenSaverText:'Welcome to Minglora',
    osdClock:true, osdDate:true, osdNotifications:false, osdBattery:true, osdPosition:'top-right', osdOpacity:85,
    soundMode:'sound', vibrateOnRing:true, voiceCallSound:true, videoCallSound:true, messageSound:true, notificationSound:true,
    ringtoneVolume:80, mediaVolume:80, notificationVolume:80, systemVolume:80,
    dndEnabled:false, dndStart:'22:00', dndEnd:'07:00', dndAllowedCalls:'none',
    notificationSort:'newest', lockScreenNotifications:'content',
    fontScale:100, screenZoom:100, screenTimeoutSeconds:60, inAppBrightness:100,
    showBatteryPercentage:true, dataSaverEnabled:false, parentalControlsEnabled:false
  };
  const THEMES = [
    ['minglora','Minglora Default','#1769e0','#f1f3f7','#172033'],
    ['chl-night','CHL Night','#c41450','#0b0b12','#f4f4f8'],
    ['chl-ocean','Ocean Studio','#006c7d','#071923','#eefaff'],
    ['chl-violet','Violet Creator','#7735a9','#100b1d','#f8f1ff'],
    ['chl-emerald','Emerald Studio','#087447','#071711','#effff4'],
    ['chl-rose','Rose Premium','#b71952','#1d0b14','#fff2f7'],
    ['chl-light','Light Professional','#a3124a','#f4f6fb','#182033']
  ];
  const STYLE_VARIANTS = [
    ['default','Creator Hub Live Default','#ff2d6f','#0b0b12','#f4f4f8'],
    ['minimal','Minimal','#1769e8','#f5f6fa','#171923'],
    ['flat','Flat Design','#1769e8','#f5f6fa','#171923'],
    ['swiss','Swiss Modern','#145ee8','#f5f6fa','#171923'],
    ['editorial','Editorial','#9b332b','#f7f2e8','#27231f'],
    ['material','Material Design','#6750a4','#f5f6fa','#171923'],
    ['fluent','Fluent Design','#0067c0','#f5f6fa','#171923'],
    ['glass','Glassmorphism','#7c8cff','#101426','#f7f8ff'],
    ['frost','Frosted Glass','#176be8','#eaf3fb','#172b43'],
    ['neo','Neo','#ff5b35','#f4f0df','#171717'],
    ['brutal','Brutalist','#f5ff00','#ffffff','#111111'],
    ['neumorphic','Neumorphic','#6c63ff','#e4e7ef','#293044'],
    ['clay','Claymorphism','#8267ff','#f3f0ff','#302653'],
    ['aurora','Aurora','#71f4d3','#090f20','#f4f7ff'],
    ['cyber','Cyberpunk','#00f5e9','#070b13','#e5fdff'],
    ['memphis','Memphis','#ff5a7a','#fff8ed','#222222'],
    ['y2k','Y2K','#ff7be5','#170a2c','#fff6ff'],
    ['pixel','Pixel Art','#a3e635','#111827','#f9fafb'],
    ['skeuo','Skeuomorphic','#b63e32','#e7e1d6','#2e2a24']
  ];
  const PRESETS_KEY='minglora.experience.presets.v1';
  const LOCAL_KEY='minglora.experience.local.v1';
  let current={...DEFAULTS};
  let saveTimer=0, saveQueue=Promise.resolve(), mountedForm=null, wallpaperUrl=null, wallpaperVideo=null, screenSaverTimer=0, screenSaverOverlay=null, battery=null;
  const $=(s,root=document)=>root.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=async(path,options={})=>{
    const response=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(window.MingloraDeviceContextHeaders?.()||{}),...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||('Request failed ('+response.status+')'));
    return payload;
  };
  function formatDuration(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return 'Unavailable';
    const mins=Math.round(seconds/60),hours=Math.floor(mins/60),rest=mins%60;
    return hours?hours+'h '+rest+'m':mins+'m';
  }
  function applyStyle(p){
    const root=document.body;
    root.dataset.mingloraStyle=p.style;
    if(p.chlStyle&&p.chlStyle!=='default')document.documentElement.dataset.chlStyle=p.chlStyle;
    else delete document.documentElement.dataset.chlStyle;
    root.dataset.mingloraTypography=p.typography;
    root.dataset.mingloraSurfaces=p.surfaces;
    root.dataset.mingloraDensity=p.density;
    root.dataset.mingloraMotion=p.motion;
    root.dataset.mingloraContrast=p.contrast;
    root.style.setProperty('--minglora-custom-accent',p.customAccentColor);
    root.style.setProperty('--minglora-custom-background',p.customBackgroundColor);
    root.style.setProperty('--minglora-font-scale',String(p.fontScale/100));
    root.dataset.mingloraAvatarFrame=p.avatarFrame;
    root.classList.toggle('mexp-data-saver',p.dataSaverEnabled===true);
    root.style.fontSize=p.fontScale+'%';
    root.style.zoom=String(p.screenZoom/100);
    root.style.setProperty('--mexp-wallpaper-opacity',String(p.wallpaperOpacity/100));
    root.style.setProperty('--mexp-wallpaper-blur',p.wallpaperBlur+'px');
    if(p.inAppBrightness!==100)root.style.filter='brightness('+Math.max(.5,Math.min(1.2,p.inAppBrightness/100))+')';
    else root.style.removeProperty('filter');
    const meta=$('meta[name="theme-color"]');
    const theme=THEMES.find(t=>t[0]===p.style);
    if(meta&&theme)meta.setAttribute('content',theme[3]);
  }
  function fitToCss(fit){
    return ({fit:'contain',fill:'cover',stretch:'100% 100%',tile:'auto',center:'auto',span:'cover',cover:'cover',contain:'contain',custom:'cover'})[fit]||'cover';
  }
  function applyWallpaper(p){
    const body=document.body;
    if(wallpaperVideo){wallpaperVideo.pause();wallpaperVideo.remove();wallpaperVideo=null;}
    const supported=['color','gradient'].includes(p.wallpaperType)||(p.wallpaperType==='image'&&!!wallpaperUrl)||(p.wallpaperType==='video'&&!!wallpaperUrl);
    body.classList.toggle('mexp-wallpaper-active',supported);
    body.style.setProperty('--mexp-wallpaper-size',fitToCss(p.wallpaperFit));
    body.style.setProperty('--mexp-wallpaper-repeat',p.wallpaperFit==='tile'?'repeat':'no-repeat');
    body.style.setProperty('--mexp-wallpaper-opacity',String(p.wallpaperOpacity/100));
    body.style.setProperty('--mexp-wallpaper-blur',p.wallpaperBlur+'px');
    body.style.setProperty('--mexp-wallpaper-color',p.wallpaperColor);
    let background='none';
    if(p.wallpaperType==='color')background='linear-gradient('+p.wallpaperColor+','+p.wallpaperColor+')';
    else if(p.wallpaperType==='gradient')background=p.wallpaperGradient;
    else if(p.wallpaperType==='image'&&wallpaperUrl)background='url("'+wallpaperUrl.replace(/["\\]/g,'')+'")';
    body.style.setProperty('--mexp-wallpaper-background',background);
    if(p.wallpaperType==='video'&&wallpaperUrl){
      wallpaperVideo=document.createElement('video');
      wallpaperVideo.className='mexp-wallpaper-video';
      wallpaperVideo.src=wallpaperUrl;
      wallpaperVideo.autoplay=true;wallpaperVideo.muted=true;wallpaperVideo.loop=true;wallpaperVideo.playsInline=true;
      wallpaperVideo.setAttribute('aria-hidden','true');
      document.body.prepend(wallpaperVideo);
      wallpaperVideo.play().catch(()=>{});
    }
  }
  function apply(p){
    current={...DEFAULTS,...p};
    applyStyle(current);
    applyWallpaper(current);
    refreshOsdPreview();
    refreshScreenSaverSchedule();
    refreshStyleChoices();
  }
  function timeLabel(value){return String(value||'').padStart(2,'0');}
  function refreshOsdPreview(){
    const preview=$('#mexp-osd-preview');if(!preview)return;
    const d=new Date(),parts=[];
    if(current.osdClock)parts.push('<strong>'+timeLabel(d.getHours())+':'+timeLabel(d.getMinutes())+'</strong>');
    if(current.osdDate)parts.push('<span>'+esc(d.toLocaleDateString())+'</span>');
    if(current.osdNotifications)parts.push('<span class="mexp-osd-chip">Notifications preview</span>');
    if(current.osdBattery)parts.push('<span class="mexp-osd-chip" id="mexp-osd-battery">Battery: checking</span>');
    preview.innerHTML=parts.join('')||'<span>OSD elements are hidden</span>';
    preview.dataset.position=current.osdPosition;
    preview.style.opacity=String(current.osdOpacity/100);
    refreshBattery();
  }
  function indexedDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('Local media storage is not supported in this browser.'));return;}
      const request=indexedDB.open('minglora-experience-assets',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('assets'))request.result.createObjectStore('assets');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open local media storage.'));
    });
  }
  async function saveLocalAsset(file){
    const db=await indexedDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(file,'wallpaper');
      tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not save this wallpaper on this device.'));};
    });
  }
  async function loadLocalAsset(){
    try{
      const db=await indexedDb();
      const blob=await new Promise((resolve,reject)=>{
        const tx=db.transaction('assets','readonly'),request=tx.objectStore('assets').get('wallpaper');
        request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
      });
      db.close();
      if(blob){if(wallpaperUrl)URL.revokeObjectURL(wallpaperUrl);wallpaperUrl=URL.createObjectURL(blob);applyWallpaper(current);}
    }catch{}
  }
  function getField(name){
    const el=$('[data-exp-field="'+name+'"]',mountedForm);
    if(!el)return current[name];
    if(el.type==='checkbox')return el.checked;
    if(el.type==='range'||el.type==='number')return Number(el.value);
    return el.value;
  }
  function collect(){
    const result={...current};
    mountedForm?.querySelectorAll('[data-exp-field]').forEach(el=>{
      if(el.type==='file')return;
      result[el.dataset.expField]=el.type==='checkbox'?el.checked:(el.type==='range'||el.type==='number'?Number(el.value):el.value);
    });
    return result;
  }
  function updateFieldLabels(){
    mountedForm?.querySelectorAll('[data-exp-output]').forEach(el=>{
      const field=el.dataset.expOutput;el.textContent=String(getField(field))+(field==='fontScale'||field==='screenZoom'||field==='inAppBrightness'||field==='wallpaperOpacity'||field==='osdOpacity'?'%':'');
    });
  }
  async function persist(p){
    const result=await api('/settings',{method:'PATCH',body:JSON.stringify({experience:p})});
    current={...DEFAULTS,...(result.settings?.experience||p)};
    try{localStorage.setItem(LOCAL_KEY,JSON.stringify(current));}catch{}
    const status=$('#mexp-save-status');
    if(status)status.textContent='Saved to your Minglora account and synchronized settings.';
    apply(current);
    return current;
  }
  function queueSave(){
    clearTimeout(saveTimer);
    const status=$('#mexp-save-status');if(status)status.textContent='Saving your changes…';
    saveTimer=setTimeout(()=>{
      const snapshot=collect();
      saveQueue=saveQueue.catch(()=>{}).then(()=>persist(snapshot)).catch(error=>{
        try{localStorage.setItem(LOCAL_KEY,JSON.stringify(snapshot));}catch{}
        if(status)status.textContent='Not synchronized: '+error.message+'. A device copy was kept when storage is available.';
      });
    },450);
  }
  function field(label,name,control,help){
    return '<label class="mexp-field"><span><strong>'+label+'</strong>'+(help?'<small>'+help+'</small>':'')+'</span>'+control+'</label>';
  }
  function toggle(label,name,checked,help){
    return '<label class="mexp-toggle"><span><strong>'+label+'</strong>'+(help?'<small>'+help+'</small>':'')+'</span><input type="checkbox" data-exp-field="'+name+'" '+(checked?'checked':'')+'></label>';
  }
  function select(name,options,value){
    return '<select data-exp-field="'+name+'">'+options.map(o=>'<option value="'+o[0]+'" '+(value===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
  }
  function range(name,value,min,max,step){
    return '<span class="mexp-range"><input type="range" data-exp-field="'+name+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"><output data-exp-output="'+name+'">'+value+'</output></span>';
  }
  function themeCards(){
    return '<div class="mexp-theme-grid">'+THEMES.map(t=>'<button type="button" class="mexp-theme-card" data-exp-theme="'+t[0]+'" aria-pressed="'+(current.style===t[0]?'true':'false')+'"><span class="mexp-theme-swatch" style="--swatch-accent:'+t[2]+';--swatch-bg:'+t[3]+';--swatch-text:'+t[4]+'"></span><strong>'+t[1]+'</strong><small>'+(t[0].startsWith('chl-')?'Imported Creator Hub Live style':'Minglora native style')+'</small></button>').join('')+'</div>';
  }
  function styleVariantCards(){
    return '<div class="mexp-theme-grid mexp-variant-grid">'+STYLE_VARIANTS.map(t=>'<button type="button" class="mexp-theme-card mexp-variant-card" data-exp-chl-style="'+t[0]+'" aria-pressed="'+(current.chlStyle===t[0]?'true':'false')+'"><span class="mexp-theme-swatch" style="--swatch-accent:'+t[2]+';--swatch-bg:'+t[3]+';--swatch-text:'+t[4]+'"></span><strong>'+t[1]+'</strong><small>Creator Hub Live design style</small></button>').join('')+'</div>';
  }
  function refreshStyleChoices(){
    const area=$('#settings-experience');
    if(!area)return;
    area.querySelectorAll('[data-exp-theme]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.expTheme===current.style?'true':'false'));
    area.querySelectorAll('[data-exp-chl-style]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.expChlStyle===current.chlStyle?'true':'false'));
  }
  function markup(){
    const unitOptions=[['seconds','Seconds'],['minutes','Minutes'],['hours','Hours']];
    const timeoutOptions=[[15,'15 seconds'],[30,'30 seconds'],[60,'1 minute'],[120,'2 minutes'],[300,'5 minutes'],[600,'10 minutes'],[1800,'30 minutes']];
    return '<section class="settings-card mexp-card" id="settings-experience" data-settings-category="experience" hidden>'+
      '<div class="mexp-heading"><div><span class="mexp-eyebrow">MINGLORA CONTROL CENTER</span><h2>Personalization, Display &amp; Device Experience</h2><p>Choose your look, manage in-app experience settings and inspect device capabilities. Device-only controls are clearly identified.</p></div><button class="secondary" type="button" data-exp-reset>Restore defaults</button></div>'+
      '<div class="mexp-subnav"><a href="#mexp-styles">Styles</a><a href="#mexp-wallpaper">Wallpaper</a><a href="#mexp-saver">Screen saver</a><a href="#mexp-sound">Sound</a><a href="#mexp-display">Display</a><a href="#mexp-device">Device</a></div>'+
      '<section class="mexp-section" id="mexp-styles"><h3>Style library &amp; appearance</h3><p>Choose a Creator Hub Live color palette and combine it with any of the 18 compatible design styles. Preview changes instantly and save them to your Minglora account.</p>'+themeCards()+'<h4>Creator Hub Live design styles</h4>'+styleVariantCards()+
      field('Typography','typography',select('typography',[['system','System'],['studio','Studio'],['readable','Readable']],current.typography),'Readable uses a larger type scale and more generous line spacing.')+
      field('Surface shape','surfaces',select('surfaces',[['standard','Standard'],['soft','Soft rounded'],['sharp','Clean edges']],current.surfaces))+
      field('Display density','density',select('density',[['comfortable','Comfortable'],['compact','Compact']],current.density))+
      field('Motion','motion',select('motion',[['standard','Standard'],['reduced','Reduced motion']],current.motion))+
      field('Contrast','contrast',select('contrast',[['standard','Standard'],['high','High contrast']],current.contrast))+
      field('Custom accent color','customAccentColor','<input type="color" data-exp-field="customAccentColor" value="'+current.customAccentColor+'">','Used for compatible accent and focus treatments.')+
      field('Custom background color','customBackgroundColor','<input type="color" data-exp-field="customBackgroundColor" value="'+current.customBackgroundColor+'">','Used as the selected style’s custom background when applied.')+
      '<div class="mexp-actions"><button type="button" class="primary" data-exp-preview>Preview current selection</button><button type="button" class="secondary" data-exp-save-preset>Save as device preset</button><select data-exp-presets aria-label="Saved style presets"><option value="">Saved presets on this device</option></select><button type="button" class="secondary" data-exp-apply-preset>Apply preset</button></div></section>'+
      '<section class="mexp-section" id="mexp-wallpaper"><h3>Profile appearance &amp; wallpapers</h3><p>Use Minglora’s existing profile editor for your profile photo and cover image. The video/animated profile media uploader will use the profile media pipeline when that endpoint supports it.</p>'+
      '<button type="button" class="secondary" data-exp-open-profile>Edit profile picture &amp; cover</button>'+
      field('Profile frame','avatarFrame',select('avatarFrame',[['none','None'],['glow','Glow'],['ribbon','Ribbons'],['glass','Glass'],['neon','Neon']],current.avatarFrame),'Applies an appearance frame where supported by profile/avatar components.')+
      field('Wallpaper type','wallpaperType',select('wallpaperType',[['none','None'],['color','Solid color'],['gradient','Gradient'],['image','Photo'],['video','Video wallpaper']],current.wallpaperType))+
      field('Wallpaper file','wallpaperFile','<input type="file" data-exp-wallpaper-file accept="image/*,video/mp4,video/webm,video/quicktime">','Custom wallpaper media is saved in this browser’s local storage area (IndexedDB), not uploaded to your account. Choose a file to preview it on this device.')+
      field('Wallpaper fit','wallpaperFit',select('wallpaperFit',[['fit','Fit'],['fill','Fill'],['stretch','Stretch'],['tile','Tile'],['center','Center'],['span','Span'],['cover','Cover'],['contain','Contain'],['custom','Custom']],current.wallpaperFit))+
      field('Wallpaper color','wallpaperColor','<input type="color" data-exp-field="wallpaperColor" value="'+current.wallpaperColor+'">')+
      field('Wallpaper gradient','wallpaperGradient',select('wallpaperGradient',ENUM_GRADIENTS,current.wallpaperGradient))+
      field('Wallpaper opacity','wallpaperOpacity',range('wallpaperOpacity',current.wallpaperOpacity,0,100,5))+
      field('Wallpaper blur','wallpaperBlur',range('wallpaperBlur',current.wallpaperBlur,0,24,1))+
      '<div class="mexp-preview" id="mexp-wallpaper-preview"><strong>Wallpaper preview</strong><span>Choose a color, gradient or local photo/video.</span></div></section>'+
      '<section class="mexp-section" id="mexp-saver"><h3>Screen saver &amp; on-screen display</h3>'+
      toggle('Enable Minglora screen saver','screenSaverEnabled',current.screenSaverEnabled,'Starts after the inactivity delay below. It pauses during visible calls, meetings and LIVE rooms.')+
      field('Screen saver effect','screenSaverEffect',select('screenSaverEffect',[['bubbles','Bubbles'],['text','Custom text'],['mystifying','Mystifying'],['photos','Photos'],['ribbons','Ribbons'],['particles','Particles'],['stars','Stars'],['waves','Waves'],['fireflies','Fireflies'],['clock','Clock'],['none','None']],current.screenSaverEffect))+
      field('Wait before activation','screenSaverWaitValue','<input type="number" data-exp-field="screenSaverWaitValue" min="5" max="7200" step="1" value="'+current.screenSaverWaitValue+'">')+
      field('Wait time unit','screenSaverWaitUnit',select('screenSaverWaitUnit',unitOptions,current.screenSaverWaitUnit))+
      field('Screen saver text','screenSaverText','<input type="text" data-exp-field="screenSaverText" maxlength="120" value="'+esc(current.screenSaverText)+'">','Used by the Custom text effect.')+
      '<div class="mexp-actions"><button type="button" class="secondary" data-exp-test-saver>Preview screen saver now</button></div>'+
      '<h4>On-screen display (OSD) preview</h4>'+
      toggle('Show clock','osdClock',current.osdClock)+toggle('Show date','osdDate',current.osdDate)+toggle('Show notification preview','osdNotifications',current.osdNotifications)+toggle('Show battery percentage when available','osdBattery',current.osdBattery)+
      field('OSD position','osdPosition',select('osdPosition',[['top-left','Top left'],['top-right','Top right'],['bottom-left','Bottom left'],['bottom-right','Bottom right'],['center','Center']],current.osdPosition))+
      field('OSD opacity','osdOpacity',range('osdOpacity',current.osdOpacity,0,100,5))+
      '<div class="mexp-osd-preview" id="mexp-osd-preview" data-position="'+current.osdPosition+'"></div></section>'+
      '<section class="mexp-section" id="mexp-sound"><h3>Sounds, vibration &amp; Do Not Disturb</h3>'+
      field('Sound mode','soundMode',select('soundMode',[['sound','Sound'],['vibrate','Vibrate'],['mute','Mute']],current.soundMode))+
      toggle('Vibrate when ringing','vibrateOnRing',current.vibrateOnRing)+toggle('Voice-call sound','voiceCallSound',current.voiceCallSound)+toggle('Video-call sound','videoCallSound',current.videoCallSound)+toggle('Message sound','messageSound',current.messageSound)+toggle('Notification sound','notificationSound',current.notificationSound)+
      field('Ringtone preview volume','ringtoneVolume',range('ringtoneVolume',current.ringtoneVolume,0,100,5),'Controls the Minglora sound test only; system-wide device volume remains controlled by the phone.')+
      field('Media test volume','mediaVolume',range('mediaVolume',current.mediaVolume,0,100,5))+
      field('Notification test volume','notificationVolume',range('notificationVolume',current.notificationVolume,0,100,5))+
      field('System-alert test volume','systemVolume',range('systemVolume',current.systemVolume,0,100,5),'This controls the Minglora browser test tone, not Android or iOS system volume.')+
      '<div class="mexp-actions"><button type="button" class="secondary" data-exp-test-sound>Test sound</button><button type="button" class="secondary" data-exp-test-vibration>Test vibration</button><button type="button" class="secondary" data-exp-manage-ringtone>Manage incoming-call ringtone</button></div>'+
      toggle('Enable Do Not Disturb','dndEnabled',current.dndEnabled,'Minglora quiet mode; this does not override the phone’s system Do Not Disturb settings.')+
      field('Quiet start','dndStart','<input type="time" data-exp-field="dndStart" value="'+current.dndStart+'">')+
      field('Quiet end','dndEnd','<input type="time" data-exp-field="dndEnd" value="'+current.dndEnd+'">')+
      field('Allow calls from','dndAllowedCalls',select('dndAllowedCalls',[['everyone','Everyone'],['none','Nobody']],current.dndAllowedCalls),'Contacts and Favorites filtering is not enabled in this web client, so only enforceable choices are shown.')+
      '<p class="mexp-note">Minglora custom incoming-call ringtone is currently managed in Interactions. Minglora can request vibration where supported. Android/iOS system volume, Do Not Disturb and notification channel behavior remain controlled by device settings.</p></section>'+
      '<section class="mexp-section" id="mexp-display"><h3>Display, notifications &amp; accessibility</h3>'+
      field('Font size','fontScale',range('fontScale',current.fontScale,85,150,5))+
      field('Screen zoom','screenZoom',range('screenZoom',current.screenZoom,85,150,5))+
      field('In-app brightness','inAppBrightness',range('inAppBrightness',current.inAppBrightness,50,120,5),'A visual app adjustment; does not change the phone’s physical display brightness.')+
      field('Preferred device screen timeout','screenTimeoutSeconds',select('screenTimeoutSeconds',timeoutOptions,current.screenTimeoutSeconds))+
      toggle('Show battery percentage where supported','showBatteryPercentage',current.showBatteryPercentage)+
      toggle('Data saver for Minglora visuals','dataSaverEnabled',current.dataSaverEnabled,'Reduces decorative motion and media-heavy effects where compatible.')+
      field('Notification sorting','notificationSort',select('notificationSort',[['newest','Newest first'],['oldest','Oldest first'],['unread','Unread first'],['priority','Priority first'],['people','People first'],['category','Category']],current.notificationSort))+
      field('Lock-screen notification privacy','lockScreenNotifications',select('lockScreenNotifications',[['content','Show content'],['hide-content','Hide content'],['icon-only','Notification only'],['hidden','Hide notifications']],current.lockScreenNotifications),'This stores your preference. Actual device lock-screen notification visibility is controlled by Android/iOS settings.')+
      '<p class="mexp-note">Minglora can scale its own content and run its own inactivity screen saver. The timeout value is a saved reference only; changing Android/iOS display timeout, adaptive brightness, font engine or hardware brightness requires the operating system settings.</p></section>'+
      '<section class="mexp-section" id="mexp-device"><h3>Battery, connections &amp; device integrations</h3>'+
      '<div class="mexp-metrics"><article><small>Battery level</small><strong id="mexp-battery-level">Checking…</strong><span id="mexp-battery-status">Reading device data</span></article><article><small>Charging estimate</small><strong id="mexp-battery-charge">Checking…</strong><span>Shown only when the device provides an estimate</span></article><article><small>Remaining estimate</small><strong id="mexp-battery-remaining">Checking…</strong><span>Shown only when the device provides an estimate</span></article><article><small>Network</small><strong id="mexp-network-type">Checking…</strong><span id="mexp-network-details">Browser-reported connection information</span></article></div>'+
      '<div class="mexp-device-grid">'+
      '<article><strong>Airplane mode</strong><p id="mexp-airplane-status">This browser cannot read or change airplane mode.</p><span>Open your phone’s quick settings to change it.</span></article>'+
      '<article><strong>Mobile data &amp; roaming</strong><p>Device-controlled setting</p><span>Minglora cannot switch carrier data or roaming from a browser.</span></article>'+
      '<article><strong>Wi-Fi &amp; Bluetooth</strong><p id="mexp-connectivity-status">Browser online status: checking</p><span>Manage network and connected devices in your device settings.</span></article>'+
      '<article><strong>Location access</strong><p>Use Device Access to request or review location permission.</p><span>Location sharing remains opt-in per Minglora feature.</span></article>'+
      '<article><strong>Lock screen &amp; biometrics</strong><p>Device security settings</p><span>PIN, password, pattern, fingerprint and face unlock are never collected by Minglora.</span></article>'+
      '<article><strong>External peripherals</strong><p>Keyboard, mouse, headset and camera support is detected when each feature is used.</p><span>Native pairing and hardware controls belong to the operating system.</span></article>'+
      '</div><div class="mexp-actions"><button type="button" class="secondary" data-exp-refresh-device>Refresh device readings</button><button type="button" class="secondary" data-exp-export>Export preferences</button><button type="button" class="secondary" data-exp-import>Import preferences</button><input type="file" accept="application/json,.json" data-exp-import-file hidden></div>'+
      '<p class="mexp-note">Battery values and network characteristics are read from supported browser APIs only. Minglora does not invent battery health, capacity, remaining hours or carrier data usage. Some devices do not expose these readings to web apps.</p></section>'+
      '<section class="mexp-section"><h3>Account care, family safety &amp; help</h3>'+
      '<div class="mexp-actions"><button type="button" class="secondary" data-exp-open-account>Open account security &amp; sessions</button><button type="button" class="secondary" data-exp-open-help>Open help &amp; support</button></div>'+
      '<p class="mexp-note">Account Care will show verified account, security and moderation records when the corresponding server checks are available. Parental controls, emergency functions, native lock methods, hardware button remapping and system airplane mode are not simulated by web-only controls.</p></section>'+
      '<div class="mexp-savebar"><span id="mexp-save-status" role="status" aria-live="polite">Settings are saved to your Minglora account when signed in.</span><button type="button" class="primary" data-exp-save>Save changes</button></div>'+
      '</section>';
  }
  const ENUM_GRADIENTS=[
    ['linear-gradient(135deg, #eaf1ff, #f7f1ff)','Blue to lavender'],
    ['linear-gradient(135deg, #071923, #163f57)','Ocean'],
    ['linear-gradient(135deg, #2b1245, #7a2f78)','Violet'],
    ['linear-gradient(135deg, #092b1d, #3b8c63)','Emerald'],
    ['linear-gradient(135deg, #321426, #a33f72)','Rose'],
    ['linear-gradient(135deg, #f4f6fb, #ffffff)','Light professional']
  ];
  function setStatus(message){const el=$('#mexp-save-status');if(el)el.textContent=message;}
  function activateCategory(form,category){
    const tabs=[...form.querySelectorAll('[data-settings-category-button]')];
    const sections=[...form.querySelectorAll('[data-settings-category]')];
    const selected=tabs.find(t=>t.dataset.settingsCategoryButton===category);
    if(!selected)return;
    tabs.forEach(t=>{const active=t===selected;t.classList.toggle('active',active);t.setAttribute('aria-pressed',active?'true':'false');});
    sections.forEach(s=>{s.hidden=s.dataset.settingsCategory!==category;});
    const description=$('#settings-category-description',form);
    if(description)description.textContent=selected.dataset.categoryDescription||'Personalization, appearance and device experience settings.';
  }
  function populatePresetSelect(){
    const selectEl=$('[data-exp-presets]',mountedForm);if(!selectEl)return;
    let list=[];try{list=JSON.parse(localStorage.getItem(PRESETS_KEY)||'[]');}catch{}
    selectEl.innerHTML='<option value="">Saved presets on this device</option>'+list.map((p,i)=>'<option value="'+i+'">'+esc(p.name||('Preset '+(i+1)))+'</option>').join('');
  }
  function readPresets(){try{const x=JSON.parse(localStorage.getItem(PRESETS_KEY)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
  function writePresets(x){try{localStorage.setItem(PRESETS_KEY,JSON.stringify(x.slice(0,30)));return true;}catch{return false;}}
  async function refreshBattery(){
    const level=$('#mexp-battery-level'),status=$('#mexp-battery-status'),charge=$('#mexp-battery-charge'),remaining=$('#mexp-battery-remaining');
    if(!level)return;
    const osd=$('#mexp-osd-battery');
    if(!battery&&navigator.getBattery){try{battery=await navigator.getBattery();battery.addEventListener('levelchange',refreshBattery);battery.addEventListener('chargingchange',refreshBattery);battery.addEventListener('chargingtimechange',refreshBattery);battery.addEventListener('dischargingtimechange',refreshBattery);}catch{battery=null;}}
    if(!battery){level.textContent='Unavailable';status.textContent='This device/browser does not expose Battery Status API';charge.textContent='Unavailable';remaining.textContent='Unavailable';if(osd)osd.textContent='Battery unavailable';return;}
    const percent=Math.round(battery.level*100);
    level.textContent=current.showBatteryPercentage?percent+'%':'Hidden by your preference';
    status.textContent=battery.charging?'Charging':'Discharging';
    charge.textContent=battery.charging?formatDuration(battery.chargingTime):'Not charging';
    remaining.textContent=!battery.charging?formatDuration(battery.dischargingTime):'Charging';
    if(osd)osd.textContent='Battery '+percent+'%';
  }
  function refreshNetwork(){
    const type=$('#mexp-network-type'),details=$('#mexp-network-details'),online=$('#mexp-connectivity-status');
    if(!type)return;
    type.textContent=navigator.onLine?'Online':'Offline';
    const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    details.textContent=c?[String(c.effectiveType||'connection type unavailable')+(Number.isFinite(c.downlink)?' · '+c.downlink+' Mbps':'')+(Number.isFinite(c.rtt)?' · '+c.rtt+' ms RTT':'')+(c.saveData?' · Data saver requested':'') ]:'Detailed network metrics unavailable';
    if(online)online.textContent='Browser online status: '+(navigator.onLine?'Online':'Offline');
  }
  function isBusy(){
    return document.hidden||document.querySelector('.live-room-layout,.meetwave-room,.call-overlay,.incoming-call-overlay,.outgoing-call-overlay,[data-call-active="true"],[data-meetwave-active="true"]');
  }
  function showScreenSaver(){
    if(!current.screenSaverEnabled||current.screenSaverEffect==='none'||screenSaverOverlay)return;
    if(isBusy()){screenSaverTimer=setTimeout(showScreenSaver,30000);return;}
    screenSaverOverlay=document.createElement('div');
    screenSaverOverlay.className='mexp-screen-saver effect-'+current.screenSaverEffect;
    screenSaverOverlay.setAttribute('role','dialog');screenSaverOverlay.setAttribute('aria-label','Minglora screen saver');
    const title=current.screenSaverEffect==='text'?'<h2>'+esc(current.screenSaverText||'Minglora')+'</h2>':(current.screenSaverEffect==='clock'?'<h2>'+new Date().toLocaleTimeString()+'</h2>':'');
    const dots=Array.from({length:18},(_,i)=>'<i style="--i:'+i+'"></i>').join('');
    if(current.screenSaverEffect==='photos'&&current.wallpaperType==='image'&&wallpaperUrl)screenSaverOverlay.style.backgroundImage='linear-gradient(#050813aa,#050813aa),url("'+wallpaperUrl.replace(/["\\]/g,'')+'")';
    screenSaverOverlay.innerHTML='<div class="mexp-saver-art">'+dots+title+(current.screenSaverEffect==='photos'&&!wallpaperUrl?'<h2>Choose a local wallpaper photo first</h2>':'')+'</div><span class="mexp-saver-dismiss">Touch or press any key to return</span>';
    screenSaverOverlay.addEventListener('pointerdown',dismissScreenSaver,{once:true});
    document.addEventListener('keydown',dismissScreenSaver,{once:true});
    document.body.appendChild(screenSaverOverlay);
  }
  function dismissScreenSaver(){
    if(screenSaverOverlay){screenSaverOverlay.remove();screenSaverOverlay=null;}
    document.removeEventListener('keydown',dismissScreenSaver);
    scheduleScreenSaver();
  }
  function scheduleScreenSaver(){
    clearTimeout(screenSaverTimer);
    if(!current.screenSaverEnabled||current.screenSaverEffect==='none')return;
    const mult=current.screenSaverWaitUnit==='hours'?3600000:current.screenSaverWaitUnit==='minutes'?60000:1000;
    screenSaverTimer=setTimeout(showScreenSaver,Math.max(5000,Number(current.screenSaverWaitValue)||60)*mult);
  }
  function refreshScreenSaverSchedule(){scheduleScreenSaver();}
  function makeSoundTest(){
    if(current.soundMode==='mute'){setStatus('Sound mode is muted. Change it to Sound to test audio.');return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC){setStatus('Audio test is not supported by this browser.');return;}
    try{
      const ctx=new AC(),osc=ctx.createOscillator(),gain=ctx.createGain();
      const volume=(Number(current.ringtoneVolume)||0)/100;
      osc.type='sine';osc.frequency.value=660;gain.gain.setValueAtTime(volume*0.15,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.55);
      osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.56);
      osc.onended=()=>ctx.close();setStatus('Sound test played through the current browser audio output.');
    }catch{setStatus('The browser could not start an audio test.');}
  }
  function testVibration(){
    if(current.soundMode==='mute'||!current.vibrateOnRing){setStatus('Vibration is disabled by your current sound settings.');return;}
    if(typeof navigator.vibrate!=='function'){setStatus('Vibration API is not available on this device/browser.');return;}
    const ok=navigator.vibrate([120,60,120]);setStatus(ok?'Vibration test requested from the device.':'The device did not accept a vibration request.');
  }
  function attach(form){
    if(mountedForm===form)return;
    mountedForm=form;
    const grid=$('.settings-category-grid',form);
    if(!grid)return;
    if(!$('[data-settings-category-button="experience"]',grid)){
      const tab=document.createElement('button');tab.type='button';tab.className='settings-category-tab';tab.setAttribute('aria-pressed','false');
      tab.dataset.settingsCategoryButton='experience';tab.dataset.categoryDescription='Themes, wallpapers, screensavers, audio, display and device integration.';
      tab.innerHTML='<span class="mexp-nav-icon" aria-hidden="true">✦</span><span>Experience Center</span>';
      grid.appendChild(tab);
    }
    const intro=$('.settings-category-intro',form);
    if(intro&&!$('#settings-experience',form))intro.insertAdjacentHTML('afterend',markup());
    form.addEventListener('click',event=>{
      const tab=event.target.closest('[data-settings-category-button]');
      if(tab){event.preventDefault();activateCategory(form,tab.dataset.settingsCategoryButton);}
    });
    const area=$('#settings-experience',form);
    area?.addEventListener('change',event=>{
      const target=event.target;
      if(target.matches('[data-exp-field]')){current=collect();apply(current);updateFieldLabels();queueSave();}
    });
    area?.addEventListener('input',event=>{
      const target=event.target;
      if(target.matches('[data-exp-field]')){current=collect();apply(current);updateFieldLabels();if(target.type!=='range'&&target.type!=='number')queueSave();}
    });
    area?.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-exp-theme')){const theme=button.dataset.expTheme;current={...collect(),style:theme};apply(current);area.querySelectorAll('[data-exp-theme]').forEach(x=>x.setAttribute('aria-pressed',x===button?'true':'false'));queueSave();}
      if(button.hasAttribute('data-exp-chl-style')){
        current={...collect(),chlStyle:button.dataset.expChlStyle};
        apply(current);
        area.querySelectorAll('[data-exp-chl-style]').forEach(x=>x.setAttribute('aria-pressed',x===button?'true':'false'));
        queueSave();
      }
      if(button.hasAttribute('data-exp-reset')){
        if(!window.confirm('Restore all Minglora Experience Center settings to their defaults?'))return;
        current={...DEFAULTS};area.querySelectorAll('[data-exp-field]').forEach(el=>{if(el.type==='checkbox')el.checked=!!current[el.dataset.expField];else if(el.type!=='file')el.value=current[el.dataset.expField]??'';});
        apply(current);updateFieldLabels();queueSave();setStatus('Defaults restored and saving…');
      }
      if(button.hasAttribute('data-exp-preview')){current=collect();apply(current);setStatus('Preview active. Select Save changes to keep this appearance on your account.');}
      if(button.hasAttribute('data-exp-save')){current=collect();button.disabled=true;try{await persist(current);}catch(error){setStatus('Not saved: '+error.message);}finally{button.disabled=false;}}
      if(button.hasAttribute('data-exp-save-preset')){
        const name=window.prompt('Name this appearance preset:','My Minglora style');if(!name?.trim())return;
        const presets=readPresets();presets.push({name:name.trim().slice(0,48),settings:collect(),savedAt:new Date().toISOString()});
        setStatus(writePresets(presets)?'Preset saved on this device.':'Could not save a preset in this browser.');populatePresetSelect();
      }
      if(button.hasAttribute('data-exp-apply-preset')){
        const index=Number($('[data-exp-presets]',area)?.value),preset=readPresets()[index];if(!preset?.settings)return;
        current={...DEFAULTS,...preset.settings};area.querySelectorAll('[data-exp-field]').forEach(el=>{if(el.type==='checkbox')el.checked=!!current[el.dataset.expField];else if(el.type!=='file')el.value=current[el.dataset.expField]??'';});
        apply(current);updateFieldLabels();queueSave();
      }
      if(button.hasAttribute('data-exp-test-saver'))showScreenSaver();
      if(button.hasAttribute('data-exp-test-sound'))makeSoundTest();
      if(button.hasAttribute('data-exp-test-vibration'))testVibration();
      if(button.hasAttribute('data-exp-refresh-device')){await refreshBattery();refreshNetwork();setStatus('Device readings refreshed. Unsupported values remain unavailable.');}
      if(button.hasAttribute('data-exp-open-profile'))window.dispatchEvent(new CustomEvent('minglora:open-profile-editor'));
      if(button.hasAttribute('data-exp-manage-ringtone')){
        const interaction=form.querySelector('[data-settings-category-button="interactions"]');if(interaction)interaction.click();
        setTimeout(()=>$('#settings-calls')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
      }
      if(button.hasAttribute('data-exp-open-account')){
        const account=form.querySelector('[data-settings-category-button="logon"]');if(account)account.click();
        setTimeout(()=>$('#settings-security')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
      }
      if(button.hasAttribute('data-exp-open-help')){
        const support=form.querySelector('[data-settings-category-button="support-about"]');if(support)support.click();
        setTimeout(()=>$('#settings-help')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
      }
      if(button.hasAttribute('data-exp-export')){
        const blob=new Blob([JSON.stringify(collect(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='minglora-experience-settings.json';link.click();URL.revokeObjectURL(url);
      }
      if(button.hasAttribute('data-exp-import'))$('[data-exp-import-file]',area)?.click();
    });
    area?.querySelector('[data-exp-wallpaper-file]')?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      const isImage=file.type.startsWith('image/'),isVideo=file.type.startsWith('video/');
      if(!isImage&&!isVideo){setStatus('Choose an image or video wallpaper.');return;}
      if(file.size>80*1024*1024){setStatus('Wallpaper files must be 80 MB or smaller.');return;}
      try{
        await saveLocalAsset(file);
        if(wallpaperUrl)URL.revokeObjectURL(wallpaperUrl);
        wallpaperUrl=URL.createObjectURL(file);
        current=collect();current.wallpaperType=isVideo?'video':'image';
        const typeField=$('[data-exp-field="wallpaperType"]',area);if(typeField)typeField.value=current.wallpaperType;
        apply(current);queueSave();
        const preview=$('#mexp-wallpaper-preview');if(preview)preview.innerHTML='<strong>Wallpaper preview</strong>'+(isImage?'<img src="'+wallpaperUrl+'" alt="Selected wallpaper preview">':'<video src="'+wallpaperUrl+'" muted loop autoplay playsinline></video>')+'<span>Media is stored locally on this device.</span>';
        setStatus('Wallpaper saved on this device. The selected wallpaper type is synchronized with your account.');
      }catch(error){setStatus(error.message);}
    });
    area?.querySelector('[data-exp-import-file]')?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        const incoming=JSON.parse(await file.text()),validated={...DEFAULTS,...incoming};
        const allowed=new Set(Object.keys(DEFAULTS));for(const key of Object.keys(validated))if(!allowed.has(key))delete validated[key];
        current=validated;area.querySelectorAll('[data-exp-field]').forEach(el=>{if(el.type==='checkbox')el.checked=!!current[el.dataset.expField];else if(el.type!=='file')el.value=current[el.dataset.expField]??'';});
        apply(current);queueSave();setStatus('Imported settings. Saving to your account…');
      }catch{setStatus('This settings file is not valid JSON.');}
      event.target.value='';
    });
    populatePresetSelect();
    loadLocalAsset();
    refreshOsdPreview();refreshBattery();refreshNetwork();
    document.addEventListener('visibilitychange',scheduleScreenSaver);
    ['pointerdown','keydown','touchstart','scroll'].forEach(name=>window.addEventListener(name,()=>{if(screenSaverOverlay)dismissScreenSaver();else scheduleScreenSaver();},{passive:true}));
    window.addEventListener('online',refreshNetwork);window.addEventListener('offline',refreshNetwork);
    window.addEventListener('minglora:settings-loaded',event=>{
      const exp=event.detail?.experience;if(exp){current={...DEFAULTS,...exp};apply(current);}
    });
    const local=(()=>{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');}catch{return null;}})();
    api('/settings').then(r=>{
      current={...DEFAULTS,...(r.settings?.experience||{})};apply(current);
      area.querySelectorAll('[data-exp-field]').forEach(el=>{if(el.type==='checkbox')el.checked=!!current[el.dataset.expField];else if(el.type!=='file')el.value=current[el.dataset.expField]??'';});
      updateFieldLabels();setStatus('Loaded from your Minglora account.');
    }).catch(()=>{
      if(local){current={...DEFAULTS,...local};apply(current);setStatus('Account settings unavailable. Showing the saved device copy.');}
      else setStatus('Sign in to save Experience Center settings across your devices.');
    });
    setInterval(refreshOsdPreview,30000);
    activateCategory(form,'activity');
  }
  function observe(){
    const main=$('#main-content');
    if(main){
      const observer=new MutationObserver(()=>{const form=$('#settings-form',main);if(form)attach(form);});
      observer.observe(main,{childList:true,subtree:true});
      const form=$('#settings-form',main);if(form)attach(form);
    } else {
      const observer=new MutationObserver(()=>{const target=$('#main-content');if(!target)return;observer.disconnect();observe();});
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
  }
  const onReady=()=>observe();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});else onReady();
  function isDndActive(){
    if(!current.dndEnabled)return false;
    const now=new Date(),minute=now.getHours()*60+now.getMinutes();
    const toMinute=value=>{const [h,m]=String(value||'00:00').split(':').map(Number);return h*60+m;};
    const start=toMinute(current.dndStart),end=toMinute(current.dndEnd);
    if(start===end)return true;
    return start<end?(minute>=start&&minute<end):(minute>=start||minute<end);
  }
  window.MingloraExperience={
    getSettings:()=>({...current}),
    shouldSilenceNotifications:(kind='all')=>current.soundMode==='mute'||(isDndActive()&&!(kind==='call'&&current.dndAllowedCalls==='everyone')),
    shouldVibrate:()=>current.soundMode==='vibrate'&&current.vibrateOnRing,
    apply,
    open:()=>{const button=$('[data-settings-category-button="experience"]');if(button)button.click();}
  };
})();