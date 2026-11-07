const $ = s => document.querySelector(s);
const state = { user:null, view:'feed', feed:[], feedScope:'all', savedPosts:[], savedPostCollections:[], savedFilter:'all', savedCollection:'all', savedType:'all', savedSort:'saved-newest', savedSearch:'', stories:[], people:[], discoveryLiveSessions:[], groups:[], notifications:[], conversations:[], activeConversation:null, messageWindows:[], activeGroup:null, pages:[], activePage:null, profile:null, searchResults:null, settings:null, activeConnections:null, liveStartFormat:'video_audio', messengerFilter:'all', messengerSearch:'', messengerPanelOpen:false, messengerOptionsOpen:false, messengerPanelSection:'chats', messengerComposeMode:false, messengerComposeUsers:null, messengerComposeLoading:false, messengerPresence:{}, messengerTyping:{}, messengerRealtimeConnected:false, rechargeTab:'recharge' };
const LAST_VIEW_SESSION_PREFIX='minglora:last-view:v1:';
const RESTORABLE_VIEWS=new Set(['feed','more','gifts','gifter-progression','live','live-pro','leagues','coins','creator','friends','groups','messages','saved','pages','meetwave','connections','page','group','profile','search','notifications']);
const MINGLORA_HISTORY_KEY='mingloraNavigation';
let restoringSavedView=false;
let restoringBrowserNavigation=false;
function getBrowserNavigationSnapshot(){
  return {
    view:state.view,
    feedScope:state.feedScope||'all',
    profileId:state.profileTargetId||state.profile?.user?.id||'',
    profileTab:state.profileTab||'posts',
    activePage:state.activePage||'',
    pageTab:state.pageTab||'posts',
    pageDays:state.pageDays||30,
    activeGroup:state.activeGroup||'',
    activeConnections:state.activeConnections||null,
    searchQuery:state.searchQuery||'',
    creatorSection:state.creatorStudio?.section||state.restoreCreatorSection||'overview',
    rechargeTab:state.rechargeTab||'recharge',
    savedFilter:state.savedFilter||'all',
    savedCollection:state.savedCollection||'all',
    savedType:state.savedType||'all',
    savedSort:state.savedSort||'saved-newest',
    savedSearch:state.savedSearch||''
  };
}
function withMingloraHistoryState(snapshot){
  const existing=window.history.state&&typeof window.history.state==='object'?window.history.state:{};
  return {...existing,[MINGLORA_HISTORY_KEY]:snapshot};
}
function recordBrowserNavigation({replace=false}={}){
  if(!state.user||restoringBrowserNavigation)return;
  const snapshot=getBrowserNavigationSnapshot();
  const current=window.history.state?.[MINGLORA_HISTORY_KEY];
  if(current&&JSON.stringify(current)===JSON.stringify(snapshot))return;
  try{
    const scrollKey=MINGLORA_HISTORY_KEY+'Scroll';
    if(!replace){
      const currentState=window.history.state&&typeof window.history.state==='object'?window.history.state:{};
      if(currentState[MINGLORA_HISTORY_KEY]){
        window.history.replaceState({...currentState,[scrollKey]:{x:window.scrollX||0,y:window.scrollY||0}},'',window.location.href);
      }
    }
    const nextState=withMingloraHistoryState(snapshot);
    delete nextState[scrollKey];
    const method=replace?'replaceState':'pushState';
    window.history[method](nextState,'',window.location.href);
  }catch(error){
    console.warn('Minglora browser navigation history could not be updated:',error?.message||error);
  }
}
function initializeBrowserNavigation(){
  if(!state.user)return;
  try{
    window.history.replaceState(withMingloraHistoryState(getBrowserNavigationSnapshot()),'',window.location.href);
  }catch(error){
    console.warn('Minglora browser navigation could not be initialized:',error?.message||error);
  }
}
async function restoreBrowserNavigation(event){
  const saved=event?.state?.[MINGLORA_HISTORY_KEY];
  if(!state.user||!saved||!RESTORABLE_VIEWS.has(saved.view))return;
  if(saved.view==='profile'&&!saved.profileId)return;
  if(saved.view==='page'&&!saved.activePage)return;
  if(saved.view==='group'&&!saved.activeGroup)return;
  if(saved.view==='connections'&&!saved.activeConnections?.profileId)return;
  if(saved.view==='search'&&!saved.searchQuery)return;
  restoringBrowserNavigation=true;
  try{
    state.view=saved.view;
    state.feedScope=['all','for-you','following','friends'].includes(saved.feedScope)?saved.feedScope:'all';
    state.profileTargetId=String(saved.profileId||'');
    state.profileTab=['posts','about','friends','photos','reels','badges','more','gift-gallery','checkins','events','highlights','groups','videos','manage'].includes(saved.profileTab)?saved.profileTab:'posts';
    state.activePage=String(saved.activePage||'')||null;
    state.pageTab=String(saved.pageTab||'posts');
    state.pageDays=[7,30,90].includes(Number(saved.pageDays))?Number(saved.pageDays):30;
    state.activeGroup=String(saved.activeGroup||'')||null;
    state.activeConnections=saved.activeConnections||null;
    state.searchQuery=String(saved.searchQuery||'');
    state.restoreCreatorSection=String(saved.creatorSection||'overview');
    state.rechargeTab=['recharge','earnings','exchange'].includes(saved.rechargeTab)?saved.rechargeTab:'recharge';
    state.savedFilter=String(saved.savedFilter||'all');
    state.savedCollection=String(saved.savedCollection||'all');
    state.savedType=String(saved.savedType||'all');
    state.savedSort=String(saved.savedSort||'saved-newest');
    state.savedSearch=String(saved.savedSearch||'');
    syncNavigationActive();
    syncMessageRefreshPolling();
    await renderView();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    persistCurrentView();
    const position=event.state?.[MINGLORA_HISTORY_KEY+'Scroll'];
    if(position&&Number.isFinite(Number(position.y)))window.scrollTo(Number(position.x)||0,Number(position.y)||0);
  }catch(error){
    console.warn('Minglora could not restore the previous browser screen:',error?.message||error);
    setContent('<section class="card empty-state"><h3>Could not restore this page</h3><p>'+esc(error?.message||'Please try again.')+'</p><button class="primary" id="retry-view">Try again</button></section>');
    $('#retry-view')?.addEventListener('click',()=>void renderView());
  }finally{
    restoringBrowserNavigation=false;
  }
}
window.addEventListener('popstate',event=>{void restoreBrowserNavigation(event);});
function lastViewStorageKey(){return LAST_VIEW_SESSION_PREFIX+String(state.user?.id||'');}
function persistCurrentView(){
  if(!state.user||restoringSavedView)return;
  try{
    sessionStorage.setItem(lastViewStorageKey(),JSON.stringify({
      view:state.view,
      feedScope:state.feedScope,
      profileId:state.profileTargetId||state.profile?.user?.id||'',
      profileTab:state.profileTab||'posts',
      activePage:state.activePage||'',
      pageTab:state.pageTab||'posts',
      pageDays:state.pageDays||30,
      activeGroup:state.activeGroup||'',
      activeConnections:state.activeConnections||null,
      searchQuery:state.searchQuery||'',
      creatorSection:state.creatorStudio?.section||state.restoreCreatorSection||'overview',
      rechargeTab:state.rechargeTab||'recharge',
      savedFilter:state.savedFilter||'all',
      savedCollection:state.savedCollection||'all',
      savedType:state.savedType||'all',
      savedSort:state.savedSort||'saved-newest',
      savedSearch:state.savedSearch||'',
      scrollX:window.scrollX||0,
      scrollY:window.scrollY||0,
      mainScrollTop:document.querySelector('#main-content')?.scrollTop||0
    }));
  }catch{}
}
function readPersistedView(){
  try{
    const saved=JSON.parse(sessionStorage.getItem(lastViewStorageKey())||'null');
    if(!saved||!RESTORABLE_VIEWS.has(saved.view))return null;
    if(saved.view==='profile'&&!saved.profileId)return null;
    if(saved.view==='page'&&!saved.activePage)return null;
    if(saved.view==='group'&&!saved.activeGroup)return null;
    if(saved.view==='connections'&&!saved.activeConnections?.profileId)return null;
    if(saved.view==='search'&&!saved.searchQuery)return null;
    return saved;
  }catch{return null;}
}
async function restoreLastView(){
  const saved=readPersistedView();
  if(!saved){activateNav('feed');return;}
  state.feedScope=['all','for-you','following','friends'].includes(saved.feedScope)?saved.feedScope:'all';
  state.profileTab=['posts','about','friends','photos','reels','badges','more','gift-gallery','checkins','events','highlights','groups','videos','manage'].includes(saved.profileTab)?saved.profileTab:'posts';
  state.profileTargetId=String(saved.profileId||'');
  state.activePage=String(saved.activePage||'')||null;
  state.pageTab=String(saved.pageTab||'posts');
  state.pageDays=[7,30,90].includes(Number(saved.pageDays))?Number(saved.pageDays):30;
  state.activeGroup=String(saved.activeGroup||'')||null;
  state.activeConnections=saved.activeConnections||null;
  state.searchQuery=String(saved.searchQuery||'');
  state.restoreCreatorSection=String(saved.creatorSection||'overview');
  state.rechargeTab=['recharge','earnings','exchange'].includes(saved.rechargeTab)?saved.rechargeTab:'recharge';
  state.savedFilter=String(saved.savedFilter||'all');
  state.savedCollection=String(saved.savedCollection||'all');
  state.savedType=String(saved.savedType||'all');
  state.savedSort=String(saved.savedSort||'saved-newest');
  state.savedSearch=String(saved.savedSearch||'');
  restoringSavedView=true;
  try{
    await activateNav(saved.view);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.scrollTo(Number(saved.scrollX)||0,Number(saved.scrollY)||0);
    const main=document.querySelector('#main-content');
    if(main)main.scrollTop=Number(saved.mainScrollTop)||0;
  }finally{
    restoringSavedView=false;
    persistCurrentView();
  }
}
window.addEventListener('pagehide',persistCurrentView);
const LIVE_ROOM_THEME_OPTIONS=[{value:'studio',label:'Creator Studio'},{value:'ocean',label:'Ocean Stage'},{value:'tropical',label:'Tropical Party'},{value:'royal',label:'Royal Lounge'},{value:'neon',label:'Neon Arena'},{value:'sunset',label:'Sunset Spotlight'},{value:'garden',label:'Garden Glow'},{value:'social',label:'Soft Social'}];
window.addEventListener('minglora:settings-loaded',event=>{state.settings=event.detail||null;const sort=$('#feed-sort');if(sort&&state.view==='feed'){sort.value=state.settings?.preferences?.feedSort==='oldest'?'old':'new';sort.dispatchEvent(new Event('change'));}renderPaletteSwitcher();});
const DEFAULT_PROFILE_AVATAR='/assets/default-profile-avatar-3d.svg?v=20261106-profile-defaults-2';
const DEFAULT_PROFILE_COVER='/assets/default-profile-cover.svg?v=20261106-profile-defaults-1';
const fallbackAvatar = () => DEFAULT_PROFILE_AVATAR;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatar = u => esc(u?.avatar || fallbackAvatar(u?.name));
function thoughtAvatarMarkup(member,className='avatar',clickToProfile=false){
  const profileAttr=clickToProfile?' data-profile="'+esc(member?.id||'')+'"':'';
  const image='<img class="'+esc(className)+'"'+profileAttr+' src="'+avatar(member)+'" alt="">';
  if(!member?.id)return image;
  if(!member?.profileThought?.text&&member.id===state.user?.id)return '<span class="ml-thought-avatar-wrap">'+image+'<button type="button" class="ml-thought-avatar-indicator ml-thought-avatar-add" data-edit-profile-thought aria-label="Share a thought" title="Share a thought">+</button></span>';
  if(!member?.profileThought?.text)return image;
  return '<span class="ml-thought-avatar-wrap">'+image+'<button type="button" class="ml-thought-avatar-indicator" data-view-profile-thought-user="'+esc(member.id)+'" aria-label="View '+esc(member.name||'member')+'’s thought" title="View thought">…</button></span>';
}
const verifiedProfileBadge = member => member?.verificationBadge==='blue'
  ? '<span class="profile-blue-verification" role="img" aria-label="Verified on Minglora" title="Verified on Minglora">✓</span>'
  : '';
const platformAdminProfileBadge = member => member?.platformBadge==='admin'
  ? '<span class="platform-admin-profile-badge" role="img" aria-label="Minglora platform administrator" title="Minglora platform administrator"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 21 5.2v6.5c0 5.4-3.6 9.1-9 11.5-5.4-2.4-9-6.1-9-11.5V5.2L12 1.8Z"></path><path d="m8.3 12.2 2.3 2.3 5.2-5.3"></path></svg><span>Admin</span></span>'
  : '';
const creatorLeagueProfileBadge = member => {
  const league=String(member?.creatorLeague?.leagueClass||'').trim().toUpperCase();
  if(!/^(D[1-5]|C[1-5]|B[1-5]|A[1-3])$/.test(league))return '';
  return '<span class="creator-league-profile-badge" role="img" aria-label="Creator League '+league+'" title="Creator League · '+league+'"><span aria-hidden="true">🏆</span> '+league+'</span>';
};
const gifterProfileBadge = member => {
  const identity=member?.newGifterIdentity?.active
    ? '<span class="gp-new-gifter-identity" role="status" aria-label="New Gifter identity active for one week" title="New Gifter · expires '+esc(member.newGifterIdentity.expiresAt)+'">NEW GIFTER</span>'
    : '';
  const leagueBadge=creatorLeagueProfileBadge(member);
  const badge=member?.gifterBadge;
  if(!badge?.level)return identity+leagueBadge;
  const level=Math.max(1,Math.min(50,Math.floor(Number(badge.level)||1)));
  const tier=Math.max(1,Math.min(10,Math.ceil(level/5)));
  const title=esc(badge.badgeName||('Gifter LV '+level));
  const artwork=window.MingloraGifterBadgeArt?.render
    ? window.MingloraGifterBadgeArt.render({level,tier,badgeName:title,inline:true})
    : '<span class="gp-inline-badge gp-tier-'+tier+'" role="img" aria-label="'+title+'" title="'+title+'"><strong>'+level+'</strong></span>';
  return identity+artwork+
    (badge.adminAwarded?'<span class="gp-admin-awarded-marker" title="Admin-awarded gifter badge; no Coin spending was added">ADMIN AWARDED</span>':'')+
    (badge.liveEntranceUnlocked?'<span class="gp-live-entry-badge" role="img" aria-label="LV 25 LIVE entrance unlocked" title="LV 25 LIVE entrance unlocked">LIVE ENTRY</span>':'')+
    leagueBadge;
};
window.addEventListener('minglora:gifter-badge-updated',event=>{
  if(state.user){
    state.user.gifterBadge=event.detail?.badge||null;
    state.user.newGifterIdentity=event.detail?.newGifterIdentity||null;
  }
});
const timeAgo = date => {const sec=Math.max(0,(Date.now()-new Date(date).getTime())/1000);if(sec<60)return 'Just now';if(sec<3600)return `${Math.floor(sec/60)}m`;if(sec<86400)return `${Math.floor(sec/3600)}h`;if(sec<604800)return `${Math.floor(sec/86400)}d`;return new Date(date).toLocaleDateString();};
function getMingloraDeviceTimeZone(){
  try{
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(zone&&typeof zone==='string')return zone;
  }catch{}
  return '';
}
function mingloraDeviceContextHeaders(){
  const zone=getMingloraDeviceTimeZone();
  return zone?{'X-Minglora-Time-Zone':zone}:{};
}
window.MingloraDeviceContextHeaders=mingloraDeviceContextHeaders;
async function api(path, options={}) { let res;try{res=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...mingloraDeviceContextHeaders(),...(options.headers||{})},cache:'no-store'});}catch{throw new Error(navigator.onLine===false?'You appear to be offline. Reconnect and try again.':'Could not reach Minglora. Check your connection and try again.');}let data={};try{data=await res.json()}catch{}if(!res.ok){const error=new Error(data.error||`Request failed (${res.status})`);error.status=res.status;error.code=data.code||'';const retryAfter=Number(res.headers?.get?.('Retry-After')||data.retryAfterSeconds);if(Number.isFinite(retryAfter)&&retryAfter>0)error.retryAfterSeconds=Math.ceil(retryAfter);throw error;}return data; }
let creatorLeagueProfileRefreshTimer=null;
function stopCreatorLeagueProfileRefresh(){
  if(creatorLeagueProfileRefreshTimer!==null)window.clearInterval(creatorLeagueProfileRefreshTimer);
  creatorLeagueProfileRefreshTimer=null;
}
function startCreatorLeagueProfileRefresh(){ /* Automatic page refresh disabled. */ }
function stopProfilePresence(){stopCreatorLeagueProfileRefresh();}
const APP_PALETTE_OPTIONS=[
  {value:'minglora',label:'Minglora Blue',color:'#1769e0'},
  {value:'ocean',label:'Ocean Breeze',color:'#0f766e'},
  {value:'tropical',label:'Tropical Pulse',color:'#e45b4d'},
  {value:'royal',label:'Royal Amethyst',color:'#7146c7'},
  {value:'emerald',label:'Emerald Garden',color:'#16834f'},
  {value:'rose',label:'Rose Bloom',color:'#be315f'},
  {value:'golden',label:'Golden Hour',color:'#a16207'},
  {value:'lavender',label:'Lavender Cloud',color:'#7864c8'},
  {value:'midnight',label:'Midnight Neon',color:'#38bdf8'},
  {value:'graphite',label:'Graphite Studio',color:'#64748b'}
];
const LIVE_PALETTE_OPTIONS=[
  {value:'studio',label:'Creator Studio',color:'#c4d1e2'},
  {value:'ocean',label:'Ocean Stage',color:'#67e8f9'},
  {value:'tropical',label:'Tropical Party',color:'#ffab91'},
  {value:'royal',label:'Royal Lounge',color:'#f2d58e'},
  {value:'neon',label:'Neon Arena',color:'#67e8f9'},
  {value:'sunset',label:'Sunset Spotlight',color:'#fbbf64'},
  {value:'garden',label:'Garden Glow',color:'#6ee7b7'},
  {value:'social',label:'Soft Social',color:'#e9b9e9'}
];
function renderPaletteSwitcher(){
  const panel=$('#palette-switcher');
  if(!panel)return;
  const preferences=state.settings?.preferences||{};
  const appTheme=preferences.colorTheme||document.body.dataset.colorTheme||'minglora';
  const liveTheme=preferences.liveRoomTheme||'studio';
  const appButtons=APP_PALETTE_OPTIONS.map(item=>"<button type='button' class='palette-swatch "+(item.value===appTheme?"active":"")+"' data-app-palette='"+item.value+"' style='--palette-color:"+item.color+"' aria-pressed='"+(item.value===appTheme?"true":"false")+"'><i></i><span>"+item.label+"</span></button>").join("");
  const liveButtons=LIVE_PALETTE_OPTIONS.map(item=>"<button type='button' class='palette-swatch "+(item.value===liveTheme?"active":"")+"' data-live-palette='"+item.value+"' style='--palette-color:"+item.color+"' aria-pressed='"+(item.value===liveTheme?"true":"false")+"'><i></i><span>"+item.label+"</span></button>").join("");
  panel.innerHTML="<div class='palette-switcher-head'><div><strong>Personalise Minglora</strong><small>Change your look whenever you like</small></div><button type='button' class='palette-switcher-close' id='palette-switcher-close' aria-label='Close palettes'>×</button></div>"+
    "<section class='palette-switcher-section'><div class='palette-switcher-label'><strong>App palette</strong><small>Changes the full Minglora interface</small></div><div class='palette-swatch-grid'>"+appButtons+"</div></section>"+
    "<section class='palette-switcher-section'><div class='palette-switcher-label'><strong>LIVE room palette</strong><small>Sets your default room look; hosts can also update an active room</small></div><div class='palette-swatch-grid live-palette-grid'>"+liveButtons+"</div></section>"+
    "<p class='palette-switcher-status' id='palette-switcher-status' role='status'>Your palette changes save to your Minglora account.</p>"+
    "<button type='button' class='palette-switcher-more' id='palette-switcher-more'>Open Theme Centre settings ↗</button>";
  panel.querySelectorAll('[data-app-palette]').forEach(button=>button.addEventListener('click',()=>saveMingloraPalette('app',button.dataset.appPalette,button)));
  panel.querySelectorAll('[data-live-palette]').forEach(button=>button.addEventListener('click',()=>saveMingloraPalette('live',button.dataset.livePalette,button)));
  $('#palette-switcher-close')?.addEventListener('click',closePaletteSwitcher);
  $('#palette-switcher-more')?.addEventListener('click',()=>{closePaletteSwitcher();window.MingloraSettings?.open?.();});
}
function openPaletteSwitcher(){
  const panel=$('#palette-switcher'),toggle=$('#palette-toggle');
  if(!panel||!toggle)return;
  renderPaletteSwitcher();panel.classList.remove('hidden');toggle.setAttribute('aria-expanded','true');
}
function closePaletteSwitcher(){
  $('#palette-switcher')?.classList.add('hidden');
  $('#palette-toggle')?.setAttribute('aria-expanded','false');
}
async function saveMingloraPalette(kind,value,button){
  const status=$('#palette-switcher-status');
  if(button)button.disabled=true;
  if(status)status.textContent='Saving your palette…';
  try{
    const key=kind==='app'?'colorTheme':'liveRoomTheme';
    const result=await api('/settings',{method:'PATCH',body:JSON.stringify({preferences:{[key]:value}})});
    state.settings=result.settings;
    if(kind==='app'){
      document.body.dataset.colorTheme=value;
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content',APP_PALETTE_OPTIONS.find(item=>item.value===value)?.color||'#1769e0');
    }
    window.dispatchEvent(new CustomEvent('minglora:settings-loaded',{detail:result.settings}));
    if(kind==='live'&&activeLiveSession&&activeLiveRole==='host'){
      try{
        await api('/live/sessions/'+encodeURIComponent(activeLiveSession.id)+'/theme',{method:'PATCH',body:JSON.stringify({liveTheme:value})});
        activeLiveSession.liveTheme=value;
        const player=document.querySelector('.live-player-shell');
        if(player){
          [...player.classList].filter(name=>name.startsWith('live-theme-')).forEach(name=>player.classList.remove(name));
          player.classList.add('live-theme-'+value);
        }
      }catch(error){
        renderPaletteSwitcher();
        toast('Your default LIVE palette was saved, but the current room could not be updated: '+error.message);
        return;
      }
    }
    renderPaletteSwitcher();
    toast(kind==='app'?'Minglora app palette updated.':'Your LIVE room palette was saved'+(activeLiveSession&&activeLiveRole==='host'?' and applied to this LIVE.':'.'));
  }catch(error){
    const current=$('#palette-switcher-status');
    if(current)current.textContent='Palette not saved. '+error.message;
    toast('Palette not saved: '+error.message);
  }finally{
    if(button)button.disabled=false;
  }
}
function bindPaletteSwitcher(){
  const toggle=$('#palette-toggle');
  if(toggle&&!toggle.dataset.bound){
    toggle.dataset.bound='true';
    toggle.addEventListener('click',()=>$('#palette-switcher')?.classList.contains('hidden')?openPaletteSwitcher():closePaletteSwitcher());
  }
  if(!document.documentElement.dataset.paletteOutsideBound){
    document.documentElement.dataset.paletteOutsideBound='true';
    document.addEventListener('click',event=>{
      const anchor=$('.palette-menu-anchor');
      if(anchor&&!anchor.contains(event.target))closePaletteSwitcher();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closePaletteSwitcher();});
  }
  renderPaletteSwitcher();
}

let toastTimer;
let messageRefreshKnownIncomingIds=new Set(),messageRefreshKnownIncomingPrimed=false,messengerMessageSoundContext=null;
let browserNotificationTimer=null;
let notificationFilter='all',notificationSearch='';
let browserNotificationSeen=new Set();
let browserNotificationPrimed=false;
let webPushSubscriptionActive=false;
let incomingCallPollingTimer=null,incomingCallPollBusy=false,incomingCallOverlay=null,incomingCallStatusTimer=null;
let outgoingCallOverlay=null,outgoingCallPending=null,callRingtoneCache={loadedAt:0,ringtone:null};
let callRingtoneAudio=null,callToneContext=null,callToneNodes=[],callToneTimer=null;
window.addEventListener('minglora:call-ringtone-updated',()=>{callRingtoneCache={loadedAt:0,ringtone:null};});
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function showAuth(){ stopMessengerRealtime();$('#app').classList.add('hidden');$('#auth-screen').classList.remove('hidden'); }
function showApp(){ $('#auth-screen').classList.add('hidden');$('#app').classList.remove('hidden');$('#top-avatar').src=avatar(state.user);$('#rail-avatar').src=avatar(state.user);$('#top-name').textContent=state.user.name.split(' ')[0];$('#rail-name').textContent=state.user.name;window.dispatchEvent(new Event('minglora:session-ready'));startMessengerRealtime();startBrowserNotificationPolling();startIncomingCallPolling();prepareMingloraServiceWorker();handleMingloraPushNavigation(); }
function primeCallAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!callToneContext)callToneContext=new C();if(callToneContext.state==='suspended')void callToneContext.resume();}catch{}}
document.addEventListener('pointerdown',primeCallAudio,{capture:true,once:true});
function base64UrlToBytes(value){
  const base64=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=base64+'='.repeat((4-base64.length%4)%4);
  return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}
async function prepareMingloraServiceWorker(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  try{
    const registration=await navigator.serviceWorker.register('/sw.js?v=20261107-auto-sync-no-refresh-1',{scope:'/',updateViaCache:'none'});
    // Keep the installed shell current even while the visitor is signed out.
    // The browser checks for worker updates normally; new versions must not take over this open page.
    if(!state.user)return;
    const subscription=await registration.pushManager.getSubscription();
    if(subscription){
      webPushSubscriptionActive=true;
      await api('/push/subscriptions',{method:'POST',body:JSON.stringify(subscription.toJSON())}).catch(()=>{});
    }
  }catch(error){console.warn('Minglora background push setup:',error.message);}
}
// Register and update the application shell before the auth bootstrap runs.
// This prevents an old installed-app cache from trapping the user on stale login code.
void prepareMingloraServiceWorker();
async function enableMingloraPush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){toast('This browser does not support device push notifications.');return;}
  try{
    const permission=Notification.permission==='granted'? 'granted':await Notification.requestPermission();
    if(permission!=='granted'){toast('Allow notifications in your browser settings to enable Minglora push.');return;}
    const [keyData,registration]=await Promise.all([
      api('/push/public-key'),
      navigator.serviceWorker.register('/sw.js?v=20261107-auto-sync-no-refresh-1',{scope:'/',updateViaCache:'none'})
    ]);
    if(!keyData.publicKey)throw new Error('Minglora could not retrieve its device push key.');
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToBytes(keyData.publicKey)});
    await api('/push/subscriptions',{method:'POST',body:JSON.stringify(subscription.toJSON())});
    webPushSubscriptionActive=true;
    toast('Minglora push notifications are enabled on this device.');
    return true;
  }catch(error){toast(error.message||'Could not enable device push.');return false;}
}
async function handleMingloraPushNavigation(){
  const params=new URLSearchParams(window.location.search),type=params.get('minglora-push');
  if(!type||!state.user)return;
  const callId=params.get('callId'),liveSessionId=params.get('liveSessionId'),actorId=params.get('actorId');
  window.history.replaceState({},'',window.location.pathname+window.location.hash);
  try{
    if(type==='answer-call'&&callId){await answerMingloraCall(callId);return;}
    if(type==='decline-call'&&callId){await declineMingloraCall(callId);return;}
    if(type==='call'&&callId){const calls=(await api('/calls/incoming')).calls||[];const incoming=calls.find(item=>item.id===callId);if(incoming)await showIncomingCallOverlay(incoming);else await renderNotifications();return;}
    if(type==='live'&&liveSessionId){
      const sessions=(await api('/live/sessions')).sessions||[],session=sessions.find(item=>item.id===liveSessionId);
      if(session){await openLiveRoom(session,session.hostId===state.user.id?'host':'viewer');return;}
      toast('This LIVE session has ended.');
    }
    if(type==='message'&&actorId){
      const member=(await api('/users')).users?.find(item=>item.id===actorId);
      if(member){await openMessageWindow(member);return;}
    }
    await renderNotifications();
  }catch(error){toast(error.message);}
}
function syncNavigationActive(){
  const activeView=state.view==='feed'&&state.feedScope==='for-you'?'for-you':state.view;
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===activeView));
  const moreButton=document.querySelector('#mobile-more-nav');
  moreButton?.classList.toggle('active',activeView==='more'||!['feed','for-you','profile','friends','live','messages'].includes(activeView));
}
function activateNav(view){const requestedView=view;if(requestedView==='profile'&&state.user){state.profileTargetId=String(state.user.id);state.profileTab='posts';}if(state.view==='meetwave'&&requestedView!=='meetwave')window.MingloraMeetWave?.onNavigateAway?.();if(state.view==='leagues'&&requestedView!=='leagues')window.MingloraLeagues?.onNavigateAway?.();if(state.view==='gifter-progression'&&requestedView!=='gifter-progression')window.MingloraGifterProgression?.onNavigateAway?.();if(state.view==='feed'&&requestedView!=='feed'&&requestedView!=='for-you')stopFeedAutoSync();if(requestedView==='for-you'){state.feedScope='for-you';view='feed';}else if(requestedView==='feed'&&!restoringSavedView){state.feedScope='all';}if(view!=='profile')stopProfilePresence();if(view!=='friends')stopPeopleDiscoveryRefresh();if(view!=='profile')state.profileTargetId='';state.view=view;syncMessageRefreshPolling();syncNavigationActive();persistCurrentView();recordBrowserNavigation();return renderView();}
window.addEventListener('minglora:open-wallet',event=>{
  const tab=['recharge','earnings','exchange'].includes(event.detail?.tab)?event.detail.tab:'recharge';
  state.rechargeTab=tab;
  activateNav('coins');
});
window.addEventListener('minglora:open-creator-section',async event=>{
  const section=['monetization','overview','audience','analytics','pages','settings'].includes(event.detail?.section)?event.detail.section:'monetization';
  await renderCreator();
  await renderCreatorSection(section);
});
function setContent(html){$('#main-content').innerHTML=html;bindSoundtrackPlayback($('#main-content'));bindProfileThoughtControls($('#main-content'));bindProfileLinks($('#main-content'));}
const MESSENGER_ICON_SPRITE='/assets/icons/navigation-3d.svg?v=20261104-recharge-wallet-3d-2';
function messenger3dIcon(id,className='messenger-3d-icon'){
  return '<svg class="'+className+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="'+MESSENGER_ICON_SPRITE+'#'+id+'"></use></svg>';
}
function composer(){return `<section class="card"><div class="composer-top">${thoughtAvatarMarkup(state.user)}<button class="composer-open" id="open-composer" type="button" aria-haspopup="dialog">${messenger3dIcon('share','composer-share-icon')}<span>Share your thoughts, ${esc(state.user.name.split(' ')[0])}?</span></button></div><div class="composer-actions"><button id="post-photo" class="photo" type="button">${messenger3dIcon('photo','composer-action-icon')}<span>Photo / link</span></button><button id="post-feeling" class="feeling" type="button">${messenger3dIcon('feeling','composer-action-icon')}<span>Feeling / activity</span></button><button id="post-text" type="button">${messenger3dIcon('create','composer-action-icon')}<span>Share thoughts</span></button></div></section>`;}
function renderSingleMedia(media,className='post-media-viewer'){
  if(!media?.url)return '';
  const url=esc(media.url);
  if(media.mediaType==='video')return '<video class="'+className+'" controls playsinline preload="metadata" src="'+url+'"></video>';
  if(media.mediaType==='audio')return '<audio class="'+className+'" controls preload="metadata" src="'+url+'"></audio>';
  if(media.mediaType==='model3d')return '<model-viewer class="'+className+'-3d" src="'+url+'" alt="Interactive 3D model" camera-controls auto-rotate shadow-intensity="1"></model-viewer>';
  return '<img class="'+className+'" loading="lazy" src="'+url+'" alt="Uploaded media">';
}
function renderStoryPreview(media){
  if(!media?.url)return '';
  if(media.mediaType==='video')return '<video class="story-image" muted playsinline preload="metadata" src="'+esc(media.url)+'"></video>';
  if(media.mediaType==='image')return '<img class="story-image" loading="lazy" src="'+esc(media.url)+'" alt="">';
  return '<span class="story-text-background">Story media</span>';
}
function renderPostMedia(post){
  const media=Array.isArray(post.media)?post.media:[];
  const items=media.map(item=>{
    const url=esc(item.url||'');
    if(!url)return '';
    if(item.mediaType==='video')return '<video class="post-media-video" controls playsinline preload="metadata" src="'+url+'"></video>';
    if(item.mediaType==='audio')return '<audio class="post-media-audio" controls preload="metadata" src="'+url+'"></audio>';
    if(item.mediaType==='model3d')return '<model-viewer class="post-media-3d" src="'+url+'" alt="Interactive 3D model" camera-controls auto-rotate shadow-intensity="1" loading="lazy"></model-viewer>';
    return '<img class="post-image" loading="lazy" src="'+url+'" alt="Post attachment">';
  }).join('');
  return items;
}
function renderPostSoundtrack(post){
  const track=post.soundtrack,sound=track?.sound;
  if(!sound?.url)return '';
  const volume=Number.isFinite(Number(track.volume))?Math.max(0,Math.min(1,Number(track.volume))):1;
  return '<section class="post-soundtrack" aria-label="Minglora soundtrack"><div class="post-soundtrack-title"><span aria-hidden="true">♫</span><span><strong>'+esc(sound.title)+'</strong><small>'+(sound.attribution?esc(sound.attribution)+' · ':'')+'@'+esc(sound.author?.username||'creator')+'</small></span></div><audio controls preload="none" data-minglora-soundtrack data-start-ms="'+Number(track.startMs||0)+'" data-end-ms="'+Number(track.endMs||0)+'" data-volume="'+volume+'" data-fade-in-ms="'+Number(track.fadeInMs||0)+'" data-fade-out-ms="'+Number(track.fadeOutMs||0)+'" src="'+esc(sound.url)+'" aria-label="Play '+esc(sound.title)+'"></audio></section>';
}
function bindSoundtrackPlayback(root=document){
  root.querySelectorAll('[data-minglora-soundtrack]').forEach(player=>{
    const start=Math.max(0,Number(player.dataset.startMs||0))/1000;
    const end=Math.max(0,Number(player.dataset.endMs||0))/1000;
    const baseVolume=Math.max(0,Math.min(1,Number(player.dataset.volume??1)));
    const fadeIn=Math.max(0,Number(player.dataset.fadeInMs||0))/1000;
    const fadeOut=Math.max(0,Number(player.dataset.fadeOutMs||0))/1000;
    const seekTo=seconds=>{
      if(!Number.isFinite(player.duration)||!player.duration)return;
      player.currentTime=Math.max(0,Math.min(player.duration-.05,seconds));
    };
    const post=player.closest('[data-post]');
    const videos=post?[...post.querySelectorAll('video.post-media-video')]:[...root.querySelectorAll('video.story-viewer-image')];
    videos.forEach(video=>{
      if(video.dataset.soundtrackBound==='true')return;
      video.dataset.soundtrackBound='true';
      video.addEventListener('play',()=>{
        const offset=Math.max(0,Number(video.currentTime||0));
        seekTo(start+offset);player.play().catch(()=>{});
      });
      video.addEventListener('pause',()=>player.pause());
      video.addEventListener('seeking',()=>{if(!player.paused)seekTo(start+Number(video.currentTime||0));});
      video.addEventListener('ended',()=>player.pause());
    });
    if(player.dataset.soundtrackBound==='true')return;
    player.dataset.soundtrackBound='true';
    player.volume=baseVolume;
    player.addEventListener('loadedmetadata',()=>seekTo(start));
    player.addEventListener('timeupdate',()=>{
      const clipEnd=end||player.duration;
      if(clipEnd&&player.currentTime>=clipEnd){player.pause();seekTo(start);return;}
      let gain=baseVolume;
      const elapsed=Math.max(0,player.currentTime-start);
      if(fadeIn>0&&elapsed<fadeIn)gain*=elapsed/fadeIn;
      if(fadeOut>0&&clipEnd&&player.currentTime>clipEnd-fadeOut)gain*=Math.max(0,(clipEnd-player.currentTime)/fadeOut);
      player.volume=Math.max(0,Math.min(1,gain));
    });
  });
}
function renderSavedControls(post){
  return `<section class="saved-post-manager" aria-label="Saved post organization">
    <div class="saved-post-manager-top">
      <div class="saved-post-markers">
        <span class="saved-private-label">🔒 Private to you</span>
        ${post.savedAt?`<span class="saved-time-label">Saved ${timeAgo(post.savedAt)}</span>`:''}
        ${post.isFavorite?'<span class="saved-state-label">★ Favorite</span>':''}
        ${post.readLater?'<span class="saved-state-label">◷ Read later</span>':''}
      </div>
      <label class="saved-move-label">Collection
        <select data-saved-collection-select="${esc(post.id)}" aria-label="Move saved post to a collection">
          <option value="">All saved</option>
          ${state.savedPostCollections.map(collection=>`<option value="${esc(collection.id)}" ${post.collectionId===collection.id?'selected':''}>${esc(collection.title)}</option>`).join('')}
        </select>
      </label>
    </div>
    ${post.note?`<p class="saved-private-note"><strong>Your note:</strong> ${esc(post.note)}</p>`:''}
    ${Array.isArray(post.tags)&&post.tags.length?`<div class="saved-tags">${post.tags.map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>`:''}
    <div class="saved-post-tools">
      <button type="button" data-saved-favorite="${esc(post.id)}" aria-pressed="${post.isFavorite?'true':'false'}">${post.isFavorite?'★ Favorited':'☆ Add favorite'}</button>
      <button type="button" data-saved-read-later="${esc(post.id)}" aria-pressed="${post.readLater?'true':'false'}">${post.readLater?'✓ In Read Later':'◷ Read later'}</button>
      <button type="button" data-saved-note-toggle="${esc(post.id)}">✎ ${post.note||post.tags?.length?'Edit note & tags':'Add private note & tags'}</button>
    </div>
    <form class="saved-details-form hidden" data-saved-details-form="${esc(post.id)}">
      <label>Private note<textarea name="note" maxlength="500" placeholder="Add a reminder or context only you can see…">${esc(post.note||'')}</textarea></label>
      <label>Tags <input name="tags" maxlength="220" value="${esc((post.tags||[]).join(', '))}" placeholder="ideas, travel, recipes"></label>
      <div class="saved-details-actions"><button class="primary" type="submit">Save details</button><button class="secondary" type="button" data-saved-details-cancel="${esc(post.id)}">Cancel</button></div>
    </form>
  </section>`;
}

function postCard(post,options={}){
  const author=post.author||{}, comments=post.comments||[];
  const savedControls=options.saved?renderSavedControls(post):'';
  return `<article class="card post" data-post="${esc(post.id)}">
    <div class="post-head">${thoughtAvatarMarkup(author,'avatar',true)}
      <div class="post-author"><strong data-profile="${esc(author.id||'')}">${esc(author.name||'Unknown account')}</strong><small>@${esc(author.username||'')} ${verifiedProfileBadge(author)}${gifterProfileBadge(author)} · ${timeAgo(post.createdAt)} · ◉</small></div>
      <button class="post-menu" aria-label="Post options" data-post-menu="${esc(post.id)}">···</button>
    </div>
    ${post.text?`<div class="post-text">${esc(post.text)}</div>`:''}
    ${renderPostMedia(post)}
    ${renderPostSoundtrack(post)}
    <div class="post-stats"><span>👍 ${post.reactionCount||0} ${post.reactionCount===1?'reaction':'reactions'}</span><span>${comments.length} comments</span></div>
    <div class="post-actions">
      <button class="${post.myReaction?'liked':''}" data-react="${esc(post.id)}">${post.myReaction==='love'?'❤️':post.myReaction==='haha'?'😆':post.myReaction==='care'?'🤗':post.myReaction?'👍':'♡'} &nbsp; ${post.myReaction?esc(post.myReaction[0].toUpperCase()+post.myReaction.slice(1)):'Like'}</button>
      <button data-focus-comment="${esc(post.id)}">▢ &nbsp; Comment</button>
      <button data-toggle-save="${esc(post.id)}" data-saved="${post.isSaved?'true':'false'}">${post.isSaved?'▣ Saved':'▢ Save'}</button>
      <button data-share="${esc(post.id)}">↗ &nbsp; Share</button>
      <button type="button" data-gift-content="post" data-gift-id="${esc(post.id)}" data-gift-username="${esc(author.username||'')}">🎁 Gift</button>
    </div>
    ${savedControls}
    ${comments.length?`<div class="comments">${comments.slice(-3).map(c=>`<div class="comment">${thoughtAvatarMarkup(c.author,'avatar',true)}<div class="comment-bubble"><strong data-profile="${esc(c.author?.id||'')}" role="link" tabindex="0">${esc(c.author?.name||'Member')}</strong><small class="comment-author-username" data-profile="${esc(c.author?.id||'')}" role="link" tabindex="0">@${esc(c.author?.username||'')} ${verifiedProfileBadge(c.author)}${gifterProfileBadge(c.author)}</small>${esc(c.text)}${c.userId===state.user.id||post.userId===state.user.id?`<button class="comment-delete" data-delete-comment-post="${esc(post.id)}" data-delete-comment-id="${esc(c.id)}">Delete</button>`:''}</div>${c.userId!==state.user.id?`<button class="comment-delete" data-report-comment="${esc(c.id)}">Report</button>`:''}</div>`).join('')}</div>`:''}
    <form class="comment-form" data-comment-form="${esc(post.id)}">${thoughtAvatarMarkup(state.user)}<input name="text" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment" required><button type="submit">Send</button></form>
  </article>`;
}
function findVisiblePost(id){
  return [...state.feed,...state.savedPosts,...(state.profile?.posts||[]),...(state.creatorStudio?.profile?.posts||[]),...(state.searchResults?.posts||[])].find(post=>post.id===id);
}
async function refreshVisiblePosts(){
  if(state.view==='creator'&&state.creatorStudio){state.creatorStudio.profile=await api('/users/'+encodeURIComponent(state.user.id));await renderCreatorSection(state.creatorStudio.section||'content');return;}
  if(state.view==='group'&&state.activeGroup){await renderGroup(state.activeGroup);return;}
  if(state.view==='saved'){await renderSavedPosts();return;}
  if(state.view==='profile'&&state.profile?.user?.id){await openProfile(state.profile.user.id);return;}
  if(state.view==='search'){
    const query=$('#search-input')?.value.trim();
    if(query){await renderSearch(query);return;}
  }
  await loadFeed();await renderFeed();
}
function bindFeed(root=document){
  if(root===document){
    bindSoundtrackPlayback(document);
    $('#open-composer')?.addEventListener('click',()=>openComposer());
    $('#post-text')?.addEventListener('click',()=>openComposer());
    $('#post-photo')?.addEventListener('click',()=>openComposer(true));
    $('#post-feeling')?.addEventListener('click',()=>openComposer());
  }else bindSoundtrackPlayback(root);
  root.querySelector('#create-story')?.addEventListener('click',()=>openStoryComposer());
  root.querySelectorAll('[data-open-story]').forEach(el=>el.addEventListener('click',()=>openStory(el.dataset.openStory)));
  bindProfileLinks(root);
  root.querySelectorAll('[data-react]').forEach(el=>el.addEventListener('click',async()=>{
    try{await api(`/posts/${el.dataset.react}/reactions`,{method:'POST',body:JSON.stringify({reaction:'like'})});await refreshVisiblePosts();}
    catch(e){toast(e.message);}
  }));
  root.querySelectorAll('[data-comment-form]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const input=form.elements.text;
    try{await api(`/posts/${form.dataset.commentForm}/comments`,{method:'POST',body:JSON.stringify({text:input.value})});await refreshVisiblePosts();}
    catch(err){toast(err.message);}
  }));
  root.querySelectorAll('[data-report-comment]').forEach(btn=>btn.addEventListener('click',()=>openReportComposer('comment',btn.dataset.reportComment)));
  root.querySelectorAll('[data-delete-comment-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!window.confirm('Delete this comment?'))return;
    try{await api(`/posts/${btn.dataset.deleteCommentPost}/comments/${btn.dataset.deleteCommentId}`,{method:'DELETE',body:'{}'});await refreshVisiblePosts();toast('Comment deleted.');}
    catch(err){toast(err.message);}
  }));
  root.querySelectorAll('[data-focus-comment]').forEach(el=>el.addEventListener('click',()=>root.querySelector(`[data-comment-form="${el.dataset.focusComment}"] input`)?.focus()));
  root.querySelectorAll('[data-toggle-save]').forEach(btn=>btn.addEventListener('click',async()=>{
    const saving=btn.dataset.saved!=='true';
    try{await api(`/posts/${btn.dataset.toggleSave}/save`,{method:saving?'POST':'DELETE',body:'{}'});await refreshVisiblePosts();toast(saving?'Post saved.':'Post removed from saved posts.');}
    catch(err){toast(err.message);}
  }));
  root.querySelectorAll('[data-share]').forEach(el=>el.addEventListener('click',async()=>{
    const post=findVisiblePost(el.dataset.share);if(!post)return;
    try{await navigator.clipboard.writeText(`${location.origin}/#post-${post.id}`);toast('Post link copied.');}
    catch{toast('Copy this page URL to share the post.');}
  }));
  root.querySelectorAll('[data-post-menu]').forEach(el=>el.addEventListener('click',()=>{
    const post=findVisiblePost(el.dataset.postMenu);if(post)openPostOptions(post);
  }));
}
function openEditPost(post){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-post-title"><div class="modal-head"><h2 id="edit-post-title">Edit post</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="edit-post-form"><div class="field"><label for="edit-post-text">Post text</label><textarea id="edit-post-text" name="text" maxlength="5000">'+esc(post.text||'')+'</textarea></div><div class="field"><label>Photos, videos and audio attachments</label><div id="edit-post-media-picker"></div></div><div class="field"><label>Soundtrack</label><div id="edit-post-soundtrack"></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Save changes</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#edit-post-media-picker'),{slot:'post',initialMedia:post.media||[]});
  const soundtrack=createSoundtrackEditor(modal.querySelector('#edit-post-soundtrack'),post.soundtrack||null);
  const close=()=>{picker.destroy();soundtrack.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      await api('/posts/'+encodeURIComponent(post.id),{method:'PATCH',body:JSON.stringify({text:values.get('text'),mediaIds,audience:values.get('audience'),soundtrack:soundtrack.value()})});
      close();await refreshVisiblePosts();toast('Post updated.');
    }catch(error){toast(error.message);button.disabled=false;}
  };
}

function openReportComposer(targetType,targetId){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><div class="modal-head"><h2 id="report-title">Report '+esc(targetType)+'</h2><button class="modal-close" aria-label="Close">×</button></div><form id="report-form" class="modal-body"><p class="muted">Reports are reviewed by Minglora moderators. Reporting does not automatically remove content.</p><label class="field"><span>Reason</span><select name="category" required><option value="spam">Spam</option><option value="harassment">Harassment or bullying</option><option value="hate">Hate or discrimination</option><option value="nudity">Nudity or sexual content</option><option value="violence">Violence or threats</option><option value="scam">Scam or fraud</option><option value="impersonation">Impersonation</option><option value="copyright">Copyright</option><option value="privacy">Privacy concern</option><option value="other">Other</option></select></label><label class="field"><span>Additional details (optional)</span><textarea name="details" rows="4" maxlength="2000" placeholder="Tell the moderator what happened."></textarea></label><p class="auth-error" id="report-status" role="status"></p><button class="primary full" type="submit">Submit report</button></form></section>';
  document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();modal.addEventListener('click',event=>{if(event.target===modal)modal.remove();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,values=new FormData(form),button=form.querySelector('button[type="submit"]'),status=modal.querySelector('#report-status');button.disabled=true;
    try{await api('/reports',{method:'POST',body:JSON.stringify({targetType,targetId,category:values.get('category'),details:values.get('details')})});modal.remove();toast('Report submitted to Minglora moderation.');}
    catch(error){status.textContent=error.message;button.disabled=false;}
  });
}
function openPostOptions(post){
  const owner=post.userId===state.user.id, author=post.author||{};
  const modal=document.createElement('div');modal.className='modal-backdrop';
  const actions=owner
    ? '<button class="secondary full" data-post-action="edit">Edit post</button>'+(post.archivedAt?'':'<button class="secondary full" data-post-action="archive">Archive post</button>')+'<button class="secondary full" data-post-action="delete">Delete post</button>'
    : `<button class="secondary full" data-post-action="report-post">Report this post</button><button class="secondary full" data-post-action="report-user">Report ${esc(author.name||'this member')}</button><button class="secondary full" data-post-action="block">Block ${esc(author.name||'this member')}</button>`;
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="post-options-title"><div class="modal-head"><h2 id="post-options-title">Post options</h2><button class="modal-close" aria-label="Close">×</button></div><div class="modal-body">${actions}<button type="button" class="secondary full modal-cancel">Cancel</button></div></section>`;
  document.body.append(modal);
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=()=>modal.remove());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('[data-post-action="edit"]')?.addEventListener('click',()=>{modal.remove();openEditPost(post);});
  modal.querySelector('[data-post-action="archive"]')?.addEventListener('click',async()=>{try{await api('/profile/archive',{method:'POST',body:JSON.stringify({postId:post.id})});modal.remove();await refreshVisiblePosts();toast('Post moved to your archive.');}catch(error){toast(error.message);}});
  modal.querySelector('[data-post-action="delete"]')?.addEventListener('click',async()=>{
    if(!window.confirm('Delete this post permanently?'))return;
    try{await api(`/posts/${post.id}`,{method:'DELETE',body:'{}'});modal.remove();await refreshVisiblePosts();toast('Post deleted.');}
    catch(err){toast(err.message);}
  });
  modal.querySelector('[data-post-action="report-post"]')?.addEventListener('click',()=>{modal.remove();openReportComposer('post',post.id);});
  modal.querySelector('[data-post-action="report-user"]')?.addEventListener('click',()=>{modal.remove();openReportComposer('user',post.userId);});
  modal.querySelector('[data-post-action="block"]')?.addEventListener('click',async()=>{
    if(!window.confirm(`Block ${author.name||'this member'}? You will no longer see each other’s profile, posts or messages.`))return;
    try{await api(`/users/${post.userId}/block`,{method:'POST',body:'{}'});modal.remove();await refreshVisiblePosts();toast('Member blocked.');}
    catch(err){toast(err.message);}
  });
}
async function loadFeed(scope=state.feedScope||'all'){state.feedScope=scope;state.feed=(await api(`/feed?scope=${encodeURIComponent(state.feedScope)}`)).posts;}
async function loadStories(){state.stories=(await api('/stories')).stories;}
let feedAutoSyncTimer=null,feedAutoSyncBusy=false;
function stopFeedAutoSync(){
  if(feedAutoSyncTimer!==null)window.clearInterval(feedAutoSyncTimer);
  feedAutoSyncTimer=null;
}
function startFeedAutoSync(){
  stopFeedAutoSync();
  feedAutoSyncTimer=window.setInterval(()=>void syncFeedAutomatically(),30000);
}
async function syncFeedAutomatically(){
  if(feedAutoSyncBusy||state.view!=='feed'||document.visibilityState!=='visible')return;
  const list=$('#feed-list');
  const currentStories=$('.story-panel');
  if(!list)return;
  const focused=document.activeElement;
  if((focused&&list.contains(focused))||(focused&&currentStories?.contains(focused)))return;
  feedAutoSyncBusy=true;
  const anchor=[...list.querySelectorAll('[data-post]')].find(post=>post.getBoundingClientRect().bottom>=0);
  const anchorId=anchor?.dataset.post||'';
  const anchorTop=anchor?anchor.getBoundingClientRect().top:0;
  try{
    await Promise.all([loadFeed(state.feedScope),loadStories()]);
    if(state.view!=='feed'||!list.isConnected)return;
    const sort=$('#feed-sort')?.value||'new';
    const posts=[...state.feed].sort((a,b)=>sort==='old'?new Date(a.createdAt)-new Date(b.createdAt):new Date(b.createdAt)-new Date(a.createdAt));
    const noPosts=state.feedScope==='for-you'?'There are no recommendations yet. Follow creators, react to posts, comment and save content to help personalize your feed.':state.feedScope==='following'?'You are not following anyone who has posted yet.':state.feedScope==='friends'?'Your friends have not shared posts yet.':'Share your first post or connect with people to see updates.';
    list.innerHTML=posts.length?posts.map(post=>postCard(post)).join(''):`<section class="card empty-state"><div class="empty-icon">✦</div><h3>No posts here yet</h3><p>${noPosts}</p></section>`;
    bindFeed(list);
    if(currentStories?.isConnected&&!currentStories.contains(document.activeElement)){
      const wrapper=document.createElement('div');
      wrapper.innerHTML=renderStoriesPanel();
      const incoming=wrapper.firstElementChild;
      if(incoming){currentStories.replaceWith(incoming);bindFeed(incoming);}
    }
    if(anchorId){
      const restored=[...list.querySelectorAll('[data-post]')].find(post=>post.dataset.post===anchorId);
      if(restored)window.scrollBy(0,restored.getBoundingClientRect().top-anchorTop);
    }
  }catch(error){
    console.warn('[Minglora] Feed background sync failed:',error?.message||error);
  }finally{feedAutoSyncBusy=false;}
}
function renderStoriesPanel(){const seen=new Set();const visible=state.stories.filter(story=>{const id=story.author?.id;if(!id||seen.has(id))return false;seen.add(id);return true;});const cards=visible.map(story=>'<button class="story-card" data-open-story="'+esc(story.id)+'">'+(story.media?renderStoryPreview(story.media):story.soundtrack?'<span class="story-text-background story-sound-preview">♫<small>'+esc(story.soundtrack.sound?.title||'Original sound')+'</small></span>':'<span class="story-text-background">'+esc((story.text||'').slice(0,80))+'</span>')+'<span class="story-shade"></span><img class="story-avatar" src="'+avatar(story.author)+'" alt=""><span class="story-author">'+esc(story.author?.name||'Unknown account')+'</span>'+(Array.isArray(story.mediaItems)&&story.mediaItems.length>1?'<span class="story-media-count">'+story.mediaItems.length+' items</span>':'')+(story.viewedByMe?'<span class="story-viewed">Viewed</span>':'')+'</button>').join('');return '<section class="card story-panel"><div class="story-panel-head"><h2>Stories</h2><button class="primary" id="create-story"><svg class="profile-control-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v8M8 12h8"></path></svg><span>Add story</span></button></div>'+(visible.length?'<div class="story-cards">'+cards+'</div>':'<p class="story-empty">No stories yet. Add a story to share an update for 24 hours.</p>')+'</section>';}
async function renderFeed(){state.view='feed';const noPosts=state.feedScope==='for-you'?'There are no recommendations yet. Follow creators, react to posts, comment and save content to help personalize your feed.':state.feedScope==='following'?'You are not following anyone who has posted yet.':state.feedScope==='friends'?'Your friends have not shared posts yet.':'Share your first post or connect with people to see updates.';const title=state.feedScope==='for-you'?'For You':state.feedScope==='following'?'Following feed':state.feedScope==='friends'?'Friends feed':'Recent posts';setContent(`<section class="card welcome"><h1>Good to see you, ${esc(state.user.name.split(' ')[0])} 👋</h1><p>Your community is here. Catch up and share something good.</p></section>${renderStoriesPanel()}${composer()}<div class="feed-header"><h2>${title}</h2><div class="feed-controls"><select id="feed-scope" class="sort-select" aria-label="Feed audience"><option value="for-you" ${state.feedScope==='for-you'?'selected':''}>For You</option><option value="all" ${state.feedScope==='all'?'selected':''}>All posts</option><option value="following" ${state.feedScope==='following'?'selected':''}>Following</option><option value="friends" ${state.feedScope==='friends'?'selected':''}>Friends</option></select><select id="feed-sort" class="sort-select" aria-label="Feed sort"><option value="new">Most recent</option><option value="old">Oldest first</option></select></div></div><div id="feed-list">${state.feed.length?state.feed.map(postCard).join(''):`<section class="card empty-state"><div class="empty-icon">✦</div><h3>No posts here yet</h3><p>${noPosts}</p></section>`}</div>`);bindFeed();startFeedAutoSync();$('#feed-scope')?.addEventListener('change',async e=>{try{await loadFeed(e.target.value);syncNavigationActive();await renderFeed();}catch(err){toast(err.message);}});$('#feed-sort')?.addEventListener('change',e=>{const posts=[...state.feed].sort((a,b)=>e.target.value==='old'?new Date(a.createdAt)-new Date(b.createdAt):new Date(b.createdAt)-new Date(a.createdAt));$('#feed-list').innerHTML=posts.map(postCard).join('');bindFeed($('#feed-list'))});if(state.settings?.preferences?.feedSort==='oldest'){const sort=$('#feed-sort');if(sort){sort.value='old';sort.dispatchEvent(new Event('change'));}}}

function measureAudioDurationMs(file){
  if(!file)return Promise.resolve(0);
  const url=URL.createObjectURL(file),audio=new Audio();
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);resolve(value);};
    audio.preload='metadata';audio.onloadedmetadata=()=>finish(Number.isFinite(audio.duration)?Math.min(3600000,Math.round(audio.duration*1000)):0);
    audio.onerror=()=>finish(0);audio.src=url;
  });
}
function openOriginalSoundComposer(onCreated){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal sound-original-modal" role="dialog" aria-modal="true" aria-labelledby="original-sound-title"><div class="modal-head"><div><span class="eyebrow">MINGLORA SOUNDS</span><h2 id="original-sound-title">Publish an original sound</h2></div><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body"><label class="field"><span>Sound title</span><input name="title" maxlength="100" minlength="2" required placeholder="Give your sound a title"></label><label class="field"><span>Attribution (optional)</span><input name="attribution" maxlength="100" placeholder="Producer, performer or source credit"></label><div class="field"><span>Audio recording</span><div data-original-sound-picker></div></div><label class="sound-permission-check"><input type="checkbox" name="allowReuse"><span><strong>Allow other members to use this sound</strong><small>You can keep it private to your own posts, or let other creators reuse it with attribution.</small></span></label><label class="sound-permission-check"><input type="checkbox" name="rightsConfirmed" required><span><strong>I own this recording or have permission to publish it on Minglora.</strong><small>Do not upload commercial music or another person&#39;s recording without the necessary rights.</small></span></label><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish original sound</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('[data-original-sound-picker]'),{slot:'sound',maxFiles:1,accept:mediaAccept('sound')});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(form),file=picker.selectedFiles()[0];
      if(!file)throw new Error('Choose an audio recording first.');
      const durationMs=await measureAudioDurationMs(file),ids=await picker.upload();
      const result=await api('/sounds',{method:'POST',body:JSON.stringify({assetId:ids[0],title:values.get('title'),attribution:values.get('attribution'),allowReuse:values.get('allowReuse')==='on',rightsConfirmed:values.get('rightsConfirmed')==='on',durationMs})});
      close();toast('Your original sound was added to Minglora Sounds.');onCreated?.(result.sound);
    }catch(error){toast(error.message);button.disabled=false;}
  });
}
function openSoundLibrary(onSelect){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal sound-library-modal" role="dialog" aria-modal="true" aria-labelledby="sound-library-title"><div class="modal-head"><div><span class="eyebrow">MINGLORA ORIGINAL AUDIO</span><h2 id="sound-library-title">Sounds</h2><p class="muted">Discover creator-published recordings and sounds you have saved.</p></div><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><form class="sound-search-form"><input name="q" type="search" maxlength="100" placeholder="Search sounds or creators" aria-label="Search sounds"><button class="secondary" type="submit">Search</button></form><div class="sound-library-filters" role="group" aria-label="Sound library filters"><button type="button" class="active" data-sound-sort="trending">Trending</button><button type="button" data-sound-sort="new">New</button><button type="button" data-sound-sort="saved">Saved</button><button type="button" data-sound-sort="mine">My sounds</button></div><div class="sound-library-list" data-sound-list><section class="card empty-state"><p>Loading Minglora Sounds…</p></section></div><div class="sound-library-footer"><button type="button" class="primary full" data-create-original-sound>＋ Publish an original sound</button><small>Licensed commercial music is not included in this original-sounds library.</small></div></div></section>';
  document.body.append(modal);
  let sort='trending',query='',requestToken=0;
  const close=()=>modal.remove();
  modal.querySelector('.modal-close').onclick=close;modal.addEventListener('click',event=>{if(event.target===modal)close();});
  async function load(){
    const token=++requestToken,list=modal.querySelector('[data-sound-list]');
    list.innerHTML='<section class="card empty-state"><p>Loading sounds…</p></section>';
    try{
      const params=new URLSearchParams({sort});if(query)params.set('q',query);
      const result=await api('/sounds?'+params.toString());
      if(token!==requestToken||!modal.isConnected)return;
      const sounds=result.sounds||[];
      list.innerHTML=sounds.length?sounds.map(sound=>'<article class="sound-library-card"><div class="sound-library-art"><span>♫</span></div><div class="sound-library-info"><strong>'+esc(sound.title)+'</strong><small>'+(sound.attribution?esc(sound.attribution)+' · ':'')+'@'+esc(sound.author?.username||'creator')+'</small><small>'+Number(sound.usageCount||0).toLocaleString()+' uses'+(sound.durationMs?' · '+(sound.durationMs/1000).toFixed(1)+'s':'')+'</small><audio controls preload="none" src="'+esc(sound.url)+'" aria-label="Preview '+esc(sound.title)+'"></audio></div><div class="sound-library-actions"><button type="button" class="primary" data-use-sound="'+esc(sound.id)+'">Use sound</button><button type="button" class="secondary" data-favorite-sound="'+esc(sound.id)+'" data-favorite="'+(sound.isFavorite?'true':'false')+'">'+(sound.isFavorite?'♥ Saved':'♡ Save')+'</button>'+(sound.author?.id===state.user.id?'<button type="button" class="text-button" data-archive-sound="'+esc(sound.id)+'">Remove</button>':'')+'</div></article>').join(''):'<section class="card empty-state"><div class="empty-icon">♫</div><h3>'+(sort==='saved'?'No saved sounds yet':sort==='mine'?'You have not published an original sound yet':'No original sounds found')+'</h3><p>'+(sort==='saved'?'Save sounds from the library and they will appear here.':sort==='mine'?'Publish a recording to create your own sound library.':'Search for another title or publish the first original sound in your library.')+'</p></section>';
      list.querySelectorAll('[data-use-sound]').forEach(button=>button.onclick=()=>{const sound=sounds.find(item=>item.id===button.dataset.useSound);if(sound){close();onSelect?.(sound);}});
      list.querySelectorAll('[data-favorite-sound]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const saved=button.dataset.favorite!=='true';await api('/sounds/'+encodeURIComponent(button.dataset.favoriteSound)+'/favorite',{method:saved?'POST':'DELETE',body:'{}'});await load();}catch(error){toast(error.message);button.disabled=false;}});
      list.querySelectorAll('[data-archive-sound]').forEach(button=>button.onclick=async()=>{if(!window.confirm('Remove this sound from your library? Existing posts that use it will keep their soundtrack.'))return;button.disabled=true;try{await api('/sounds/'+encodeURIComponent(button.dataset.archiveSound),{method:'DELETE',body:'{}'});await load();toast('Sound removed from your library.');}catch(error){toast(error.message);button.disabled=false;}});
    }catch(error){list.innerHTML='<section class="card empty-state"><h3>Sounds could not be loaded</h3><p>'+esc(error.message)+'</p><button type="button" class="secondary" data-retry-sounds>Retry</button></section>';list.querySelector('[data-retry-sounds]')?.addEventListener('click',load);}
  }
  modal.querySelector('.sound-search-form').onsubmit=event=>{event.preventDefault();query=String(new FormData(event.currentTarget).get('q')||'').trim();load();};
  modal.querySelectorAll('[data-sound-sort]').forEach(button=>button.onclick=()=>{sort=button.dataset.soundSort;modal.querySelectorAll('[data-sound-sort]').forEach(item=>item.classList.toggle('active',item===button));load();});
  modal.querySelector('[data-create-original-sound]').onclick=()=>openOriginalSoundComposer(sound=>{close();onSelect?.(sound);});
  load();
}
function createSoundtrackEditor(root,initialTrack=null){
  let selected=initialTrack?.sound||null;
  function settings(){return {
    startMs:Number(initialTrack?.startMs||0),endMs:Number(initialTrack?.endMs||selected?.durationMs||0),
    volume:Number.isFinite(Number(initialTrack?.volume))?Number(initialTrack.volume):1,
    fadeInMs:Number(initialTrack?.fadeInMs||0),fadeOutMs:Number(initialTrack?.fadeOutMs||0)
  };}
  let values=settings();
  function render(){
    root.innerHTML='<div class="soundtrack-editor">'+(selected?'<div class="soundtrack-selected"><span class="soundtrack-note">♫</span><div><strong>'+esc(selected.title)+'</strong><small>'+(selected.attribution?esc(selected.attribution)+' · ':'')+'@'+esc(selected.author?.username||'creator')+'</small></div><button type="button" class="text-button" data-clear-soundtrack>Remove</button></div><audio class="soundtrack-editor-preview" controls preload="metadata" src="'+esc(selected.url)+'" aria-label="Preview selected soundtrack"></audio><div class="soundtrack-edit-grid"><label>Start (seconds)<input type="number" min="0" max="3600" step="0.1" data-track-start value="'+(values.startMs/1000)+'"></label><label>End (seconds)<input type="number" min="0" max="3600" step="0.1" data-track-end value="'+(values.endMs?values.endMs/1000:'')+'" placeholder="End of recording"></label><label>Volume <output data-track-volume-label>'+Math.round(values.volume*100)+'%</output><input type="range" min="0" max="100" step="1" value="'+Math.round(values.volume*100)+'" data-track-volume></label><label>Fade in (seconds)<input type="number" min="0" max="30" step="0.1" data-track-fade-in value="'+(values.fadeInMs/1000)+'"></label><label>Fade out (seconds)<input type="number" min="0" max="30" step="0.1" data-track-fade-out value="'+(values.fadeOutMs/1000)+'"></label></div><small class="soundtrack-edit-help">Trim the section, set playback volume and add smooth fades.</small>':'<div class="soundtrack-empty"><span class="soundtrack-note">♫</span><div><strong>No sound selected</strong><small>Add an original Minglora sound to your photos or videos.</small></div></div>')+'<div class="soundtrack-editor-actions"><button type="button" class="secondary" data-open-sound-library>'+(selected?'Change sound':'Browse sounds')+'</button><button type="button" class="secondary" data-create-sound>＋ Original sound</button></div></div>';
    root.querySelector('[data-open-sound-library]').onclick=()=>openSoundLibrary(sound=>{selected=sound;values={startMs:0,endMs:Number(sound.durationMs||0),volume:1,fadeInMs:0,fadeOutMs:0};render();});
    root.querySelector('[data-create-sound]').onclick=()=>openOriginalSoundComposer(sound=>{selected=sound;values={startMs:0,endMs:Number(sound.durationMs||0),volume:1,fadeInMs:0,fadeOutMs:0};render();});
    root.querySelector('[data-clear-soundtrack]')?.addEventListener('click',()=>{selected=null;values={startMs:0,endMs:0,volume:1,fadeInMs:0,fadeOutMs:0};render();});
    const volume=root.querySelector('[data-track-volume]'),audio=root.querySelector('.soundtrack-editor-preview');
    const startInput=root.querySelector('[data-track-start]'),endInput=root.querySelector('[data-track-end]');
    const fadeInInput=root.querySelector('[data-track-fade-in]'),fadeOutInput=root.querySelector('[data-track-fade-out]');
    const seekPreview=()=>{if(audio&&Number.isFinite(audio.duration))audio.currentTime=Math.min(values.startMs/1000,Math.max(0,audio.duration-.1));};
    const updateFadePreview=()=>{
      if(!audio)return;
      const end=values.endMs?values.endMs/1000:audio.duration;
      const elapsed=Math.max(0,audio.currentTime-values.startMs/1000);
      let gain=values.volume;
      if(values.fadeInMs>0&&elapsed<values.fadeInMs/1000)gain*=elapsed/(values.fadeInMs/1000);
      if(values.fadeOutMs>0&&end&&audio.currentTime>end-values.fadeOutMs/1000)gain*=Math.max(0,(end-audio.currentTime)/(values.fadeOutMs/1000));
      audio.volume=Math.max(0,Math.min(1,gain));
    };
    volume?.addEventListener('input',()=>{values.volume=Number(volume.value)/100;root.querySelector('[data-track-volume-label]').textContent=volume.value+'%';updateFadePreview();});
    startInput?.addEventListener('change',()=>{values.startMs=Math.max(0,Math.round(Number(startInput.value||0)*1000));seekPreview();updateFadePreview();});
    endInput?.addEventListener('change',()=>{values.endMs=Math.max(0,Math.round(Number(endInput.value||0)*1000));if(audio&&values.endMs>0&&audio.currentTime>values.endMs/1000){audio.pause();seekPreview();}updateFadePreview();});
    fadeInInput?.addEventListener('change',()=>{values.fadeInMs=Math.max(0,Math.round(Number(fadeInInput.value||0)*1000));updateFadePreview();});
    fadeOutInput?.addEventListener('change',()=>{values.fadeOutMs=Math.max(0,Math.round(Number(fadeOutInput.value||0)*1000));updateFadePreview();});
    if(audio){
      audio.volume=values.volume;
      audio.addEventListener('loadedmetadata',()=>seekPreview());
      audio.addEventListener('play',updateFadePreview);
      audio.addEventListener('timeupdate',()=>{
        const end=values.endMs?values.endMs/1000:audio.duration;
        if(end&&audio.currentTime>=end){audio.pause();seekPreview();return;}
        updateFadePreview();
      });
    }
  }
  render();
  return {
    value(){
      if(!selected)return null;
      const start=Math.max(0,Number(root.querySelector('[data-track-start]')?.value||0));
      const end=Math.max(0,Number(root.querySelector('[data-track-end]')?.value||0));
      const volume=Number(root.querySelector('[data-track-volume]')?.value??100)/100;
      const fadeIn=Math.max(0,Number(root.querySelector('[data-track-fade-in]')?.value||0));
      const fadeOut=Math.max(0,Number(root.querySelector('[data-track-fade-out]')?.value||0));
      return {soundId:selected.id,startMs:Math.round(start*1000),endMs:Math.round(end*1000),volume,fadeInMs:Math.round(fadeIn*1000),fadeOutMs:Math.round(fadeOut*1000)};
    },
    destroy(){root.innerHTML='';}
  };
}
function openComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="create-post-title"><div class="modal-head"><h2 id="create-post-title">Share your thoughts</h2><button class="modal-close" type="button" aria-label="Close">'+messenger3dIcon('close','modal-close-icon')+'</button></div><form class="modal-body" id="create-post-form"><div class="post-head"><img class="avatar" src="'+avatar(state.user)+'" alt=""><div class="post-author"><strong>'+esc(state.user.name)+'</strong><small>Choose the audience for this post</small></div></div><div class="field"><label for="post-audience">Who can see this post?</label><select id="post-audience" name="audience"><option value="public">Public</option><option value="friends">Friends</option><option value="close_friends">Close Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><div class="field"><textarea name="text" maxlength="5000" placeholder="What would you like to share?" aria-label="Share your thoughts"></textarea></div><div class="field"><label>Photos, videos and audio attachments</label><div id="create-post-media-picker"></div></div><div class="field"><label>Soundtrack</label><div id="create-post-soundtrack"></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Share post</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#create-post-media-picker'),{slot:'post',maxFiles:10});
  const soundtrack=createSoundtrackEditor(modal.querySelector('#create-post-soundtrack'));
  const close=()=>{picker.destroy();soundtrack.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      await api('/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds,soundtrack:soundtrack.value()})});
      close();await loadFeed();await renderFeed();toast('Your post is published.');
    }catch(error){toast(error.message);button.disabled=false;}
  });
}

async function loadPeople(){state.people=(await api('/users')).users;}
async function loadPeopleDiscovery(){
  const result=await api('/discovery/people');
  state.people=result.users||[];
}
function discoveryMediaTile(media){
  if(!media?.url)return '';
  const url=esc(media.url);
  if(media.mediaType==='video')return '<span class="person-media-tile"><video muted playsinline loop autoplay preload="none" src="'+url+'" aria-label="Recent video shared by this member"></video><i aria-hidden="true">▶</i></span>';
  if(media.mediaType==='image')return '<span class="person-media-tile"><img loading="lazy" src="'+url+'" alt="Recent photo shared by this member"></span>';
  if(media.mediaType==='model3d')return '<span class="person-media-tile person-media-kind"><strong>3D</strong><small>3D post</small></span>';
  if(media.mediaType==='audio')return '<span class="person-media-tile person-media-kind"><strong>♫</strong><small>Audio post</small></span>';
  return '';
}
function discoveryPostPreview(post,profileId){
  const media=(post.media||[]).slice(0,3);
  const mediaHtml=media.length?'<div class="person-post-media">'+media.map(discoveryMediaTile).join('')+'</div>':'';
  const copy=String(post.text||'').trim();
  return '<article class="person-post-preview"><div class="person-post-meta"><span>RECENT POST</span><time>'+esc(timeAgo(post.createdAt))+'</time></div><button type="button" class="person-post-open" data-profile="'+esc(profileId)+'" aria-label="Open member profile">'+
    (copy?'<span class="person-post-copy">'+esc(copy.slice(0,112))+(copy.length>112?'…':'')+'</span>':'')+mediaHtml+
    (!copy&&!media.length?'<span class="person-post-empty">A post was shared.</span>':'')+
    '<span class="person-post-reactions">♡ '+Number(post.reactionCount||0).toLocaleString()+'</span></button></article>';
}
function peopleCard(p){
  const mutual=p.friendship==='accepted';
  const liveSession=(state.discoveryLiveSessions||[]).find(session=>session.hostId===p.id&&session.viewerCountVerified===true)||null;
  const story=p.latestStory;
  const cover=p.cover?'<img class="person-cover-image" loading="lazy" src="'+esc(p.cover)+'" alt="">':'';
  const storyPreview=story
    ?'<button type="button" class="person-story-preview" data-open-profile-story="'+esc(story.id)+'" aria-label="View '+esc(p.name)+'’s current story">'+
      (story.media?.url?renderStoryPreview(story.media):'<span class="person-story-text">'+esc((story.text||'').slice(0,100)||'A new story')+'</span>')+
      '<span class="person-story-overlay"><strong>STORY</strong><small>'+esc(timeAgo(story.createdAt))+'</small></span></button>'
    :'';
  const recent=(p.recentPosts||[]).map(post=>discoveryPostPreview(post,p.id)).join('');
  const hasActivity=Boolean(storyPreview||recent);
  const followerCount=Number(p.followersCount||0).toLocaleString();
  const friendCount=Number(p.friendsCount||0).toLocaleString();
  const postCount=Number(p.postsCount||0).toLocaleString();
  const following=Boolean(p.following);
  const followLabel=following?(mutual?'Friends · Following':'Following'):(mutual?'Friends':'Follow');
  return '<article class="card person-card person-card--immersive">'+
    '<button type="button" class="person-cover'+(p.cover?' has-cover':'')+'" data-profile="'+esc(p.id)+'" aria-label="Open '+esc(p.name)+'’s profile">'+cover+
      (liveSession?'<span class="person-live-badge"><i></i> LIVE NOW</span>':story?'<span class="person-story-badge">STORY AVAILABLE</span>':'')+
      '<span class="person-cover-caption">MINGLORA MEMBER</span></button>'+
    '<div class="person-card-content">'+
      '<div class="person-identity"><div class="person-avatar-wrap'+(story?' has-story':'')+'"><button type="button" data-profile="'+esc(p.id)+'" aria-label="View '+esc(p.name)+'’s profile"><img class="avatar" src="'+avatar(p)+'" alt=""></button></div>'+
      '<div class="person-title-group" data-profile="'+esc(p.id)+'" role="link" tabindex="0" aria-label="Open '+esc(p.name)+'’s profile" style="cursor:pointer"><h3>'+esc(p.name)+'</h3><span>@'+esc(p.username)+' '+verifiedProfileBadge(p)+gifterProfileBadge(p)+'</span></div>'+
      (liveSession?'<span class="person-live-mini"><i></i> LIVE</span>':'')+'</div>'+
      '<p class="person-bio">'+(p.bio?esc(p.bio):'<span>No bio added yet.</span>')+'</p>'+
      '<div class="person-stat-row"><span><strong>'+followerCount+'</strong><small>Followers</small></span><span><strong>'+friendCount+'</strong><small>Friends</small></span><span><strong>'+postCount+'</strong><small>Posts</small></span></div>'+
      '<div class="person-mutual-context"><span class="person-mutual-glyph" aria-hidden="true">✦</span><span>'+(Number(p.mutualFriendsCount||0)>0?'<strong>'+Number(p.mutualFriendsCount).toLocaleString()+' mutual '+(Number(p.mutualFriendsCount)===1?'connection':'connections')+'</strong>':'No mutual connections yet')+'</span></div>'+
      (liveSession?'<div class="person-live-strip"><span><i></i><strong>'+Number(liveSession.viewerCount||0).toLocaleString()+'</strong> watching now</span><button type="button" data-watch-live="'+esc(liveSession.id)+'">Watch LIVE <b>↗</b></button></div>':'')+
      (hasActivity?'<div class="person-activity">'+storyPreview+recent+'</div>':'<div class="person-no-activity"><span class="person-no-activity-icon">✧</span><span><strong>No recent public activity</strong><small>New shared moments will appear here.</small></span></div>')+
      '<div class="person-card-actions"><button type="button" class="person-connect-btn" data-toggle-follow="'+esc(p.id)+'" data-following="'+(following?'true':'false')+'">'+(following?'<span>✓</span> ':'＋ ')+esc(followLabel)+'</button><button type="button" class="person-view-btn" data-profile="'+esc(p.id)+'">View profile <span>↗</span></button></div>'+
      '<div class="person-card-secondary-actions"><button type="button" class="person-dismiss-btn" data-dismiss-suggestion="'+esc(p.id)+'">Remove suggestion</button><button type="button" class="person-block-link" data-block-user="'+esc(p.id)+'">Block member</button></div>'+
    '</div></article>';
}
function peopleGridMarkup(){
  const others=state.people.filter(member=>member.friendship!=='accepted');
  return others.length?others.map(peopleCard).join(''):'<section class="card empty-state"><h3>You’re all caught up</h3><p>There are no new people to suggest right now.</p></section>';
}
function bindSuggestionDismissals(root=document){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('[data-dismiss-suggestion]').forEach(button=>{
    if(button.dataset.dismissBound==='true')return;
    button.dataset.dismissBound='true';
    button.addEventListener('click',async event=>{
      event.preventDefault();
      event.stopPropagation();
      const memberId=String(button.dataset.dismissSuggestion||'').trim();
      if(!memberId)return;
      button.disabled=true;
      try{
        await api('/discovery/people/'+encodeURIComponent(memberId)+'/dismiss',{method:'POST',body:'{}'});
        toast('Suggestion removed from People You May Know.');
        state.people=(state.people||[]).filter(member=>member.id!==memberId);
        await renderSidebar();
        if(state.view==='friends')await renderFriends();
      }catch(error){
        toast(error.message||'Could not remove this suggestion.');
        button.disabled=false;
      }
    });
  });
}
function bindPeople(root=document){
  root.querySelectorAll('[data-toggle-follow]').forEach(btn=>btn.addEventListener('click',async()=>{
    const following=btn.dataset.following==='true';
    btn.disabled=true;
    try{
      const result=await api('/users/'+encodeURIComponent(btn.dataset.toggleFollow)+'/follow',{method:following?'DELETE':'POST',body:'{}'});
      toast(result.friends?'You are now friends through mutual follows.':(following?'Unfollowed member.':'Now following member.'));
      await renderFriends();
    }catch(e){toast(e.message);btn.disabled=false;}
  }));
  root.querySelectorAll('[data-block-user]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!window.confirm('Block this member? You will no longer see each other’s profile, posts or messages.'))return;
    try{
      await api('/users/'+encodeURIComponent(btn.dataset.blockUser)+'/block',{method:'POST',body:'{}'});
      toast('Member blocked.');await renderFriends();await renderSidebar();
    }catch(e){toast(e.message);}
  }));
  bindProfileLinks(root);
  bindSuggestionDismissals(root);
  root.querySelectorAll('[data-open-profile-story]').forEach(el=>el.addEventListener('click',()=>openStory(el.dataset.openProfileStory)));
  root.querySelectorAll('[data-watch-live]').forEach(el=>el.addEventListener('click',()=>{
    const session=(state.discoveryLiveSessions||[]).find(item=>item.id===el.dataset.watchLive);
    if(session)openLiveRoom(session,'viewer').catch(error=>toast(error.message));
  }));
}
let peopleDiscoveryRefreshBusy=false;
let peopleDiscoveryRefreshTimer=null;
function stopPeopleDiscoveryRefresh(){
  if(peopleDiscoveryRefreshTimer!==null)window.clearInterval(peopleDiscoveryRefreshTimer);
  peopleDiscoveryRefreshTimer=null;
}
function startPeopleDiscoveryRefresh(){
  stopPeopleDiscoveryRefresh();
  peopleDiscoveryRefreshTimer=window.setInterval(()=>void refreshPeopleDiscovery({quiet:true}),30000);
}
async function refreshPeopleDiscovery({quiet=true}={}){
  if(peopleDiscoveryRefreshBusy||state.view!=='friends'||document.visibilityState!=='visible')return;
  const grid=$('#people-discovery-grid');
  if(!grid)return;
  const focused=document.activeElement;
  if(focused&&grid.contains(focused))return;
  peopleDiscoveryRefreshBusy=true;
  try{
    const [peopleResult,liveResult]=await Promise.all([
      api('/discovery/people'),
      api('/live/sessions').catch(()=>({sessions:[]}))
    ]);
    if(state.view!=='friends'||document.visibilityState!=='visible')return;
    state.people=peopleResult.users||[];
    state.discoveryLiveSessions=liveResult.sessions||[];
    if(grid.isConnected){grid.innerHTML=peopleGridMarkup();bindPeople(grid);}
  }catch(error){
    if(!quiet)toast('People could not be updated: '+error.message);
    else console.warn('[Minglora] People discovery sync failed:',error?.message||error);
  }finally{
    peopleDiscoveryRefreshBusy=false;
  }
}

async function renderFriends(){
  activateSilent('friends');stopPeopleDiscoveryRefresh();
  await loadPeopleDiscovery();
  const [result,liveResult]=await Promise.all([
    api('/friends'),
    api('/live/sessions').catch(()=>({sessions:[]}))
  ]);
  state.discoveryLiveSessions=liveResult.sessions||[];
  const friends=result.friends||[];
  setContent('<div class="page-heading"><div><h1>Friends</h1><p class="muted">Discover members through the moments they choose to share.</p></div></div>'+
    '<div class="feed-header"><h2>People you may know</h2></div>'+
    '<div id="people-discovery-grid" class="people-grid people-discovery-grid">'+peopleGridMarkup()+'</div>'+
    '<section class="card friends-list"><h2>Friends ('+friends.length+')</h2>'+
    (friends.length?friends.map(member=>'<div class="person-row" style="margin:12px 0"><img class="avatar" data-profile="'+esc(member.id)+'" alt="View '+esc(member.name)+'’s profile" src="'+avatar(member)+'"><div class="person-meta"><strong data-profile="'+esc(member.id)+'">'+esc(member.name)+'</strong><small>@'+esc(member.username)+' '+verifiedProfileBadge(member)+'</small></div><span class="muted">Mutual follow</span><button class="mini-btn" data-profile="'+esc(member.id)+'">View profile</button></div>').join(''):'<p class="muted">Follow each other to become friends. Your mutual connections will appear here.</p>')+'</section>');
  bindPeople(document);
  startPeopleDiscoveryRefresh();
}
let activeCallRoom=null;
let activeCallOverlay=null;
function refreshMingloraCallAvailability(){
  if(document.visibilityState==='visible'&&state.user&&!activeCallRoom&&!outgoingCallPending)void pollIncomingCalls();
}
document.addEventListener('visibilitychange',refreshMingloraCallAvailability);
window.addEventListener('online',refreshMingloraCallAvailability);
window.addEventListener('pageshow',refreshMingloraCallAvailability);
let activeLiveRoom=null;
let activeLiveSession=null;
let activeLiveRole=null;
let activeLivePinnedComment=null;
let liveChatRefreshTimer=null;
let liveDirectoryRefreshTimer=null;
let liveCameraEnabled=true;
let liveMicrophoneEnabled=true;
let liveAudioMuted=false;
let liveScreenShareEnabled=false;
let liveCameraFacing='user';
let liveGiftCatalogue=[];
let liveGiftEventsTimer=null;
let liveGiftEventsBusy=false;
let liveGiftEventsLastSeenAt='';
const liveGiftSeenEventIds=new Set();
let liveSpeakerRefreshTimer=null;
const liveSpeakerSeenRequestsBySession=new Map();
let liveParticipantSyncTimer=null;
let liveParticipantSyncBusy=false;
let liveRewardRefreshTimer=null;
let liveRewardRefreshBusy=false;
let liveRewardWalletFetchedAt=0;
let liveMatchRefreshTimer=null;
let liveMatchRefreshBusy=false;
let liveViewerRefreshTimer=null;
let liveViewerRefreshBusy=false;
let liveFanClubState=null;
let liveFanClubHeartbeatTimer=null;
let liveGiftScope='all';
let refreshLiveGiftGrid=null;
let liveDirectoryFilter='all';
const MINGLORA_FAN_CLUB_GIFT_CODES=Object.freeze(['heart-me-2mk7ob','community-heart-mg6zzi','blue-heart-19gp9xp','flame-heart-yv4ovw','fan-1avs41e']);
const LIVE_SCREEN_LAYOUT_OPTIONS=Object.freeze([
  {value:'full-screen',label:'Full Screen',icon:'fullscreen'},
  {value:'fluid-panel',label:'Fluid Panel',icon:'featured'},
  {value:'fluid-grid',label:'Fluid Grid',icon:'grid'},
  {value:'fixed-grid',label:'Fixed Grid',icon:'grid'},
  {value:'fixed-panel',label:'Fixed Panel',icon:'columns'},
  {value:'side-by-side',label:'Side by Side',icon:'columns'},
  {value:'spotlight',label:'Spotlight',icon:'host'},
  {value:'roundtable-1',label:'Roundtable 1',icon:'stack'},
  {value:'roundtable-2',label:'Roundtable 2',icon:'match'}
]);
let activeLiveScreenLayout='full-screen';
function normalizeLiveScreenLayout(value){const candidate=String(value||'full-screen');return LIVE_SCREEN_LAYOUT_OPTIONS.some(option=>option.value===candidate)?candidate:'full-screen';}
function liveLayoutIcon(name){const paths={grid:"<rect x='3' y='3' width='8' height='8' rx='1'/><rect x='13' y='3' width='8' height='8' rx='1'/><rect x='3' y='13' width='8' height='8' rx='1'/><rect x='13' y='13' width='8' height='8' rx='1'/>",columns:"<rect x='3' y='3' width='8' height='18' rx='1'/><rect x='13' y='3' width='8' height='18' rx='1'/>",stack:"<rect x='3' y='3' width='18' height='5' rx='1'/><rect x='3' y='10' width='18' height='5' rx='1'/><rect x='3' y='17' width='18' height='4' rx='1'/>",featured:"<rect x='3' y='3' width='12' height='18' rx='1'/><rect x='17' y='3' width='4' height='5' rx='1'/><rect x='17' y='10' width='4' height='5' rx='1'/><rect x='17' y='17' width='4' height='4' rx='1'/>",host:"<rect x='3' y='3' width='18' height='12' rx='1'/><rect x='3' y='17' width='5' height='4' rx='1'/><rect x='10' y='17' width='5' height='4' rx='1'/><rect x='17' y='17' width='4' height='4' rx='1'/>",guest:"<rect x='3' y='3' width='5' height='4' rx='1'/><rect x='10' y='3' width='5' height='4' rx='1'/><rect x='17' y='3' width='4' height='4' rx='1'/><rect x='3' y='9' width='18' height='12' rx='1'/>",fullscreen:"<path d='M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5'/>",match:"<rect x='3' y='3' width='8' height='18' rx='1'/><rect x='13' y='3' width='8' height='18' rx='1'/><path d='m9 12 2 2 2-2'/>"};return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"+(paths[name]||paths.grid)+"</svg>";}
function applyLiveScreenLayout(value){activeLiveScreenLayout=normalizeLiveScreenLayout(value);document.querySelectorAll('.live-guest-layout').forEach(root=>{root.dataset.liveLayout=activeLiveScreenLayout;root.setAttribute('aria-label','LIVE host and guest seats');root.closest('.live-video-stage')?.classList.toggle('live-full-screen-layout',activeLiveScreenLayout==='full-screen');root.closest('.live-audio-stage')?.classList.remove('live-host-only-layout');});document.querySelectorAll('[data-live-screen-layout]').forEach(button=>{const selected=button.dataset.liveScreenLayout===activeLiveScreenLayout;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});}
function restoreLiveChatToStage(){
  const chat=$('#live-chat-overlay')||$('#live-chat-disabled-note');
  const stage=$('#live-video-stage');
  const slot=$('#live-fullscreen-chat-slot');
  if(!chat||!stage)return;
  const target=activeLiveScreenLayout==='full-screen'&&slot?slot:stage;
  if(chat.parentElement!==target)target.append(chat);
}
function activateLiveToolsPanel(name){
  const shell=$('#live-player-shell');
  if(name==='chat'&&shell?.classList.contains('live-full-screen-active')){
    closeLiveToolsPanel({returnTo:'chat'});
    return;
  }
  const drawer=$('#live-tools-drawer');
  if(!drawer)return;
  const sections=[...drawer.querySelectorAll('[data-live-tools-panel]')];
  if(!sections.some(section=>section.dataset.liveToolsPanel===name))return;
  sections.forEach(section=>{section.hidden=section.dataset.liveToolsPanel!==name;});
  drawer.querySelectorAll('[data-live-tools-panel-target]').forEach(button=>{
    const active=button.dataset.liveToolsPanelTarget===name;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  if(name==='chat'){
    const chat=$('#live-chat-overlay')||$('#live-chat-disabled-note');
    const body=$('#live-chat-panel-body');
    if(chat&&body)body.append(chat);
  }else restoreLiveChatToStage();
}


function stopLiveChatRefresh(){if(liveChatRefreshTimer){clearInterval(liveChatRefreshTimer);liveChatRefreshTimer=null;}}
function stopLiveDirectoryRefresh(){if(liveDirectoryRefreshTimer){clearInterval(liveDirectoryRefreshTimer);liveDirectoryRefreshTimer=null;}}
function startLiveDirectoryRefresh(){
  stopLiveDirectoryRefresh();
  liveDirectoryRefreshTimer=window.setInterval(()=>void refreshLiveDirectorySessions({quiet:true}),15000);
}
function liveMoney(minor){return "$"+(Number(minor||0)/100).toFixed(2);}
function liveSessionCardMarkup(session){
  const audioOnly=session.broadcastType==='audio_only';
  const liveMode=['video_audio','audio_only','mobile_gaming','live_studio'].includes(session.liveMode)
    ?session.liveMode:(audioOnly?'audio_only':'video_audio');
  const modeLabels={video_audio:'VIDEO + AUDIO',audio_only:'AUDIO ONLY',mobile_gaming:'MOBILE GAMING',live_studio:'LIVE STUDIO'};
  const theme=LIVE_ROOM_THEME_OPTIONS.some(option=>option.value===session.liveTheme)?session.liveTheme:'studio';
  const showViewers=session.liveSettings?.markViewers!==false;
  const presence=!showViewers?'':session.viewerCountVerified?'◉ '+Number(session.viewerCount||0).toLocaleString()+' in room':'Live presence unavailable';
  const boardLabels={general:'General',gaming:'Gaming',music:'Music',talk:'Talk',education:'Education',beauty:'Beauty',sports:'Sports',business:'Business',lifestyle:'Lifestyle'};
  return "<article class='live-room-card' data-live-type='"+liveMode+"'><div class='live-room-preview live-preview-theme-"+theme+(audioOnly?" live-room-preview-audio":"")+(liveMode==='mobile_gaming'?" live-room-preview-gaming":"")+"'>"+
    "<span class='live-indicator'>LIVE</span><span class='live-type-pill "+(audioOnly?'audio':'video')+"'>"+modeLabels[liveMode]+"</span>"+
    (presence?"<span class='live-room-viewers'>"+presence+"</span>":"")+
    (audioOnly?"<div class='live-directory-audio-orb'><span>♪</span></div>":liveMode==='mobile_gaming'?"<div class='live-directory-audio-orb'><span>🎮</span></div>":"<div class='live-room-avatar'><img src='"+avatar(session.host)+"' alt=''></div>")+
    "</div><div class='live-room-details'><strong>"+esc(session.title)+"</strong><span>"+esc(session.host?.name||'Minglora creator')+"</span><small>@"+esc(session.host?.username||'member')+gifterProfileBadge(session.host)+"</small>"+
    "<small class='live-room-board'>"+esc(boardLabels[session.liveSettings?.board]||'General')+"</small>"+
    (session.description?"<p class='live-room-description'>"+esc(session.description)+"</p>":"")+
    "<button class='primary' data-watch-live='"+esc(session.id)+"'>"+(audioOnly?'Listen LIVE':'Watch LIVE')+"</button></div></article>";
}
function applyLiveDirectoryFilter(filter=liveDirectoryFilter){
  liveDirectoryFilter=filter;
  document.querySelectorAll('[data-live-filter]').forEach(button=>button.classList.toggle('active',button.dataset.liveFilter===filter));
  document.querySelectorAll('.live-room-card[data-live-type]').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.liveType!==filter;});
}
function bindLiveDirectoryCards(sessions){
  document.querySelectorAll('[data-watch-live]').forEach(button=>button.addEventListener('click',()=>{
    const session=sessions.find(item=>item.id===button.dataset.watchLive);
    if(session)openLiveRoom(session,session.hostId===state.user.id?'host':'viewer').catch(error=>toast(error.message));
  }));
  document.querySelectorAll('[data-live-filter]').forEach(button=>button.addEventListener('click',()=>applyLiveDirectoryFilter(button.dataset.liveFilter)));
  applyLiveDirectoryFilter(liveDirectoryFilter);
}
function renderLiveDirectory(sessions,status,catalog,wallet,livePro={}){
  const liveReady=Boolean(status.configured&&status.connected===true);
  const liveStatusText=!status.configured?"Live provider not configured":liveReady?"LiveKit ready":"Live provider connection failed";
  const cards=sessions.length?sessions.map(liveSessionCardMarkup).join(""):status.liveDirectoryError
    ?"<section class='card empty-state'><div class='empty-icon'>📡</div><h3>LIVE directory unavailable</h3><p>"+esc(status.liveDirectoryError)+"</p></section>"
    :"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a video broadcast, mobile gaming stream or an independent audio room and bring your community together.</p></section>";
  const packages=Array.isArray(catalog?.packages)?catalog.packages.slice(0,4):[];
  const selectedMode=['video_audio','audio_only','mobile_gaming','live_studio'].includes(state.liveStartFormat)?state.liveStartFormat:'video_audio';
  const modeOptions=[
    {value:'video_audio',label:'Video + Audio',detail:'Camera and microphone',icon:'live'},
    {value:'audio_only',label:'Audio Only',detail:'Microphone; no camera access',icon:'microphone'},
    {value:'mobile_gaming',label:'Mobile Gaming',detail:'Mic + screen share; device support required',icon:'live'},
    {value:'live_studio',label:'Live Studio',detail:'Camera, mic and screen share',icon:'creator'}
  ];
  const modeCards=modeOptions.map(option=>"<label class='live-mode-card'><input type='radio' name='liveMode' value='"+option.value+"' "+(selectedMode===option.value?'checked':'')+"><span class='live-mode-icon'>"+(option.icon==='live'?"<svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#live'></use></svg>":option.icon==='microphone'?"<svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#microphone'></use></svg>":option.icon==='live'?"<svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#live'></use></svg>":"<svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#creator'></use></svg>")+"</span><span><strong>"+option.label+"</strong><small>"+option.detail+"</small></span></label>").join("");
  const boardOptions=[['general','General'],['gaming','Gaming'],['music','Music'],['talk','Talk'],['education','Education'],['beauty','Beauty'],['sports','Sports'],['business','Business'],['lifestyle','Lifestyle']];
  setContent("<div class='page-heading live-page-heading'><div><span class='eyebrow'>Minglora LIVE</span><h1>Go LIVE. Share the moment.</h1><p class='muted'>Choose a mode and set up your audience before you broadcast.</p></div>"+(livePro?.hasAccess?"<button type='button' class='secondary live-pro-open-button' id='live-pro-open'>LIVE Pro Studio</button>":"")+"<span class='live-status-pill "+(liveReady?"ready":"unavailable")+"'>"+liveStatusText+"</span></div>"+
    "<section class='card live-start-card'><div class='live-preflight-heading'><div><h2>LIVE setup</h2><p class='muted'>Your settings are applied before Minglora opens the LIVE room.</p></div><span class='live-preflight-step'>1 · SET UP</span></div>"+
    "<form id='live-create-form' class='live-create-form'><fieldset class='live-mode-picker'><legend>Choose LIVE mode</legend>"+modeCards+"</fieldset>"+
    "<div class='live-preflight-fields'>"+
      "<label class='live-preflight-field'><span>LIVE title</span><input name='title' maxlength='120' required placeholder='What are you going LIVE about?'></label>"+
      "<label class='live-preflight-field'><span>LIVE board</span><select name='board'>"+boardOptions.map(([value,label])=>"<option value='"+value+"'>"+label+"</option>").join("")+"</select></label>"+
      "<label class='live-preflight-field' id='live-audience-field'><span>Who can watch?</span><select name='visibility' id='live-audience-select'><option value='public'>Everyone · Public</option><option value='friends'>Friends</option><option value='private'>Private room</option></select></label>"+
      "<label class='live-preflight-field' id='live-quality-field'><span>Live quality</span><select name='liveQuality'><option value='auto'>Auto · Recommended</option><option value='720p'>720p · Balanced</option><option value='1080p'>1080p · High bandwidth</option></select></label>"+
      "<label class='live-preflight-field live-preflight-wide'><span>About me / live description</span><textarea name='aboutMe' rows='2' maxlength='500' placeholder='Tell viewers what this LIVE is about (optional)'></textarea></label>"+
    "</div>"+
    "<div class='live-preflight-section'><div class='live-preflight-section-title'><strong>Broadcast controls</strong><small>Compact controls · change any setting before you start</small></div><div class='live-preflight-switches'>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='practiceMode'><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#lock'></use></svg></span><span><strong>Practice mode</strong><small>Private test room; no public alert or paid gifts</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='noiseSuppression' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#sound'></use></svg></span><span><strong>Noise suppression</strong><small>Reduce background noise in your microphone</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='optimizeForStability' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#restore'></use></svg></span><span><strong>Optimize for stability</strong><small>Adaptive video and bandwidth-saving publishing</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='markViewers' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#profile'></use></svg></span><span><strong>Show viewer count</strong><small>Display the verified LIVE audience count</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='communitySafety' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#privacy'></use></svg></span><span><strong>Community safety</strong><small>Keep LIVE safety and reporting guidance visible</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='groupChatEnabled' checked><span class='live-preflight-switch'></span><span><strong>Group LIVE chat</strong><small>Allow viewers to read and send LIVE comments</small></span></label>"+
       "<label class='live-preflight-toggle'><input type='checkbox' name='liveGifts' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#coins'></use></svg></span><span><strong>LIVE gifts</strong><small>Allow Coins gifts and reward drops in this LIVE</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='audienceControl' checked><span class='live-preflight-switch'></span><span class='live-preflight-label-icon'><svg class='live-preflight-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#friends'></use></svg></span><span><strong>Audience control</strong><small>Use the audience selector above</small></span></label>"+
    "</div></div>"+
    "<div class='live-preflight-section live-guest-controls-section'><div class='live-preflight-section-title'><strong>Guest & co-host controls</strong><small>Choose who can join your stage and how requests are handled</small></div><div class='live-preflight-switches'>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='allowGuestRequests' checked><span class='live-preflight-switch'></span><span><strong>Allow guest requests</strong><small>Let viewers ask to join your speaker stage</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='guestCamera' checked><span class='live-preflight-switch'></span><span><strong>Guest camera</strong><small>Allow approved guests to share video</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='autoAcceptRequests'><span class='live-preflight-switch'></span><span><strong>Auto accept</strong><small>Automatically approve guest requests while seats are open</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='prioritizeGifters'><span class='live-preflight-switch'></span><span><strong>Prioritize gifters</strong><small>Show higher verified gifter levels first in the request queue</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='allowCoHost' checked><span class='live-preflight-switch'></span><span><strong>Allow co-host</strong><small>Allow other members to join your LIVE stage</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='manageModerators' checked><span class='live-preflight-switch'></span><span><strong>Manage moderators</strong><small>Allow the host to assign and remove LIVE moderators</small></span></label>"+
      "<label class='live-preflight-toggle'><input type='checkbox' name='voiceRings' checked><span class='live-preflight-switch'></span><span><strong>Voice rings</strong><small>Play an audio alert for new guest stage requests</small></span></label>"+
    "</div></div>"+
    "<details class='live-preflight-advanced'><summary>Disclosure & client acquisition <span>More settings</span></summary><div class='live-preflight-fields'>"+
      "<label class='live-preflight-field'><span>Content disclosure</span><select name='contentDisclosure'><option value='none'>No disclosure</option><option value='branded'>Branded content / partnership</option><option value='sponsored'>Sponsored content</option></select></label>"+
      "<label class='live-preflight-toggle live-preflight-cta-toggle'><input type='checkbox' name='clientAcquisitionEnabled'><span class='live-preflight-switch'></span><span><strong>Show client call-to-action</strong><small>Add a business, booking or service link to your LIVE</small></span></label>"+
      "<label class='live-preflight-field'><span>Button label</span><input name='clientCtaLabel' maxlength='48' placeholder='Book a consultation'></label>"+
      "<label class='live-preflight-field'><span>HTTPS link</span><input name='clientCtaUrl' type='url' inputmode='url' placeholder='https://example.com'></label>"+
    "</div></details>"+
    "<div class='live-preflight-unavailable' aria-label='Additional LIVE production integrations'><strong>Additional LIVE integrations</strong><span>Guardian/family controls · Cloud recording/egress · Advanced effects · LIVE Services · Fan Club</span><small>These need verified provider, storage, creator and safety workflows before they can be enabled.</small></div>"+
    "<div class='live-preflight-submit'><button class='primary' type='submit' "+(liveReady?"":"disabled")+">🔴 Start LIVE</button><p class='form-hint'>Mobile Gaming uses screen sharing. Screen-capture availability depends on the device and browser; native Android game capture still needs platform integration.</p></div></form>"+
    (liveReady?"":"<p class='form-hint'>"+esc(status.error||"Minglora could not verify its LiveKit connection. Check the server URL and API credentials.")+"</p>")+"</section>"+
    "<div class='feed-header'><h2>Live now</h2></div>"+
    "<div class='live-directory-filters' role='group' aria-label='Filter LIVE broadcasts'><button type='button' data-live-filter='all' class='active'>All LIVE</button><button type='button' data-live-filter='video_audio'>Video + Audio</button><button type='button' data-live-filter='audio_only'>Audio Only</button><button type='button' data-live-filter='mobile_gaming'>Gaming</button><button type='button' data-live-filter='live_studio'>Studio</button></div>"+
    "<section class='live-discovery-board card'><nav class='live-discovery-tabs' aria-label='LIVE discovery rankings'><button type='button' data-live-discovery='daily'>Daily</button><button type='button' data-live-discovery='popular'>Popular LIVE</button><button type='button' data-live-discovery='league'>League</button></nav><div id='live-discovery-content'><p class='muted'>Loading Daily LIVE rankings…</p></div></section>"+
    "<div class='live-room-grid'>"+cards+"</div>"+
    "<section class='card live-coins-promo'><div><span class='eyebrow'>Support your favourite creators</span><h2>Send LIVE gifts with Minglora Coins</h2><p class='muted'>Your gifts support creators through Minglora’s 50/50 earnings share.</p></div><div class='live-promo-actions'><strong>"+
    (wallet.wallet&&wallet.wallet.balance_coins!=null?Number(wallet.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable")+"</strong><button class='secondary' id='open-live-coins'>Recharge Coins</button></div>"+
    (packages.length?"<div class='live-package-preview'>"+packages.map(p=>"<span>"+Number(p.coin_amount).toLocaleString()+" Coins · "+liveMoney(p.price_minor)+"</span>").join("")+"</div>":"")+"</section>");
  const form=$("#live-create-form");
  form?.querySelectorAll("input[name='liveMode']").forEach(input=>input.addEventListener("change",()=>{state.liveStartFormat=input.value;}));
  const audienceSelect=$("#live-audience-select");
  const audienceControl=form?.querySelector("[name='audienceControl']");
  const practiceControl=form?.querySelector("[name='practiceMode']");
  const syncAudienceControls=()=>{
    if(!audienceSelect)return;
    const forcedPrivate=Boolean(practiceControl?.checked);
    const disabled=forcedPrivate||!audienceControl?.checked;
    if(forcedPrivate)audienceSelect.value='private';
    else if(!audienceControl?.checked)audienceSelect.value='public';
    audienceSelect.disabled=disabled;
    $("#live-audience-field")?.classList.toggle("is-disabled",disabled);
  };
  practiceControl?.addEventListener("change",syncAudienceControls);
  audienceControl?.addEventListener("change",syncAudienceControls);
  syncAudienceControls();
  const clientAcquisition=form?.querySelector("[name='clientAcquisitionEnabled']");
  const ctaLabel=form?.querySelector("[name='clientCtaLabel']");
  const ctaUrl=form?.querySelector("[name='clientCtaUrl']");
  const syncCtaControls=()=>{
    const enabled=Boolean(clientAcquisition?.checked);
    if(ctaLabel)ctaLabel.required=enabled;
    if(ctaUrl)ctaUrl.required=enabled;
    form?.querySelectorAll("[name='clientCtaLabel'],[name='clientCtaUrl']").forEach(input=>input.closest(".live-preflight-field")?.classList.toggle("is-required",enabled));
  };
  clientAcquisition?.addEventListener("change",syncCtaControls);
  syncCtaControls();
  form?.addEventListener("submit",async event=>{
    event.preventDefault();const button=form.querySelector("button[type='submit']");button.disabled=true;
    try{
      const values=new FormData(form);
      const liveMode=String(values.get("liveMode")||"video_audio");
      const liveSettings={
        board:String(values.get("board")||"general"),
        aboutMe:String(values.get("aboutMe")||"").trim(),
        practiceMode:values.has("practiceMode"),
        liveQuality:String(values.get("liveQuality")||"auto"),
        noiseSuppression:values.has("noiseSuppression"),
        optimizeForStability:values.has("optimizeForStability"),
        markViewers:values.has("markViewers"),
        communitySafety:values.has("communitySafety"),
        groupChatEnabled:values.has("groupChatEnabled"),
        liveGifts:values.has("liveGifts"),
        audienceControl:values.has("audienceControl"),
        contentDisclosure:String(values.get("contentDisclosure")||"none"),
        allowGuestRequests:values.has("allowGuestRequests"),
        guestCamera:values.has("guestCamera"),
        autoAcceptRequests:values.has("autoAcceptRequests"),
        prioritizeGifters:values.has("prioritizeGifters"),
        allowCoHost:values.has("allowCoHost"),
        manageModerators:values.has("manageModerators"),
        voiceRings:values.has("voiceRings"),
        clientAcquisitionEnabled:values.has("clientAcquisitionEnabled"),
        clientCtaLabel:String(values.get("clientCtaLabel")||"").trim(),
        clientCtaUrl:String(values.get("clientCtaUrl")||"").trim()
      };
      const result=await api("/live/sessions",{method:"POST",body:JSON.stringify({
        title:String(values.get("title")||"").trim(),
        visibility:values.get("visibility")||"public",
        liveMode,
        broadcastType:liveMode==="audio_only"?"audio_only":"video_audio",
        liveSettings
      })});
      await openLiveRoom(result.session,"host",result.liveKit);
    }catch(error){toast(error.message);button.disabled=false;}
  });
  $("#open-live-coins")?.addEventListener("click",()=>activateNav("coins"));
  bindLiveDirectoryCards(sessions);
  bindLiveDiscoveryBoards(sessions);
}
async function refreshLiveDirectorySessions({quiet=true}={}){
  if(state.view!=='live'||activeLiveRoom||document.visibilityState!=='visible')return false;
  const container=$('.live-room-grid');
  if(!container)return false;
  const focused=document.activeElement;
  if(focused&&container.contains(focused))return false;
  try{
    const data=await api('/live/sessions');
    if(state.view!=='live'||activeLiveRoom||!container.isConnected)return false;
    const sessions=(data.sessions||[]).filter(session=>
      session.status==='live'&&session.viewerCountVerified===true
    );
    container.innerHTML=sessions.length?sessions.map(liveSessionCardMarkup).join(""):"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a LIVE session and bring your community together.</p></section>";
    bindLiveDirectoryCards(sessions);
    bindLiveDiscoveryBoards(sessions);
    return true;
  }catch(error){
    if(!quiet)toast('LIVE directory could not be updated: '+error.message);
    else console.warn('[Minglora LIVE] Directory sync failed:',error?.message||error);
    return false;
  }
}
async function renderLive(){
  activateSilent("live");stopLiveChatRefresh();stopLiveDirectoryRefresh();
  const results=await Promise.allSettled([
    api("/live/status"),
    api("/live/sessions"),
    api("/coins/catalog"),
    api("/coins/wallet"),
    api("/live-pro/access")
  ]);
  const status=results[0].status==="fulfilled"
    ? results[0].value
    : {provider:"livekit",configured:false,connected:false,error:results[0].reason?.message||"Minglora could not check the LiveKit connection."};
  const sessionResult=results[1].status==="fulfilled"?results[1].value:null;
  const sessions=(Array.isArray(sessionResult?.sessions)?sessionResult.sessions:[]).filter(session=>
    session.status==='live'&&session.viewerCountVerified===true
  );
  if(!sessionResult)status.liveDirectoryError=results[1].reason?.message||"Minglora could not load the LIVE directory.";
  const catalog=results[2].status==="fulfilled"?results[2].value:{gifts:[],packages:[]};
  const wallet=results[3].status==="fulfilled"?results[3].value:{wallet:null,ledger:[]};
  liveGiftCatalogue=Array.isArray(catalog.gifts)?catalog.gifts:[];
  const livePro=results[4].status==="fulfilled"?results[4].value:{hasAccess:false};
  renderLiveDirectory(sessions,status,catalog,wallet,livePro);
  $("#live-pro-open")?.addEventListener("click",()=>activateNav("live-pro"));
  startLiveDirectoryRefresh();
}

async function renderLiveProStudio(){
  activateSilent("live");stopLiveChatRefresh();stopLiveDirectoryRefresh();
  setContent("<section class='card empty-state'><h2>Opening LIVE Pro Studio…</h2><p>Loading your saved Minglora broadcast history.</p></section>");
  try{
    const [access,dashboard]=await Promise.all([api("/live-pro/access"),api("/live-pro/dashboard")]);
    if(!access.hasAccess)throw new Error("LIVE Pro access is not enabled for this account.");
    const stats=dashboard.stats||{};
    const sessions=Array.isArray(dashboard.history)?dashboard.history:[];
    const modeLabel=value=>({video_audio:"Video + Audio",audio_only:"Audio Only",mobile_gaming:"Mobile Gaming",live_studio:"LIVE Studio"}[value]||"LIVE");
    const history=sessions.length?sessions.map(session=>{
      const started=session.startedAt?new Date(session.startedAt).toLocaleString():"Date unavailable";
      const status=session.status==="live"?"LIVE NOW":session.status==="ended"?"Ended":String(session.status||"Saved");
      return "<article class='live-pro-history-item'><div><strong>"+esc(session.title)+"</strong><small>"+esc(modeLabel(session.mode))+" · "+esc(status)+" · "+esc(started)+"</small></div><span>"+Number(session.durationMinutes||0).toLocaleString()+" min</span></article>";
    }).join(""):"<p class='muted'>No previous broadcasts are recorded for this account yet.</p>";
    const capabilities=Array.isArray(access.capabilities)?access.capabilities:[];
    setContent("<div class='page-heading live-pro-page-heading'><div><span class='eyebrow'>Minglora creator tools</span><h1>LIVE Pro Studio</h1><p class='muted'>Advanced LIVE production and creator controls, with your real broadcast history.</p></div><span class='live-pro-access-pill'>LIVE Pro enabled</span></div>"+
      "<section class='live-pro-stat-grid'><article class='card'><small>Total broadcasts</small><strong>"+Number(stats.totalBroadcasts||0).toLocaleString()+"</strong></article><article class='card'><small>Currently live</small><strong>"+Number(stats.activeBroadcasts||0).toLocaleString()+"</strong></article><article class='card'><small>Broadcast minutes</small><strong>"+Number(stats.totalMinutes||0).toLocaleString()+"</strong></article><article class='card'><small>Recorded participant joins</small><strong>"+Number(stats.recordedParticipantJoins||0).toLocaleString()+"</strong></article></section>"+
      "<section class='card live-pro-tools-card'><div class='live-pro-card-heading'><div><h2>Production tools</h2><p class='muted'>These controls use Minglora's existing LiveKit LIVE room and server permissions.</p></div><button class='primary' id='live-pro-start-live' type='button'>Start a LIVE</button></div><div class='live-pro-capabilities'>"+capabilities.map(item=>"<article><strong>"+esc(item.label)+"</strong><p>"+esc(item.description)+"</p></article>").join("")+"</div></section>"+
      "<section class='card live-pro-history-card'><div class='live-pro-card-heading'><div><h2>Broadcast history</h2><p class='muted'>Only broadcasts saved under your account are shown.</p></div></div>"+history+"</section>");
    $("#live-pro-start-live")?.addEventListener("click",()=>activateNav("live"));
    }catch(error){
    setContent("<section class='card empty-state'><h2>LIVE Pro Studio is unavailable</h2><p>"+esc(error.message||"Minglora could not load LIVE Pro.")+"</p><button class='secondary' id='live-pro-back-live'>Back to LIVE</button></section>");
    $("#live-pro-back-live")?.addEventListener("click",()=>activateNav("live"));
  }
}

function isLiveScreenSharePublication(publication){
  const source=publication?.source;
  const sdkSource=window.LivekitClient?.Track?.Source?.ScreenShare;
  return source===3||source===sdkSource||/screen.?share/i.test(String(source||""));
}
function attachLiveTrack(track,participant,local,publication){
  if(!track)return;
  if(track.kind==="video"){
    const identity=String(participant?.identity||"local");
    const screenShare=isLiveScreenSharePublication(publication);
    const layout=$("#live-guest-layout");
    const seat=Array.from(layout?.querySelectorAll(".live-guest-seat[data-participant]")||[]).find(item=>item.dataset.participant===identity);
    const target=screenShare?$("#live-screen-share-stage"):(seat?.querySelector(".live-guest-seat-media")||(activeLiveScreenLayout==="full-screen"?null:$("#live-video-stage")));
    if(!target)return;
    const tile=document.createElement("div");
    tile.className=screenShare?"live-screen-share-tile":"live-video-tile"+(local?" local":"");
    tile.dataset.participant=identity;
    const element=track.attach();element.autoplay=true;element.playsInline=true;element.className="live-video-element";if(local)element.muted=true;
    tile.append(element);
    if(!local||screenShare){const name=document.createElement("span");name.className=screenShare?"live-screen-share-name":"live-video-name";name.textContent=screenShare?"Screen shared by "+(participant?.name||participant?.identity||"Host"):(participant?.name||participant?.identity||"Guest");tile.append(name);}
    target.append(tile);
    if(screenShare)$("#live-video-stage")?.classList.add("has-live-screen-share");
    else seat?.classList.add("has-video");
  }else{
    const root=$("#live-audio-root");if(root){const element=track.attach();element.autoplay=true;element.muted=liveAudioMuted;root.append(element);}
  }
}

function endHostedLiveOnPageHide(){
  if(activeLiveRole!=="host"||!activeLiveSession?.id)return;
  const sessionId=encodeURIComponent(activeLiveSession.id);
  try{activeLiveRoom?.disconnect();}catch{}
  fetch("/api/live/sessions/"+sessionId+"/end",{
    method:"POST",credentials:"same-origin",keepalive:true,
    headers:{"Content-Type":"application/json"},body:"{}"
  }).catch(()=>{});
}
window.addEventListener("pagehide",endHostedLiveOnPageHide);

function stopLiveParticipantSync(){
  if(liveParticipantSyncTimer){clearInterval(liveParticipantSyncTimer);liveParticipantSyncTimer=null;}
  liveParticipantSyncBusy=false;
}
async function syncLiveParticipantPresence(session){
  stopLiveParticipantSync();
  const path="/live/sessions/"+encodeURIComponent(session.id)+"/connected";
  const send=()=>api(path,{method:"POST",body:"{}"});
  for(let attempt=0;attempt<4;attempt++){
    try{await send();return true;}
    catch(error){
      if(attempt===3)console.warn("[Minglora LIVE] Participant presence is not confirmed yet; background retries will continue.",error);
      else await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
    }
  }
  toast("Your microphone is connected. Minglora is still confirming your LIVE presence.");
  liveParticipantSyncTimer=setInterval(async()=>{
    if(liveParticipantSyncBusy)return;
    if(!activeLiveRoom||activeLiveSession?.id!==session.id){stopLiveParticipantSync();return;}
    liveParticipantSyncBusy=true;
    try{
      await send();
      stopLiveParticipantSync();
      console.info("[Minglora LIVE] Participant presence confirmed after retry.",{sessionId:session.id});
    }catch(error){
      console.warn("[Minglora LIVE] Participant presence retry failed.",error?.message||error);
    }finally{liveParticipantSyncBusy=false;}
  },3000);
  return false;
}
function stopLiveSpeakerRefresh(){if(liveSpeakerRefreshTimer){clearInterval(liveSpeakerRefreshTimer);liveSpeakerRefreshTimer=null;}}
function stopLiveGiftEvents(){
  if(liveGiftEventsTimer){clearInterval(liveGiftEventsTimer);liveGiftEventsTimer=null;}
  liveGiftEventsBusy=false;
  liveGiftEventsLastSeenAt='';
  liveGiftSeenEventIds.clear();
}
function rememberLiveGiftEvent(eventId){
  const id=String(eventId||'').trim();
  if(!id||liveGiftSeenEventIds.has(id))return false;
  liveGiftSeenEventIds.add(id);
  if(liveGiftSeenEventIds.size>500){
    const previous=Array.from(liveGiftSeenEventIds);
    previous.slice(0,previous.length-300).forEach(item=>liveGiftSeenEventIds.delete(item));
  }
  return true;
}
function presentLiveGiftEvent(event){
  if(!event||typeof event!=='object')return false;
  if(event.broadcastId&&String(event.broadcastId)!==String(activeLiveSession?.id||''))return false;
  const eventId=String(event.id||event.giftTransactionId||event.gift_transaction_id||'');
  if(!rememberLiveGiftEvent(eventId))return false;
  const catalogueGift=liveGiftCatalogue.find(item=>item.code===String(event.giftCode||''));
  const gift=catalogueGift?{
    ...catalogueGift,
    code:catalogueGift.code||event.giftCode,
    name:catalogueGift.name||event.giftName||'Minglora Gift',
    image_url:catalogueGift.image_url||event.imageUrl||event.image_url||'',
    model_url:catalogueGift.model_url||event.modelUrl||event.model_url||'',
    emoji:catalogueGift.emoji||event.emoji||'🎁'
  }:{
    code:String(event.giftCode||''),
    name:String(event.giftName||'Minglora Gift'),
    image_url:String(event.imageUrl||event.image_url||''),
    model_url:String(event.modelUrl||event.model_url||''),
    emoji:String(event.emoji||'🎁'),
    animation_preset:String(event.animationPreset||'gift-reveal'),
    animation_duration_ms:Number(event.animationDurationMs)||2600
  };
  const stage=$('#live-video-stage');
  if(stage)window.MingloraGiftFX?.mount(stage,gift);
  const sender=String(event.sender?.name||event.sender?.username||'A Minglora member');
  const recipient=String(event.recipient?.name||activeLiveSession?.host?.name||'');
  if(String(event.sender?.id||'')!==String(state.user?.id||''))toast(sender+' sent '+gift.name+(recipient?' to '+recipient:'')+' 🎁');
  const createdAt=String(event.createdAt||'');
  if(createdAt&&createdAt>liveGiftEventsLastSeenAt)liveGiftEventsLastSeenAt=createdAt;
  return true;
}
async function refreshLiveGiftEvents(session){
  if(liveGiftEventsBusy||!session?.id||activeLiveSession?.id!==session.id)return;
  liveGiftEventsBusy=true;
  try{
    const since=liveGiftEventsLastSeenAt||new Date(Date.now()-10000).toISOString();
    const result=await api('/live/sessions/'+encodeURIComponent(session.id)+'/gifts?since='+encodeURIComponent(since));
    const events=Array.isArray(result.events)?result.events:[];
    for(const event of events)presentLiveGiftEvent(event);
  }catch(error){
    console.warn('[Minglora LIVE] Confirmed gift activity could not be refreshed.',error?.message||error);
  }finally{liveGiftEventsBusy=false;}
}
function startLiveGiftEvents(session){
  if(liveGiftEventsTimer)clearInterval(liveGiftEventsTimer);
  void refreshLiveGiftEvents(session);
  liveGiftEventsTimer=setInterval(()=>void refreshLiveGiftEvents(session),2200);
}
async function refreshLiveSpeakerPanel(session,role,room){
  const root="/live/sessions/"+encodeURIComponent(session.id);
  if(role==="host"){
    const list=$("#live-speaker-request-list");if(!list)return;
    try{
      const data=await api(root+"/speaker-requests"),requests=data.requests||[];
      const currentPendingIds=new Set(requests.filter(request=>request.status==='requested').map(request=>String(request.userId)));
      const previousPendingIds=liveSpeakerSeenRequestsBySession.get(session.id);
      if(previousPendingIds&&session.liveSettings?.voiceRings!==false&&Array.from(currentPendingIds).some(id=>!previousPendingIds.has(id))){
        primeCallAudio();window.setTimeout(()=>playCallTone([620,820],520),160);
      }
      liveSpeakerSeenRequestsBySession.set(session.id,currentPendingIds);
      const pendingCount=requests.filter(request=>request.status==="requested").length;
      const activeCount=requests.filter(request=>request.status==="connected").length;
      const approvedCount=requests.filter(request=>request.status==="accepted").length;
      const historyCount=requests.filter(request=>["rejected","left"].includes(request.status)).length;
      const pendingNode=$("#live-guest-pending-count"),activeNode=$("#live-guest-active-count"),approvedNode=$("#live-guest-approved-count"),historyNode=$("#live-guest-history-count");
      if(pendingNode)pendingNode.textContent=pendingCount.toLocaleString();
      if(activeNode)activeNode.textContent=activeCount.toLocaleString();
      if(approvedNode)approvedNode.textContent=approvedCount.toLocaleString();
      if(historyNode)historyNode.textContent=historyCount.toLocaleString();
      const guestStageEnabled=session.liveSettings?.guestStageEnabled!==false;
      const stageState=$("#live-guest-stage-state");
      if(stageState)stageState.textContent=guestStageEnabled?"ON":"OFF";
      list.innerHTML=requests.length?requests.map(request=>{
        const statusLabels={requested:"Pending review",connected:"On stage",accepted:"Approved · waiting to join",rejected:"Declined",left:"Removed or left stage"};
        const status=statusLabels[request.status]||"Status · "+String(request.status||"Unknown");
        const actions=request.status==="requested"
          ?"<div class='live-speaker-actions'><button type='button' data-speaker-accept='"+esc(request.userId)+"'>Accept</button><button type='button' data-speaker-reject='"+esc(request.userId)+"'>Decline</button></div>"
          :["accepted","connected"].includes(request.status)
            ?"<div class='live-speaker-actions'><span class='live-speaker-approved'>"+esc(request.status==="connected"?"Connected on stage":"Approved · waiting to join")+"</span><button type='button' class='live-speaker-remove' data-speaker-remove='"+esc(request.userId)+"'>Remove</button></div>"
            :"<div class='live-speaker-actions'><span class='live-speaker-closed'>Request closed</span></div>";
        const memberName=String(request.user?.name||"Minglora member");
        const formatTime=value=>value?new Date(value).toLocaleString():"";
        const timeline=[
          "Requested · "+(formatTime(request.requestedAt)||"Time unavailable"),
          request.acceptedAt?"Approved · "+formatTime(request.acceptedAt):"",
          request.connectedAt?"Connected · "+formatTime(request.connectedAt):"",
          request.reviewedAt?"Reviewed · "+formatTime(request.reviewedAt):"",
          request.leftAt?"Left stage · "+formatTime(request.leftAt):""
        ].filter(Boolean);
        return "<article class='live-speaker-request-row status-"+esc(request.status)+"'><span class='live-speaker-avatar' aria-hidden='true'>"+esc(memberName.trim().slice(0,1).toUpperCase()||"M")+"</span><div class='live-speaker-meta'><strong>"+esc(memberName)+gifterProfileBadge(request.user)+"</strong><span class='live-speaker-username'>@"+esc(request.user?.username||"member")+"</span><small class='live-speaker-status'>"+esc(status)+"</small><div class='live-speaker-timeline'>"+timeline.map(item=>"<small>"+esc(item)+"</small>").join("")+"</div></div>"+actions+"</article>";
      }).join(""):guestStageEnabled
        ?"<div class='live-speaker-empty'><strong>No guest requests yet</strong><p>New requests, approvals, connected speakers and closed requests for this LIVE will all appear here.</p></div>"
        :"<div class='live-speaker-empty is-disabled'><strong>Guest stage is OFF</strong><p>Turn Guest stage ON to accept requests and add speakers. No guests can join while it is disabled.</p></div>";
      list.querySelectorAll("[data-speaker-accept],[data-speaker-reject],[data-speaker-remove]").forEach(button=>button.addEventListener("click",async()=>{
        const speakerId=button.dataset.speakerAccept||button.dataset.speakerReject||button.dataset.speakerRemove;
        const decision=button.dataset.speakerAccept?"accept":button.dataset.speakerReject?"reject":"remove";
        if(decision==="remove"&&!window.confirm("Remove this guest from the LIVE stage? They will return to the audience and can request to join again."))return;
        button.disabled=true;
        try{
          await api(root+"/speaker-requests/"+encodeURIComponent(speakerId),{method:"PATCH",body:JSON.stringify({decision})});
          toast(decision==="accept"?"Speaker approved. They can now join the stage.":decision==="reject"?"Speaker request declined.":"Guest removed from the stage.");
          await refreshLiveSpeakerPanel(session,role,room);
        }catch(error){toast(error.message);button.disabled=false;}
      }));
    }catch(error){list.innerHTML="<p class='muted'>Speaker requests could not be refreshed: "+esc(error.message)+"</p>";}
    return;
  }
  if(role!=="viewer")return;
  const button=$("#live-request-speaker"),status=$("#live-speaker-request-status");if(!button)return;
  try{
    const data=await api(root+"/speaker-request"),request=data.request;
    if(request&&request.status==="accepted"){
      button.disabled=false;button.textContent="Join speaker stage";
      if(status)status.textContent="The host approved your microphone. Join when you're ready.";
      button.onclick=async()=>{
        button.disabled=true;
        try{stopLiveSpeakerRefresh();stopLiveChatRefresh();await room.disconnect();activeLiveRoom=null;await openLiveRoom(session,"guest");}
        catch(error){toast(error.message);button.disabled=false;startLiveSpeakerRefresh(session,"viewer",room);}
      };
      return;
    }
    button.disabled=Boolean(request&&request.status==="requested");
    button.textContent=request?.status==="requested"?"Request sent":request?.status==="rejected"?"Request to speak again":"Raise hand to speak";
    if(status)status.textContent=request?.status==="requested"?"Waiting for the host to review your request.":request?.status==="rejected"?"Your last request was declined. You can ask again.":"You are listening as an audience member.";
    button.onclick=async()=>{
      button.disabled=true;
      try{await api(root+"/speaker-requests",{method:"POST",body:"{}"});button.textContent="Request sent";if(status)status.textContent="Waiting for the host to review your request.";toast("Your request to speak was sent.");}
      catch(error){toast(error.message);button.disabled=false;}
    };
  }catch(error){if(status)status.textContent=error.message;}
}
function startLiveSpeakerRefresh(session,role,room){
  stopLiveSpeakerRefresh();void refreshLiveSpeakerPanel(session,role,room);
  if(role==="host"||role==="viewer")liveSpeakerRefreshTimer=setInterval(()=>void refreshLiveSpeakerPanel(session,role,room),5000);
}
function renderLivePinnedComment(comment){
  activeLivePinnedComment=comment?.id?{
    id:String(comment.id),
    body:String(comment.body||"").slice(0,500),
    author:String(comment.author||"Member").slice(0,80)
  }:null;
  const root=$("#live-pinned-comment");
  if(!root)return;
  root.replaceChildren();
  root.classList.toggle("hidden",!activeLivePinnedComment);
  if(!activeLivePinnedComment)return;
  const tag=document.createElement("span");tag.className="live-pinned-tag";tag.textContent="PINNED";
  const author=document.createElement("strong");author.textContent=activeLivePinnedComment.author+":";
  const body=document.createElement("span");body.className="live-pinned-body";body.textContent=activeLivePinnedComment.body;
  root.append(tag,author,body);
}
async function refreshLiveChat(broadcastId){
  try{
    const data=await api("/live/sessions/"+encodeURIComponent(broadcastId)+"/chat"),list=$("#live-chat-list");if(!list)return;
    const wasNearBottom=!list.dataset.liveChatInitialized||list.scrollHeight-list.scrollTop-list.clientHeight<=72;
    list.innerHTML=(data.messages||[]).map(message=>{
      const member=message.user||message.member||{};
      const author=member.name||message.user_name||"Member";
      const handle=member.username||message.username||"";
      const chatAvatar=member.avatar||member.avatar_url||member.avatarUrl||message.avatar||message.avatar_url||"";
      const authorAvatar=avatar({name:author,avatar:chatAvatar});
      const isPinned=activeLivePinnedComment?.id===String(message.id);
      const canModerateChat=activeLiveRole==="host"||Boolean(activeLiveSession?.liveModerators?.includes(state.user?.id));
      const controls=canModerateChat
        ?"<span class='live-chat-actions'>"+(activeLiveRole==="host"?"<button type='button' class='live-chat-pin"+(isPinned?" is-pinned":"")+"' data-live-chat-pin='"+esc(message.id)+"' aria-label='"+(isPinned?"Unpin":"Pin")+" this comment'>"+(isPinned?"Unpin":"Pin")+"</button>":"")+"<button type='button' class='live-chat-delete' data-live-chat-delete='"+esc(message.id)+"' aria-label='Remove this comment'>Remove</button></span>"
        :"";
      return "<div class='live-chat-line' data-live-chat-id='"+esc(message.id)+"'><img class='live-chat-avatar' src='"+authorAvatar+"' alt='' loading='lazy'><div class='live-chat-copy'><strong>"+esc(author)+(handle?" <small class='live-chat-handle'>@"+esc(handle)+"</small>":"")+gifterProfileBadge(member)+"</strong><span>"+esc(message.body)+"</span><small class='live-chat-time'>"+timeAgo(message.created_at)+"</small></div>"+controls+"</div>";
    }).join("")||"<p class='muted'>Say hello to the LIVE community.</p>";
    if(wasNearBottom)list.scrollTop=list.scrollHeight;
    list.dataset.liveChatInitialized='true';
  }catch(error){if($("#live-chat-list"))toast(error.message);}
}
async function endHostedLiveSession(session){
  try{
    return await api("/live/sessions/"+encodeURIComponent(session.id)+"/end",{method:"POST",body:"{}"});
  }catch(error){
    // Reconcile a lost response only when LiveKit is reachable and the server no longer
    // advertises this broadcast as live. This avoids duplicate "end failed" messages.
    try{
      const [health,result]=await Promise.all([api("/live/status"),api("/live/sessions")]);
      if(health.connected===true&&!(result.sessions||[]).some(item=>item.id===session.id)){
        return {ok:true,alreadyEnded:true};
      }
    }catch{}
    throw error;
  }
}
function participantHasLiveAudio(participant){
  const publications=participant?.audioTrackPublications;
  if(publications&&typeof publications.values==="function"){
    for(const publication of publications.values())if(publication)return true;
  }
  const tracks=participant?.trackPublications;
  if(tracks&&typeof tracks.values==="function"){
    for(const publication of tracks.values()){
      const kind=String(publication?.kind||publication?.track?.kind||"").toLowerCase();
      const source=String(publication?.source||"").toLowerCase();
      if(kind==="audio"||source==="microphone")return true;
    }
  }
  return false;
}
function participantHasLiveStageMedia(participant){
  const publications=participant?.trackPublications;
  if(publications&&typeof publications.values==="function"){
    for(const publication of publications.values()){
      const kind=String(publication?.kind||publication?.track?.kind||"").toLowerCase();
      const source=String(publication?.source||"").toLowerCase();
      const isLiveMedia=kind==="audio"||kind==="video"||source==="microphone"||source==="camera";
      if(isLiveMedia&&(publication?.track||publication?.isSubscribed===true))return true;
    }
  }
  return false;
}

function renderLiveSpeakerRoster(room,role,session,activeSpeakerIds=new Set()){
  const root=$("#live-speaker-list");if(!root||!room)return;
  const speakers=[];
  const local=room.localParticipant;
  if(role==="host"||role==="guest"){
    speakers.push({
      identity:local?.identity||state.user?.id,
      name:local?.name||state.user?.name||"You",
      label:role==="host"?"You · Host":"You · Guest speaker",
      connected:participantHasLiveAudio(local),
      speaking:activeSpeakerIds.has(local?.identity), muted:Array.from(local?.audioTrackPublications?.values?.()||[]).some(publication=>publication?.isMuted)
    });
  }
  const remotes=room.remoteParticipants?.values?Array.from(room.remoteParticipants.values()):[];
  for(const person of remotes){
    const isHost=person.identity===session?.hostId;
    const hasAudio=participantHasLiveAudio(person);
    if(!isHost&&!hasAudio)continue;
    speakers.push({
      identity:person.identity,
      name:person.name||person.identity||"Minglora member",
      label:isHost?"Host": "Guest speaker",
      connected:hasAudio,
      speaking:activeSpeakerIds.has(person.identity), muted:Array.from(person.audioTrackPublications?.values?.()||[]).some(publication=>publication?.isMuted)
    });
  }
  if(!speakers.length){
    root.innerHTML="<span class='muted'>You're connected to the room. Waiting for the host microphone to publish…</span>";
    return;
  }
  root.innerHTML=speakers.map(person=>
    "<span class='live-speaker-chip "+(person.speaking?"active ":"")+(person.connected?"connected":"connecting")+"' title='"+esc(person.label)+"'>"+
      esc(person.name)+"<small>"+(person.speaking?"Speaking":person.connected?(person.muted?"Microphone muted":"Microphone connected"):"Connected · microphone starting")+"</small></span>"
  ).join("");
}

function renderLiveGuestLayout(room,role,session,activeSpeakerIds=new Set()){
  const root=$("#live-guest-layout");if(!root||!room)return;
  applyLiveScreenLayout(activeLiveScreenLayout);
  const local=room.localParticipant;
  const remotes=room.remoteParticipants?.values?Array.from(room.remoteParticipants.values()):[];
  const hostParticipant=role==="host"?local:remotes.find(person=>person.identity===session?.hostId)||null;
  const hostIdentity=String(hostParticipant?.identity||session?.hostId||"minglora-host");
  const hostName=hostParticipant?.name||session?.host?.name||(role==="host"?state.user?.name:"Minglora host")||"Minglora host";
  const fullScreenHostOnly=activeLiveScreenLayout==="full-screen"&&!root.closest(".live-audio-stage");
  const guests=[];
  if(role==="guest"&&local&&participantHasLiveStageMedia(local))guests.push(local);
  for(const person of remotes){
    if(person.identity===session?.hostId||!participantHasLiveStageMedia(person))continue;
    if(!guests.some(item=>item.identity===person.identity))guests.push(person);
  }
  root.classList.toggle("live-host-only-layout",fullScreenHostOnly);
  root.classList.toggle("has-active-guests",fullScreenHostOnly&&guests.length>0);
  root.classList.toggle("has-many-guests",fullScreenHostOnly&&guests.length>4);
  root.dataset.activeGuestCount=String(guests.length);
  const specs=[{
    key:"host",identity:hostIdentity,name:hostName,person:hostParticipant,isHost:true
  }];
  guests.slice(0,8).forEach((person,index)=>specs.push({
    key:"guest:"+String(person.identity||index),identity:String(person.identity||""),name:person.name||person.identity||"Minglora guest",
    person,isHost:false
  }));
  if(!fullScreenHostOnly)while(specs.length<9)specs.push({key:"empty:"+specs.length,empty:true,seatNumber:specs.length});
  const previous=new Map(Array.from(root.children).filter(node=>node.dataset?.seatKey).map(node=>[node.dataset.seatKey,node]));
  const header=document.createElement("div");
  header.className="live-guest-layout-heading";
  header.innerHTML="<strong>Multi-guest stage</strong><small>"+(guests.length+1)+" / 9 seats</small>";
  const nodes=specs.map(spec=>{
    if(spec.empty){
      const seat=previous.get(spec.key)||document.createElement("button");
      seat.type="button";seat.className="live-guest-seat empty";seat.dataset.seatKey=spec.key;
      seat.removeAttribute("data-participant");seat.setAttribute("data-open-guest-panel","");
      seat.setAttribute("aria-label","Open guest seat "+(spec.seatNumber));
      seat.innerHTML="<span class='live-guest-seat-plus' aria-hidden='true'>+</span><strong>Guest seat</strong><small>"+(role==="host"?"Invite a speaker":"Open seat")+"</small>";
      return seat;
    }
    const seat=previous.get(spec.key)||document.createElement("article");
    const media=seat.querySelector(".live-guest-seat-media")||document.createElement("div");
    const identity=String(spec.identity||"");
    const connected=Boolean(spec.person&&participantHasLiveAudio(spec.person));
    const muted=Boolean(spec.person&&Array.from(spec.person.audioTrackPublications?.values?.()||[]).some(publication=>publication?.isMuted));
    const speaking=Boolean(identity&&activeSpeakerIds.has(identity));
    const name=String(spec.name||"Minglora member");
    const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase()||"M";
    const status=speaking?"Speaking":connected?(muted?"Microphone muted":"Microphone connected"):spec.isHost?"Waiting for host":"Connecting to stage";
    const hasVideo=Boolean(media.querySelector(".live-video-element"));
    seat.className="live-guest-seat"+(spec.isHost?" is-host":" is-guest")+(speaking?" is-speaking":"")+(hasVideo?" has-video":"");
    seat.dataset.seatKey=spec.key;seat.dataset.participant=identity;
    seat.setAttribute("aria-label",name+" · "+(spec.isHost?"Host":"Guest speaker")+" · "+status);
    seat.innerHTML="<span class='live-guest-seat-tag'>"+(spec.isHost?"HOST":"GUEST")+"</span>"+
      "<span class='live-guest-seat-avatar' aria-hidden='true'>"+esc(initials)+"</span>"+
      "<span class='live-guest-seat-meta'><strong>"+esc(name)+"</strong><small>"+esc(status)+"</small></span>";
    media.className="live-guest-seat-media";seat.append(media);
    return seat;
  });
  if(fullScreenHostOnly)root.replaceChildren(...nodes);
  else root.replaceChildren(header,...nodes);
}

function renderLiveViewerPanel(room,role,session){
  const panel=$('#live-viewer-panel'),list=$('#live-viewer-roster'),count=$('#live-viewer-total');
  if(!panel||!list||role!=='host'||!room)return;
  if(session?.liveSettings?.markViewers===false){if(count)count.textContent='Hidden by the LIVE viewer setting';list.innerHTML="<p class='muted'>Viewer marking is turned off for this broadcast.</p>";return;}
  const people=room.remoteParticipants?.values?Array.from(room.remoteParticipants.values()):[];
  if(count)count.textContent=people.length.toLocaleString()+' people in this LIVE';
  list.innerHTML=people.length?people.map(person=>{
    const name=String(person.name||person.identity||'Minglora member');
    const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'M';
    return "<div class='live-viewer-row'><span class='live-viewer-avatar' aria-hidden='true'>"+esc(initials)+"</span><span class='live-viewer-identity'><strong>"+esc(name)+"</strong><small>"+(participantHasLiveAudio(person)?'Guest speaker':'Viewer')+"</small></span><button type='button' class='text-button' data-live-viewer-profile='"+esc(person.identity||'')+"'>Profile</button></div>";
  }).join(''):"<p class='muted'>No other viewers are connected yet.</p>";
  list.querySelectorAll('[data-live-viewer-profile]').forEach(button=>button.addEventListener('click',()=>{const userId=button.dataset.liveViewerProfile;if(userId)openLiveProfilePreview(userId,session);}));
}

function stopLiveMatchRefresh(){if(liveMatchRefreshTimer){clearInterval(liveMatchRefreshTimer);liveMatchRefreshTimer=null;}liveMatchRefreshBusy=false;}
function stopLiveViewerRefresh(){if(liveViewerRefreshTimer){clearInterval(liveViewerRefreshTimer);liveViewerRefreshTimer=null;}liveViewerRefreshBusy=false;}
async function refreshLiveViewerRoster(session){
  if(liveViewerRefreshBusy||!session?.id||activeLiveRole!=='host'||activeLiveSession?.id!==session.id)return;
  const panel=$('#live-viewer-panel'),list=$('#live-viewer-roster'),count=$('#live-viewer-total');
  if(!panel||!list||session.liveSettings?.markViewers===false)return;
  liveViewerRefreshBusy=true;
  try{
    const data=await api('/live/sessions/'+encodeURIComponent(session.id)+'/viewers');
    if(activeLiveSession?.id!==session.id)return;
    const viewers=Array.isArray(data.viewers)?data.viewers:[];
    if(count)count.textContent=Number(data.viewerCount||0).toLocaleString()+' people in this LIVE';
    if(!viewers.length){list.innerHTML="<p class='muted'>No other viewers are connected yet.</p>";return;}
    list.innerHTML=viewers.map(item=>{
      const member=item.user||{},name=String(member.name||member.username||'Minglora member');
      const badge=item.gifterBadge,fan=item.fanClubMembership;
      const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'M';
      const priority=item.isGifter?"<span class='live-viewer-gifter-badge'>"+esc(badge?.badgeName||('Gifter LV '+badge.level))+"</span>":"";
      const fanBadge=fan?.status==='active'?"<span class='live-viewer-fan-points'>♥ "+Number(fan.points||0).toLocaleString()+" Fan Pts</span>":"";
      const roleLabel=item.role==='guest'?'Guest speaker':'Viewer';
      return "<div class='live-viewer-row "+(item.isGifter?'is-priority-gifter':'')+"'><span class='live-viewer-avatar' aria-hidden='true'>"+esc(initials)+"</span><span class='live-viewer-identity'><strong>"+esc(name)+"</strong><small>"+roleLabel+"</small>"+priority+fanBadge+"</span><button type='button' class='text-button' data-live-viewer-profile='"+esc(member.id||'')+"'>Profile</button></div>";
    }).join('');
    list.querySelectorAll('[data-live-viewer-profile]').forEach(button=>button.addEventListener('click',()=>{const userId=button.dataset.liveViewerProfile;if(userId)openLiveProfilePreview(userId,session);}));
    panel.classList.toggle('has-prioritized-gifters',data.prioritized===true);
  }catch(error){
    if(list&&!list.children.length)list.innerHTML="<p class='muted'>Viewer details are temporarily unavailable.</p>";
  }finally{liveViewerRefreshBusy=false;}
}
function startLiveViewerRefresh(session){
  stopLiveViewerRefresh();
  void refreshLiveViewerRoster(session);
  liveViewerRefreshTimer=setInterval(()=>void refreshLiveViewerRoster(session),5000);
}
function liveMatchStatusLabel(match){
  if(match.status==='live')return 'LIVE MATCH';
  if(match.status==='pending')return 'Invitation pending';
  return String(match.status||'Match').replace(/_/g,' ');
}
function renderLiveMatches(matches){
  const root=$('#live-match-list');if(!root)return;
  const items=Array.isArray(matches)?matches:[];
  if(!items.length){root.innerHTML="<div class='live-match-empty'><strong>No League Matches yet</strong><small>Challenge another creator who is currently broadcasting.</small></div>";return;}
  root.innerHTML=items.map(match=>{
    const challenger=match.challenger?.name||'Challenger',opponent=match.opponent?.name||'Opponent';
    const active=match.status==='live',pending=match.status==='pending';
    const score=match.scores||{challenger:0,opponent:0};
    const challengerPoints=Number(score.challenger||0),opponentPoints=Number(score.opponent||0);
    const total=Math.max(1,challengerPoints+opponentPoints);
    const mine=[match.challengerId,match.opponentId].includes(state.user?.id);
    const acceptedByMe=match.opponentId===state.user?.id&&pending;
    const alreadySupported=(match.supporters||[]).some(item=>item.userId===state.user?.id);
    const leftSide="<div class='live-match-side'><strong>"+esc(challenger)+"</strong><b>"+challengerPoints.toLocaleString()+"</b><small>Challenger</small></div>";
    const rightSide="<div class='live-match-side'><strong>"+esc(opponent)+"</strong><b>"+opponentPoints.toLocaleString()+"</b><small>Opponent</small></div>";
    const bar="<div class='live-match-scorebar'><i style='width:"+Math.round(challengerPoints/total*100)+"%'></i></div>";
    const accept=acceptedByMe?"<button type='button' data-live-match-action='accept' data-match-id='"+esc(match.id)+"'>Accept challenge</button>":"";
    const support=active&&!mine?"<div class='live-match-support'>"+(alreadySupported?"<small>You have supported this match.</small>":"<button type='button' data-live-match-action='support-challenger' data-match-id='"+esc(match.id)+"'>Support "+esc(challenger)+"</button><button type='button' data-live-match-action='support-opponent' data-match-id='"+esc(match.id)+"'>Support "+esc(opponent)+"</button>")+"</div>":"";
    const powerups=active&&mine?"<div class='live-match-powerups'><button type='button' data-live-match-action='powerup' data-powerup-id='shield' data-match-id='"+esc(match.id)+"'>Shield</button><button type='button' data-live-match-action='powerup' data-powerup-id='score_multiplier' data-match-id='"+esc(match.id)+"'>Double score</button><button type='button' data-live-match-action='powerup' data-powerup-id='time_boost' data-match-id='"+esc(match.id)+"'>Time Boost</button></div>":"";
    return "<article class='live-match-card' data-match-status='"+esc(match.status)+"'><div class='live-match-card-head'><strong>Creator League</strong><span>"+esc(liveMatchStatusLabel(match))+"</span></div><div class='live-match-score'>"+leftSide+"<em>VS</em>"+rightSide+"</div>"+bar+"<div class='live-match-card-foot'><small>"+(active?'Ends '+new Date(match.endsAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):pending?'Expires '+new Date(match.expiresAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Match '+esc(match.status||''))+"</small>"+accept+"</div>"+support+powerups+"</article>";
  }).join('');
}
async function refreshLiveMatchPanel(session,role){
  if(liveMatchRefreshBusy||!session?.id||!$('#live-match-list'))return;
  liveMatchRefreshBusy=true;
  try{const data=await api('/leagues/matches');if(activeLiveSession?.id!==session.id)return;renderLiveMatches(data.matches||[]);}
  catch(error){const root=$('#live-match-list');if(root&&!root.children.length)root.innerHTML="<p class='muted'>Creator League could not be loaded: "+esc(error.message)+"</p>";}
  finally{liveMatchRefreshBusy=false;}
}
async function setupLiveMatchPanel(session,role){
  stopLiveMatchRefresh();
  const panel=$('#live-match-panel');if(!panel)return;
  const form=$('#live-match-create-form'),opponentSelect=$('#live-match-opponent'),giftMode=$('#live-match-gift-mode'),giftCode=$('#live-match-gift-code');
  if(form&&role==='host'){
    try{
      const directory=await api('/live/sessions');
      const sessions=(directory.sessions||[]).filter(item=>item.status==='live'&&item.id!==session.id&&item.hostId!==state.user?.id);
      opponentSelect.innerHTML=sessions.length?"<option value=''>Select a creator currently LIVE</option>"+sessions.map(item=>"<option value='"+esc(item.id)+"'>"+esc(item.host?.name||item.host?.username||'Minglora creator')+" · "+esc(item.title||'LIVE')+"</option>").join(''):"<option value=''>No other eligible creators are live</option>";
    }catch(error){opponentSelect.innerHTML="<option value=''>Live creator list unavailable</option>";}
    giftMode?.addEventListener('change',()=>{if(giftCode){giftCode.disabled=giftMode.value!=='specific';giftCode.required=giftMode.value==='specific';if(giftMode.value!=='specific')giftCode.value='';}});
    giftMode?.dispatchEvent(new Event('change'));
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=form.querySelector("button[type='submit']");
      const opponentSessionId=String(opponentSelect?.value||'');
      if(!opponentSessionId){toast('Choose a creator who is currently live.');return;}
      button.disabled=true;
      try{
        const data=await api('/leagues/matches',{method:'POST',body:JSON.stringify({ownSessionId:session.id,opponentSessionId,giftMode:giftMode?.value||'all',selectedGiftCode:String(giftCode?.value||'').trim()})});
        toast('League Match challenge sent to '+(data.match?.opponent?.name||'the other creator')+'.');
        await refreshLiveMatchPanel(session,role);
      }catch(error){toast(error.message||'The League Match challenge could not be sent.');}
      finally{button.disabled=false;}
    });
  }
  $('#live-match-list')?.addEventListener('click',async event=>{
    const button=event.target?.closest?.('[data-live-match-action]');if(!button)return;
    const action=button.dataset.liveMatchAction,matchId=String(button.dataset.matchId||'');
    const routeAction=action==='accept'?'accept':action==='support-challenger'||action==='support-opponent'?'support':'powerups';
    const payload=routeAction==='support'?{side:action==='support-challenger'?'challenger':'opponent'}:routeAction==='powerups'?{powerupId:button.dataset.powerupId}:{};
    button.disabled=true;
    try{await api('/leagues/matches/'+encodeURIComponent(matchId)+'/'+routeAction,{method:'POST',body:JSON.stringify(payload)});toast(action==='accept'?'League Match accepted.':action.startsWith('support')?'Your support was counted.':'League Match power-up activated.');await refreshLiveMatchPanel(session,role);}
    catch(error){toast(error.message||'The League Match action could not be completed.');}
    finally{button.disabled=false;}
  });
  await refreshLiveMatchPanel(session,role);
  liveMatchRefreshTimer=setInterval(()=>void refreshLiveMatchPanel(session,role),5000);
}

function liveCompactCount(value){
  const count=Math.max(0,Number(value)||0);
  try{return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(count);}
  catch{return count.toLocaleString();}
}
function stopLiveFanClubHeartbeat(){
  if(liveFanClubHeartbeatTimer){clearInterval(liveFanClubHeartbeatTimer);liveFanClubHeartbeatTimer=null;}
}
function renderLiveFanClubStatus(status){
  liveFanClubState=status||null;
  const button=$('#live-fan-club-join');
  const member=Boolean(status?.isMember||status?.membership?.status==='active');
  const paused=status?.membership?.status==='paused';
  if(button){
    button.classList.toggle('is-member',member);
    button.disabled=false;
    button.setAttribute('aria-pressed',member?'true':'false');
    button.textContent=member?'♥ Joined':paused?'♥ Rejoin · 1 Coin':'♥ Join · 1 Coin';
    button.title=member?'Open your Fan Club status and Team Gifts':paused?'Rejoin this Fan Club for 1 Coin':'Follow the host, then join for 1 Coin';
  }
  const panelJoinButton=$('#live-fan-club-join-panel');
  if(panelJoinButton){panelJoinButton.textContent=member?'♥ Joined Fan Club':paused?'♥ Rejoin for 1 Coin':'♥ Join for 1 Coin';panelJoinButton.disabled=member;}
  const panel=$('#live-fan-club-status');
  if(panel){
    const membership=status?.membership;
    panel.innerHTML=member
      ?"<strong>♥ Fan Club member</strong><small>"+Number(membership.points||0).toLocaleString()+" fan points · active until "+(membership.expiresAt?new Date(membership.expiresAt).toLocaleDateString():'your next activity')+"</small>"
      :paused
        ?"<strong>Membership paused</strong><small>Earn fan points within seven days to keep membership active, or rejoin for 1 Coin.</small>"
        :"<strong>Not a member yet</strong><small>Follow the host, then join with the 1-Coin Heart Me gift. Watch, chat and gift to earn Fan Points.</small>";
  }
  const count=$('#live-fan-club-member-count');
  if(count&&Number.isFinite(Number(status?.fanClubMemberCount)))count.textContent=Number(status.fanClubMemberCount).toLocaleString();
  const follow=$('#live-follow-host');
  if(follow){
    const following=Boolean(status?.following);
    follow.textContent=following?'Following':'Follow';
    follow.classList.toggle('is-following',following);
    follow.setAttribute('aria-pressed',following?'true':'false');
  }
  refreshLiveGiftGrid?.();
  const teamButton=$('#live-team-gifts-open');if(teamButton)teamButton.disabled=!member;
  return member;
}
async function loadLiveFanClubStatus(session){
  if(!session?.id||activeLiveSession?.id!==session.id)return null;
  try{
    const status=await api('/live/sessions/'+encodeURIComponent(session.id)+'/fan-club');
    if(activeLiveSession?.id!==session.id)return null;
    renderLiveFanClubStatus(status);
    return status;
  }catch(error){
    const panel=$('#live-fan-club-status');
    if(panel)panel.innerHTML="<small>Fan Club status is temporarily unavailable. Retry from this panel.</small>";
    return null;
  }
}
function startLiveFanClubHeartbeat(session){
  stopLiveFanClubHeartbeat();
  liveFanClubHeartbeatTimer=setInterval(async()=>{
    if(activeLiveSession?.id!==session?.id||!liveFanClubState?.isMember)return;
    try{
      const result=await api('/live/sessions/'+encodeURIComponent(session.id)+'/fan-club/watch',{method:'POST',body:'{}'});
      if(activeLiveSession?.id===session.id&&result.membership){
        liveFanClubState.membership=result.membership;
        liveFanClubState.isMember=result.membership.status==='active';
        renderLiveFanClubStatus(liveFanClubState);
      }
    }catch{}
  },60000);
}
async function joinLiveHostFanClub(session){
  const button=$('#live-fan-club-join');
  if(!session?.id||!button)return;
  if(!session.host?.following&&!liveFanClubState?.following){
    toast('Follow the LIVE host first, then join the Fan Club.');
    return;
  }
  if(liveFanClubState?.isMember){
    const panel=$('#live-fan-club-panel');
    if(panel){panel.scrollIntoView?.({behavior:'smooth',block:'nearest'});}
    openLiveToolsPanel('#live-fan-club-panel');
    return;
  }
  const hostName=String(session.host?.name||session.host?.username||'this creator');
  if(!window.confirm('Join '+hostName+'’s Fan Club for 1 Minglora Coin using the Heart Me gift? Membership pauses after 7 days without earning Fan Points.'))return;
  button.disabled=true;
  try{
    const result=await api('/live/sessions/'+encodeURIComponent(session.id)+'/fan-club/join',{method:'POST',body:'{}'});
    renderLiveFanClubStatus({
      membership:result.membership,isMember:true,following:true,fanClubMemberCount:result.fanClubMemberCount
    });
    startLiveFanClubHeartbeat(session);
    toast('You joined '+hostName+'’s Fan Club for 1 Coin.');
  }catch(error){
    toast(error.message||'Minglora could not complete the Fan Club join.');
    button.disabled=false;
    if(error.code==='follow_required')await loadLiveFanClubStatus(session);
  }
}
async function openLiveProfilePreview(userId,session){
  const root=$('#live-profile-preview');
  const id=String(userId||'').trim();
  if(!root||!id)return;
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden','false');
  root.innerHTML="<section class='live-profile-preview-card' role='dialog' aria-modal='true' aria-label='Minglora profile preview'><button type='button' class='live-profile-preview-close' data-live-profile-preview-close aria-label='Close profile preview'>×</button><p class='muted'>Loading profile…</p></section>";
  try{
    const data=await api('/users/'+encodeURIComponent(id));
    if(activeLiveSession?.id!==session?.id)return;
    const member=data.user||{};
    const name=String(member.name||member.username||'Minglora member');
    const following=Boolean(data.following);
    const own=member.id===state.user?.id;
    const followers=Number(data.followersCount||0),followingCount=Number(data.followingCount||0);
    const bio=String(member.bio||member.about||'');
    const posts=Array.isArray(data.posts)?data.posts.slice(0,2):[];
    root.innerHTML="<section class='live-profile-preview-card' role='dialog' aria-modal='true' aria-label='Profile preview for "+esc(name)+"'>"+
      "<button type='button' class='live-profile-preview-close' data-live-profile-preview-close aria-label='Close profile preview'>×</button>"+
      "<div class='live-profile-preview-cover'></div><div class='live-profile-preview-main'><img class='live-profile-preview-avatar' src='"+avatar(member)+"' alt=''>"+
      "<div class='live-profile-preview-heading'><strong>"+esc(name)+"</strong><small>@"+esc(member.username||'member')+"</small></div>"+
      "<div class='live-profile-preview-stats'><span><b>"+liveCompactCount(followers)+"</b><small>Followers</small></span><span><b>"+liveCompactCount(followingCount)+"</b><small>Following</small></span><span><b>"+liveCompactCount(posts.length===2?Number(data.posts?.length||0):Number(data.posts?.length||0))+"</b><small>Posts</small></span></div>"+
      (bio?"<p class='live-profile-preview-bio'>"+esc(bio)+"</p>":"<p class='muted'>No bio added yet.</p>")+
      "<div class='live-profile-preview-posts'>"+(posts.length?posts.map(post=>"<article><small>"+esc(new Date(post.createdAt||Date.now()).toLocaleDateString())+"</small><p>"+esc(String(post.text||post.caption||'Shared a post').slice(0,140))+"</p></article>").join(''):"<small>No recent posts to preview.</small>")+"</div>"+
      "<div class='live-profile-preview-actions'>"+(!own?"<button type='button' class='primary' id='live-preview-follow' data-following='"+(following?'true':'false')+"'>"+(following?'Following':'Follow')+"</button>":"<span class='muted'>Your profile</span>")+
      "<button type='button' class='secondary' data-live-profile-preview-close>Back to LIVE</button></div></div></section>";
    root.querySelectorAll('[data-live-profile-preview-close]').forEach(button=>button.addEventListener('click',closeLiveProfilePreview));
    root.querySelector('#live-preview-follow')?.addEventListener('click',async buttonEvent=>{
      const actionButton=buttonEvent.currentTarget;
      const currentlyFollowing=actionButton.dataset.following==='true';
      actionButton.disabled=true;
      try{
        const result=await api('/users/'+encodeURIComponent(id)+'/follow',{method:currentlyFollowing?'DELETE':'POST',body:'{}'});
        const next=!currentlyFollowing;
        actionButton.dataset.following=next?'true':'false';
        actionButton.textContent=next?(result.friends?'Friends':'Following'):'Follow';
        if(id===session?.hostId){
          session.host=session.host||{};
          session.host.following=next;
          const status=liveFanClubState||{};
          status.following=next;
          renderLiveFanClubStatus(status);
        }
        toast(next?'Now following '+name+'.':'Unfollowed '+name+'.');
      }catch(error){toast(error.message);}
      finally{actionButton.disabled=false;}
    });
  }catch(error){
    root.innerHTML="<section class='live-profile-preview-card' role='dialog' aria-label='Profile preview'><button type='button' class='live-profile-preview-close' data-live-profile-preview-close aria-label='Close profile preview'>×</button><p>"+esc(error.message||'This profile could not be loaded.')+"</p></section>";
    root.querySelector('[data-live-profile-preview-close]')?.addEventListener('click',closeLiveProfilePreview);
  }
}
function closeLiveProfilePreview(){
  const root=$('#live-profile-preview');
  if(root){root.classList.add('hidden');root.setAttribute('aria-hidden','true');root.innerHTML='';}
}
async function loadLiveDiscoveryBoard(tab,sessions){
  const root=$('#live-discovery-content');if(!root)return;
  const current=Array.isArray(sessions)?sessions:[];
  root.innerHTML="<p class='muted'>Loading "+esc(tab)+" rankings…</p>";
  try{
    if(tab==='popular'){
      const popular=current.filter(item=>item.viewerCountVerified===true)
        .sort((a,b)=>Number(b.viewerCount||0)-Number(a.viewerCount||0));
      root.innerHTML=popular.length?popular.slice(0,8).map(item=>"<article class='live-ranking-row'><img src='"+avatar(item.host||{})+"' alt=''><span><strong>"+esc(item.host?.name||item.host?.username||'Minglora creator')+"</strong><small>"+esc(item.title||'LIVE')+"</small></span><b>◉ "+liveCompactCount(item.viewerCount||0)+"</b><button type='button' data-live-ranking-watch='"+esc(item.id)+"'>Watch</button></article>").join(''):"<p class='muted'>No verified LIVE audience rankings are available yet.</p>";
      root.querySelectorAll('[data-live-ranking-watch]').forEach(button=>button.addEventListener('click',()=>{
        const session=current.find(item=>item.id===button.dataset.liveRankingWatch);
        if(session)openLiveRoom(session,session.hostId===state.user?.id?'host':'viewer').catch(error=>toast(error.message));
      }));
    }else if(tab==='daily'){
      const data=await api('/live/rankings/daily');
      const items=Array.isArray(data.leaderboard)?data.leaderboard:[];
      root.innerHTML="<div class='live-ranking-heading'><strong>Daily LIVE Gifter Rankings</strong><small>Ranked by confirmed Coins sent today · "+esc(data.dayKey||'today')+"</small></div>"+
        (items.length?items.slice(0,10).map(item=>"<button type='button' class='live-ranking-row' data-live-ranking-profile='"+esc(item.user?.id||'')+"'><span class='live-ranking-position'>#"+Number(item.position||0)+"</span><img src='"+avatar(item.user||{})+"' alt=''><span><strong>"+esc(item.user?.name||item.user?.username||'Minglora member')+"</strong><small>@"+esc(item.user?.username||'member')+"</small></span><b>"+liveCompactCount(item.points||0)+" pts</b></button>").join(''):"<p class='muted'>No Daily LIVE gift points have been recorded today yet.</p>");
      root.querySelectorAll('[data-live-ranking-profile]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.liveRankingProfile)));
    }else{
      const data=await api('/leagues/overview');
      const items=Array.isArray(data.leaderboard)?data.leaderboard:[];
      const profile=data.profile||{};
      root.innerHTML="<div class='live-ranking-heading'><strong>Creator League · "+esc(profile.leagueClass||'D5')+"</strong><small>"+esc(profile.region||'GLOBAL')+" region · Season "+esc(profile.seasonKey||'current')+"</small></div>"+
        (items.length?items.slice(0,10).map(item=>"<button type='button' class='live-ranking-row' data-live-ranking-profile='"+esc(item.id||'')+"'><span class='live-ranking-position'>#"+Number(item.position||0)+"</span><img src='"+avatar(item)+"' alt=''><span><strong>"+esc(item.name||item.username||'Minglora member')+"</strong><small>"+esc(item.leagueClass||profile.leagueClass||'League')+"</small></span><b>"+liveCompactCount(item.seasonPoints||0)+" pts</b></button>").join(''):"<p class='muted'>No Creator League ranking is available for this class yet.</p>");
      root.querySelectorAll('[data-live-ranking-profile]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.liveRankingProfile)));
    }
    document.querySelectorAll('[data-live-discovery]').forEach(button=>button.classList.toggle('active',button.dataset.liveDiscovery===tab));
  }catch(error){root.innerHTML="<p class='muted'>"+esc(error.message||'LIVE rankings are temporarily unavailable.')+"</p>";}
}
function bindLiveDiscoveryBoards(sessions){
  document.querySelectorAll('[data-live-discovery]').forEach(button=>{
    button.onclick=()=>void loadLiveDiscoveryBoard(button.dataset.liveDiscovery,sessions);
  });
  void loadLiveDiscoveryBoard('daily',sessions);
}
function liveControlIcon(name){
  const paths={
    mic:"<rect x='9' y='3' width='6' height='12' rx='3'/><path d='M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6'/>",
    "mic-off":"<path d='m3 3 18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-5.8-1M5 11a7 7 0 0 0 12 5M12 18v3M9 21h6'/>",
    camera:"<rect x='3' y='6' width='13' height='12' rx='2'/><path d='m16 10 5-3v10l-5-3z'/>",
    "camera-off":"<path d='m3 3 18 18M10 6h4a2 2 0 0 1 2 2v2l5-3v10l-5-3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2'/>",
    flip:"<path d='M20 7v5h-5M4 17v-5h5'/><path d='M5.6 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.4-3'/>",
    users:"<path d='M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/>",
    message:"<path d='M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.7 8.7 0 0 1-4-.95L3 21l1.95-5.5A8.7 8.7 0 0 1 4 11.5 8.5 8.5 0 1 1 21 11.5Z'/>",
    screen:"<rect x='2.5' y='3.5' width='19' height='14' rx='2'/><path d='M8 21h8M12 17.5V21M9 10l2 2 4-4'/>",
    gift:"<rect x='3' y='8' width='18' height='13' rx='2'/><path d='M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.4-3.2L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2L12 8Z'/>",
    volume:"<path d='M11 5 6 9H3v6h3l5 4z'/><path d='M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13'/>",
    "volume-off":"<path d='m3 3 18 18M11 5 6 9H3v6h3l2 1.6M11 19l-1.5-1.2M16 9.5a5 5 0 0 1 .2 5M19 6.5a9 9 0 0 1 .5 10'/>",
    settings:"<path d='M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z'/><path d='m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.6a8 8 0 0 1-1.7 1l-.2 1.6h-3l-.3-1.6a8 8 0 0 1-1.7-1l-1.5.6-1.5-2.6 1.2-1a7 7 0 0 1 0-2l-1.2-1 1.5-2.6 1.5.6a8 8 0 0 1 1.7-1l.3-1.6h3l.2 1.6a8 8 0 0 1 1.7 1l1.5-.6 1.5 2.6-1.2 1a7 7 0 0 1 0 2Z'/>",
    share:"<path d='M12 16V3m0 0L7 8m5-5 5 5'/><path d='M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'/>",
    end:"<path d='M4 14.5c4.7-4.7 11.3-4.7 16 0l-2.2 3.2a1 1 0 0 1-1.2.35l-2.8-1.15a1 1 0 0 1-.62-.93v-1.1a10 10 0 0 0-2.36 0V16a1 1 0 0 1-.62.93l-2.8 1.15a1 1 0 0 1-1.2-.35L4 14.5Z'/>"
  };
  return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' focusable='false'>"+(paths[name]||"")+"</svg>";
}
function liveControlButton(id,icon,label,caption,options={}){
  const pressed=options.pressed===undefined?"":" aria-pressed='"+String(Boolean(options.pressed))+"'";
  return "<button type='button' class='live-control-button"+(options.danger?" is-danger":"")+"' id='"+id+"' aria-label='"+esc(label)+"' title='"+esc(label)+"'"+pressed+"><span class='live-control-icon'>"+liveControlIcon(icon)+"</span><span class='live-control-caption'>"+esc(caption)+"</span></button>";
}
function updateLiveControlButton(button,icon,label,caption,pressed){
  if(!button)return;
  button.innerHTML="<span class='live-control-icon'>"+liveControlIcon(icon)+"</span><span class='live-control-caption'>"+esc(caption)+"</span>";
  button.setAttribute("aria-label",label);
  button.title=label;
  if(pressed!==undefined)button.setAttribute("aria-pressed",String(Boolean(pressed)));
}
function openLiveToolsPanel(focusSelector){
  const backdrop=$("#live-tools-backdrop"),drawer=$("#live-tools-drawer"),shell=$("#live-player-shell");
  if(!backdrop||!drawer){toast("LIVE settings are not available in this room.");return;}
  const fullScreen=Boolean(shell?.classList.contains('live-full-screen-active'));
  if(fullScreen){
    moveLiveToolsToFullscreenSidebar();
    setLiveFullscreenPanel('tools');
    backdrop.setAttribute("aria-modal","false");
    setLiveSettingsControlState(true);
    setLiveChatControlState(false,'Open LIVE chat','Chat');
  }else{
    backdrop.setAttribute("aria-modal","true");
    backdrop.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden","false");
    $("#live-settings-toggle")?.setAttribute("aria-expanded","true");
    document.body.classList.add("live-tools-open");
  }
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden","false");
  const target=focusSelector?$(focusSelector):null;
  const panel=target?.closest?.('[data-live-tools-panel]');
  activateLiveToolsPanel(panel?.dataset.liveToolsPanel||(activeLiveRole==='host'?'layouts':'guests'));
  if(!focusSelector)$('#live-tools-close')?.focus();
}
function closeLiveToolsPanel(options={}){
  const backdrop=$("#live-tools-backdrop"),shell=$("#live-player-shell");
  if(!backdrop)return;
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden","true");
  const fullScreen=Boolean(shell?.classList.contains('live-full-screen-active'));
  if(fullScreen){
    backdrop.setAttribute("aria-modal","false");
    setLiveSettingsControlState(false);
    if(options.returnTo==='chat'){
      setLiveFullscreenPanel('chat');
      const wideLayout=Boolean(window.matchMedia?.('(min-width:760px)').matches);
      setLiveChatControlState(true,wideLayout?'Hide LIVE chat':'Return to LIVE video',wideLayout?'Hide chat':'Video');
    }else{
      setLiveFullscreenPanel('video');
      setLiveChatControlState(false,'Open LIVE chat','Chat');
    }
  }else{
    backdrop.setAttribute("aria-modal","true");
    restoreLiveChatToStage();
    $("#live-settings-toggle")?.setAttribute("aria-expanded","false");
    document.body.classList.remove("live-tools-open");
  }
  $("#live-settings-toggle")?.focus();
}
function focusLiveRoomPanel(selector){
  const target=$(selector);
  if(!target){toast("That LIVE panel is not available in this room.");return;}
  if(target.closest("#live-tools-drawer")&&$("#live-tools-backdrop")?.classList.contains("hidden")){
    openLiveToolsPanel();
  }
  target.scrollIntoView?.({behavior:"smooth",block:"center"});
  target.classList.add("is-focused");
  window.setTimeout(()=>target.classList.remove("is-focused"),1500);
}

function stopLiveRewardRefresh(){
  if(liveRewardRefreshTimer){clearInterval(liveRewardRefreshTimer);liveRewardRefreshTimer=null;}
  liveRewardRefreshBusy=false;
}
function liveRewardCountdown(target){
  const seconds=Math.max(0,Math.ceil((Date.parse(target||'')-Date.now())/1000));
  if(!Number.isFinite(seconds)||seconds<=0)return 'Now';
  const minutes=Math.floor(seconds/60),remaining=seconds%60;
  return minutes>0?minutes+'m '+String(remaining).padStart(2,'0')+'s':remaining+'s';
}
function renderLiveRewardDrops(drops,role){
  const root=$('#live-reward-list');if(!root)return;
  const items=Array.isArray(drops)?drops:[];
  if(!items.length){
    root.innerHTML="<div class='live-reward-empty'><span aria-hidden='true'>🎁</span><strong>No reward drops yet</strong><small>The host can launch a Goody Bag or Treasure Box during this LIVE.</small></div>";
    return;
  }
  root.innerHTML=items.map(drop=>{
    const host=drop.creatorId===state.user?.id||role==='host';
    const goody=drop.kind==='goody_bag';
    const active=drop.status==='active';
    const opensAt=Date.parse(drop.opensAt||'');
    const closesAt=Date.parse(drop.closesAt||'');
    const now=Date.now();
    const isOpen=!goody&&Number.isFinite(opensAt)&&now>=opensAt&&now<closesAt;
    const joined=Boolean(drop.viewerJoined);
    const claimed=Number(drop.viewerClaimOrder||0)>0;
    const full=Number(drop.participantCount||0)>=Number(drop.winnerCount||0);
    let timerText='';
    if(active){
      timerText=goody?'Draw closes in '+liveRewardCountdown(drop.closesAt)
        :now<opensAt?'Treasure opens in '+liveRewardCountdown(drop.opensAt)
        :'Claims close in '+liveRewardCountdown(drop.closesAt);
    }else if(drop.status==='refunded'){
      timerText='No rewards were claimed · coins returned to host';
    }else{
      timerText=Number(drop.winners?.length||0)+' winner'+(Number(drop.winners?.length||0)===1?'':'s')+' selected';
    }
    let button='';
    if(!host&&active&&goody){
      button=joined?"<button type='button' class='live-reward-action is-done' disabled>You're entered</button>"
        :"<button type='button' class='live-reward-action' data-live-reward-action='join' data-live-reward-id='"+esc(drop.id)+"'>Join Goody Bag</button>";
    }else if(!host&&active&&!goody){
      button=claimed?"<button type='button' class='live-reward-action is-done' disabled>Claimed · "+Number(drop.viewerRewardCoins||0).toLocaleString()+" Coins</button>"
        :!isOpen?"<button type='button' class='live-reward-action' disabled>"+(now<opensAt?'Waiting to open':'Closed')+"</button>"
        :full?"<button type='button' class='live-reward-action' disabled>Fully claimed</button>"
        :"<button type='button' class='live-reward-action' data-live-reward-action='claim' data-live-reward-id='"+esc(drop.id)+"'>Open & claim</button>";
    }else if(drop.viewerRewardCoins>0){
      button="<span class='live-reward-earned'>You received "+Number(drop.viewerRewardCoins).toLocaleString()+" Coins</span>";
    }
    const requirement=drop.participationMethod==='comment'
      ?"<small class='live-reward-condition'>Comment <strong>"+esc(drop.keyword||'the keyword')+"</strong> in LIVE chat to participate.</small>"
      :"<small class='live-reward-condition'>"+(goody?'Tap to enter the random draw.':'First eligible viewers to claim receive Coins.')+"</small>";
    return "<article class='live-reward-card "+(goody?'goody':'treasure')+"' data-live-reward-card='"+esc(drop.id)+"'>"+
      "<div class='live-reward-art' aria-hidden='true'><span>"+(goody?'🎁':'💎')+"</span></div>"+
      "<div class='live-reward-main'><div class='live-reward-title-row'><strong>"+(goody?'Goody Bag':'Treasure Box')+"</strong><span class='live-reward-state "+(active?'active':drop.status==='refunded'?'refunded':'complete')+"'>"+(active?'LIVE':drop.status==='refunded'?'REFUNDED':'COMPLETE')+"</span></div>"+
      "<div class='live-reward-pot'>"+Number(drop.totalCoins||0).toLocaleString()+" <span>Coins</span></div>"+
      "<small class='live-reward-meta'>"+Number(drop.participantCount||0).toLocaleString()+" joined · "+Number(drop.winnerCount||0).toLocaleString()+" winner"+(Number(drop.winnerCount||0)===1?'':'s')+"</small>"+
      requirement+"<small class='live-reward-countdown'>"+esc(timerText)+"</small>"+button+"</div></article>";
  }).join('');
  root.querySelectorAll('[data-live-reward-action]').forEach(button=>button.addEventListener('click',async()=>{
    const action=button.dataset.liveRewardAction,dropId=button.dataset.liveRewardId;
    if(!activeLiveSession?.id||!dropId||button.disabled)return;
    button.disabled=true;
    try{
      const path='/live/sessions/'+encodeURIComponent(activeLiveSession.id)+'/reward-drops/'+encodeURIComponent(dropId)+'/'+(action==='join'?'join':'claim');
      const result=await api(path,{method:'POST',body:JSON.stringify({})});
      const reward=Number(result.result?.rewardCoins||0);
      toast(action==='join'?'You joined the Goody Bag. Good luck!':reward>0?'Treasure Box claimed: '+reward.toLocaleString()+' Coins added to your wallet.':'Your Treasure Box claim was recorded.');
      await refreshLiveRewardPanel(activeLiveSession,role);
    }catch(error){toast(error.message);button.disabled=false;}
  }));
}
async function refreshLiveRewardPanel(session,role){
  if(liveRewardRefreshBusy||!session?.id||!$('#live-reward-list'))return;
  liveRewardRefreshBusy=true;
  try{
    const data=await api('/live/sessions/'+encodeURIComponent(session.id)+'/reward-drops');
    if(activeLiveSession?.id!==session.id)return;
    renderLiveRewardDrops(data.drops||[],role);
    const balance=$('#live-reward-balance');
    if(balance&&role==='host'&&Date.now()-liveRewardWalletFetchedAt>=30000){
      liveRewardWalletFetchedAt=Date.now();
      try{
        const wallet=await api('/coins/wallet');
        if(activeLiveSession?.id===session.id&&$('#live-reward-balance')){
          $('#live-reward-balance').textContent=Number(wallet.wallet?.balance_coins??0).toLocaleString()+' Coins available';
        }
      }catch{
        if(activeLiveSession?.id===session.id&&$('#live-reward-balance'))$('#live-reward-balance').textContent='Wallet unavailable';
      }
    }
  }catch(error){
    const root=$('#live-reward-list');
    if(root&&!root.children.length)root.innerHTML="<p class='muted'>Reward drops could not be loaded: "+esc(error.message)+"</p>";
  }finally{liveRewardRefreshBusy=false;}
}
function setupLiveRewardPanel(session,role){
  stopLiveRewardRefresh();
  const panel=$('#live-reward-panel');if(!panel)return;
  const form=$('#live-reward-create-form');
  const method=$('#live-reward-method');
  const keywordRow=$('#live-reward-keyword-row');
  const kind=$('#live-reward-kind');
  const launch=$('#live-reward-launch');
  const syncForm=()=>{
    if(keywordRow)keywordRow.hidden=method?.value!=='comment';
    if(kind&&launch)launch.textContent=kind.value==='goody_bag'?'Launch Goody Bag':'Launch Treasure Box';
  };
  method?.addEventListener('change',syncForm);
  kind?.addEventListener('change',syncForm);
  syncForm();
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(role!=='host'){toast('Only the LIVE host can create a reward drop.');return;}
    const values=new FormData(form);
    const requestId=String(form.dataset.pendingRequestId||crypto.randomUUID());
    form.dataset.pendingRequestId=requestId;
    const payload={
      requestId,
      kind:String(values.get('kind')||'goody_bag'),
      totalCoins:Number(values.get('totalCoins')),
      winnerCount:Number(values.get('winnerCount')),
      countdownSeconds:Number(values.get('countdownSeconds')),
      participationMethod:String(values.get('participationMethod')||'tap'),
      keyword:String(values.get('keyword')||'').trim().toLowerCase()
    };
    if(payload.participationMethod==='comment'&&!payload.keyword){toast('Enter the chat keyword viewers must comment.');return;}
    if(!Number.isSafeInteger(payload.totalCoins)||payload.totalCoins<1||payload.totalCoins>1000000||
       !Number.isSafeInteger(payload.winnerCount)||payload.winnerCount<1||payload.winnerCount>100||
       payload.winnerCount>payload.totalCoins){toast('Check the coin pool and number of winners.');return;}
    launch.disabled=true;
    try{
      await api('/live/sessions/'+encodeURIComponent(session.id)+'/reward-drops',{method:'POST',body:JSON.stringify(payload)});
      toast(payload.kind==='goody_bag'?'Goody Bag launched.':'Treasure Box scheduled.');
      delete form.dataset.pendingRequestId;
      form.reset();syncForm();
      await refreshLiveRewardPanel(session,role);
    }catch(error){toast(error.message);}
    finally{launch.disabled=false;}
  });
  void refreshLiveRewardPanel(session,role);
  liveRewardRefreshTimer=setInterval(()=>void refreshLiveRewardPanel(session,role),5000);
}
async function openLiveRoom(session,role,issuedLiveKit){
  stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();stopLiveRewardRefresh();stopLiveFanClubHeartbeat();stopLiveMatchRefresh();stopLiveViewerRefresh();stopLiveGiftEvents();
  window.MingloraGiftFX?.prime();
  liveGiftEventsLastSeenAt=new Date(Date.now()-10000).toISOString();closeLiveProfilePreview();liveFanClubState=null;liveGiftCatalogue=[];liveGiftScope='all';refreshLiveGiftGrid=null;
  try{
    const progression=await api('/gifter-progression/overview');
    state.user.gifterBadge=progression.badge||null;
    state.user.newGifterIdentity=progression.newGifterIdentity||null;
  }catch{}
  const liveKit=issuedLiveKit||(await api("/live/sessions/"+encodeURIComponent(session.id)+"/join",{method:"POST",body:"{}"})).liveKit;
  // The server-issued token role is authoritative; never trust a caller-supplied guest role.
  role=liveKit?.role==="host"?"host":liveKit?.role==="guest"?"guest":"viewer";
  const broadcastType=session.broadcastType==="audio_only"?"audio_only":"video_audio";
  const liveMode=['video_audio','audio_only','mobile_gaming','live_studio'].includes(session.liveMode)
    ?session.liveMode:(broadcastType==='audio_only'?'audio_only':'video_audio');
  const liveSettings=session.liveSettings&&typeof session.liveSettings==='object'?session.liveSettings:{};
  activeLiveScreenLayout=normalizeLiveScreenLayout(session.liveLayout);
  const canUseCamera=broadcastType==='video_audio'&&liveMode!=='mobile_gaming'&&(role!=='guest'||liveSettings.guestCamera!==false);
  const giftsEnabled=liveSettings.liveGifts!==false&&!liveSettings.practiceMode;
  const client=window.LivekitClient;
  if(!client?.Room||!client?.RoomEvent){if(role!=="host")await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});throw new Error("The LIVE player could not load. Check your connection and try again.");}
  const liveTheme=LIVE_ROOM_THEME_OPTIONS.some(option=>option.value===session.liveTheme)?session.liveTheme:'studio';
  activeLiveSession={...session,liveTheme,broadcastType,liveMode,liveSettings};activeLiveRole=role;liveCameraEnabled=canUseCamera;liveMicrophoneEnabled=true;liveAudioMuted=false;liveScreenShareEnabled=false;liveCameraFacing='user';
  const stageMarkup=broadcastType==="audio_only"
    ? "<div id='live-video-stage' class='live-video-stage live-audio-stage'><div class='live-audio-scene'><div class='live-audio-orb'><span class='live-audio-orbit orbit-one'></span><span class='live-audio-orbit orbit-two'></span><img src='"+avatar(session.host||state.user)+"' alt='' class='live-audio-host-avatar'></div><span class='live-audio-live-label'>LIVE AUDIO</span><h2>You're in the room</h2><p>Voice-first. Camera-free. Join the conversation.</p><div class='live-audio-waveform' id='live-audio-waveform' aria-label='Live audio activity'><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div id='live-guest-layout' class='live-guest-layout audio-guest-layout' aria-label='LIVE host and guest seats'></div><div id='live-speaker-list' class='live-speaker-list'><span class='muted'>Connecting speakers…</span></div></div>"
    : "<div id='live-video-stage' class='live-video-stage live-mode-"+liveMode+"'><div id='live-guest-layout' class='live-guest-layout' aria-label='LIVE host and guest seats'></div><div id='live-screen-share-stage' class='live-screen-share-stage' aria-label='Shared screen'></div></div>";
  const liveEntryBanner=state.user?.gifterBadge?.liveEntranceUnlocked
    ? "<aside class='gp-live-entry-banner' role='status'><span class='gp-live-entry-seal' aria-hidden='true'>✦25</span><span class='gp-live-entry-copy'><strong>"+esc(state.user.name||'Minglora member')+"</strong><small>LV 25+ Gifter · special LIVE entrance unlocked</small></span><span class='gp-live-entry-wordmark'>MINGLORA LIVE</span></aside>"
    : '';
  const speakerTools=role==="host"
    ? "<section id='live-speaker-request-panel' class='live-speaker-request-panel host' data-live-tools-panel='guests'><div class='live-speaker-panel-heading'><div><strong>Guest stage</strong><small>Manage up to 8 active guest speakers and review every request.</small></div><span class='live-speaker-seat-limit'>8 guest seats</span></div><label class='live-room-permission-toggle live-guest-stage-toggle'><input type='checkbox' id='live-guest-stage-toggle' data-live-room-setting='guestStageEnabled'"+(liveSettings.guestStageEnabled!==false?" checked":"")+"><span class='live-preflight-switch' aria-hidden='true'></span><span><strong>Guest stage</strong><small>Turn OFF to block requests and remove current speakers. Turn ON permits requests when Allow guest requests and Allow co-host are also enabled.</small></span><span id='live-guest-stage-state' class='live-guest-stage-state'>"+(liveSettings.guestStageEnabled!==false?"ON":"OFF")+"</span></label><div class='live-guest-stage-overview' aria-label='Guest stage counts'><span><strong id='live-guest-pending-count'>0</strong><small>Pending</small></span><span><strong id='live-guest-approved-count'>0</strong><small>Approved</small></span><span><strong id='live-guest-active-count'>0</strong><small>On stage</small></span><span><strong id='live-guest-history-count'>0</strong><small>History</small></span></div><div id='live-speaker-request-list' class='live-speaker-request-list'><p class='muted'>Loading guest requests…</p></div></section>"
    : role==="viewer"
      ? (liveSettings.guestStageEnabled===false||liveSettings.allowGuestRequests===false||liveSettings.allowCoHost===false?"<section id='live-speaker-request-panel' class='live-speaker-request-panel' data-live-tools-panel='guests'><strong>Guest stage is unavailable</strong><p class='muted'>The host is not accepting guest speaker requests right now.</p></section>":"<section id='live-speaker-request-panel' class='live-speaker-request-panel' data-live-tools-panel='guests'><div class='live-speaker-panel-heading'><strong>Join the conversation</strong><small>Request a microphone seat from the host</small></div><button type='button' class='secondary full' id='live-request-speaker'>Raise hand to speak</button><p id='live-speaker-request-status' class='muted'>You are listening as an audience member.</p></section>")
      : "<section id='live-speaker-request-panel' class='live-speaker-request-panel guest' data-live-tools-panel='guests'><strong>You're on stage</strong><small>"+(broadcastType==="audio_only"?"Your microphone is live in this audio-only room.":"Your microphone and camera controls are available below.")+"</small></section>";
  const rewardTools=!giftsEnabled?"":"<section id='live-reward-panel' class='live-reward-panel' data-live-tools-panel='rewards'>"+
    "<div class='live-reward-heading'><div><strong>Goody Bags & Treasure Boxes</strong><small>LIVE community rewards</small></div>"+(role==="host"?"<span id='live-reward-balance' class='live-reward-balance'>Loading Coins…</span>":"")+"</div>"+
    (role==="host"
      ?"<form id='live-reward-create-form' class='live-reward-create-form'>"+
        "<label>Reward type<select id='live-reward-kind' name='kind'><option value='goody_bag'>Goody Bag · random draw</option><option value='treasure_box'>Treasure Box · first to claim</option></select></label>"+
        "<div class='live-reward-fields'><label>Coin pool<input name='totalCoins' type='number' min='1' max='1000000' step='1' value='500' required></label><label>Winners<input name='winnerCount' type='number' min='1' max='100' step='1' value='5' required></label></div>"+
        "<label>Countdown<select name='countdownSeconds'><option value='60'>1 minute</option><option value='180'>3 minutes</option><option value='300' selected>5 minutes</option><option value='600'>10 minutes</option></select></label>"+
        "<label>Entry condition<select id='live-reward-method' name='participationMethod'><option value='tap'>Tap to enter / claim</option><option value='comment'>Comment a keyword in chat</option></select></label>"+
        "<label id='live-reward-keyword-row' hidden>Chat keyword<input name='keyword' maxlength='40' placeholder='Example: MINGLORA'></label>"+
        "<button id='live-reward-launch' type='submit' class='live-reward-launch'>Launch Goody Bag</button>"+
        "<small class='live-reward-note'>Coins move from your Minglora balance into this reward pool. Unclaimed Coins are returned to you when it closes.</small></form>"
      :"<p class='live-reward-note'>Join a Goody Bag before its draw closes, or claim a Treasure Box when it opens. You must be connected to this LIVE room.</p>")+
    "<div id='live-reward-list' class='live-reward-list'><p class='muted'>Loading LIVE rewards…</p></div></section>";
  const liveControls=[
    (role==="host"||role==="guest")?liveControlButton("live-mic-toggle","mic","Mute microphone","Mute",{pressed:true}):"",
    (role==="host"||role==="guest")&&canUseCamera?liveControlButton("live-camera-toggle","camera","Turn camera off","Camera",{pressed:true}):"",
    (role==="host"||role==="guest")&&canUseCamera?liveControlButton("live-camera-flip","flip","Switch front/back camera","Flip"):"",
    role==="host"&&broadcastType==="video_audio"?liveControlButton("live-screen-share-toggle","screen",liveMode==="mobile_gaming"?"Share your game screen":"Share your screen",liveMode==="mobile_gaming"?"Game screen":"Screen",{pressed:false}):"",
    liveControlButton("live-guests-toggle","users",role==="host"?"Manage multi-guest stage":"Open guest stage","Guests"),
    liveControlButton("live-audio-toggle","volume","Mute LIVE room audio","Sound",{pressed:true}),
    liveControlButton("live-chat-toggle","message","Open LIVE chat","Chat"),
    liveControlButton("live-gifts-toggle","gift",role==="host"?"Preview LIVE gift catalogue":giftsEnabled?"Open LIVE gifts":"View LIVE gift availability","Gift"),
    liveControlButton("live-settings-toggle","settings","Open LIVE settings and tools","Settings"),
    liveControlButton("live-share-toggle","share","Share this LIVE","Share"),
    role!=="host"?liveControlButton("live-leave","end",role==="guest"?"Leave stage":"Leave LIVE","Leave",{danger:true}):""
  ].filter(Boolean).join("");
  const liveGiftTools="<section id='live-gift-panel' class='live-gift-panel "+(giftsEnabled?"is-enabled":"is-disabled")+"' data-live-tools-panel='gifts'><div class='live-gift-heading'><div><strong>"+(role==="host"?"LIVE gift catalogue":"Send a LIVE gift")+"</strong><small>"+(role==="host"?"Viewer preview · sending to your own LIVE is disabled":"Browse, preview and quickly send from the complete Minglora gift collection")+"</small></div><span id='live-wallet-balance'>"+(role==="host"?"VIEWER CATALOGUE":"Loading Coins…")+"</span></div><label class='live-gift-funding-source'>Pay with<select id='live-gift-funding-source'><option value='cash'>Main Coin Wallet</option><option value='admin_promotional'>Promotional Gift Wallet</option></select></label><small class='live-gift-promo-fund-note' id='live-promo-fund-availability'>Checking cash-backed promotional reserve…</small>"+
    (!giftsEnabled?"<p class='live-gift-disabled-note' role='status'>"+(liveSettings.practiceMode?"Gifts are unavailable in Practice Mode.":"The host has turned off gifts for this LIVE.")+" The catalogue remains visible, but gifts cannot be sent.</p>":"")+
    "<div class='live-gift-scope-tabs' role='group' aria-label='Gift collection'><button type='button' data-live-gift-scope='all' class='active' aria-pressed='true'>All Gifts</button><button type='button' data-live-gift-scope='favorites' aria-pressed='false'>★ Favorites</button><button type='button' data-live-gift-scope='recent' aria-pressed='false'>Recently Sent</button><button type='button' id='live-gift-scope-team' data-live-gift-scope='team' aria-pressed='false'>♥ Team Gifts</button></div><p id='live-gift-team-note' class='live-gift-team-note' hidden>Team Gifts are unlocked when you join this host’s Fan Club.</p>"+
    "<div class='live-gift-browser-tools'><label class='live-gift-search-wrap'><span>Find any gift</span><input id='live-gift-search' class='live-gift-search' type='search' placeholder='Search by gift name, category or Coins…' aria-label='Search every gift by name, category or coin price'></label><label class='live-gift-sort-label'>Sort gifts <select id='live-gift-sort' aria-label='Sort LIVE gifts'><option value='high'>Premium first · highest price</option><option value='low'>Price: low to high</option><option value='name'>Name A–Z</option></select></label></div>"+
    "<div id='live-gift-categories' class='live-gift-category-row' role='group' aria-label='Gift categories'><button type='button' class='active' data-live-gift-category='all' aria-pressed='true'>All categories</button></div>"+
    "<section id='live-gift-selected-preview' class='live-gift-selected-preview' hidden><div id='live-gift-preview-art' class='live-gift-preview-art' aria-label='Selected gift preview'></div><div class='live-gift-preview-copy'><span class='live-gift-preview-eyebrow'>Selected gift</span><strong id='live-gift-preview-name'>Choose a gift</strong><small id='live-gift-preview-price'></small><small id='live-gift-preview-note'>Preview the animation and sound before sending.</small><div class='live-gift-preview-actions'><button type='button' class='secondary' id='live-gift-preview-sound' disabled>▶ Preview animation &amp; sound</button><button type='button' class='primary' id='live-gift-send-selected' disabled>Quick send selected gift</button></div></div></section>"+
    "<div class='live-gift-results-heading'><strong id='live-gift-count'>Loading gifts…</strong><small>Tap a gift to preview it. Your favourites and recent gifts stay easy to reach.</small></div><div id='live-gift-grid' class='live-gift-grid'><p class='muted'>Loading original Minglora gifts…</p></div><button class='secondary' type='button' id='live-gift-more' hidden>Show more gifts</button>"+
    (role==="host"?"<p class='live-gift-host-note'>This is a read-only preview. Viewers and approved guests can send gifts when LIVE gifts are enabled.</p>":"<button class='text-button' id='live-recharge'>Recharge Minglora Coins</button>")+
    "</section>";
  const liveFanClubTools="<section id='live-fan-club-panel' class='live-tools-card live-fan-club-panel' data-live-tools-panel='fanclub'><div class='live-panel-title'><strong>♥ Fan Club & Team Gifts</strong><small>Join this creator’s Fan Club with the 1-Coin Heart Me gift. Earn Fan Points by watching, chatting and gifting.</small></div>"+
    (role==='host'?"<div id='live-fan-club-status' class='live-fan-club-status'><strong>Creator Fan Club</strong><small>Members can unlock Team Gifts and Fan badges.</small></div>":"<div id='live-fan-club-status' class='live-fan-club-status'><small>Checking your Fan Club membership…</small></div><button type='button' id='live-fan-club-join-panel' class='live-fan-club-join-panel'>♥ Join for 1 Coin</button><button type='button' id='live-team-gifts-open' class='secondary'>Open Team Gifts</button>")+
    "<div class='live-fan-club-member-total'><span>Fan Club members</span><strong id='live-fan-club-member-count'>"+Number(session.fanClubMemberCount||0).toLocaleString()+"</strong></div><small class='live-fan-club-expiry-note'>Membership pauses after 7 days without earning Fan Points.</small></section>";
  const liveMatchTools="<section id='live-match-panel' class='live-tools-card live-match-panel' data-live-tools-panel='matches'><div class='live-panel-title'><strong>Creator League Match</strong><small>Challenge another live creator, accept an invitation, or support a side. Confirmed gifts count toward eligible match points.</small></div>"+(role==='host'?"<form id='live-match-create-form' class='live-match-create-form'><label for='live-match-opponent'>Challenge a creator who is live</label><select id='live-match-opponent' name='opponentSessionId' required><option value=''>Finding live creators…</option></select><label for='live-match-gift-mode'>Scoring gifts</label><select id='live-match-gift-mode' name='giftMode'><option value='all'>All eligible gifts</option><option value='specific'>One selected gift</option></select><label for='live-match-gift-code'>Selected gift code</label><input id='live-match-gift-code' name='selectedGiftCode' maxlength='60' placeholder='Required only for specific gift mode'><button type='submit' class='secondary'>Send League Match challenge</button></form>":"")+"<div id='live-match-list' class='live-match-list'><p class='muted'>Loading Creator League matches…</p></div></section>";
  const liveThemeAppearance=role==="host"
    ? "<section class='live-tools-card live-room-appearance' data-live-tools-panel='appearance'><div><strong>Room appearance</strong><small>Change the visual style of this LIVE room.</small></div><label for='live-room-theme-select'>Stage theme<select id='live-room-theme-select'>"+LIVE_ROOM_THEME_OPTIONS.map(option=>"<option value='"+esc(option.value)+"'"+(option.value===liveTheme?" selected":"")+">"+esc(option.label)+"</option>").join("")+"</select></label></section>"
    : "<section class='live-tools-card live-room-appearance' data-live-tools-panel='appearance'><strong>Room appearance</strong><p>"+esc(LIVE_ROOM_THEME_OPTIONS.find(option=>option.value===liveTheme)?.label||"Creator Studio")+"</p></section>";
  const liveModeratorTools=role==="host"&&liveSettings.manageModerators!==false
    ? "<section id='live-moderator-panel' class='live-tools-card live-moderator-panel' data-live-tools-panel='moderators'><div><strong>LIVE moderators</strong><small>Assign up to 10 members to remove inappropriate LIVE comments.</small></div><form id='live-moderator-form' class='live-moderator-form'><label for='live-moderator-username'>Member username</label><input id='live-moderator-username' name='username' maxlength='30' autocomplete='off' placeholder='Enter Minglora username' required><button type='submit' class='secondary'>Add moderator</button></form><div id='live-moderator-list' class='live-moderator-list'><p class='muted'>Loading moderators…</p></div></section>"
    : "";
  const liveToolsNavigation="<nav class='live-tools-shortcuts' aria-label='LIVE panels'>"+
    (role==="host"?"<button type='button' data-live-tools-panel-target='layouts' aria-pressed='true'>Layout</button><button type='button' data-live-tools-panel-target='permissions' aria-pressed='false'>Permissions</button>":"")+
    "<button type='button' data-live-tools-panel-target='guests' data-live-tools-target='#live-speaker-request-panel' aria-pressed='false'>Guests</button>"+
    (role==="host"?"<button type='button' data-live-tools-panel-target='viewers' aria-pressed='false'>Viewers</button>":"")+
    "<button type='button' data-live-tools-panel-target='chat' aria-pressed='false'>Chat</button>"+
    "<button type='button' data-live-tools-panel-target='fanclub' data-live-tools-target='#live-fan-club-panel' aria-pressed='false'>Fan Club</button>"+
    "<button type='button' data-live-tools-panel-target='matches' data-live-tools-target='#live-match-panel' aria-pressed='false'>Match</button>"+
    "<button type='button' data-live-tools-panel-target='gifts' data-live-tools-target='#live-gift-panel' aria-pressed='false'>Gifts</button>"+
    (giftsEnabled?"<button type='button' data-live-tools-panel-target='rewards' data-live-tools-target='#live-reward-panel' aria-pressed='false'>Rewards</button>":"")+
    (role==="host"&&liveSettings.manageModerators!==false?"<button type='button' data-live-tools-panel-target='moderators' data-live-tools-target='#live-moderator-panel' aria-pressed='false'>Moderators</button>":"")+
    (role==="host"?"<button type='button' data-live-tools-panel-target='appearance' data-live-tools-target='.live-room-appearance' aria-pressed='false'>Appearance</button>":"")+
    "</nav>";
  const liveModeLabels={video_audio:'VIDEO + AUDIO',audio_only:'AUDIO ONLY',mobile_gaming:'MOBILE GAMING',live_studio:'LIVE STUDIO'};
  const disclosureLabels={none:'',branded:'Branded content',sponsored:'Sponsored content'};
  const livePreflightBanner="<div class='live-session-meta'><span class='live-mode-badge'>"+liveModeLabels[liveMode]+"</span>"+
    (liveSettings.contentDisclosure&&liveSettings.contentDisclosure!=='none'?"<span class='live-disclosure-badge'>"+esc(disclosureLabels[liveSettings.contentDisclosure]||'Disclosed content')+"</span>":"")+
    (liveSettings.board?"<span class='live-board-badge'>"+esc(String(liveSettings.board).replace(/^./,x=>x.toUpperCase()))+"</span>":"")+
    (session.description?"<p class='live-session-about'>"+esc(session.description)+"</p>":"")+
    (liveSettings.clientAcquisitionEnabled&&liveSettings.clientCtaUrl&&liveSettings.clientCtaLabel?"<a class='live-client-cta' href='"+esc(liveSettings.clientCtaUrl)+"' target='_blank' rel='noopener noreferrer'>"+esc(liveSettings.clientCtaLabel)+"</a>":"")+"</div>";
  const liveRoomPermissionSettings=[
    ['allowGuestRequests','Allow guest requests',true,'Let viewers request a guest seat'],
    ['guestCamera','Guest camera',true,'Allow approved guests to publish video'],
    ['autoAcceptRequests','Auto accept',false,'Approve requests while speaker seats are available'],
    ['prioritizeGifters','Prioritize gifters',false,'Sort pending requests by verified gifter level'],
    ['allowCoHost','Allow co-host',true,'Allow other members to join the LIVE stage'],
    ['manageModerators','Manage moderators',true,'Allow moderator assignment and removal'],
    ['voiceRings','Voice rings',true,'Play a short tone for new guest requests']
  ];
  const liveRoomPermissionPanel=role==='host'?"<section id='live-room-permission-panel' class='live-tools-card live-room-permission-panel' data-live-tools-panel='permissions'><div class='live-panel-title'><strong>Guest & host permissions</strong><small>Enable or disable each control during your LIVE.</small></div><div id='live-room-permission-controls' class='live-room-permission-grid'>"+liveRoomPermissionSettings.map(([key,label,defaultValue,description])=>"<label class='live-room-permission-toggle'><input type='checkbox' data-live-room-setting='"+key+"'"+((liveSettings[key]??defaultValue)?" checked":"")+"><span class='live-preflight-switch'></span><span><strong>"+esc(label)+"</strong><small>"+esc(description)+"</small></span></label>").join('')+"</div></section>":"";
  const liveLayoutPanel=role==="host"?"<section id='live-layout-panel' class='live-tools-card live-layout-panel' data-live-tools-panel='layouts'><div class='live-panel-title'><strong>Screen layout</strong><small>Switch the broadcast arrangement without ending LIVE. Full Screen expands the host stage across each device; viewers follow your selection.</small></div><div id='live-layout-options' class='live-layout-options' role='group' aria-label='Choose LIVE screen layout'>"+LIVE_SCREEN_LAYOUT_OPTIONS.map(option=>"<button type='button' class='live-layout-option"+(option.value===activeLiveScreenLayout?" active":"")+"' data-live-screen-layout='"+option.value+"' aria-pressed='"+String(option.value===activeLiveScreenLayout)+"'>"+liveLayoutIcon(option.icon)+"<span>"+esc(option.label)+"</span></button>").join("")+"</div><p class='live-layout-status' id='live-layout-status' role='status' aria-live='polite'>"+esc(LIVE_SCREEN_LAYOUT_OPTIONS.find(option=>option.value===activeLiveScreenLayout)?.label||'Grid')+" layout selected.</p></section>":"";
  const liveViewerTools=role==="host"?"<section id='live-viewer-panel' class='live-tools-card live-viewer-panel' data-live-tools-panel='viewers'><div class='live-panel-title'><strong>Viewers & guests</strong><small id='live-viewer-total'>Loading connected people…</small></div><div id='live-viewer-roster' class='live-viewer-roster'><p class='muted'>Loading the real-time audience…</p></div></section>":"";
  const liveChatTools=liveSettings.groupChatEnabled!==false
    ? "<section id='live-chat-panel' class='live-tools-card live-chat-panel' data-live-tools-panel='chat'><div class='live-panel-title'><strong>LIVE chat</strong><small>Live comments, emoji and host moderation.</small></div><div id='live-chat-panel-body' class='live-chat-panel-body'><p class='muted'>Open the Chat tab to view the live conversation.</p></div></section>"
    : "<section id='live-chat-panel' class='live-tools-card live-chat-panel' data-live-tools-panel='chat'><div class='live-panel-title'><strong>LIVE chat</strong><small>Chat is turned off for this broadcast.</small></div><div id='live-chat-panel-body' class='live-chat-panel-body'><p class='live-chat-disabled-note' role='status'>The host has turned off Group LIVE chat for this broadcast.</p></div></section>";
  const liveToolsDrawer="<div id='live-tools-backdrop' class='live-tools-backdrop hidden' aria-hidden='true'>"+
    "<section id='live-tools-drawer' class='live-tools-drawer' role='dialog' aria-modal='true' aria-labelledby='live-tools-title' tabindex='-1'>"+
    "<header class='live-tools-header'><div><span class='live-tools-eyebrow'>MINGLORA LIVE</span><h2 id='live-tools-title'>LIVE settings & tools</h2><small>Manage your room without covering the stream.</small></div>"+
    "<button type='button' class='live-tools-close' id='live-tools-close' aria-label='Close LIVE settings'>×</button></header>"+
    liveToolsNavigation+"<div class='live-tools-content'>"+liveLayoutPanel+liveRoomPermissionPanel+liveViewerTools+liveChatTools+liveFanClubTools+liveMatchTools+liveThemeAppearance+liveModeratorTools+speakerTools+rewardTools+liveGiftTools+"</div></section></div>";
  const liveHostName=String(session.host?.name||session.host?.username||"Minglora host");
  const liveHostId=String(session.hostId||session.host?.id||'');
  const liveLikeCount=Math.max(0,Number(session.likeCount)||0);
  // Stable layout contract: class='live-stage-topbar' remains present for the stage HUD.
  const liveStageHud=
    "<div class='live-stage-topbar "+(role==="host"?"is-host":"")+"'>"+
      "<div class='live-stage-top-left'>"+
        "<div class='live-host-profile-wrap'><button type='button' class='live-host-profile' data-live-profile-preview='"+esc(liveHostId)+"' aria-label='Open "+esc(liveHostName)+" profile in LIVE'>"+
          "<img src='"+avatar(session.host||state.user)+"' alt='' loading='eager'>"+
          "<span><strong>"+esc(liveHostName)+"</strong><small><i class='live-host-live-dot'></i> LIVE NOW</small></span>"+
        "</button>"+
        (role==='viewer'?"<button type='button' id='live-follow-host' class='live-follow-button' aria-pressed='"+(session.host?.following?'true':'false')+"'>"+(session.host?.following?'Following':'Follow')+"</button>":"")+
        "</div>"+
        "<div class='live-like-control live-like-count'><button type='button' id='live-heart-like' class='live-heart-like' aria-label='Like this LIVE' aria-pressed='false'><span aria-hidden='true'>♥</span></button><strong id='live-reaction-count' data-count='"+liveLikeCount+"'>"+liveCompactCount(liveLikeCount)+"</strong><small>likes</small></div>"+
        (role==='viewer'?"<button type='button' id='live-fan-club-join' class='live-fan-club-join' aria-label='Join host Fan Club for one Coin'>♥ Join · 1 Coin</button>":"")+
      "</div>"+
      "<div class='live-stage-top-actions'>"+
      (role==="host"?"<button type='button' id='live-leave' class='live-host-power-button' aria-label='Power off LIVE for everyone' title='Power off LIVE'><svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'><path d='M12 2v10' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' fill='none'></path><path d='M7.05 4.95a8 8 0 1 0 9.9 0' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' fill='none'></path></svg></button>":"")+
      "</div>"+
    "</div>";
  const liveChatOverlay=liveSettings.groupChatEnabled!==false
    ? "<section id='live-chat-overlay' class='live-chat-overlay' aria-label='LIVE chat and comments'><div id='live-chat-list' class='live-chat-list' aria-live='polite'><p class='muted'>Loading comments…</p></div><div class='live-chat-composer-wrap'><div id='live-chat-emoji-picker' class='live-chat-emoji-picker hidden' aria-label='Quick emojis'>"+['❤️','😂','🔥','👏','😍','🎉','💖','🙌'].map(emoji=>"<button type='button' data-live-chat-emoji='"+emoji+"' aria-label='Insert "+emoji+"'>"+emoji+"</button>").join('')+"</div><form id='live-chat-form' class='live-chat-form'><button type='button' id='live-chat-emoji' class='live-chat-emoji-button' aria-label='Open emoji picker'>😊</button><input name='body' maxlength='500' placeholder='Add a comment…' aria-label='Add a LIVE comment' required><button type='submit' aria-label='Send comment'>➤</button></form></div></section>"
    : "<p id='live-chat-disabled-note' class='live-chat-disabled-note'>The host has turned off Group LIVE chat for this broadcast.</p>";
  setContent("<section id='live-player-shell' class='live-player-shell live-theme-"+liveTheme+" live-mode-"+liveMode+" "+(broadcastType==="audio_only"?"live-player-audio-only":"live-player-video-audio")+"'><div class='live-player-header'>"+(role==='viewer'?"<button class='live-exit-button' id='live-back' aria-label='Exit LIVE' title='Exit LIVE'>×</button>":"<button class='text-button' id='live-back'>← Live now</button>")+"<div><span class='live-indicator'>LIVE</span><span class='live-broadcast-type'>"+liveModeLabels[liveMode]+"</span><strong>"+esc(session.title)+"</strong></div><span id='live-viewer-count' class='live-viewer-count'"+(liveSettings.markViewers===false?" hidden":"")+">◉ Connecting…</span></div>"+liveEntryBanner+livePreflightBanner+
    "<div class='live-player-layout'><div class='live-video-column'>"+stageMarkup+"<div id='live-audio-root' class='live-audio-root'></div>"+
    "<div class='live-player-controls live-icon-controls' role='group' aria-label='LIVE controls'>"+liveControls+"</div></div><aside id='live-fullscreen-chat-slot' class='live-fullscreen-chat-slot' aria-label='LIVE side panel'><div class='live-fullscreen-side-head'><strong>LIVE PANEL</strong><nav class='live-fullscreen-side-tabs' aria-label='Switch LIVE side panel'><button id='live-fullscreen-chat-tab' type='button' data-live-fullscreen-panel='chat' class='active' aria-pressed='true'>Chat</button><button id='live-fullscreen-tools-tab' type='button' data-live-fullscreen-panel='tools' aria-pressed='false'>Tools</button></nav></div></aside></div>"+liveToolsDrawer+"<div id='live-profile-preview' class='live-profile-preview hidden' aria-hidden='true'></div></section>");
    if(role==="host"){
    const moderatorList=$("#live-moderator-list");
    const refreshLiveModerators=async()=>{
      if(!moderatorList)return;
      moderatorList.innerHTML="<p class='muted'>Loading moderators…</p>";
      try{
        const data=await api("/live/sessions/"+encodeURIComponent(session.id)+"/moderators");
        const moderators=Array.isArray(data.moderators)?data.moderators:[];
        moderatorList.innerHTML=moderators.length?moderators.map(member=>"<div class='live-moderator-row'><span><strong>"+esc(member.name||member.username||"Minglora member")+"</strong><small>@"+esc(member.username||"member")+"</small></span><button type='button' class='text-button' data-live-moderator-remove='"+esc(member.id)+"'>Remove</button></div>").join(""):"<p class='muted'>No moderators assigned yet.</p>";
      }catch(error){moderatorList.innerHTML="<p class='muted'>"+esc(error.message||"Moderators could not be loaded.")+"</p>";}
    };
    $("#live-moderator-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget,button=form.querySelector("button[type='submit']"),username=String(form.elements.username.value||"").trim();
      if(!username)return;
      button.disabled=true;
      try{await api("/live/sessions/"+encodeURIComponent(session.id)+"/moderators",{method:"POST",body:JSON.stringify({username})});form.reset();await refreshLiveModerators();toast("LIVE moderator added.");}
      catch(error){toast(error.message||"The moderator could not be added.");}
      finally{button.disabled=false;}
    });
    moderatorList?.addEventListener("click",async event=>{
      const button=event.target?.closest?.("[data-live-moderator-remove]");if(!button)return;
      const memberId=button.dataset.liveModeratorRemove;if(!memberId)return;
      button.disabled=true;
      try{await api("/live/sessions/"+encodeURIComponent(session.id)+"/moderators/"+encodeURIComponent(memberId),{method:"DELETE"});await refreshLiveModerators();toast("LIVE moderator removed.");}
      catch(error){toast(error.message||"The moderator could not be removed.");button.disabled=false;}
    });
    void refreshLiveModerators();
  }
activeLivePinnedComment=null;
  const reactionLayer=document.createElement("div");
  reactionLayer.className="live-reaction-layer";
  reactionLayer.setAttribute("aria-hidden","true");
  const pinnedCommentLayer=document.createElement("div");
  pinnedCommentLayer.id="live-pinned-comment";
  pinnedCommentLayer.className="live-pinned-comment hidden";
  pinnedCommentLayer.setAttribute("aria-live","polite");
  const stage=$("#live-video-stage");
  stage?.append(reactionLayer,pinnedCommentLayer);
  stage?.insertAdjacentHTML("beforebegin",liveStageHud);
  stage?.insertAdjacentHTML("beforeend",liveChatOverlay);
  const stablePublishing=liveSettings.optimizeForStability!==false;
  const qualityKey=liveSettings.liveQuality==='1080p'?'h1080':liveSettings.liveQuality==='720p'?'h720':null;
  const qualityPreset=qualityKey?client.VideoPresets?.[qualityKey]:null;
  const roomOptions={
    adaptiveStream:stablePublishing,
    dynacast:stablePublishing,
    audioCaptureDefaults:{echoCancellation:true,noiseSuppression:liveSettings.noiseSuppression!==false,autoGainControl:true},
    ...(qualityPreset?.resolution?{videoCaptureDefaults:{resolution:qualityPreset.resolution}}:{})
  };
  const room=new client.Room(roomOptions);activeLiveRoom=room;
  const updatePresence=()=>{const count=Number(room.remoteParticipants?.size||0)+1;const counter=$("#live-viewer-count");if(counter)counter.textContent='◉ '+count.toLocaleString();};
  const activeLiveSpeakerIds=new Set();
  const liveReactionEmoji=Object.freeze({heart:"❤️"});
  const receivedLiveReactionAt=new Map();
  let lastLiveReactionSentAt=0;
  const showLiveReaction=(reaction,options={})=>{
    const emoji=liveReactionEmoji[reaction];
    if(!emoji)return;
    const counter=$("#live-reaction-count");
    if(counter&&options.count!==false){
      const count=Math.max(0,Number(counter.dataset.count||0))+1;
      counter.dataset.count=String(count);
      counter.textContent=liveCompactCount(count);
    }
    const layer=$("#live-video-stage .live-reaction-layer");
    if(!layer)return;
    const bubble=document.createElement("span");
    bubble.className="live-reaction-float reaction-"+reaction;
    bubble.textContent=emoji;
    bubble.style.left=(14+Math.random()*72).toFixed(1)+"%";
    bubble.style.setProperty("--reaction-drift",(Math.random()*48-24).toFixed(1)+"px");
    layer.append(bubble);
    while(layer.childElementCount>18)layer.firstElementChild?.remove();
    bubble.addEventListener("animationend",()=>bubble.remove(),{once:true});
  };
  if(client.RoomEvent.DataReceived)room.on(client.RoomEvent.DataReceived,(payload,participant,kind,topic)=>{
    if(!payload)return;
    let packet;
    try{packet=JSON.parse(new TextDecoder().decode(payload));}catch{return;}
    if(topic==="minglora-live-gift"&&!participant?.identity&&packet?.type==="minglora.live.gift"&&packet.version===1){
      const event=packet.event;
      if(event&&String(event.broadcastId||"")===String(session.id))presentLiveGiftEvent(event);
      return;
    }
    if(!participant?.identity)return;
    if(topic==="minglora-live-setting"&&participant.identity===session.hostId&&packet?.type==="minglora.live.setting"&&packet.version===1&&typeof packet.enabled==='boolean'){
      if(packet.setting==='guestCamera'){
        activeLiveSession.liveSettings={...(activeLiveSession.liveSettings||{}),guestCamera:packet.enabled};
        session.liveSettings={...(session.liveSettings||{}),guestCamera:packet.enabled};
        if(role==='guest'&&!packet.enabled){
          void room.localParticipant.setCameraEnabled(false).then(()=>{
            liveCameraEnabled=false;
            const cameraButton=$('#live-camera-toggle');
            if(cameraButton){cameraButton.disabled=true;updateLiveControlButton(cameraButton,'camera-off','Guest cameras disabled by host','Camera off',false);}
            $('#live-camera-flip')?.setAttribute('disabled','disabled');
            toast('The host has turned off guest cameras.');
          }).catch(error=>toast(error.message||'Minglora could not turn off your camera.'));
        }else if(role==='guest'&&packet.enabled){toast('The host enabled guest cameras. Rejoin the speaker stage to refresh your camera permission.');}
        return;
      }
      if(packet.setting==='guestStageEnabled'){
        activeLiveSession.liveSettings={...(activeLiveSession.liveSettings||{}),guestStageEnabled:packet.enabled};
        session.liveSettings={...(session.liveSettings||{}),guestStageEnabled:packet.enabled};
        const switchInput=$('#live-guest-stage-toggle'),stateLabel=$('#live-guest-stage-state');
        if(switchInput)switchInput.checked=packet.enabled;
        if(stateLabel)stateLabel.textContent=packet.enabled?'ON':'OFF';
        if(role==='viewer'){
          const panel=$('#live-speaker-request-panel');
          const canRequest=packet.enabled&&session.liveSettings?.allowGuestRequests!==false&&session.liveSettings?.allowCoHost!==false;
          if(panel){
            panel.innerHTML=canRequest
              ?"<div class='live-speaker-panel-heading'><strong>Join the conversation</strong><small>Request a microphone seat from the host</small></div><button type='button' class='secondary full' id='live-request-speaker'>Raise hand to speak</button><p id='live-speaker-request-status' class='muted'>You are listening as an audience member.</p>"
              :"<strong>Guest stage is unavailable</strong><p class='muted'>The host is not accepting guest speaker requests right now.</p>";
          }
          if(canRequest)void refreshLiveSpeakerPanel(session,role,room);
        }else if(role==='guest'&&!packet.enabled){
          toast('The host disabled the guest stage. You are being returned to the audience.');
          stopLiveSpeakerRefresh();stopLiveChatRefresh();
          void (async()=>{try{await room.disconnect();activeLiveRoom=null;await openLiveRoom(session,'viewer');}catch(error){toast(error.message||'Could not return to the LIVE audience.');}})();
        }
        return;
      }
    }
    if(topic==="minglora-live-layout"&&participant.identity===session.hostId&&packet?.type==="minglora.live.layout"&&packet.version===1){
      if(!LIVE_SCREEN_LAYOUT_OPTIONS.some(option=>option.value===packet.layout))return;
      const nextLayout=normalizeLiveScreenLayout(packet.layout);
      session.liveLayout=nextLayout;activeLiveSession.liveLayout=nextLayout;applyLiveScreenLayout(nextLayout);renderLiveGuestLayout(room,role,session,activeLiveSpeakerIds);
      return;
    }
    if(topic==="minglora-live-reaction"){
      if(packet?.type!=="minglora.live.reaction"||packet.version!==1||!Object.hasOwn(liveReactionEmoji,packet.reaction))return;
      const identity=String(participant.identity),now=Date.now(),last=receivedLiveReactionAt.get(identity)||0;
      if(now-last<150)return;
      receivedLiveReactionAt.set(identity,now);
      if(receivedLiveReactionAt.size>250){
        for(const [key,at] of receivedLiveReactionAt)if(now-at>10000)receivedLiveReactionAt.delete(key);
      }
      const counter=$("#live-reaction-count");
      if(counter&&Number.isFinite(Number(packet.likeCount))){counter.dataset.count=String(Math.max(0,Number(packet.likeCount)));counter.textContent=liveCompactCount(packet.likeCount);}
      showLiveReaction(packet.reaction,{count:false});
      return;
    }
    if(topic==="minglora-live-pin"&&participant.identity===session.hostId&&packet?.type==="minglora.live.pin"&&packet.version===1){
      if(packet.action==="unpin"){
        if(activeLivePinnedComment?.id===String(packet.messageId||""))renderLivePinnedComment(null);
        return;
      }
      const messageId=String(packet.messageId||"");
      const body=String(packet.body||"").trim();
      const author=String(packet.author||"Member").trim();
      if(packet.action!=="pin"||!messageId||body.length<1||body.length>500||author.length>80)return;
      renderLivePinnedComment({id:messageId,body,author});
    }
  });
  const refreshSpeakerRoster=()=>{renderLiveSpeakerRoster(room,role,session,activeLiveSpeakerIds);renderLiveGuestLayout(room,role,session,activeLiveSpeakerIds);renderLiveViewerPanel(room,role,session);};
  room.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>{refreshSpeakerRoster();attachLiveTrack(track,participant,false,publication);refreshSpeakerRoster();});
  room.on(client.RoomEvent.TrackUnsubscribed,track=>{track.detach().forEach(element=>{element.closest?.(".live-video-tile,.live-screen-share-tile")?.remove();element.remove();});const stage=$("#live-video-stage");if(stage&&!$("#live-screen-share-stage")?.querySelector(".live-screen-share-tile"))stage.classList.remove("has-live-screen-share");refreshSpeakerRoster();});
  room.on(client.RoomEvent.ParticipantConnected,()=>{updatePresence();refreshSpeakerRoster();});
  room.on(client.RoomEvent.ParticipantDisconnected,()=>{updatePresence();refreshSpeakerRoster();});
  if(client.RoomEvent.TrackPublished)room.on(client.RoomEvent.TrackPublished,refreshSpeakerRoster);
  if(client.RoomEvent.TrackUnpublished)room.on(client.RoomEvent.TrackUnpublished,refreshSpeakerRoster);
  if(client.RoomEvent.LocalTrackUnpublished)room.on(client.RoomEvent.LocalTrackUnpublished,publication=>{
    if(isLiveScreenSharePublication(publication)){
      liveScreenShareEnabled=false;
      $("#live-screen-share-stage")?.replaceChildren();
      $("#live-video-stage")?.classList.remove("has-live-screen-share");
      updateLiveControlButton($("#live-screen-share-toggle"),"screen",liveMode==="mobile_gaming"?"Share your game screen":"Share your screen",liveMode==="mobile_gaming"?"Game screen":"Screen",false);
    }
    refreshSpeakerRoster();
  });
  if(client.RoomEvent.ActiveSpeakersChanged)room.on(client.RoomEvent.ActiveSpeakersChanged,speakers=>{
    activeLiveSpeakerIds.clear();
    (Array.isArray(speakers)?speakers:[]).forEach(person=>activeLiveSpeakerIds.add(person.identity));
    $("#live-audio-waveform")?.classList.toggle("is-active",activeLiveSpeakerIds.size>0);
    refreshSpeakerRoster();
  });
  room.on(client.RoomEvent.Disconnected,()=>{if(activeLiveRoom===room){stopLiveRewardRefresh();stopLiveFanClubHeartbeat();stopLiveMatchRefresh();stopLiveViewerRefresh();toast("Your LIVE connection was disconnected.");}});
  // Render the host/speaker seat immediately; the connection label upgrades when
  // the microphone publication is confirmed, so the stage never waits for speech.
  refreshSpeakerRoster();
  try{
    let connectTimeout;
    try{
      await Promise.race([
        room.connect(liveKit.url,liveKit.token),
        new Promise((_,reject)=>{connectTimeout=setTimeout(()=>reject(new Error('Could not establish a LIVE connection within 20 seconds. Check the LiveKit server URL, firewall and network connection, then try again.')),20000);})
      ]);
    }finally{if(connectTimeout)clearTimeout(connectTimeout);}
    $(".live-video-placeholder")?.remove();
    if(role==="host"&&canUseCamera){
      await room.localParticipant.enableCameraAndMicrophone();
      for(const publication of room.localParticipant.videoTrackPublications.values())if(publication.track)attachLiveTrack(publication.track,room.localParticipant,true,publication);
    }else if(role==="host"||role==="guest"){
      await room.localParticipant.setMicrophoneEnabled(true);
      let microphonePublished=participantHasLiveAudio(room.localParticipant);
      for(let attempt=0;attempt<5&&!microphonePublished;attempt++){
        await new Promise(resolve=>setTimeout(resolve,250));
        microphonePublished=participantHasLiveAudio(room.localParticipant);
      }
      if(!microphonePublished){
        throw new Error("Minglora connected to the LIVE room, but the microphone track was not published. Check browser microphone permission and try again.");
      }
      if(role==="guest"&&canUseCamera){
        await room.localParticipant.setCameraEnabled(true);
        for(const publication of room.localParticipant.videoTrackPublications.values()){
          if(publication.track)attachLiveTrack(publication.track,room.localParticipant,true,publication);
        }
      }
    }
    updatePresence();
    refreshSpeakerRoster();
    await syncLiveParticipantPresence(session);
    if(role==='host')startLiveViewerRefresh(session);
    if(role==='viewer'){
      const fanStatus=await loadLiveFanClubStatus(session);
      if(fanStatus?.isMember)startLiveFanClubHeartbeat(session);
    }
    setupLiveMatchPanel(session,role);
    if(giftsEnabled)setupLiveRewardPanel(session,role);
    const micControl=$("#live-mic-toggle"),cameraControl=$("#live-camera-toggle"),flipCameraControl=$("#live-camera-flip");
    const roomAudioControl=$("#live-audio-toggle");
    const screenShareControl=$("#live-screen-share-toggle");
    liveScreenShareEnabled=false;
    liveAudioMuted=false;
    if(micControl)micControl.disabled=!(role==="host"||role==="guest");
    if(cameraControl)cameraControl.disabled=!((role==="host"||role==="guest")&&canUseCamera);
    if(flipCameraControl)flipCameraControl.disabled=!liveCameraEnabled;
    if(screenShareControl&&typeof navigator.mediaDevices?.getDisplayMedia!=="function"){
      screenShareControl.disabled=true;
      screenShareControl.title="Screen capture is not supported by this browser or device.";
      screenShareControl.setAttribute("aria-label","Screen capture is not supported on this device");
    }
    roomAudioControl?.addEventListener("click",()=>{
      liveAudioMuted=!liveAudioMuted;
      $("#live-audio-root")?.querySelectorAll("audio,video").forEach(element=>{element.muted=liveAudioMuted;});
      updateLiveControlButton(roomAudioControl,liveAudioMuted?"volume-off":"volume",liveAudioMuted?"Unmute LIVE room audio":"Mute LIVE room audio",liveAudioMuted?"Sound off":"Sound",!liveAudioMuted);
    });
    micControl?.addEventListener("click",async()=>{
      const nextEnabled=!liveMicrophoneEnabled;micControl.disabled=true;
      try{
        await room.localParticipant.setMicrophoneEnabled(nextEnabled);
        liveMicrophoneEnabled=nextEnabled;
        updateLiveControlButton(micControl,nextEnabled?"mic":"mic-off",nextEnabled?"Mute microphone":"Unmute microphone",nextEnabled?"Mute":"Unmute",nextEnabled);
        refreshSpeakerRoster();
      }catch(error){toast(error.message);}
      finally{micControl.disabled=false;}
    });
    cameraControl?.addEventListener("click",async()=>{
      const nextEnabled=!liveCameraEnabled;cameraControl.disabled=true;
      try{
        await room.localParticipant.setCameraEnabled(nextEnabled);
        liveCameraEnabled=nextEnabled;
        if(nextEnabled){
          for(const publication of room.localParticipant.videoTrackPublications.values()){
            if(publication.track)attachLiveTrack(publication.track,room.localParticipant,true,publication);
          }
        }else{
          for(const publication of room.localParticipant.videoTrackPublications.values()){
            if(publication.track)publication.track.detach().forEach(element=>element.closest?.(".live-video-tile")?.remove());
          }
          document.querySelectorAll("#live-guest-layout .live-video-tile.local").forEach(tile=>tile.remove());
        }
        updateLiveControlButton(cameraControl,nextEnabled?"camera":"camera-off",nextEnabled?"Turn camera off":"Turn camera on",nextEnabled?"Camera":"Camera off",nextEnabled);
        if(flipCameraControl)flipCameraControl.disabled=!nextEnabled;
        refreshSpeakerRoster();
      }catch(error){toast(error.message);}
      finally{cameraControl.disabled=false;}
    });
    flipCameraControl?.addEventListener("click",async()=>{
      if(!liveCameraEnabled){toast("Turn your camera on before switching cameras.");return;}
      const publications=Array.from(room.localParticipant.videoTrackPublications?.values?.()||[]);
      const publication=publications.find(item=>item?.track?.kind==="video"||item?.videoTrack)||publications[0];
      const videoTrack=publication?.videoTrack||publication?.track;
      if(!videoTrack?.restartTrack){toast("Camera switching is not available on this device.");return;}
      const nextFacing=liveCameraFacing==="user"?"environment":"user";
      flipCameraControl.disabled=true;
      try{
        await videoTrack.restartTrack({facingMode:nextFacing});
        liveCameraFacing=nextFacing;
        toast(nextFacing==="environment"?"Back camera selected.":"Front camera selected.");
      }catch(error){toast(error.message||"Could not switch cameras.");}
      finally{flipCameraControl.disabled=!liveCameraEnabled;}
    });
    screenShareControl?.addEventListener("click",async()=>{
      if(role!=="host"||broadcastType!=="video_audio"){toast("Screen sharing is available to the host in video-based LIVE rooms.");return;}
      if(typeof room.localParticipant.setScreenShareEnabled!=="function"){toast("Screen sharing is not supported by this browser.");return;}
      const nextEnabled=!liveScreenShareEnabled;
      screenShareControl.disabled=true;
      try{
        await room.localParticipant.setScreenShareEnabled(nextEnabled,{
          audio:false,
          contentHint:liveMode==="mobile_gaming"?"motion":"detail",
          ...(qualityPreset?.resolution?{resolution:qualityPreset.resolution}:{})
        });
        liveScreenShareEnabled=nextEnabled;
        if(nextEnabled){
          const source=client.Track?.Source?.ScreenShare??3;
          const publication=Array.from(room.localParticipant.trackPublications?.values?.()||[]).find(item=>item?.source===source||isLiveScreenSharePublication(item));
          if(publication?.track)attachLiveTrack(publication.track,room.localParticipant,true,publication);
          const mediaTrack=publication?.track?.mediaStreamTrack;
          mediaTrack?.addEventListener?.("ended",()=>{
            liveScreenShareEnabled=false;
            $("#live-screen-share-stage")?.replaceChildren();
            $("#live-video-stage")?.classList.remove("has-live-screen-share");
            updateLiveControlButton(screenShareControl,"screen",liveMode==="mobile_gaming"?"Share your game screen":"Share your screen",liveMode==="mobile_gaming"?"Game screen":"Screen",false);
          },{once:true});
        }else{
          $("#live-screen-share-stage")?.replaceChildren();
          $("#live-video-stage")?.classList.remove("has-live-screen-share");
        }
        updateLiveControlButton(screenShareControl,"screen",nextEnabled?"Stop sharing":"Share "+(liveMode==="mobile_gaming"?"game screen":"screen"),nextEnabled?"Stop share":liveMode==="mobile_gaming"?"Game screen":"Screen",nextEnabled);
      }catch(error){
        liveScreenShareEnabled=false;
        updateLiveControlButton(screenShareControl,"screen",liveMode==="mobile_gaming"?"Share your game screen":"Share your screen",liveMode==="mobile_gaming"?"Game screen":"Screen",false);
        if(error?.name!=="NotAllowedError"&&error?.name!=="AbortError")toast(error.message||"Could not share your screen.");
      }finally{screenShareControl.disabled=false;}
    });
    $("#live-chat-list")?.addEventListener("click",async event=>{
      const deleteButton=event.target?.closest?.("[data-live-chat-delete]");
      if(deleteButton&&(role==="host"||Boolean(session.liveModerators?.includes(state.user?.id)))){
        const messageId=String(deleteButton.dataset.liveChatDelete||"");
        if(!messageId)return;
        if(!window.confirm("Remove this comment from the LIVE chat?"))return;
        deleteButton.disabled=true;
        try{
          await api("/live/sessions/"+encodeURIComponent(session.id)+"/chat/"+encodeURIComponent(messageId),{method:"DELETE"});
          if(activeLivePinnedComment?.id===messageId){
            try{
              const packet={type:"minglora.live.pin",version:1,action:"unpin",messageId};
              await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(packet)),{reliable:true,topic:"minglora-live-pin"});
              renderLivePinnedComment(null);
            }catch(error){console.warn("[Minglora LIVE] Removed pinned comment but could not broadcast unpin.",error?.message||error);}
          }
          toast("LIVE comment removed.");
          await refreshLiveChat(session.id);
        }catch(error){toast(error.message||"This comment could not be removed.");deleteButton.disabled=false;}
        return;
      }
      const button=event.target?.closest?.("[data-live-chat-pin]");
      if(!button||role!=="host")return;
      const line=button.closest(".live-chat-line");
      if(!line)return;
      const messageId=String(button.dataset.liveChatPin||"");
      const messageBody=String(line.querySelector("span")?.textContent||"").trim();
      const author=String(line.querySelector("strong")?.textContent||"Member").trim();
      if(!messageId||!messageBody)return;
      const unpin=activeLivePinnedComment?.id===messageId;
      const packet=unpin
        ?{type:"minglora.live.pin",version:1,action:"unpin",messageId}
        :{type:"minglora.live.pin",version:1,action:"pin",messageId,body:messageBody,author};
      button.disabled=true;
      try{
        await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(packet)),{reliable:true,topic:"minglora-live-pin"});
        renderLivePinnedComment(unpin?null:{id:messageId,body:messageBody,author});
      }catch(error){toast(error.message||"This comment could not be pinned.");}
      finally{button.disabled=false;}
    });
    const sendLiveLike=async()=>{
      const now=Date.now();
      if(now-lastLiveReactionSentAt<120)return;
      lastLiveReactionSentAt=now;
      try{
        const result=await api('/live/sessions/'+encodeURIComponent(session.id)+'/likes',{method:'POST',body:'{}'});
        const counter=$("#live-reaction-count");
        if(counter&&Number.isFinite(Number(result.likeCount))){counter.dataset.count=String(Math.max(0,Number(result.likeCount)));counter.textContent=liveCompactCount(result.likeCount);}
        if(result.accepted===false)return;
        const likeButton=$('#live-heart-like');
        if(likeButton){likeButton.classList.add('is-liked');likeButton.setAttribute('aria-pressed','true');}
        const packet=new TextEncoder().encode(JSON.stringify({type:"minglora.live.reaction",version:1,reaction:"heart",likeCount:result.likeCount}));
        await room.localParticipant.publishData(packet,{reliable:false,topic:"minglora-live-reaction"});
        showLiveReaction("heart",{count:false});
      }catch(error){toast(error.message||"LIVE likes could not be sent right now.");}
    };
    $('#live-heart-like')?.addEventListener('click',()=>void sendLiveLike());
    $('[data-live-profile-preview]')?.addEventListener('click',event=>openLiveProfilePreview(event.currentTarget.dataset.liveProfilePreview,session));
    $('#live-follow-host')?.addEventListener('click',async event=>{
      const button=event.currentTarget,following=button.getAttribute('aria-pressed')==='true';
      button.disabled=true;
      try{
        const result=await api('/users/'+encodeURIComponent(session.hostId)+'/follow',{method:following?'DELETE':'POST',body:'{}'});
        session.host=session.host||{};session.host.following=!following;
        const status=liveFanClubState||{};status.following=!following;renderLiveFanClubStatus(status);
        button.setAttribute('aria-pressed',String(!following));button.textContent=!following?(result.friends?'Friends':'Following'):'Follow';
        toast(!following?'Now following '+(session.host.name||'the host')+'.':'Unfollowed the LIVE host.');
      }catch(error){toast(error.message||'The follow could not be updated.');}
      finally{button.disabled=false;}
    });
    $('#live-fan-club-join')?.addEventListener('click',()=>void joinLiveHostFanClub(session));
    $('#live-fan-club-join-panel')?.addEventListener('click',()=>void joinLiveHostFanClub(session));
    $('#live-team-gifts-open')?.addEventListener('click',()=>{
      if(!liveFanClubState?.isMember){toast('Join the host Fan Club to unlock Team Gifts.');return;}
      openLiveToolsPanel('#live-gift-panel');$('#live-gift-scope-team')?.click();
    });
    $('#live-chat-emoji')?.addEventListener('click',()=>$('#live-chat-emoji-picker')?.classList.toggle('hidden'));
    $('#live-chat-emoji-picker')?.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-live-chat-emoji]');if(!button)return;
      const input=$('#live-chat-form input[name="body"]');if(!input)return;
      const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
      input.value=input.value.slice(0,start)+button.dataset.liveChatEmoji+input.value.slice(end);
      input.focus();input.setSelectionRange(start+button.dataset.liveChatEmoji.length,start+button.dataset.liveChatEmoji.length);
      $('#live-chat-emoji-picker')?.classList.add('hidden');
    });
    stage?.addEventListener("click",event=>{
      const interactiveTarget=event.target?.closest?.("button,a,input,textarea,select,[contenteditable='true'],[role='button'],.live-stage-topbar,.live-chat-form,.live-tools-drawer");
      if(interactiveTarget)return;
      void sendLiveLike();
    });
    $("#live-settings-toggle")?.addEventListener("click",()=>{
      const backdrop=$("#live-tools-backdrop");
      if(backdrop&&!backdrop.classList.contains("hidden"))closeLiveToolsPanel();
      else openLiveToolsPanel();
    });
    $("#live-chat-toggle")?.addEventListener("click",()=>toggleLiveChatView());
    $("#live-fullscreen-chat-tab")?.addEventListener("click",()=>{
      const backdrop=$("#live-tools-backdrop");
      if(backdrop&&!backdrop.classList.contains("hidden"))closeLiveToolsPanel({returnTo:"chat"});
      else showFullscreenChat();
    });
    $("#live-fullscreen-tools-tab")?.addEventListener("click",()=>openLiveToolsPanel());
    $("#live-guests-toggle")?.addEventListener("click",()=>openLiveToolsPanel("#live-speaker-request-panel"));
    $("#live-stage-gift-open")?.addEventListener("click",()=>openLiveToolsPanel("#live-gift-panel"));
    $("#live-guest-layout")?.addEventListener("click",event=>{if(event.target?.closest?.("[data-open-guest-panel]"))openLiveToolsPanel("#live-speaker-request-panel");});
    $("#live-gifts-toggle")?.addEventListener("click",()=>openLiveToolsPanel("#live-gift-panel"));
    $("#live-tools-close")?.addEventListener("click",closeLiveToolsPanel);
    $("#live-tools-backdrop")?.addEventListener("click",event=>{if(event.target?.id==="live-tools-backdrop")closeLiveToolsPanel();});
    $("#live-tools-drawer")?.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();closeLiveToolsPanel();}});
    $("#live-tools-drawer")?.querySelectorAll("[data-live-tools-panel-target]").forEach(button=>button.addEventListener("click",()=>activateLiveToolsPanel(button.dataset.liveToolsPanelTarget)));
    $("#live-layout-options")?.addEventListener("click",async event=>{
      const button=event.target?.closest?.('[data-live-screen-layout]');
      if(!button||role!=="host"||button.disabled)return;
      const nextLayout=String(button.dataset.liveScreenLayout||'');
      if(!LIVE_SCREEN_LAYOUT_OPTIONS.some(option=>option.value===nextLayout))return;
      $("#live-layout-options")?.querySelectorAll('button').forEach(item=>item.disabled=true);
      const status=$("#live-layout-status");
      try{
        await api("/live/sessions/"+encodeURIComponent(session.id)+"/layout",{method:"PATCH",body:JSON.stringify({layout:nextLayout})});
        session.liveLayout=nextLayout;activeLiveSession.liveLayout=nextLayout;applyLiveScreenLayout(nextLayout);renderLiveGuestLayout(room,role,session,activeLiveSpeakerIds);
        const packet=new TextEncoder().encode(JSON.stringify({type:"minglora.live.layout",version:1,layout:nextLayout}));
        await room.localParticipant.publishData(packet,{reliable:true,topic:"minglora-live-layout"});
        const label=LIVE_SCREEN_LAYOUT_OPTIONS.find(option=>option.value===nextLayout)?.label||'Grid';
        if(status)status.textContent=label+' layout is now live for everyone.';
      }catch(error){
        applyLiveScreenLayout(session.liveLayout||'grid');renderLiveGuestLayout(room,role,session,activeLiveSpeakerIds);
        if(status)status.textContent='Layout could not be synchronized. '+(error.message||'Try again.');
        toast(error.message||'The LIVE layout could not be changed.');
      }finally{$("#live-layout-options")?.querySelectorAll('button').forEach(item=>item.disabled=false);}
    });
    $("#live-tools-drawer")?.addEventListener('change',async event=>{
      const input=event.target?.closest?.('[data-live-room-setting]');if(!input||role!=='host')return;
      const key=input.dataset.liveRoomSetting;
      const fallbackDefault=['autoAcceptRequests','prioritizeGifters'].includes(key)?false:true;
      const previous=Boolean(activeLiveSession?.liveSettings?.[key]??fallbackDefault);
      input.disabled=true;
      try{
        const saved=await api('/live/sessions/'+encodeURIComponent(session.id)+'/settings',{method:'PATCH',body:JSON.stringify({settings:{[key]:input.checked}})});
        activeLiveSession.liveSettings={...(activeLiveSession.liveSettings||{}),...(saved.liveSettings||{})};
        session.liveSettings={...(session.liveSettings||{}),...(saved.liveSettings||{})};
        if((key==='guestCamera'||key==='guestStageEnabled')&&room.localParticipant?.publishData){
          const packet=new TextEncoder().encode(JSON.stringify({type:'minglora.live.setting',version:1,setting:key,enabled:input.checked}));
          try{await room.localParticipant.publishData(packet,{reliable:true,topic:'minglora-live-setting'});}
          catch(error){console.warn('[Minglora LIVE] Saved room setting but could not notify connected viewers.',error?.message||error);}
        }
        if(key==='guestStageEnabled'){
          const stateLabel=$('#live-guest-stage-state');if(stateLabel)stateLabel.textContent=input.checked?'ON':'OFF';
          await refreshLiveSpeakerPanel(session,role,room);
          if(saved.guestStage?.removalFailures)toast('Guest stage is OFF. '+saved.guestStage.removalFailures+' connected guest(s) could not be removed immediately; guest reconnects are blocked.');
          else if(input.checked){
            const requestsAllowed=activeLiveSession.liveSettings?.allowGuestRequests!==false&&activeLiveSession.liveSettings?.allowCoHost!==false;
            toast(requestsAllowed?'Guest stage enabled. Viewers can request to join.':'Guest stage enabled, but requests remain disabled by the guest-request or co-host permission.');
          }else toast('Guest stage disabled. Pending requests and approvals were cleared; connected guests were disconnected where possible.');
          return;
        }
        if(key==='manageModerators')$('#live-moderator-panel')?.classList.toggle('hidden',!input.checked);
        if(key==='prioritizeGifters')await refreshLiveSpeakerPanel(session,role,room);
        toast((input.checked?'Enabled ':'Disabled ')+input.closest('label')?.querySelector('strong')?.textContent+'.');
      }catch(error){input.checked=previous;toast(error.message||'The LIVE setting could not be updated.');}
      finally{input.disabled=false;}
    });
    $("#live-room-theme-select")?.addEventListener("change",async event=>{
      const control=event.currentTarget,nextTheme=String(control.value||"");
      if(role!=="host"||!LIVE_ROOM_THEME_OPTIONS.some(option=>option.value===nextTheme)){control.value=activeLiveSession?.liveTheme||liveTheme;return;}
      control.disabled=true;
      try{
        await api("/live/sessions/"+encodeURIComponent(session.id)+"/theme",{method:"PATCH",body:JSON.stringify({liveTheme:nextTheme})});
        const player=$(".live-player-shell");
        if(player){
          player.classList.remove(...LIVE_ROOM_THEME_OPTIONS.map(option=>"live-theme-"+option.value));
          player.classList.add("live-theme-"+nextTheme);
        }
        activeLiveSession.liveTheme=nextTheme;
        toast("LIVE room appearance updated.");
      }catch(error){control.value=activeLiveSession?.liveTheme||liveTheme;toast(error.message);}
      finally{control.disabled=false;}
    });
    $("#live-share-toggle")?.addEventListener("click",async()=>{
      const shareUrl=new URL(window.location.pathname,window.location.origin);
      shareUrl.searchParams.set("minglora-push","live");
      shareUrl.searchParams.set("liveSessionId",session.id);
      const url=shareUrl.toString();
      if(typeof navigator.share==="function"){
        try{await navigator.share({title:session.title||"Minglora LIVE",text:"Join me on Minglora LIVE.",url});return;}
        catch(error){if(error?.name==="AbortError")return;}
      }
      try{
        if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast("LIVE link copied. Share it with your community.");return;}
        const field=document.createElement("textarea");field.value=url;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";document.body.append(field);field.select();
        const copied=document.execCommand("copy");field.remove();
        toast(copied?"LIVE link copied. Share it with your community.":"Copy this LIVE link: "+url);
      }catch(error){toast("Share this LIVE link: "+url);}
    });
    $("#live-leave")?.addEventListener("click",async()=>{
      if(role==="host"&&!window.confirm("End this LIVE for everyone? The broadcast will close and disappear from Live now."))return;
      const button=$("#live-leave");if(button)button.disabled=true;
      try{
        if(role==="host")await endHostedLiveSession(session);
        else await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"});
      }catch(error){
        toast(error.message);
        if(button)button.disabled=false;
        return;
      }
      closeLiveToolsPanel();renderLivePinnedComment(null);stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();stopLiveGiftEvents();stopLiveRewardRefresh();stopLiveFanClubHeartbeat();stopLiveMatchRefresh();stopLiveViewerRefresh();closeLiveProfilePreview();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-back")?.addEventListener("click",async()=>{
      if(role==="host"){toast("End your LIVE session before returning to the directory.");return;}
      await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});
      closeLiveToolsPanel();renderLivePinnedComment(null);stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();stopLiveRewardRefresh();stopLiveFanClubHeartbeat();stopLiveMatchRefresh();stopLiveViewerRefresh();closeLiveProfilePreview();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-chat-form")?.addEventListener("submit",async event=>{
      event.preventDefault();const form=event.currentTarget,body=String(form.elements.body.value||"").trim();if(!body)return;
      const button=form.querySelector("button");button.disabled=true;
      try{await api("/live/sessions/"+encodeURIComponent(session.id)+"/chat",{method:"POST",body:JSON.stringify({body})});form.reset();await refreshLiveChat(session.id);}
      catch(error){toast(error.message);}finally{button.disabled=false;}
    });
    {
      const giftGrid=$("#live-gift-grid");
      const liveGiftSearch=$("#live-gift-search");
      const liveGiftMore=$("#live-gift-more");
      const liveGiftSortControl=$("#live-gift-sort");
      const liveGiftCategories=$("#live-gift-categories");
      const liveGiftPreview=$("#live-gift-selected-preview");
      const liveGiftPreviewArt=$("#live-gift-preview-art");
      const liveGiftPreviewName=$("#live-gift-preview-name");
      const liveGiftPreviewPrice=$("#live-gift-preview-price");
      const liveGiftPreviewNote=$("#live-gift-preview-note");
      const liveGiftPreviewSound=$("#live-gift-preview-sound");
      const liveGiftSendSelected=$("#live-gift-send-selected");
      const liveGiftCount=$("#live-gift-count");
      const liveGiftPreferenceKey="minglora:live-gift-access:v1:"+String(state.user?.id||"member");
      let liveGiftVisible=48,liveGiftQuery="",liveGiftSort="high",liveGiftCategory="all",liveGiftCatalogueError=null,liveGiftSelectedCode="",liveGiftSending=false;
      let liveGiftFavorites=new Set(),liveGiftRecent=[];
      try{
        const stored=JSON.parse(localStorage.getItem(liveGiftPreferenceKey)||"{}");
        liveGiftFavorites=new Set(Array.isArray(stored.favorites)?stored.favorites.map(String):[]);
        liveGiftRecent=Array.isArray(stored.recent)?stored.recent.map(String).slice(0,40):[];
      }catch{}
      const saveLiveGiftPreferences=()=>{
        try{localStorage.setItem(liveGiftPreferenceKey,JSON.stringify({favorites:Array.from(liveGiftFavorites),recent:liveGiftRecent.slice(0,40)}));}catch{}
      };
      const liveGiftCategoryNames={flowers:"Flowers",hearts:"Love & hearts",animals:"Animals & creatures",vehicles:"Vehicles",music:"Music",sports:"Sports",food_drink:"Food & drinks",fashion_beauty:"Fashion & beauty",luxury:"Luxury",celebrations:"Celebrations",fantasy:"Fantasy & cosmic",nature:"Nature",travel:"Travel",games:"Games",community:"Community",symbols:"Symbols",everyday:"Everyday",reactions:"Reactions",seasonal:"Seasonal",jamaican_culture:"Jamaican culture",other:"More gifts"};
      const liveGiftCategoryName=key=>liveGiftCategoryNames[String(key||"").toLowerCase()]||String(key||"More gifts").replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase());
      const liveGiftByCode=code=>liveGiftCatalogue.find(item=>String(item.code)===String(code))||null;
      const drawLiveGiftCategories=()=>{
        if(!liveGiftCategories)return;
        let base=liveGiftCatalogue.filter(item=>{
          const teamGift=MINGLORA_FAN_CLUB_GIFT_CODES.includes(item.code);
          if(liveGiftScope==="team")return teamGift;
          if(liveGiftScope==="favorites")return liveGiftFavorites.has(String(item.code));
          if(liveGiftScope==="recent")return liveGiftRecent.includes(String(item.code));
          return true;
        });
        const names=[...new Set(base.map(item=>String(item.category||"other")))].sort((a,b)=>liveGiftCategoryName(a).localeCompare(liveGiftCategoryName(b)));
        if(liveGiftCategory!=="all"&&!names.includes(liveGiftCategory))liveGiftCategory="all";
        const chips=[{key:"all",label:"All categories"},...names.map(key=>({key,label:liveGiftCategoryName(key)}))];
        liveGiftCategories.innerHTML=chips.map(item=>"<button type='button' data-live-gift-category='"+esc(item.key)+"' class='"+(liveGiftCategory===item.key?"active":"")+"' aria-pressed='"+String(liveGiftCategory===item.key)+"'>"+esc(item.label)+"</button>").join("");
      };
      const updateLiveGiftPreview=()=>{
        const gift=liveGiftByCode(liveGiftSelectedCode);
        if(!liveGiftPreview)return;
        liveGiftPreview.hidden=!gift;
        if(!gift){
          if(liveGiftPreviewArt)liveGiftPreviewArt.innerHTML="<span aria-hidden='true'>🎁</span>";
          if(liveGiftPreviewName)liveGiftPreviewName.textContent="Choose a gift";
          if(liveGiftPreviewPrice)liveGiftPreviewPrice.textContent="";
          if(liveGiftPreviewNote)liveGiftPreviewNote.textContent="Preview the animation and sound before sending.";
          if(liveGiftPreviewSound)liveGiftPreviewSound.disabled=true;
          if(liveGiftSendSelected)liveGiftSendSelected.disabled=true;
          return;
        }
        if(liveGiftPreviewName)liveGiftPreviewName.textContent=gift.name||"Minglora Gift";
        if(liveGiftPreviewPrice)liveGiftPreviewPrice.textContent=Number(gift.coin_price||0).toLocaleString()+" Coins · "+liveGiftCategoryName(gift.category);
        if(liveGiftPreviewNote){
          const locked=role!=="host"&&MINGLORA_FAN_CLUB_GIFT_CODES.includes(gift.code)&&!liveFanClubState?.isMember;
          liveGiftPreviewNote.textContent=role==="host"?"Read-only host preview · viewers send this gift.":!giftsEnabled?"Gifting is disabled for this broadcast.":locked?"Join this host’s Fan Club to unlock this Team Gift.":"Preview the animation and sound, then send it to the LIVE host.";
        }
        if(liveGiftPreviewArt){
          const fallback=gift.image_url?"<img class='live-gift-preview-fallback' src='"+esc(gift.image_url)+"' alt='"+esc(gift.name||"Gift")+"' hidden>":"";
          const art=gift.model_url
            ?"<model-viewer id='live-gift-preview-model' class='live-gift-preview-model' src='"+esc(gift.model_url)+"' "+(gift.image_url?"poster='"+esc(gift.image_url)+"' ":"")+"camera-controls auto-rotate rotation-per-second='22deg' interaction-prompt='none' shadow-intensity='.65' exposure='1.1' alt='"+esc(gift.name||"Minglora gift")+"'></model-viewer>"+fallback
            :gift.image_url?"<img id='live-gift-preview-image' class='live-gift-preview-image' src='"+esc(gift.image_url)+"' alt='"+esc(gift.name||"Gift")+"'>":"<span class='live-gift-preview-emoji' aria-label='"+esc(gift.name||"Gift")+"'>"+esc(gift.emoji||"🎁")+"</span>";
          liveGiftPreviewArt.innerHTML=art;
          const model=liveGiftPreviewArt.querySelector("model-viewer");
          const fallbackImage=liveGiftPreviewArt.querySelector(".live-gift-preview-fallback");
          model?.addEventListener("error",()=>{if(fallbackImage)fallbackImage.hidden=false;model.hidden=true;});
        }
        if(liveGiftPreviewSound)liveGiftPreviewSound.disabled=false;
        const isTeamGift=MINGLORA_FAN_CLUB_GIFT_CODES.includes(gift.code);
        const locked=role!=="host"&&isTeamGift&&!liveFanClubState?.isMember;
        if(liveGiftSendSelected){
          liveGiftSendSelected.disabled=role==="host"||!giftsEnabled||locked||liveGiftSending;
          liveGiftSendSelected.textContent=role==="host"?"Viewer-only preview":locked?"Join Fan Club to unlock":!giftsEnabled?"Gifting unavailable":"Quick send · "+Number(gift.coin_price||0).toLocaleString()+" Coins";
        }
      };
      const drawLiveGiftGrid=()=>{
        if(!giftGrid)return;
        if(liveGiftCatalogueError){
          giftGrid.innerHTML="<div class='live-gift-empty'><strong>Gifts could not be loaded</strong><p>"+esc(liveGiftCatalogueError)+"</p><button type='button' class='secondary' id='live-gift-retry'>Retry gift catalogue</button></div>";
          liveGiftMore&&(liveGiftMore.hidden=true);
          liveGiftCount&&(liveGiftCount.textContent="Gift catalogue unavailable");
          giftGrid.querySelector("#live-gift-retry")?.addEventListener("click",()=>void loadLiveGiftCatalogue());
          updateLiveGiftPreview();
          return;
        }
        if(!liveGiftCatalogue.length){
          giftGrid.innerHTML="<div class='live-gift-empty'><strong>No gifts are available right now</strong><p>Minglora could not find any published gifts in the live catalogue.</p></div>";
          liveGiftMore&&(liveGiftMore.hidden=true);
          liveGiftCount&&(liveGiftCount.textContent="0 gifts");
          giftGrid.querySelector("#live-gift-retry")?.addEventListener("click",()=>void loadLiveGiftCatalogue());
          updateLiveGiftPreview();
          return;
        }
        drawLiveGiftCategories();
        const query=liveGiftQuery.trim().toLowerCase();
        const filtered=liveGiftCatalogue.filter(item=>{
          const code=String(item.code||"");
          const teamGift=MINGLORA_FAN_CLUB_GIFT_CODES.includes(code);
          const inScope=liveGiftScope==="team"?teamGift:liveGiftScope==="favorites"?liveGiftFavorites.has(code):liveGiftScope==="recent"?liveGiftRecent.includes(code):true;
          const inCategory=liveGiftCategory==="all"||String(item.category||"other")===liveGiftCategory;
          const terms=[item.name,item.category,liveGiftCategoryName(item.category),item.code,item.coin_price].map(value=>String(value??"")).join(" ").toLowerCase();
          return inScope&&inCategory&&(!query||terms.includes(query));
        });
        filtered.sort((a,b)=>liveGiftSort==="name"
          ?String(a.name||"").localeCompare(String(b.name||""))
          :liveGiftSort==="low"
            ?Number(a.coin_price)-Number(b.coin_price)||String(a.name||"").localeCompare(String(b.name||""))
            :Number(b.asset_version==="2")-Number(a.asset_version==="2")||Number(b.coin_price)-Number(a.coin_price)||String(a.name||"").localeCompare(String(b.name||"")));
        const shown=filtered.slice(0,liveGiftVisible);
        if(liveGiftCount)liveGiftCount.textContent=filtered.length.toLocaleString()+" gifts"+(liveGiftScope==="favorites"?" · Favorites":liveGiftScope==="recent"?" · Recently sent":liveGiftScope==="team"?" · Team Gifts":"");
        giftGrid.innerHTML=shown.length?shown.map(gift=>{
          const code=String(gift.code||"");
          const art=gift.image_url?"<img class='live-gift-image' loading='lazy' decoding='async' src='"+esc(gift.image_url)+"' alt='Original Minglora artwork: "+esc(gift.name||"Gift")+"'>":"<span class='live-gift-card-emoji'>"+esc(gift.emoji||"🎁")+"</span>";
          const teamGift=MINGLORA_FAN_CLUB_GIFT_CODES.includes(code);
          const locked=role!=="host"&&teamGift&&!liveFanClubState?.isMember;
          const favorite=liveGiftFavorites.has(code);
          const selected=liveGiftSelectedCode===code;
          return "<article class='live-gift-card-shell "+(selected?"is-selected ":"")+(teamGift?"is-team-gift ":"")+(locked?"is-locked":"")+"'><button type='button' class='live-gift-pick-button' data-live-gift-select='"+esc(code)+"' aria-pressed='"+String(selected)+"' aria-label='Preview "+esc(gift.name||"gift")+"'><span class='live-gift-model-slot'>"+art+"</span><strong>"+esc(gift.name||"Gift")+(teamGift?" ♥":"")+"</strong><small>"+Number(gift.coin_price||0).toLocaleString()+" Coins</small></button><button type='button' class='live-gift-favorite-toggle "+(favorite?"is-favorite":"")+"' data-live-gift-favorite='"+esc(code)+"' aria-pressed='"+String(favorite)+"' aria-label='"+(favorite?"Remove ":"Add ")+esc(gift.name||"gift")+" "+(favorite?"from":"to")+" favourites'>"+(favorite?"★":"☆")+"</button>"+(locked?"<span class='live-gift-lock-label'>Fan Club</span>":"")+"</article>";
        }).join(""):"<div class='live-gift-empty'><strong>"+(liveGiftScope==="favorites"?"No favourite gifts yet":liveGiftScope==="recent"?"No recently sent gifts yet":"No gifts match your filters")+"</strong><p>"+(liveGiftScope==="favorites"?"Tap the star on any gift to save it here.":liveGiftScope==="recent"?"Gifts you send in LIVE will appear here for quick access.":"Try another name, category, or coin amount.")+"</p></div>";
        if(liveGiftMore){liveGiftMore.hidden=shown.length>=filtered.length;liveGiftMore.textContent="Show more gifts · "+Math.max(0,filtered.length-shown.length).toLocaleString()+" remaining";}
        updateLiveGiftPreview();
      };
      const loadLiveGiftCatalogue=async()=>{
        if(giftGrid)giftGrid.innerHTML="<p class='muted'>Loading original Minglora gifts…</p>";
        liveGiftCatalogueError=null;
        const results=await Promise.allSettled([
          api("/coins/catalog"),
          role!=="host"?api("/coins/wallet"):Promise.resolve({wallet:null}),
          role!=="host"?api("/coins/promotional-gift-wallet"):Promise.resolve({wallet:null})
        ]);
        if(results[0].status!=="fulfilled"){
          liveGiftCatalogueError=results[0].reason?.message||"The gift catalogue is temporarily unavailable.";
          liveGiftCatalogue=[];
        }else{
          liveGiftCatalogue=Array.isArray(results[0].value?.gifts)?results[0].value.gifts:[];
          if(!liveGiftByCode(liveGiftSelectedCode))liveGiftSelectedCode=String(liveGiftCatalogue[0]?.code||"");
        }
        const wallet=results[1].status==="fulfilled"?results[1].value:{wallet:null};
        const promotionalWallet=results[2].status==="fulfilled"?(results[2].value.wallet||{}):{};
        const promotionalNote=$("#live-promo-fund-availability");
        if(promotionalNote)promotionalNote.textContent="Promotional wallet: "+Number(promotionalWallet.promotionalCoins||0).toLocaleString()+" Coins · cash reserve available: USD "+(Number(promotionalWallet.availableMinor||0)/100).toFixed(2)+". Gifts are rejected when the reserve is insufficient.";
        const walletBalance=$("#live-wallet-balance");
        if(walletBalance&&role!=="host")walletBalance.textContent=wallet.wallet&&wallet.wallet.balance_coins!=null?Number(wallet.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable";
        drawLiveGiftGrid();
      };
      refreshLiveGiftGrid=drawLiveGiftGrid;
      document.querySelectorAll("[data-live-gift-scope]").forEach(button=>button.addEventListener("click",()=>{
        if(button.dataset.liveGiftScope==="team"&&role!=="host"&&!liveFanClubState?.isMember){toast("Join the host Fan Club to unlock Team Gifts.");return;}
        liveGiftScope=button.dataset.liveGiftScope;
        liveGiftCategory="all";liveGiftVisible=48;
        document.querySelectorAll("[data-live-gift-scope]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));});
        const note=$("#live-gift-team-note");if(note)note.hidden=liveGiftScope!=="team";
        drawLiveGiftGrid();
      }));
      liveGiftCategories?.addEventListener("click",event=>{
        const button=event.target.closest("[data-live-gift-category]");if(!button)return;
        liveGiftCategory=button.dataset.liveGiftCategory||"all";liveGiftVisible=48;drawLiveGiftGrid();
      });
      giftGrid?.addEventListener("click",event=>{
        const favoriteButton=event.target.closest("[data-live-gift-favorite]");
        if(favoriteButton){
          const code=String(favoriteButton.dataset.liveGiftFavorite||"");
          if(liveGiftFavorites.has(code))liveGiftFavorites.delete(code);else liveGiftFavorites.add(code);
          saveLiveGiftPreferences();drawLiveGiftGrid();return;
        }
        const selectButton=event.target.closest("[data-live-gift-select]");if(!selectButton)return;
        liveGiftSelectedCode=String(selectButton.dataset.liveGiftSelect||"");drawLiveGiftGrid();
      });
      liveGiftSearch?.addEventListener("input",()=>{liveGiftQuery=liveGiftSearch.value;liveGiftVisible=48;drawLiveGiftGrid();});
      liveGiftSortControl?.addEventListener("change",()=>{liveGiftSort=liveGiftSortControl.value;liveGiftVisible=48;drawLiveGiftGrid();});
      liveGiftMore?.addEventListener("click",()=>{liveGiftVisible+=48;drawLiveGiftGrid();});
      liveGiftPreviewSound?.addEventListener("click",()=>{
        const gift=liveGiftByCode(liveGiftSelectedCode);if(!gift)return;
        window.MingloraGiftFX?.preview(gift);
      });
      liveGiftSendSelected?.addEventListener("click",async()=>{
        const gift=liveGiftByCode(liveGiftSelectedCode);
        if(!gift||liveGiftSending||role==="host"||!giftsEnabled)return;
        const teamGift=MINGLORA_FAN_CLUB_GIFT_CODES.includes(gift.code);
        if(teamGift&&!liveFanClubState?.isMember){toast("Join the host Fan Club to unlock Team Gifts.");return;}
        liveGiftSending=true;window.MingloraGiftFX?.prime();updateLiveGiftPreview();
        if(liveGiftSendSelected){liveGiftSendSelected.disabled=true;liveGiftSendSelected.textContent="Sending gift…";}
        try{
          const fundingSource=String($("#live-gift-funding-source")?.value||"cash");
          const sent=fundingSource==="cash"
            ?await api("/live/sessions/"+encodeURIComponent(session.id)+"/gifts",{method:"POST",body:JSON.stringify({giftCode:gift.code})})
            :await api("/live/sessions/"+encodeURIComponent(session.id)+"/gifts",{method:"POST",body:JSON.stringify({giftCode:gift.code,fundingSource})});
          const resultGift=sent.gift||{};
          const transactionId=sent.event?.id||sent.giftEventId||resultGift.giftTransactionId||resultGift.transactionId||resultGift.transaction_id||resultGift.id;
          presentLiveGiftEvent(sent.event||{
            id:String(transactionId||""),
            broadcastId:session.id,
            giftCode:String(resultGift.giftCode||gift.code),
            giftName:String(resultGift.giftName||resultGift.name||gift.name||"Minglora Gift"),
            coinAmount:Number(resultGift.coinAmount||resultGift.coin_amount||gift.coin_price||0),
            emoji:String(resultGift.emoji||gift.emoji||"🎁"),
            imageUrl:String(resultGift.imageUrl||resultGift.image_url||gift.image_url||""),
            modelUrl:String(resultGift.modelUrl||resultGift.model_url||gift.model_url||""),
            createdAt:new Date().toISOString(),
            sender:{id:state.user?.id,name:state.user?.name,username:state.user?.username},
            recipient:{id:session.hostId,name:session.host?.name||"LIVE host",username:session.host?.username||""}
          });
          liveGiftRecent=[gift.code,...liveGiftRecent.filter(code=>code!==gift.code)].slice(0,40);saveLiveGiftPreferences();
          const giftFundingNotice=resultGift.fundingSource==="promo"?" · ordinary promotional Coins (no cash earnings)":resultGift.fundingSource==="admin_promotional"?" · cash-reserved Admin Promotional gift":"";
          toast((resultGift.emoji||"🎁")+" "+(resultGift.giftName||gift.name)+" sent · "+Number(resultGift.coinAmount||gift.coin_price||0).toLocaleString()+" Minglora Coins"+giftFundingNotice);
          const [walletResult,promoResult]=await Promise.allSettled([api("/coins/wallet"),api("/coins/promotional-gift-wallet")]);
          const balanceElement=$("#live-wallet-balance");
          if(balanceElement)balanceElement.textContent=walletResult.status==="fulfilled"&&walletResult.value.wallet?.balance_coins!=null?Number(walletResult.value.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable";
          if(promoResult.status==="fulfilled"&&$("#live-promo-fund-availability")){
            const promo=promoResult.value.wallet||{};
            $("#live-promo-fund-availability").textContent="Promotional wallet: "+Number(promo.promotionalCoins||0).toLocaleString()+" Coins · cash reserve available: USD "+(Number(promo.availableMinor||0)/100).toFixed(2)+".";
          }
          if(liveGiftScope==="recent"){liveGiftVisible=48;drawLiveGiftGrid();}
        }catch(error){toast(error.message);}
        finally{liveGiftSending=false;updateLiveGiftPreview();}
      });
      $("#live-recharge")?.addEventListener("click",()=>activateNav("coins"));
      await loadLiveGiftCatalogue();
      startLiveGiftEvents(session);
    }
    if(liveSettings.groupChatEnabled!==false){await refreshLiveChat(session.id);liveChatRefreshTimer=setInterval(()=>refreshLiveChat(session.id),5000);}
    startLiveSpeakerRefresh(session,role,room);
    if(role==="host")toast(broadcastType==="audio_only"?"You are LIVE in Audio Only mode. Your camera was not requested.":"You are LIVE. Your camera and microphone are connected.");
    else if(role==="guest")toast(broadcastType==="audio_only"?"You're on stage. Your microphone is connected; audio-only LIVE does not use a camera.":"You're on stage. Your microphone and camera are connected.");
  }catch(error){
    stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();stopLiveGiftEvents();await room.disconnect().catch(()=>{});activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;
    if(role==="host")await api("/live/sessions/"+encodeURIComponent(session.id)+"/end",{method:"POST",body:"{}"}).catch(()=>{});
    else await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});
    if(state.view==='live'){
      setContent("<section class='card empty-state'><div class='empty-icon'>📡</div><h3>LIVE connection failed</h3><p>"+esc(error.message||'Minglora could not connect to the LIVE room.')+"</p><button class='primary' id='retry-live-connection'>Try again</button><button class='secondary' id='back-live-directory'>Back to LIVE</button></section>");
      $('#retry-live-connection')?.addEventListener('click',()=>{
        if(role==='host'){renderLive();return;}
        openLiveRoom(session,'viewer').catch(err=>toast(err.message));
      });
      $('#back-live-directory')?.addEventListener('click',()=>renderLive());
    }
    throw error;
  }
}

async function renderCoins(){
  activateSilent("coins");
  const activeTab=state.rechargeTab==="earnings"?"earnings":state.rechargeTab==="exchange"?"exchange":"recharge";
  const walletResults=await Promise.allSettled([
    activeTab==="recharge"?api("/coins/catalog"):Promise.resolve({packages:[]}),
    api("/coins/wallet"),
    api("/creator/earnings")
  ]);
  if(activeTab==="recharge"&&walletResults[0].status==="rejected")throw walletResults[0].reason;
  const catalog=walletResults[0].status==="fulfilled"?walletResults[0].value||{}:{};
  const wallet=walletResults[1].status==="fulfilled"?walletResults[1].value:{wallet:null,ledger:[]};
  const earnings=walletResults[2].status==="fulfilled"?walletResults[2].value:null;
  const earningsError=walletResults[2].status==="rejected"?(walletResults[2].reason?.message||"Your money earnings are unavailable."):null;
  const balance=Number(wallet.wallet?.balance_coins||0);
  const packages=Array.isArray(catalog.packages)?catalog.packages:[];
  const cashBackedBalance=Number(wallet.wallet?.cash_balance_coins||0);
  const marketingBackedBalance=Number(wallet.wallet?.marketing_balance_coins||0);
  const promoBalance=Number(wallet.wallet?.promo_balance_coins||0);
  const giftBalance=earnings?.giftBalance||{};
  const moneyOverview=earnings
    ?"<section class='wallet-money-overview'><div class='wallet-money-overview-heading'><div><span class='eyebrow'>REAL MONEY EARNINGS</span><strong>Your Minglora money balance</strong><small>Money earned is separate from Minglora Coins.</small></div><button type='button' data-recharge-tab='earnings'>View earnings details ↗</button></div><div class='wallet-money-stat'><small>LIFETIME EARNED</small><strong>"+creatorMoney(earnings.earnedMinor||0)+"</strong><span>Your eligible creator share and subscription earnings</span></div><div class='wallet-money-stat'><small>AVAILABLE MONEY</small><strong>"+creatorMoney(earnings.availableMinor||0)+"</strong><span>Currently available after payouts and Coin exchanges</span></div><div class='wallet-money-stat'><small>NON-CASH PROMOTIONAL SHARE</small><strong>" + creatorMoney(earnings.promotionalGiftEarningsExcludedMinor||0) + "</strong><span>Historical promotional gift activity · excluded from withdrawals</span></div><div class='wallet-money-stat'><small>GIFT COINS RECEIVED</small><strong>"+Number(giftBalance.receivedCoins||0).toLocaleString()+"</strong><span>"+Number(giftBalance.giftCount||0).toLocaleString()+" gifts recorded · see Earnings for details</span></div></section>"
    :"<section class='wallet-money-overview wallet-money-unavailable'><div><span class='eyebrow'>REAL MONEY EARNINGS</span><strong>Money balance unavailable</strong><small>"+esc(earningsError||"Minglora could not load your money balance.")+"</small></div><button type='button' data-recharge-tab='earnings'>Open earnings details</button></section>";
  const header="<header class='recharge-page-heading'><div><span class='eyebrow'>MINGLORA WALLET</span><h1>Wallet &amp; earnings</h1><p class='muted'>See your real money earnings and Minglora Coins in separate balances.</p></div><div class='coin-balance-card'><small>COIN BALANCE</small><strong>"+(wallet.wallet&&wallet.wallet.balance_coins!=null?balance.toLocaleString():"—")+"</strong><span>Minglora Coins</span></div><div class='coin-source-breakdown' aria-label='Coin balance by funding source'><span><small>Cash-backed</small><strong>"+cashBackedBalance.toLocaleString()+"</strong><em>Purchased or earnings-exchanged</em></span><span><small>Marketing-funded</small><strong>"+marketingBackedBalance.toLocaleString()+"</strong><em>Reserved from funded campaigns</em></span><span><small>Promotional</small><strong>"+promoBalance.toLocaleString()+"</strong><em>Non-cash rewards and admin credits</em></span></div></header>";
  const tabs="<nav class='recharge-tabs' aria-label='Wallet actions'><button type='button' data-recharge-tab='recharge' class='"+(activeTab==="recharge"?"active":"")+"' aria-current='"+(activeTab==="recharge"?"page":"false")+"'>Recharge</button><button type='button' data-recharge-tab='earnings' class='"+(activeTab==="earnings"?"active":"")+"' aria-current='"+(activeTab==="earnings"?"page":"false")+"'>Earnings</button><button type='button' data-recharge-tab='exchange' class='"+(activeTab==="exchange"?"active":"")+"' aria-current='"+(activeTab==="exchange"?"page":"false")+"'>Exchange</button></nav>";
  const bindTabs=()=>{
    document.querySelectorAll("[data-recharge-tab]").forEach(button=>button.addEventListener("click",()=>{
      const destination=button.dataset.rechargeTab;
      state.rechargeTab=destination==="earnings"||destination==="exchange"?destination:"recharge";
      renderCoins().catch(error=>setContent("<section class='card empty-state'><h2>Wallet could not load</h2><p>"+esc(error.message)+"</p><button class='secondary' id='recharge-retry'>Try again</button></section>"));
    }));
  };

  if(activeTab==="earnings"){
    if(earningsError||!earnings){
      setContent("<div class='recharge-page'>"+header+moneyOverview+tabs+"<section class='card recharge-exchange-unavailable'><span class='eyebrow'>CREATOR EARNINGS</span><h2>Your earnings could not be loaded</h2><p class='muted'>"+esc(earningsError||"Minglora could not retrieve your money balance.")+"</p><button type='button' class='secondary' id='wallet-earnings-retry'>Try again</button></section></div>");
      bindTabs();
      $("#wallet-earnings-retry")?.addEventListener("click",()=>renderCoins().catch(error=>toast(error.message)));
      return;
    }

    const payouts=Array.isArray(earnings.payouts)?earnings.payouts:[];
    const ledger=Array.isArray(earnings.ledger)?earnings.ledger:[];
    const exchanges=Array.isArray(earnings.exchanges)?earnings.exchanges:[];
    const receivedGiftRows=Array.isArray(giftBalance.recent)?giftBalance.recent:[];
    const giftSourceLabels={
      cash:"Cash-backed",
      marketing:"Funded marketing",
      promo:"Promotional · non-cash",
      mixed:"Mixed funding",
      admin_promotional:"Cash-reserved Admin Promotional"
    };
    const giftReceiptRows=receivedGiftRows.length?receivedGiftRows.map(item=>{
      const date=item.createdAt?new Date(item.createdAt).toLocaleString():"Date unavailable";
      const sender=String(item.senderDisplayName||item.senderUsername||"Minglora member");
      const giftName=String(item.giftName||"Gift");
      const coinAmount=Number(item.coinAmount||0);
      const creatorShare=Number(item.creatorShareMinor||0);
      const earningsLabel=creatorShare>0
        ?"<b class='positive'>+"+creatorMoney(creatorShare)+" creator share</b>"
        :"<span class='muted'>No cash earnings · promotional Coins</span>";
      return "<article class='recharge-history-row'><div><strong>"+esc(item.giftEmoji||"🎁")+" "+esc(giftName)+"</strong><small>From "+esc(sender)+(item.senderUsername?" · @"+esc(item.senderUsername):"")+" · "+esc(date)+" · "+esc(giftSourceLabels[item.fundingSource]||"Gift")+"</small></div><span>"+coinAmount.toLocaleString()+" Coins</span>"+earningsLabel+"</article>";
    }).join(""):"<div class='recharge-empty'><strong>No gifts received yet</strong><p>Every confirmed LIVE or profile gift sent to you will appear here.</p></div>";
    const giftReceiptsContent=
      "<section class='card recharge-history-card wallet-received-gifts-card'><div class='recharge-section-heading'><div><span class='eyebrow'>GIFT RECEIPTS</span><h2>Gifts received</h2></div><span class='muted'>Latest 50</span></div>"+
      "<div class='recharge-exchange-metrics wallet-received-gift-metrics'>"+
      "<article><small>Total gifts</small><strong>"+Number(giftBalance.giftCount||0).toLocaleString()+"</strong><span>Confirmed gifts received</span></article>"+
      "<article><small>Gift Coins received</small><strong>"+Number(giftBalance.receivedCoins||0).toLocaleString()+"</strong><span>Activity total · not spendable wallet Coins</span></article>"+
      "<article><small>Backed gift Coins</small><strong>"+(Number(giftBalance.cashBackedCoins||0)+Number(giftBalance.marketingBackedCoins||0)+Number(giftBalance.adminPromotionalCoins||0)).toLocaleString()+"</strong><span>Eligible funding sources</span></article>"+
      "<article><small>Ordinary promotional</small><strong>"+Number(giftBalance.promotionalCoins||0).toLocaleString()+"</strong><span>Non-cash promotional gift value</span></article></div>"+
      "<div class='recharge-history-list'>"+giftReceiptRows+"</div>"+
      "<p class='recharge-exchange-note'>Received gifts are recorded here; gift Coins are not added to your spendable Coin wallet. Cash-backed, funded-marketing and separately cash-reserved Admin Promotional gifts create the eligible 50/50 creator share. Ordinary promotional Coins remain visible in gift history but do not create withdrawable earnings.</p></section>";
    const paidMinor=payouts.filter(item=>String(item.status||"").toLowerCase()==="paid")
      .reduce((total,item)=>total+Math.max(0,Number(item.amount_minor)||0),0);
    const pendingMinor=payouts.filter(item=>["requested","processing"].includes(String(item.status||"").toLowerCase()))
      .reduce((total,item)=>total+Math.max(0,Number(item.amount_minor)||0),0);
    const earningsRows=ledger.length?ledger.slice(0,100).map(item=>{
      const status=String(item.status||"available").replace(/_/g," ");
      const date=item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable";
      const source=String(item.funding_source||"cash")==="admin_promotional"?"Promotional gift":"Gift";
      return "<article class='recharge-history-row'><div><strong>"+source+" earnings · "+esc(status)+"</strong><small>"+esc(date)+" · 50% creator share</small></div><span>Gift value "+creatorMoney(item.gross_minor||0)+"</span><b class='positive'>+"+creatorMoney(item.creator_share_minor||0)+"</b></article>";
    }).join(""):"<div class='recharge-empty'><strong>No eligible gift earnings yet</strong><p>Money earned from qualifying Minglora gifts will appear here after the gift transaction is recorded.</p></div>";
    const payoutRows=payouts.length?payouts.map(item=>{
      const status=String(item.status||"unknown").replace(/_/g," ").toUpperCase();
      const date=item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable";
      return "<article class='recharge-history-row'><div><strong>"+esc(status)+"</strong><small>"+esc(date)+" · PayPal withdrawal</small></div><b>"+creatorMoney(item.amount_minor||0)+"</b></article>";
    }).join(""):"<div class='recharge-empty'><strong>No withdrawals yet</strong><p>Your payout requests and their latest recorded statuses will appear here.</p></div>";
    const exchangeRows=exchanges.length?exchanges.map(item=>{
      const date=item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable";
      return "<article class='recharge-history-row'><div><strong>Money exchanged for Coins</strong><small>"+esc(date)+"</small></div><b>"+creatorMoney(item.amount_minor||0)+"</b><span>+"+Number(item.coin_amount||0).toLocaleString()+" Coins</span></article>";
    }).join(""):"<div class='recharge-empty'><strong>No money exchanges yet</strong><p>Money converted into Minglora Coins will be listed here.</p></div>";
    const earningsContent=
      "<section class='recharge-exchange-intro'><div><span class='eyebrow'>YOUR CREATOR BALANCE</span><h2>Money earned on Minglora</h2><p>These are money amounts calculated from eligible creator earnings and recorded payouts—not Coin counts.</p></div><span class='recharge-exchange-mark' aria-hidden='true'>$</span></section>"+
      "<div class='recharge-exchange-metrics wallet-earnings-metrics'>"+
      "<article><small>Lifetime earned</small><strong>"+creatorMoney(earnings.earnedMinor||0)+"</strong><span>Your lifetime eligible creator share and net subscription earnings</span></article>"+
      "<article><small>Available money</small><strong>"+creatorMoney(earnings.availableMinor||0)+"</strong><span>Server-calculated amount currently available</span></article>"+
      "<article><small>Payouts in progress</small><strong>"+creatorMoney(pendingMinor)+"</strong><span>Requested or processing PayPal withdrawals</span></article>"+
      "<article><small>Already paid out</small><strong>"+creatorMoney(paidMinor)+"</strong><span>Withdrawals recorded as paid</span></article>"+
      "<article><small>Exchanged for Coins</small><strong>"+creatorMoney(earnings.exchangedMinor||0)+"</strong><span>Money converted into Minglora Coins</span></article></div>"+
      giftReceiptsContent+      "<div class='wallet-earnings-columns'><section class='card recharge-history-card'><div class='recharge-section-heading'><div><span class='eyebrow'>EARNINGS LEDGER</span><h2>Gift earnings</h2></div><span class='muted'>Latest entries</span></div><div class='recharge-history-list'>"+earningsRows+"</div></section>"+
      "<section class='card recharge-history-card'><div class='recharge-section-heading'><div><span class='eyebrow'>PAYOUT HISTORY</span><h2>Withdrawals</h2></div></div><div class='recharge-history-list'>"+payoutRows+"</div></section></div>"+
      "<section class='card recharge-history-card'><div class='recharge-section-heading'><div><span class='eyebrow'>MONEY CONVERSIONS</span><h2>Money exchanged for Coins</h2></div></div><div class='recharge-history-list'>"+exchangeRows+"</div></section>"+
      "<p class='recharge-exchange-note'>Your lifetime earned amount, available money, pending withdrawals, completed payouts and money exchanged for Coins are tracked separately. Coin purchases and promotional Coin credits are not displayed as cash earnings.</p>";
    setContent("<div class='recharge-page'>"+header+moneyOverview+tabs+earningsContent+"</div>");
    bindTabs();
    return;
  }

  if(activeTab==="exchange"){
    if(earningsError||!earnings){
      setContent("<div class='recharge-page'>"+header+moneyOverview+tabs+"<section class='card recharge-exchange-unavailable'><span class='eyebrow'>MONEY TO COINS</span><h2>Exchange is unavailable right now</h2><p class='muted'>"+esc(earningsError||"Minglora could not load your available money balance.")+"</p><button type='button' class='secondary' id='recharge-exchange-retry'>Try again</button></section></div>");
      bindTabs();
      $("#recharge-exchange-retry")?.addEventListener("click",()=>renderCoins().catch(error=>toast(error.message)));
      return;
    }

    const availableMinor=Math.max(0,Number(earnings.availableMinor)||0);
    const exchanges=Array.isArray(earnings.exchanges)?earnings.exchanges:[];
    const exchangeRows=exchanges.length?exchanges.slice(0,30).map(item=>
      "<article class='recharge-history-row'><div><strong>Money exchanged for Coins</strong><small>"+esc(item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable")+"</small></div><span>"+creatorMoney(item.amount_minor)+"</span><b class='positive'>+"+Number(item.coin_amount||0).toLocaleString()+" Coins</b></article>"
    ).join(""):"<div class='recharge-empty'><strong>No exchanges yet</strong><p>Your completed money-to-Coin exchanges will appear here.</p></div>";
    const initialAmount=availableMinor>=100?1.00:0;
    const exchangeContent=
      "<section class='recharge-exchange-intro'><div><span class='eyebrow'>MINGLORA EXCHANGE</span><h2>Exchange money for Coins</h2><p>Convert money already available in your Minglora balance into Coins for use across Minglora.</p></div><span class='recharge-exchange-mark' aria-hidden='true'>↔</span></section>"+
      "<div class='recharge-exchange-metrics'>"+
      "<article><small>Available money balance</small><strong>"+creatorMoney(availableMinor)+"</strong><span>Eligible LIVE gift and subscription earnings after payouts and previous exchanges</span></article>"+
      "<article><small>Your current Coin balance</small><strong>"+balance.toLocaleString()+"</strong><span>Minglora Coins available to use</span></article>"+
      "<article><small>Exchange rate</small><strong>100 Coins</strong><span>For every USD $1.00 exchanged</span></article></div>"+
      "<div class='recharge-exchange-grid'><section class='card recharge-exchange-card'><span class='eyebrow'>CONVERT YOUR BALANCE</span><h3>Choose an amount</h3><p class='muted'>Your money balance is debited and the equivalent Coins are credited after you confirm.</p>"+
      "<form id='recharge-exchange-form' class='recharge-form'><label for='recharge-exchange-amount'>Money amount (USD)</label><div class='recharge-exchange-amount-wrap'><span>$</span><input id='recharge-exchange-amount' name='amount' type='text' inputmode='decimal' autocomplete='off' autocapitalize='off' spellcheck='false' enterkeyhint='done' maxlength='11' value='"+(initialAmount?initialAmount.toFixed(2):"")+"' placeholder='Enter USD amount' aria-describedby='recharge-exchange-limit' required></div><small id='recharge-exchange-limit'>Minimum: USD $1.00 · Maximum: "+creatorMoney(availableMinor)+"</small><div id='recharge-exchange-preview' class='recharge-order-summary' aria-live='polite'><div><span>You will receive</span><strong>"+(initialAmount? "100 Coins":"—")+"</strong></div><p>USD $1.00 = 100 Minglora Coins.</p></div><button type='submit' id='recharge-exchange-confirm' class='primary' "+(availableMinor>=100?"":"disabled")+">Exchange for Coins</button><p id='recharge-exchange-status' class='recharge-form-status' role='status'></p></form></section>"+
      "<section class='card recharge-exchange-card'><span class='eyebrow'>EXCHANGE HISTORY</span><h3>Your transactions</h3><div class='recharge-history-list'>"+exchangeRows+"</div></section></div>"+
      "<p class='recharge-exchange-note'>This converts available money already earned through eligible Minglora LIVE gifts and subscriptions. It does not send money to PayPal. PayPal remains available on the Recharge tab when you want to purchase more Coins. Purchased Coins cannot be converted back into money.</p>";
    setContent("<div class='recharge-page'>"+header+moneyOverview+tabs+exchangeContent+"</div>");
    bindTabs();

    const form=$("#recharge-exchange-form");
    const amountInput=$("#recharge-exchange-amount");
    const preview=$("#recharge-exchange-preview");
    const confirmButton=$("#recharge-exchange-confirm");
    const status=$("#recharge-exchange-status");
    const makeRequestId=()=>{
      if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
      const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
      const hex=Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("");
      return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
    };
    let exchangeRequestId=makeRequestId();
    let exchangeRequestAmountMinor=null;
    const previewExchange=()=>{
      const raw=String(amountInput?.value||"").trim();
      const amount=Number(raw);
      const amountMinor=Math.round(amount*100);
      const valid=/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)&&Number.isSafeInteger(amountMinor)&&amountMinor>=100&&amountMinor<=availableMinor;
      if(preview){
        preview.innerHTML=valid
          ?"<div><span>You will receive</span><strong>"+amountMinor.toLocaleString()+" Coins</strong></div><p>"+creatorMoney(amountMinor)+" will be deducted from your money balance at 100 Coins per USD $1.00.</p>"
          :"<div><span>You will receive</span><strong>—</strong></div><p>"+(availableMinor<100?"You can enter an amount here, but your available balance must be at least USD $1.00 before an exchange can be confirmed.":"Enter at least USD $1.00, up to your available money balance.")+"</p>";
      }
      if(confirmButton)confirmButton.disabled=!valid||availableMinor<100;
      return valid?amountMinor:null;
    };
    amountInput?.addEventListener("input",previewExchange);
    form?.addEventListener("submit",async event=>{
      event.preventDefault();
      const amountMinor=previewExchange();
      if(!amountMinor){
        if(status)status.textContent="Enter at least USD $1.00 and no more than your available money balance.";
        return;
      }
      if(exchangeRequestAmountMinor!==null&&exchangeRequestAmountMinor!==amountMinor)exchangeRequestId=makeRequestId();
      exchangeRequestAmountMinor=amountMinor;
      if(confirmButton)confirmButton.disabled=true;
      if(amountInput)amountInput.disabled=true;
      if(status)status.textContent="Confirming your exchange securely…";
      try{
        const result=await api("/coins/exchange",{method:"POST",body:JSON.stringify({amountMinor,requestId:exchangeRequestId})});
        const exchange=result.exchange||{};
        if(status)status.textContent="Exchange completed. "+Number(exchange.coinAmount||amountMinor).toLocaleString()+" Minglora Coins credited.";
        toast("Converted "+creatorMoney(amountMinor)+" into "+Number(exchange.coinAmount||amountMinor).toLocaleString()+" Minglora Coins.");
        await renderCoins();
      }catch(error){
        if(status)status.textContent=error.message||"The exchange could not be completed. Your balance has not been changed unless the server confirms the transaction.";
        toast(error.message);
        if(confirmButton)confirmButton.disabled=false;
        if(amountInput)amountInput.disabled=false;
      }
    });
    previewExchange();
    return;
  }

  let selection=packages.length?{
    packageCode:String(packages[0].code),
    coinAmount:Number(packages[0].coin_amount),
    amountMinor:Number(packages[0].price_minor),
    label:String(packages[0].name||"Coin package")
  }:null;
  const packageCards=packages.map(pack=>
    "<button type='button' class='recharge-package-card "+(selection?.packageCode===pack.code?"is-selected":"")+"' data-coin-package='"+esc(pack.code)+"' aria-pressed='"+(selection?.packageCode===pack.code?"true":"false")+"'><span class='recharge-package-label'>"+esc(pack.name||"Coin package")+"</span><strong>"+Number(pack.coin_amount).toLocaleString()+"</strong><small>Minglora Coins</small><b>"+liveMoney(pack.price_minor)+"</b></button>"
  ).join("");
  const history=(wallet.ledger||[]).length?(wallet.ledger||[]).slice(0,30).map(item=>
    "<article class='recharge-history-row'><div><strong>"+esc(item.description||item.entry_type||"Wallet activity")+"</strong><small>"+timeAgo(item.created_at)+"</small></div><b class='"+(Number(item.delta_coins)>=0?"positive":"negative")+"'>"+(Number(item.delta_coins)>0?"+":"")+Number(item.delta_coins).toLocaleString()+" Coins</b></article>"
  ).join(""):"<div class='recharge-empty'><strong>No Coin activity yet</strong><p>Your real Coin purchases and spending will appear here.</p></div>";
  const content=
    "<div class='recharge-layout'><section class='card recharge-main-card'><div class='recharge-section-heading'><div><span class='eyebrow'>MINGLORA COINS</span><h2>Choose your package</h2><p class='muted'>Select a package or enter a custom Coin amount.</p></div><span class='recharge-payment-note'>PayPal checkout · USD</span></div>"+
    (packageCards?"<div class='recharge-package-grid' id='recharge-package-grid'>"+packageCards+"</div>":"<div class='recharge-empty'><strong>Coin packages are unavailable</strong><p>You can still enter a valid custom amount below.</p></div>")+
    "<div class='recharge-custom-panel'><label for='recharge-custom-amount'>Custom amount</label><div class='recharge-custom-controls'><input id='recharge-custom-amount' name='coinAmount' type='number' min='100' max='100000' step='2' inputmode='numeric' placeholder='Enter Coins (100–100,000)'><span>Minglora Coins</span></div><small>Enter an even amount from 100 to 100,000 Coins. Custom recharge is USD $0.01 per Coin.</small><p id='recharge-custom-error' class='recharge-form-status' role='status'></p></div></section>"+
    "<aside class='card recharge-checkout-card'><span class='eyebrow'>ORDER SUMMARY</span><h2>Your recharge</h2><div id='recharge-order-summary' class='recharge-order-summary'></div><div class='recharge-checkout-rule'></div><div class='recharge-checkout-total'><span>Total</span><strong id='recharge-total'>"+(selection?liveMoney(selection.amountMinor):"—")+"</strong></div><div class='recharge-payment-method'><span class='recharge-paypal-mark'>P</span><div><strong>PayPal</strong><small>Secure checkout</small></div></div><button type='button' id='recharge-confirm' class='primary full' "+(selection?"":"disabled")+">Recharge</button><small class='recharge-secure-note'>You will review and approve the payment on PayPal before Coins are credited.</small></aside></div>"+
    "<section class='card recharge-history-card'><div class='recharge-section-heading'><div><span class='eyebrow'>YOUR WALLET</span><h2>Coin activity</h2></div><span class='muted'>Latest transactions</span></div><div class='recharge-history-list'>"+history+"</div></section>"+
    "<p class='recharge-exchange-note'>Minglora Coins are for use within Minglora, including sending gifts. Creator earnings are handled separately in the Exchange tab.</p>";
  setContent("<div class='recharge-page'>"+header+moneyOverview+tabs+content+"</div>");
  bindTabs();

  const customInput=$("#recharge-custom-amount");
  const customError=$("#recharge-custom-error");
  const summary=$("#recharge-order-summary");
  const total=$("#recharge-total");
  const confirmButton=$("#recharge-confirm");
  const updateSelection=()=>{
    document.querySelectorAll("[data-coin-package]").forEach(button=>{
      const selected=Boolean(selection?.packageCode&&button.dataset.coinPackage===selection.packageCode);
      button.classList.toggle("is-selected",selected);
      button.setAttribute("aria-pressed",selected?"true":"false");
    });
    if(summary){
      summary.innerHTML=selection
        ?"<div><span>"+esc(selection.label||"Custom recharge")+"</span><strong>"+Number(selection.coinAmount).toLocaleString()+" Coins</strong></div><p>Coins will be added after PayPal confirms the payment.</p>"
        :"<div><span>No package selected</span><strong>—</strong></div><p>Select a package or enter a valid custom amount.</p>";
    }
    if(total)total.textContent=selection?liveMoney(selection.amountMinor):"—";
    if(confirmButton)confirmButton.disabled=!selection;
  };
  document.querySelectorAll("[data-coin-package]").forEach(button=>button.addEventListener("click",()=>{
    const pack=packages.find(item=>String(item.code)===button.dataset.coinPackage);
    if(!pack)return;
    selection={packageCode:String(pack.code),coinAmount:Number(pack.coin_amount),amountMinor:Number(pack.price_minor),label:String(pack.name||"Coin package")};
    if(customInput)customInput.value="";
    if(customError)customError.textContent="";
    updateSelection();
  }));
  customInput?.addEventListener("input",()=>{
    const raw=customInput.value;
    const amount=Number(raw);
    if(!raw){selection=null;if(customError)customError.textContent="";updateSelection();return;}
    if(!Number.isSafeInteger(amount)||amount<100||amount>100000||amount%2!==0){
      selection=null;
      if(customError)customError.textContent="Enter an even amount from 100 to 100,000 Coins.";
      updateSelection();
      return;
    }
    selection={coinAmount:amount,amountMinor:amount,label:"Custom recharge"};
    if(customError)customError.textContent="";
    updateSelection();
  });
  confirmButton?.addEventListener("click",()=>{
    if(!selection)return;
    startCoinPurchase({...selection,button:confirmButton});
  });
  updateSelection();
}
async function startCoinPurchase(selection){
  const button=selection.button;if(button)button.disabled=true;
  try{const payload=selection.packageCode?{packageCode:selection.packageCode}:{coinAmount:selection.coinAmount};const result=await api("/coins/purchase",{method:"POST",body:JSON.stringify(payload)});window.location.assign(result.approveUrl);}
  catch(error){toast(error.message);if(button)button.disabled=false;}
}
async function renderCreator(){
  activateSilent("creator");
  disposeCreatorStudioStage();
  creatorStudioDestroyPagePickers();
  const main=$("#main-content");
  setContent("<section class='creator-studio-shell'><div class='creator-loading'><span class='creator-loading-mark'>M</span><strong>Opening your creator workspace</strong><small>Loading your Minglora account data…</small></div></section>");
  try{
    const userId=state.user?.id;
    if(!userId)throw new Error("Sign in to open Creator Studio.");
    const results=await Promise.allSettled([
      api("/users/"+encodeURIComponent(userId)),
      api("/creator/earnings"),
      api("/pages")
    ]);
    if(results[0].status==="rejected")throw results[0].reason;
    const pageResult=results[2].status==="fulfilled"?results[2].value:{pages:[],unavailable:true,error:results[2].reason?.message||"Pages are unavailable."};
    state.creatorStudio={
      profile:results[0].value,
      earnings:results[1].status==="fulfilled"?results[1].value:null,
      earningsError:results[1].status==="rejected"?results[1].reason?.message||"Creator earnings are unavailable.":null,
      pages:Array.isArray(pageResult.pages)?pageResult.pages.filter(page=>["owner","admin","editor"].includes(page.myRole)):[],
      pagesError:pageResult.unavailable?pageResult.error||"Pages are unavailable.":null,
      pageDetails:{},
      followers:[],
      following:[],
      settings:null,
      contentTab:"posts",
      section:"overview",
      pagePickers:[]
    };
    await renderCreatorSection("overview");
  }catch(error){
    setContent("<section class='creator-studio-shell'><div class='creator-load-error'><span>!</span><h2>Creator Studio could not load</h2><p>"+esc(error.message||"Minglora could not load your creator workspace.")+"</p><button class='primary' id='creator-retry-load'>Try again</button></div></section>");
    $("#creator-retry-load")?.addEventListener("click",renderCreator);
  }
}

let creatorStudioStageCleanup=null;
function creatorStudioDestroyPagePickers(){
  const pickers=state.creatorStudio?.pagePickers||[];
  pickers.forEach(picker=>{try{picker.destroy();}catch{}});
  if(state.creatorStudio)state.creatorStudio.pagePickers=[];
}
function creatorMoney(minor,currency="USD"){
  const value=Number(minor);
  if(!Number.isFinite(value))return "Unavailable";
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(value/100);}
  catch{return "$"+(value/100).toFixed(2);}
}
function creatorNumber(value){
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat().format(n):"—";
}
function creatorIcon(name){
  return "<svg class='creator-ico' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#"+esc(name)+"'></use></svg>";
}
function creatorProfileName(){
  const profile=state.creatorStudio?.profile?.user||state.user||{};
  return profile.name||profile.username||"Creator";
}
function creatorOwnPages(){
  return state.creatorStudio?.pages||[];
}
function creatorPostCard(post){
  const media=Array.isArray(post.media)?post.media:[];
  const kind=media.length?media.map(item=>String(item.mediaType||"media").toUpperCase()).join(" · "):"TEXT POST";
  const date=post.createdAt?new Date(post.createdAt).toLocaleString():"Date unavailable";
  return "<article class='creator-post-card'>"+
    "<div class='creator-post-card-head'><span class='creator-post-type'>"+esc(kind)+"</span><span class='creator-post-date'>"+esc(date)+"</span></div>"+
    (post.text?"<p class='creator-post-copy'>"+esc(post.text)+"</p>":"")+
    (media.length?renderPostMedia(post):"<div class='creator-post-no-media'>Text publication · no attached media</div>")+
    "<div class='creator-post-footer'><span>♡ "+creatorNumber(post.reactionCount||0)+" reactions</span><span>"+creatorNumber((post.comments||[]).length)+" comments</span><div><button type='button' class='secondary' data-creator-edit-post='"+esc(post.id)+"'>Edit</button><button type='button' class='secondary creator-danger-action' data-creator-delete-post='"+esc(post.id)+"'>Delete</button></div></div>"+
    "</article>";
}
function creatorMetric(label,value,caption,icon){
  return "<article class='creator-metric-card'><div class='creator-metric-top'><span>"+esc(label)+"</span><span class='creator-metric-icon'>"+creatorIcon(icon)+"</span></div><strong>"+esc(value)+"</strong><small>"+esc(caption)+"</small></article>";
}
function creatorEmpty(title,description,icon){
  return "<section class='creator-empty-state'><span>"+creatorIcon(icon||"create")+"</span><h3>"+esc(title)+"</h3><p>"+esc(description)+"</p></section>";
}
function syncCreatorStudioNavigationLayout(){
  const slot=document.querySelector(".creator-studio-nav-slot");
  const nav=slot?.querySelector(".creator-studio-nav.live-format-picker");
  if(!slot||!nav)return;
  const slotRect=slot.getBoundingClientRect();
  const topbar=document.querySelector(".topbar");
  const top=Math.max(0,Math.ceil(topbar?.getBoundingClientRect().bottom||0));
  const height=Math.ceil(nav.getBoundingClientRect().height||nav.scrollHeight||60);
  slot.style.height=(height+14)+"px";
  nav.style.setProperty("--creator-studio-nav-top",top+"px");
  nav.style.setProperty("--creator-studio-nav-left",Math.round(slotRect.left)+"px");
  nav.style.setProperty("--creator-studio-nav-width",Math.round(slotRect.width)+"px");
  if(!window.__mingloraCreatorStudioNavResizeBound){
    window.addEventListener("resize",syncCreatorStudioNavigationLayout,{passive:true});
    window.__mingloraCreatorStudioNavResizeBound=true;
  }
}
function creatorStudioChrome(section,content){
  const name=creatorProfileName();
  const sections=[
    ["overview","Overview","creator","Your account at a glance"],
    ["content","Content library","saved","Your posts and media"],
    ["publish","Create & publish","create","Make something new"],
    ["audience","Audience","friends","People around your profile"],
    ["analytics","Analytics","explore","Measure real activity"],
    ["pages","Pages & channels","pages","Manage your Pages"],
    ["monetization","Monetization","coins","Earnings and payouts"],
    ["settings","Studio settings","settings","Creator preferences"]
  ];
  const nav=sections.map(([id,label,icon,description])=>"<button type='button' class='creator-studio-nav-item live-format-card "+(id===section?"active":"")+"' data-creator-section='"+id+"' aria-current='"+(id===section?"page":"false")+"'><span class='live-format-icon "+(["audience","analytics"].includes(id)?"audio":"")+"'>"+creatorIcon(icon)+"</span><span class='creator-tab-copy'><strong>"+label+"</strong><small>"+description+"</small></span></button>").join("");
  return "<div class='creator-studio-shell' data-creator-section-active='"+section+"'>"+
    "<div class='creator-studio-nav-slot'><nav class='creator-studio-nav live-format-picker' aria-label='Creator Studio sections'>"+nav+"</nav></div>"+
    "<section class='creator-studio-heading'><div><span class='creator-eyebrow'>MINGLORA CREATOR WORKSPACE</span><h1>Creator Studio</h1><p>One connected Minglora workspace for creating, publishing, understanding your audience and managing creator activity.</p></div><div class='creator-studio-heading-actions'><span class='creator-account-chip'><i class='creator-studio-account-dot'></i><strong>"+esc(name)+"</strong></span><button type='button' class='secondary' data-creator-edit-profile>Edit profile</button><button type='button' class='primary' data-creator-section='publish'>"+creatorIcon("create")+" Create content</button></div></section>"+
    "<section class='creator-live-format-entry'><div class='creator-live-format-heading'><strong>Go LIVE</strong><small>Choose the broadcast format that matches your moment</small></div><div class='creator-live-format-options'>"+
      "<button type='button' class='live-format-card creator-live-format-card' data-creator-start-live='video_audio'><span class='live-format-icon'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#live'></use></svg></span><span><strong>Video LIVE</strong><small>Camera and microphone</small></span></button>"+
      "<button type='button' class='live-format-card creator-live-format-card' data-creator-start-live='audio_only'><span class='live-format-icon audio'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#microphone'></use></svg></span><span><strong>Audio LIVE</strong><small>Voice-first broadcast</small></span></button>"+
    "</div></section>"+
    "<div class='creator-studio-content'>"+content+"</div>"+
    "<footer class='creator-studio-footer'><span>Minglora Creator Studio</span><span>Connected to your Minglora account · No invented activity or earnings</span></footer></div>";
}
function creatorStageSvgMarkup(){
  return `<svg id="creator-stage-svg-fallback" class="creator-stage-svg-fallback" viewBox="0 0 760 520" role="img" aria-label="Interactive three dimensional creator workstation with monitor, desk, camera, microphone and ring light" hidden>
    <defs>
      <linearGradient id="cs-stage-floor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#112a4b"/><stop offset=".52" stop-color="#173c5e"/><stop offset="1" stop-color="#0b1b34"/></linearGradient>
      <linearGradient id="cs-stage-desk" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#8db9e8"/><stop offset=".3" stop-color="#3f76b7"/><stop offset="1" stop-color="#183c6a"/></linearGradient>
      <linearGradient id="cs-stage-edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9be7f1"/><stop offset="1" stop-color="#2876ba"/></linearGradient>
      <linearGradient id="cs-stage-screen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17385f"/><stop offset=".48" stop-color="#226c9c"/><stop offset="1" stop-color="#152b55"/></linearGradient>
      <linearGradient id="cs-stage-metal" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#f4fbff"/><stop offset=".34" stop-color="#8eaeca"/><stop offset="1" stop-color="#385a82"/></linearGradient>
      <linearGradient id="cs-stage-teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c1fff5"/><stop offset=".34" stop-color="#38d2c2"/><stop offset="1" stop-color="#147c9d"/></linearGradient>
      <linearGradient id="cs-stage-violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0d8ff"/><stop offset=".4" stop-color="#9a83fa"/><stop offset="1" stop-color="#5141a4"/></linearGradient>
      <radialGradient id="cs-stage-glow"><stop stop-color="#72daf1" stop-opacity=".5"/><stop offset="1" stop-color="#4b83d8" stop-opacity="0"/></radialGradient>
      <filter id="cs-stage-shadow" x="-30%" y="-40%" width="160%" height="190%"><feGaussianBlur stdDeviation="13"/></filter>
    </defs>
    <ellipse cx="386" cy="436" rx="300" ry="54" fill="#020b1d" opacity=".48" filter="url(#cs-stage-shadow)"/>
    <ellipse cx="390" cy="284" rx="310" ry="250" fill="url(#cs-stage-glow)" opacity=".8"/>
    <g id="creator-stage-svg-world" class="creator-stage-svg-world">
      <ellipse cx="390" cy="408" rx="276" ry="39" fill="#07162c" opacity=".62"/>
      <path d="M141 365 376 255 661 348 425 466Z" fill="url(#cs-stage-floor)" stroke="#5e9ed1" stroke-opacity=".42" stroke-width="2"/>
      <path d="M141 365 425 466 425 483 141 382Z" fill="#102b4a"/>
      <path d="M425 466 661 348 661 365 425 483Z" fill="#0a203c"/>
      <ellipse cx="392" cy="396" rx="232" ry="24" fill="#0a1831" opacity=".65"/>
      <g class="creator-stage-svg-ring">
        <ellipse cx="555" cy="170" rx="92" ry="111" fill="none" stroke="#a9d2ff" stroke-width="15" opacity=".16"/>
        <ellipse cx="555" cy="170" rx="92" ry="111" fill="none" stroke="url(#cs-stage-violet)" stroke-width="8"/>
        <ellipse cx="555" cy="170" rx="80" ry="99" fill="none" stroke="#c2fff5" stroke-width="2.5" opacity=".88"/>
        <path d="M555 279v65" stroke="url(#cs-stage-metal)" stroke-width="13" stroke-linecap="round"/>
        <path d="M555 341 520 358 592 382" fill="none" stroke="#527ba7" stroke-width="9" stroke-linecap="round"/>
        <path d="M521 358 593 382" stroke="#b5d8ef" stroke-width="3" stroke-linecap="round"/>
      </g>
      <path d="M177 338 399 237 624 313 401 421Z" fill="url(#cs-stage-desk)" stroke="#a8d8fa" stroke-opacity=".65" stroke-width="2"/>
      <path d="M177 338 401 421 401 438 177 354Z" fill="#173d69"/>
      <path d="M401 421 624 313 624 330 401 438Z" fill="#102f57"/>
      <path d="M210 351 400 423 591 330" fill="none" stroke="url(#cs-stage-edge)" stroke-width="4" opacity=".9"/>
      <path d="M244 354 270 367 270 441 244 431Z" fill="#274d76"/>
      <path d="M535 359 562 347 562 423 535 436Z" fill="#1b3b61"/>
      <path d="M365 215 420 195 420 255 365 277Z" fill="#345b82"/>
      <path d="M353 205 427 174 427 251 353 281Z" fill="url(#cs-stage-metal)"/>
      <path d="M353 205 427 174 427 246 353 275Z" fill="#294c77" stroke="#b9e3ff" stroke-width="2"/>
      <path d="M366 211 414 191 414 235 366 255Z" fill="#0d203e"/>
      <path d="M369 214 410 197 410 231 369 248Z" fill="url(#cs-stage-teal)" opacity=".28"/>
      <path d="M378 238 401 229 401 233 378 242Z" fill="#a6f5ec" opacity=".9"/>
      <path d="M378 247 394 240 394 243 378 250Z" fill="#b9c8ff" opacity=".88"/>
      <path d="M390 257 389 273 411 281 413 263Z" fill="#7b9bbd"/>
      <path d="M369 276 431 251 444 261 381 288Z" fill="#aecce1"/>
      <path d="M381 288 444 261 449 268 386 297Z" fill="#3d668d"/>
      <path d="M249 284 282 270 315 281 281 296Z" fill="#25476e" stroke="#95c5e8" stroke-width="2"/>
      <path d="M249 284 281 296 281 347 249 335Z" fill="#173557"/>
      <path d="M281 296 315 281 315 333 281 347Z" fill="#0d2849"/>
      <path d="M257 286 281 295 281 323 257 314Z" fill="url(#cs-stage-teal)"/>
      <ellipse cx="269" cy="300" rx="7" ry="6" fill="#d7ffff" opacity=".8"/>
      <path d="M266 282 266 252 276 247 276 285Z" fill="url(#cs-stage-metal)"/>
      <path d="M253 252 281 240 300 247 272 260Z" fill="#7c9fbe"/>
      <path d="M253 252 272 260 272 278 253 269Z" fill="#244b74"/>
      <path d="M272 260 300 247 300 265 272 278Z" fill="#122c4c"/>
      <ellipse cx="278" cy="258" rx="10" ry="7" fill="#0a1d39" stroke="#d0f4ff" stroke-width="2"/>
      <ellipse cx="280" cy="257" rx="5.5" ry="4" fill="url(#cs-stage-teal)"/>
      <path d="M487 298 502 290 502 349 487 356Z" fill="#2e527b"/>
      <ellipse cx="495" cy="291" rx="8" ry="4" fill="#d4edff"/>
      <path d="M479 287 495 279 512 285 496 293Z" fill="url(#cs-stage-metal)"/>
      <rect x="477" y="268" width="29" height="28" rx="8" fill="url(#cs-stage-teal)" transform="rotate(-20 491 282)"/>
      <path d="M482 270 501 263" stroke="#e3fff9" stroke-width="2" stroke-linecap="round"/>
      <path d="M478 355 494 348 510 355 494 363Z" fill="#a3c8e6"/>
      <path d="M468 363 493 374 520 361" fill="none" stroke="#294c73" stroke-width="5" stroke-linecap="round"/>
      <path d="M338 319 364 308 386 316 360 328Z" fill="#1b3c64"/>
      <path d="M338 319 360 328 360 356 338 346Z" fill="#0c2443"/>
      <path d="M360 328 386 316 386 344 360 356Z" fill="#274e79"/>
      <path d="M345 321 360 327 360 345 345 339Z" fill="url(#cs-stage-violet)"/>
      <path d="M362 331 379 324" stroke="#b9d8ef" stroke-width="2" opacity=".7"/>
      <path d="M333 351 363 362 391 350" fill="none" stroke="#89dfe8" stroke-width="3" opacity=".7"/>
      <path d="M177 340 213 326 247 338" fill="none" stroke="#b5eaff" stroke-width="3" opacity=".65"/>
    </g>
  </svg>`;
}
function creatorOverviewMarkup(){
  const s=state.creatorStudio,profile=s.profile||{},user=profile.user||{};
  const posts=Array.isArray(profile.posts)?profile.posts:[];
  const pages=creatorOwnPages(),earnings=s.earnings||{};
  const preview=posts.slice(0,2).map(creatorPostCard).join("");
  return "<section class='creator-stage-card'><div class='creator-stage-copy'><span class='creator-stage-label'><i></i> MINGLORA CREATIVE WORKSPACE</span><h2>Make your next<br><em>moment matter.</em></h2><p>Plan your content and publish to your community. Manage profile visitor history from Notification Settings.</p><div class='creator-stage-actions'><button type='button' class='primary' data-creator-section='publish'>"+creatorIcon("create")+" Create a post</button><button type='button' class='secondary' data-creator-section='content'>Explore your content ↗</button></div><div class='creator-stage-note'>Your creator space is separate from the live broadcast room.</div></div>"+
    "<div class='creator-stage-visual'><canvas id='creator-stage-canvas' aria-label='Interactive real-time 3D Minglora creator production studio'></canvas>"+creatorStageSvgMarkup()+"<div class='creator-stage-caption'><span></span> LIVE WEBGL 3D SCENE <small>Drag to orbit</small></div><div class='creator-stage-controls'><button type='button' id='creator-stage-reset' aria-label='Reset 3D studio view'>↻</button><button type='button' id='creator-stage-pause' aria-label='Pause 3D studio animation'>Ⅱ</button></div><p class='creator-stage-fallback' id='creator-stage-fallback' hidden>3D compatibility renderer active.</p></div></section>"+
    "<div class='creator-section-title'><div><span class='creator-eyebrow'>CHANNEL OVERVIEW</span><h2>Your performance, at a glance</h2></div><button type='button' class='creator-inline-link' data-creator-section='analytics'>View analytics ↗</button></div>"+
    "<div class='creator-metrics-grid'>"+
      creatorMetric("Followers",creatorNumber(profile.followersCount),"Current profile audience","friends")+
      creatorMetric("Following",creatorNumber(profile.followingCount),"Profiles you follow","profile")+
      creatorMetric("Published posts",creatorNumber(posts.length),"Your published personal posts","saved")+
    "</div>"+
    "<div class='creator-overview-lower'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR LATEST WORK</span><h3>Recent publications</h3></div><button type='button' class='creator-inline-link' data-creator-section='content'>View all ↗</button></div>"+(preview||creatorEmpty("Your content starts here","Publish a post and your real content will appear in this workspace.","create"))+"</section>"+
    "<section class='creator-studio-panel creator-shortcuts-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>CREATOR TOOLS</span><h3>Your workspace</h3></div></div>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='content'>"+creatorIcon("saved")+"<span><strong>Content library</strong><small>Manage your posts and media</small></span><b>↗</b></button>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='audience'>"+creatorIcon("friends")+"<span><strong>Audience</strong><small>Followers and account connections</small></span><b>↗</b></button>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='pages'>"+creatorIcon("pages")+"<span><strong>Pages & channels</strong><small>Manage your Minglora Pages</small></span><b>↗</b></button>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='monetization'>"+creatorIcon("coins")+"<span><strong>Monetization</strong><small>Creator earnings and PayPal</small></span><b>↗</b></button>"+
      "<div class='creator-live-handoff-note'><span class='creator-live-handoff-icon'>"+creatorIcon("live")+"</span><div><strong>Ready to broadcast?</strong><small>Camera, microphone, guests and real-time chat belong in the LIVE room.</small><button type='button' data-creator-open-live>Open LIVE experience ↗</button></div></div>"+
    "</section></div>";
}
function creatorContentMarkup(){
  const s=state.creatorStudio,profile=s.profile||{},posts=Array.isArray(profile.posts)?profile.posts:[];
  const media=posts.flatMap(post=>(Array.isArray(post.media)?post.media:[]).map(item=>({...item,postId:post.id,postText:post.text||"",createdAt:post.createdAt})));
  const mediaHtml=media.length?media.map(item=>"<article class='creator-media-item'>"+
    (item.mediaType==="video"&&item.url?"<video controls playsinline preload='metadata' src='"+esc(item.url)+"'></video>":item.mediaType==="audio"&&item.url?"<audio controls preload='metadata' src='"+esc(item.url)+"'></audio>":item.mediaType==="model3d"&&item.url?"<model-viewer src='"+esc(item.url)+"' alt='Published 3D media' camera-controls auto-rotate></model-viewer>":item.url?"<img loading='lazy' src='"+esc(item.url)+"' alt='Published creator media'>":"<div class='creator-media-no-preview'>"+esc(String(item.mediaType||"MEDIA").toUpperCase())+"</div>")+
    "<div><strong>"+esc(item.postText||"Published media")+"</strong><small>"+esc(item.mediaType||"Media")+" · "+esc(item.createdAt?new Date(item.createdAt).toLocaleDateString():"Date unavailable")+"</small></div></article>").join(""):creatorEmpty("No published media yet","Images, videos, audio and 3D files attached to your posts will appear here.","saved");
  const postsHtml=posts.length?posts.map(creatorPostCard).join(""):creatorEmpty("No posts published yet","Create a post with text, photo, video, audio or a 3D file. Your posts will be stored on your Minglora account.","create");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>YOUR PUBLISHED WORK</span><h2>Content library</h2><p>Manage your own publications and review media attached to them.</p></div><button type='button' class='primary' data-creator-section='publish'>"+creatorIcon("create")+" Create content</button></div>"+
    "<div class='creator-content-tabs'><button type='button' class='active' data-creator-content-tab='posts'>Published posts <span>"+posts.length+"</span></button><button type='button' data-creator-content-tab='media'>Published media <span>"+media.length+"</span></button></div>"+
    "<section class='creator-library-panel' id='creator-post-library'>"+postsHtml+"</section>"+
    "<section class='creator-library-panel' id='creator-media-library' hidden><div class='creator-media-grid'>"+mediaHtml+"</div></section>";
}
function creatorPublishMarkup(){
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>CONTENT PRODUCTION</span><h2>Create & publish</h2><p>Publish directly to your Minglora profile with the existing authenticated media pipeline.</p></div></div>"+
    "<div class='creator-publish-layout'><section class='creator-studio-panel creator-composer-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>POST COMPOSER</span><h3>Build your next post</h3></div><span class='creator-draft-tag'>MINGLORA POST</span></div>"+
    "<form id='creator-publish-form'><div class='creator-publish-author'><span class='creator-publish-avatar'>"+esc(String(creatorProfileName()).charAt(0).toUpperCase())+"</span><span><strong>"+esc(creatorProfileName())+"</strong><small>Publishing to your Minglora profile</small></span></div>"+
    "<label class='creator-field-label' for='creator-post-text'>Caption or message</label><textarea id='creator-post-text' name='text' rows='5' maxlength='5000' placeholder='Share an update, an idea or a moment with your audience…'></textarea>"+
    "<label class='creator-field-label'>Attach media</label><div id='creator-post-media-picker'></div>"+
    "<div class='creator-publish-foot'><span>Text · Photo · Video · Audio · 3D GLB</span><button type='submit' class='primary' id='creator-publish-submit'>Publish to Minglora ↗</button></div><p class='creator-inline-status' id='creator-publish-status' role='status'>Files are uploaded through Minglora’s secure media endpoint before the post is published.</p></form></section>"+
    "<aside class='creator-studio-panel creator-publish-guidance'><span class='creator-eyebrow'>PUBLISHING WORKFLOW</span><h3>From creation to publication</h3><ol><li><i>01</i><span><strong>Create your post</strong><small>Write a caption or message.</small></span></li><li><i>02</i><span><strong>Add your media</strong><small>Choose gallery, files or device camera.</small></span></li><li><i>03</i><span><strong>Secure upload</strong><small>Minglora validates and stores your media.</small></span></li><li><i>04</i><span><strong>Publish</strong><small>Your post is saved through the Minglora API.</small></span></li></ol><p>Scheduled publishing is not enabled in the current Minglora backend, so this screen only offers confirmed immediate publishing.</p></aside></div>";
}
function creatorAudienceMarkup(){
  const s=state.creatorStudio,p=s.profile||{};
  const followers=s.followers||[],following=s.following||[];
  const rows=(items,error)=>error?creatorEmpty('Audience list unavailable',error,'friends'):items.length?items.map(person=>"<article class='creator-audience-row'><img src='"+avatar(person)+"' alt=''><span><strong>"+esc(person.name||"Minglora member")+"</strong><small>@"+esc(person.username||"member")+"</small></span><button type='button' class='secondary' data-creator-view-profile='"+esc(person.id)+"'>View profile</button></article>").join(""):creatorEmpty("No members to show","This list is empty. Minglora does not add sample users or follower records.","friends");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>YOUR COMMUNITY</span><h2>Audience</h2><p>Real follower and following relationships from your Minglora account.</p></div></div>"+
    "<div class='creator-audience-summary'>"+creatorMetric("Followers",creatorNumber(p.followersCount),"Members following your profile","friends")+creatorMetric("Following",creatorNumber(p.followingCount),"Profiles you follow","profile")+"</div>"+
    "<div class='creator-audience-columns'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR COMMUNITY</span><h3>Followers</h3></div><span class='creator-panel-count'>"+creatorNumber(p.followersCount)+"</span></div><div class='creator-audience-list'>"+rows(followers,s.audienceError)+"</div></section><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR NETWORK</span><h3>Following</h3></div><span class='creator-panel-count'>"+creatorNumber(p.followingCount)+"</span></div><div class='creator-audience-list'>"+rows(following,s.followingError)+"</div></section></div>";
}
function creatorAnalyticsMarkup(){
  const s=state.creatorStudio,p=s.profile||{};
  const posts=Array.isArray(p.posts)?p.posts:[];
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>MEASURE WHAT MATTERS</span><h2>Creator analytics</h2><p>Only metrics returned by Minglora’s existing profile insights API are displayed here.</p></div></div>"+
    "<div class='creator-analytics-source'><span>✓</span><div><strong>Account-backed profile insights</strong><small>Counts below are returned by Minglora. Profile viewer history lives in Notification Settings; no estimated or sample view metrics are shown here.</small></div></div>"+
    "<div class='creator-analytics-grid'>"+creatorMetric("Followers",creatorNumber(p.followersCount),"Current follower relationship count","friends")+creatorMetric("Following",creatorNumber(p.followingCount),"Current following relationship count","profile")+creatorMetric("Published posts",creatorNumber(posts.length),"Personal posts visible on your profile","saved")+"</div>"+
    "<section class='creator-studio-panel creator-analytics-limits'><span class='creator-eyebrow'>METRIC COVERAGE</span><h3>What Minglora can measure today</h3><div class='creator-coverage-list'><p><b>Available</b><span>Follower count, following count and published posts.</span></p><p><b>Not yet available</b><span>Per-post impressions, watch time, retention, completion, audience demographics, conversion funnels and time-series charts.</span></p></div></section>";
}
function creatorPageCard(page,details){
  const posts=details?.posts||[],canDelete=page.myRole==="owner";
  const pagePosts=posts.length?posts.slice(0,3).map(post=>"<article class='creator-page-post-row'><div><strong>"+esc(post.text||"Page publication")+"</strong><small>"+esc(post.createdAt?new Date(post.createdAt).toLocaleDateString():"Date unavailable")+"</small></div><button type='button' class='secondary creator-danger-action' data-creator-delete-page-post='"+esc(page.id)+"|"+esc(post.id)+"'>Delete</button></article>").join(""): "<p class='creator-page-no-posts'>No posts on this Page yet.</p>";
  return "<article class='creator-page-card'><div class='creator-page-card-head'><span class='creator-page-avatar'>"+esc(String(page.title||"P").charAt(0).toUpperCase())+"</span><div><strong>"+esc(page.title)+"</strong><small>@"+esc(page.handle)+" · "+esc(page.myRole||"manager")+"</small></div><span class='creator-page-followers'>"+creatorNumber(page.followerCount)+" followers</span></div>"+
    (page.description?"<p class='creator-page-description'>"+esc(page.description)+"</p>":"")+
    "<div class='creator-page-posts-heading'><strong>Recent Page posts</strong><small>"+posts.length+" loaded</small></div>"+pagePosts+
    "<details class='creator-page-publish'><summary>Publish to this Page</summary><form data-creator-page-form='"+esc(page.id)+"'><label class='creator-field-label'>Page post text</label><textarea name='text' maxlength='5000' rows='3' placeholder='Share a Page update…'></textarea><div data-creator-page-picker='"+esc(page.id)+"'></div><button type='submit' class='primary'>Publish Page post</button><p class='creator-inline-status' role='status'></p></form></details>"+
    (canDelete?"<button type='button' class='secondary creator-danger-action creator-delete-page' data-creator-delete-page='"+esc(page.id)+"'>Delete this Page</button>":"")+
    "</article>";
}
async function creatorPagesMarkup(){
  const s=state.creatorStudio;
  if(s.pagesError)return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>YOUR MINGLORA PAGES</span><h2>Pages & channels</h2><p>Manage Pages you own or have permission to publish to.</p></div></div><div class='creator-studio-panel'>"+creatorEmpty("Pages unavailable",s.pagesError,"pages")+"</div>";
  const details=await Promise.all(s.pages.map(async page=>{
    try{return [page.id,(await api("/pages/"+encodeURIComponent(page.id)))];}
    catch(error){return [page.id,{unavailable:true,error:error.message}];}
  }));
  s.pageDetails=Object.fromEntries(details);
  const cards=s.pages.map(page=>{
    const detail=s.pageDetails[page.id];
    return detail?.unavailable?"<article class='creator-page-card'><strong>"+esc(page.title)+"</strong><p>"+esc(detail.error||"Page details unavailable.")+"</p></article>":creatorPageCard(page,detail);
  }).join("");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>YOUR MINGLORA PAGES</span><h2>Pages & channels</h2><p>Create and manage public Pages, publish Page updates and review actual follower totals.</p></div></div>"+
    "<section class='creator-studio-panel creator-create-page-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>CREATE A CHANNEL</span><h3>Start a Minglora Page</h3></div>"+creatorIcon("pages")+"</div><form id='creator-create-page-form' class='creator-page-create-form'><div><label class='creator-field-label' for='creator-page-title'>Page name</label><input id='creator-page-title' name='title' maxlength='160' minlength='3' required placeholder='Your brand, community or public identity'></div><div><label class='creator-field-label' for='creator-page-handle'>Unique Page handle</label><input id='creator-page-handle' name='handle' minlength='3' maxlength='30' pattern='[a-zA-Z0-9_-]{3,30}' required placeholder='yourpage'></div><div><label class='creator-field-label' for='creator-page-category'>Category</label><input id='creator-page-category' name='category' maxlength='60' placeholder='Creator, music, business…'></div><div><label class='creator-field-label' for='creator-page-description'>Description</label><textarea id='creator-page-description' name='description' rows='3' maxlength='2000' placeholder='What is this Page about?'></textarea></div><button type='submit' class='primary'>Create Page</button><p class='creator-inline-status' id='creator-page-create-status' role='status'>Page handles must contain 3–30 lowercase letters, numbers, underscores or hyphens.</p></form></section>"+
    "<div class='creator-pages-list-heading'><h3>Your managed Pages</h3><span>"+s.pages.length+" Pages</span></div>"+
    (cards? "<div class='creator-pages-grid'>"+cards+"</div>":creatorEmpty("No managed Pages yet","Create your first Page to establish a public brand or community identity.","pages"));
}
function creatorMonetizationMarkup(){
  const s=state.creatorStudio,data=s.earnings;
  if(s.earningsError||!data)return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>CREATOR BUSINESS</span><h2>Monetization</h2><p>Creator earnings and PayPal withdrawals.</p></div></div><div class='creator-studio-panel'>"+creatorEmpty("Earnings unavailable",s.earningsError||"Minglora could not load creator earnings.","coins")+"</div>";
  const account=data.payoutAccount||null,ledger=Array.isArray(data.ledger)?data.ledger:[],payouts=Array.isArray(data.payouts)?data.payouts:[];
  const giftBalance=data.giftBalance||{};
  const receivedGifts=Array.isArray(giftBalance.recent)?giftBalance.recent:[];
  const giftSourceLabels={cash:"Cash-backed",marketing:"Funded marketing",promo:"Promotional · non-cash",mixed:"Mixed funding",admin_promotional:"Cash-reserved Admin Promotional"};
  const giftReceiptHistory=receivedGifts.length?receivedGifts.map(item=>{
    const share=Number(item.creatorShareMinor||0);
    const earningsLabel=share>0?creatorMoney(share)+" creator share":"No withdrawable share · promotional Coins";
    return "<article class='creator-ledger-row'><div><strong>"+esc(item.giftEmoji||"🎁")+" "+esc(item.giftName||"Gift")+" · "+esc(giftSourceLabels[item.fundingSource]||"Gift")+"</strong><small>From "+esc(item.senderDisplayName||item.senderUsername||"Minglora member")+(item.senderUsername?" · @"+esc(item.senderUsername):"")+" · "+esc(item.createdAt?new Date(item.createdAt).toLocaleString():"Date unavailable")+"</small></div><span class='creator-ledger-share'>"+Number(item.coinAmount||0).toLocaleString()+" Coins</span><strong>"+earningsLabel+"</strong></article>";
  }).join(""):creatorEmpty("No gifts received yet","Confirmed LIVE and profile gifts will appear here.","coins");
  const platformTotal=ledger.reduce((sum,row)=>sum+Number(row.platform_share_minor||0),0);
  const history=ledger.length?ledger.map(item=>{const source=String(item.funding_source||"cash")==="admin_promotional"?"Promotional gift":"Gift";return "<article class='creator-ledger-row'><div><strong>"+source+" earnings</strong><small>"+esc(item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable")+"</small></div><span class='creator-ledger-share'>Creator share "+creatorMoney(item.creator_share_minor)+"</span><strong>"+creatorMoney(item.creator_share_minor)+"</strong></article>";}).join(""):creatorEmpty("No creator earnings yet","Eligible gift earnings will appear here after real gift transactions are settled.","coins");
  const payoutHistory=payouts.length?payouts.map(item=>"<article class='creator-ledger-row'><div><strong>"+esc(String(item.status||"unknown").replace(/_/g," ").toUpperCase())+"</strong><small>"+esc(item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable")+"</small></div><span class='creator-ledger-share'>PayPal payout</span><strong>"+creatorMoney(item.amount_minor)+"</strong></article>").join(""):creatorEmpty("No withdrawals yet","Confirmed payout requests will appear in this history.","coins");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>CREATOR BUSINESS</span><h2>Monetization</h2><p>Manage actual creator gift earnings and PayPal withdrawal details.</p></div><span class='creator-finance-lock'>"+creatorIcon("settings")+" Server-authoritative amounts</span></div>"+
    "<div class='creator-earning-metrics'>"+creatorMetric("Your eligible share",creatorMoney(data.earnedMinor),"50% creator share from eligible LIVE gifts","coins")+creatorMetric("Available to withdraw",creatorMoney(data.availableMinor),"Current server-calculated amount","saved")+creatorMetric("Minglora platform share",creatorMoney(platformTotal),"Recorded platform share from the ledger","profile")+creatorMetric("Non-cash promotional share excluded",creatorMoney(data.promotionalGiftEarningsExcludedMinor||0),"Historical promotional activity · not withdrawable","coins")+creatorMetric("Gift Coins received",Number(giftBalance.receivedCoins||0).toLocaleString(),Number(giftBalance.giftCount||0).toLocaleString()+" confirmed gifts · activity total, not spendable Coins","coins")+"</div>"+
    "<section class='creator-studio-panel creator-ledger-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>GIFT RECEIPTS</span><h3>Gifts received</h3></div><small>Latest 50 · all funding sources</small></div>"+giftReceiptHistory+"<p class='creator-settings-note'>Ordinary promotional Coins remain visible in this gift history but do not create withdrawable earnings. Cash-backed, funded-marketing and separately cash-reserved Admin Promotional gifts create the eligible 50/50 creator share.</p></section>"+
    "<div class='creator-monetization-grid'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>PAYOUT SETTINGS</span><h3>PayPal recipient</h3></div></div><p class='creator-settings-note'>Link the PayPal email address that should receive creator withdrawals. You can save a replacement or unlink it at any time. Your payout history and earnings remain unchanged when you unlink.</p><form id='creator-payout-account-form' class='creator-payout-form'><label class='creator-field-label' for='creator-paypal-email'>PayPal account email</label><input id='creator-paypal-email' name='paypalEmail' type='email' autocomplete='email' maxlength='254' required placeholder='your-paypal@example.com' value='"+esc(account?.paypal_email||"")+"'><div class='creator-payout-actions'><button type='submit' class='primary'>"+(account?"Save payout email":"Link PayPal email")+"</button>"+(account?"<button type='button' class='creator-unlink-paypal' id='creator-unlink-paypal'>Unlink PayPal email</button>":"")+"</div><small>Use the email address registered to your PayPal account. Linking saves it privately to your Minglora account.</small><p class='creator-inline-status' id='creator-payout-account-status' role='status' aria-live='polite'></p></form>"+
    "<form id='creator-withdraw-form' class='creator-payout-form creator-withdraw-form'><label class='creator-field-label' for='creator-payout-amount'>Withdrawal amount (USD)</label><input id='creator-payout-amount' name='amount' type='number' min='1' step='0.01' max='"+(Number(data.availableMinor||0)/100).toFixed(2)+"' value='"+(Number(data.availableMinor||0)/100).toFixed(2)+"' required><button type='submit' class='primary' "+(account&&Number(data.availableMinor)>=100?"":"disabled")+">Request PayPal withdrawal</button><small>Minimum withdrawal: USD $1.00. A submitted request is not the same as a completed payout.</small><p class='creator-inline-status' id='creator-withdraw-status' role='status'></p></form></section>"+
    "<section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>PAYOUT TRACKING</span><h3>Withdrawal history</h3></div></div>"+payoutHistory+"</section></div>"+
    "<section class='creator-studio-panel creator-ledger-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>EARNINGS LEDGER</span><h3>Gift earnings history</h3></div><small>Creator and platform shares are settled separately.</small></div>"+history+"</section>";
}
async function creatorSettingsMarkup(){
  const result=await api("/settings");
  const s=result.settings||{},privacy=s.privacy||{},notifications=s.notifications||{},preferences=s.preferences||{};
  state.creatorStudio.settings=result;
  const themes=["minglora","ocean","tropical","royal","emerald","rose","golden","lavender","midnight","graphite"];
  const themeOptions=themes.map(value=>"<option value='"+value+"' "+(preferences.colorTheme===value?"selected":"")+">"+value.charAt(0).toUpperCase()+value.slice(1)+"</option>").join("");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>WORKSPACE & ACCOUNT</span><h2>Studio settings</h2><p>These settings are saved through Minglora’s authenticated account settings API.</p></div><button type='button' class='secondary' id='creator-edit-profile-button'>Edit profile details</button></div>"+
    "<form id='creator-settings-form' class='creator-settings-grid'>"+
    "<section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>PRIVACY</span><h3>Who can reach you?</h3></div></div>"+
    "<label class='creator-field-label' for='creator-privacy-visibility'>Profile visibility</label><select id='creator-privacy-visibility' name='profileVisibility' class='creator-select'><option value='public' "+(privacy.profileVisibility==="public"?"selected":"")+">Public</option><option value='friends' "+(privacy.profileVisibility==="friends"?"selected":"")+">Friends only</option><option value='private' "+(privacy.profileVisibility==="private"?"selected":"")+">Private</option></select>"+
    "<label class='creator-field-label' for='creator-message-audience'>Who can message you?</label><select id='creator-message-audience' name='messageAudience' class='creator-select'><option value='everyone' "+(privacy.messageAudience==="everyone"?"selected":"")+">Everyone</option><option value='friends' "+(privacy.messageAudience==="friends"?"selected":"")+">Friends only</option><option value='nobody' "+(privacy.messageAudience==="nobody"?"selected":"")+">Nobody</option></select>"+
    "<label class='creator-toggle-row'><span><strong>Friend requests</strong><small>Allow members to send you friend requests.</small></span><input type='checkbox' name='allowFriendRequests' "+(privacy.allowFriendRequests?"checked":"")+"></label></section>"+
    "<section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>NOTIFICATIONS</span><h3>Stay informed</h3></div></div>"+
    [["inApp","In-app notifications","Notifications inside Minglora."],["friendRequests","Friend requests","Requests and friendship updates."],["messages","Messages","New direct messages."],["interactions","Post interactions","Reactions and comments."],["push","Browser push","Push delivery when configured on this device."]].map(([key,label,help])=>"<label class='creator-toggle-row'><span><strong>"+label+"</strong><small>"+help+"</small></span><input type='checkbox' name='notification-"+key+"' "+(notifications[key]?"checked":"")+"></label>").join("")+"</section>"+
    "<section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>APPEARANCE</span><h3>Studio & app appearance</h3></div></div>"+
    "<label class='creator-field-label' for='creator-theme'>Theme mode</label><select id='creator-theme' class='creator-select' name='theme'><option value='system' "+(preferences.theme==="system"?"selected":"")+">System default</option><option value='light' "+(preferences.theme==="light"?"selected":"")+">Light</option><option value='dark' "+(preferences.theme==="dark"?"selected":"")+">Dark</option></select>"+
    "<label class='creator-field-label' for='creator-color-theme'>Color theme</label><select id='creator-color-theme' class='creator-select' name='colorTheme'>"+themeOptions+"</select>"+
    "<label class='creator-toggle-row'><span><strong>Reduce motion</strong><small>Reduce decorative transitions and motion effects.</small></span><input type='checkbox' name='reducedMotion' "+(preferences.reducedMotion?"checked":"")+"></label></section>"+
    "<section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>FEED PREFERENCES</span><h3>Content preferences</h3></div></div>"+
    "<label class='creator-field-label' for='creator-feed-sort'>Default feed order</label><select id='creator-feed-sort' class='creator-select' name='feedSort'><option value='recent' "+(preferences.feedSort==="recent"?"selected":"")+">Newest first</option><option value='oldest' "+(preferences.feedSort==="oldest"?"selected":"")+">Oldest first</option></select>"+
    "<p class='creator-settings-note'>LIVE room design remains managed in the separate LIVE experience. Creator Studio does not duplicate broadcast-room controls.</p></section>"+
    "<div class='creator-settings-savebar'><p class='creator-inline-status' id='creator-settings-status' role='status'>Unsaved changes stay on this form until you save.</p><button type='submit' class='primary' id='creator-settings-save'>Save settings</button></div></form>";
}
async function renderCreatorSection(section){
  const s=state.creatorStudio;
  if(!s)return;
  disposeCreatorStudioStage();
  creatorStudioDestroyPagePickers();
  s.section=section;
  state.restoreCreatorSection=section;
  persistCurrentView();
  recordBrowserNavigation();
  let content="";
  if(section==="overview"){
    content=creatorOverviewMarkup();
  }else if(section==="content"){
    content=creatorContentMarkup();
  }else if(section==="publish"){
    content=creatorPublishMarkup();
  }else if(section==="audience"){
    const profileId=state.user.id;
    const [followers,following]=await Promise.allSettled([
      api("/users/"+encodeURIComponent(profileId)+"/followers"),
      api("/users/"+encodeURIComponent(profileId)+"/following")
    ]);
    s.followers=followers.status==="fulfilled"?(followers.value.users||[]):[];
    s.following=following.status==="fulfilled"?(following.value.users||[]):[];
    s.audienceError=followers.status==="rejected"?followers.reason?.message:null;
    s.followingError=following.status==="rejected"?following.reason?.message:null;
    content=creatorAudienceMarkup();
  }else if(section==="analytics"){
    try{s.profile=await api("/users/"+encodeURIComponent(state.user.id));}
    catch(error){s.analyticsError=error.message;}
    content=creatorAnalyticsMarkup();
  }else if(section==="pages"){
    content=await creatorPagesMarkup();
  }else if(section==="monetization"){
    try{s.earnings=await api("/creator/earnings");s.earningsError=null;}
    catch(error){s.earnings=null;s.earningsError=error.message;}
    content=creatorMonetizationMarkup();
  }else if(section==="settings"){
    try{content=await creatorSettingsMarkup();}
    catch(error){content="<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>WORKSPACE & ACCOUNT</span><h2>Studio settings</h2></div></div>"+creatorEmpty("Settings unavailable",error.message||"Minglora could not load your account settings.","settings");}
  }else{
    content=creatorOverviewMarkup();
    section="overview";
  }
  setContent(creatorStudioChrome(section,content));
  syncCreatorStudioNavigationLayout();
  window.scrollTo({top:0,behavior:"auto"});
  document.querySelectorAll("[data-creator-section]").forEach(button=>button.addEventListener("click",()=>renderCreatorSection(button.dataset.creatorSection).catch(error=>toast(error.message))));
  document.querySelectorAll("[data-creator-open-live]").forEach(button=>button.addEventListener("click",()=>activateNav("live")));
  document.querySelectorAll('[data-creator-start-live]').forEach(button=>button.addEventListener('click',()=>{state.liveStartFormat=button.dataset.creatorStartLive==='audio_only'?'audio_only':'video_audio';activateNav('live');}));
  document.querySelectorAll("[data-creator-edit-profile]").forEach(button=>button.addEventListener("click",()=>openEditProfile(state.user)));
  $("#creator-edit-profile-button")?.addEventListener("click",()=>openEditProfile(state.user));
  if(section==="overview"){
    initCreatorStudio3D(document.getElementById("creator-stage-canvas"));
  }
  if(section==="content"){
    document.querySelectorAll("[data-creator-content-tab]").forEach(button=>button.addEventListener("click",()=>{
      s.contentTab=button.dataset.creatorContentTab;
      document.querySelectorAll("[data-creator-content-tab]").forEach(tab=>tab.classList.toggle("active",tab===button));
      const posts=document.getElementById("creator-post-library"),media=document.getElementById("creator-media-library");
      if(posts)posts.hidden=s.contentTab!=="posts";
      if(media)media.hidden=s.contentTab!=="media";
    }));
    document.querySelectorAll("[data-creator-edit-post]").forEach(button=>button.addEventListener("click",()=>{
      const post=(s.profile.posts||[]).find(item=>item.id===button.dataset.creatorEditPost);
      if(post)openEditPost(post);
    }));
    document.querySelectorAll("[data-creator-delete-post]").forEach(button=>button.addEventListener("click",async()=>{
      if(!window.confirm("Delete this Minglora post permanently?"))return;
      button.disabled=true;
      try{
        await api("/posts/"+encodeURIComponent(button.dataset.creatorDeletePost),{method:"DELETE",body:"{}"});
        s.profile=await api("/users/"+encodeURIComponent(state.user.id));
        toast("Post deleted.");
        await renderCreatorSection("content");
      }catch(error){toast(error.message);button.disabled=false;}
    }));
  }
  if(section==="publish"){
    const root=document.getElementById("creator-post-media-picker");
    const picker=root?createMediaPicker(root,{slot:"post",maxFiles:10}):null;
    const form=document.getElementById("creator-publish-form");
    form?.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=document.getElementById("creator-publish-submit"),status=document.getElementById("creator-publish-status");
      const values=new FormData(form),text=String(values.get("text")||"").trim();
      if(!text&&!(picker&&picker.hasSelection())){toast("Write a caption or attach media before publishing.");return;}
      button.disabled=true;
      if(status)status.textContent="Uploading media and publishing through Minglora…";
      try{
        const mediaIds=picker?await picker.upload():[];
        await api("/posts",{method:"POST",body:JSON.stringify({text,mediaIds})});
        if(status)status.textContent="Minglora confirmed your post was published.";
        toast("Your post is published.");
        s.profile=await api("/users/"+encodeURIComponent(state.user.id));
        if(picker)picker.destroy();
        await renderCreatorSection("content");
      }catch(error){
        if(status)status.textContent=error.message||"Publishing failed; no success was reported.";
        toast(error.message||"Minglora could not publish this post.");
        button.disabled=false;
      }
    });
  }
  if(section==="pages"){
    const createForm=document.getElementById("creator-create-page-form");
    createForm?.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=createForm.querySelector("button[type='submit']"),status=document.getElementById("creator-page-create-status");
      const values=new FormData(createForm);
      button.disabled=true;
      try{
        const result=await api("/pages",{method:"POST",body:JSON.stringify({
          handle:values.get("handle"),title:values.get("title"),description:values.get("description"),category:values.get("category")
        })});
        if(status)status.textContent="Page created: @"+result.page.handle;
        toast("Your Minglora Page was created.");
        const pageList=await api("/pages");
        s.pages=(pageList.pages||[]).filter(page=>["owner","admin","editor"].includes(page.myRole));
        await renderCreatorSection("pages");
      }catch(error){if(status)status.textContent=error.message;toast(error.message);button.disabled=false;}
    });
    document.querySelectorAll("[data-creator-page-form]").forEach(form=>{
      const pageId=form.dataset.creatorPageForm;
      const pickerRoot=form.querySelector("[data-creator-page-picker]");
      const picker=pickerRoot?createMediaPicker(pickerRoot,{slot:"page",maxFiles:10}):null;
      if(picker)s.pagePickers.push(picker);
      form.addEventListener("submit",async event=>{
        event.preventDefault();
        const button=form.querySelector("button[type='submit']"),status=form.querySelector(".creator-inline-status"),values=new FormData(form);
        if(!String(values.get("text")||"").trim()&&!(picker&&picker.hasSelection())){toast("Add text or media before publishing to this Page.");return;}
        button.disabled=true;
        try{
          const mediaIds=picker?await picker.upload():[];
          await api("/pages/"+encodeURIComponent(pageId)+"/posts",{method:"POST",body:JSON.stringify({text:values.get("text"),mediaIds})});
          if(status)status.textContent="Page post published.";
          toast("Page post published.");
          await renderCreatorSection("pages");
        }catch(error){if(status)status.textContent=error.message;toast(error.message);button.disabled=false;}
      });
    });
    document.querySelectorAll("[data-creator-delete-page-post]").forEach(button=>button.addEventListener("click",async()=>{
      const [pageId,postId]=button.dataset.creatorDeletePagePost.split("|");
      if(!window.confirm("Delete this Page post?"))return;
      button.disabled=true;
      try{await api("/pages/"+encodeURIComponent(pageId)+"/posts/"+encodeURIComponent(postId),{method:"DELETE",body:"{}"});toast("Page post deleted.");await renderCreatorSection("pages");}
      catch(error){toast(error.message);button.disabled=false;}
    }));
    document.querySelectorAll("[data-creator-delete-page]").forEach(button=>button.addEventListener("click",async()=>{
      if(!window.confirm("Delete this Page and all its Page posts? This cannot be undone."))return;
      button.disabled=true;
      try{await api("/pages/"+encodeURIComponent(button.dataset.creatorDeletePage),{method:"DELETE",body:"{}"});toast("Minglora Page deleted.");const result=await api("/pages");s.pages=(result.pages||[]).filter(page=>["owner","admin","editor"].includes(page.myRole));await renderCreatorSection("pages");}
      catch(error){toast(error.message);button.disabled=false;}
    }));
  }
  if(section==="audience"){
    document.querySelectorAll("[data-creator-view-profile]").forEach(button=>button.addEventListener("click",()=>openProfile(button.dataset.creatorViewProfile)));
  }
  if(section==="analytics"){
  }
  if(section==="monetization"){
    $("#creator-payout-account-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget,button=form.querySelector("button[type='submit']"),status=$("#creator-payout-account-status");
      button.disabled=true;
      try{
        await api("/creator/payout-account",{method:"PUT",body:JSON.stringify({paypalEmail:form.elements.paypalEmail.value})});
        if(status)status.textContent="PayPal payout email saved to Minglora.";
        toast("PayPal payout details saved.");
        s.earnings=await api("/creator/earnings");
        await renderCreatorSection("monetization");
      }catch(error){if(status)status.textContent=error.message;toast(error.message);button.disabled=false;}
    });
    $("#creator-unlink-paypal")?.addEventListener("click",async()=>{
      const button=$("#creator-unlink-paypal"),status=$("#creator-payout-account-status");
      if(!button)return;
      button.disabled=true;
      try{
        await api("/creator/payout-account",{method:"DELETE"});
        if(status)status.textContent="PayPal payout email unlinked. You can link another email whenever you are ready.";
        toast("PayPal payout email unlinked.");
        s.earnings=await api("/creator/earnings");
        await renderCreatorSection("monetization");
      }catch(error){
        if(status)status.textContent=error.message;
        toast(error.message);
        button.disabled=false;
      }
    });
    $("#creator-withdraw-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget,amount=Number(form.elements.amount.value),button=form.querySelector("button[type='submit']"),status=$("#creator-withdraw-status");
      if(!Number.isFinite(amount)||amount<1){toast("The minimum payout is USD $1.00.");return;}
      button.disabled=true;
      try{
        const result=await api("/creator/payouts",{method:"POST",body:JSON.stringify({amountMinor:Math.round(amount*100)})});
        if(status)status.textContent="PayPal returned payout status: "+String(result.status||"submitted")+".";
        toast("PayPal payout submitted. Status: "+String(result.status||"submitted")+".");
        s.earnings=await api("/creator/earnings");
        await renderCreatorSection("monetization");
      }catch(error){if(status)status.textContent=error.message;toast(error.message);button.disabled=false;}
    });
  }
  if(section==="settings"){
    $("#creator-settings-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget,button=$("#creator-settings-save"),status=$("#creator-settings-status"),values=new FormData(form);
      button.disabled=true;
      const checkbox=name=>form.elements[name].checked;
      const patch={
        privacy:{
          profileVisibility:values.get("profileVisibility"),
          messageAudience:values.get("messageAudience"),
          allowFriendRequests:checkbox("allowFriendRequests")
        },
        notifications:{
          inApp:checkbox("notification-inApp"),
          friendRequests:checkbox("notification-friendRequests"),
          messages:checkbox("notification-messages"),
          interactions:checkbox("notification-interactions"),
          push:checkbox("notification-push")
        },
        preferences:{
          theme:values.get("theme"),
          colorTheme:values.get("colorTheme"),
          feedSort:values.get("feedSort"),
          reducedMotion:checkbox("reducedMotion")
        }
      };
      try{
        const result=await api("/settings",{method:"PATCH",body:JSON.stringify(patch)});
        s.settings=result;
        state.settings=result.settings;
        window.dispatchEvent(new CustomEvent("minglora:settings-loaded",{detail:result.settings}));
        if(status)status.textContent="Your Minglora account settings have been saved.";
        toast("Creator Studio settings saved.");
        await renderCreatorSection("settings");
      }catch(error){if(status)status.textContent=error.message;toast(error.message);button.disabled=false;}
    });
  }
}
function initCreatorStudio3D(canvas){
  if(!canvas)return;
  const fallback=document.getElementById("creator-stage-fallback");
  const svgFallback=document.getElementById("creator-stage-svg-fallback");
  const visual=canvas.closest(".creator-stage-visual");
  const caption=visual?.querySelector(".creator-stage-caption");
  const showCompatibilityScene=reason=>{
    canvas.hidden=true;
    if(svgFallback){svgFallback.hidden=false;svgFallback.setAttribute("aria-hidden","false");}
    visual?.classList.add("creator-stage-compatibility");
    if(caption)caption.innerHTML="<span></span> COMPATIBILITY 3D SCENE <small>Drag to orbit</small>";
    if(fallback){fallback.hidden=false;fallback.textContent="Your 3D production scene is displayed using the browser-compatible renderer.";fallback.title=String(reason||"");}
    const world=svgFallback?.querySelector("#creator-stage-svg-world");
    let yaw=-12,pitch=0,dragging=false,lastX=0,lastY=0,paused=false;
    const applyOrbit=()=>{if(world)world.style.transform="perspective(900px) rotateX("+(pitch+8)+"deg) rotateY("+(yaw-12)+"deg)";};
    const onDown=event=>{dragging=true;lastX=event.clientX;lastY=event.clientY;svgFallback?.classList.add("is-dragging");svgFallback?.setPointerCapture?.(event.pointerId);};
    const onMove=event=>{if(!dragging)return;yaw=Math.max(-38,Math.min(38,yaw+(event.clientX-lastX)*.32));pitch=Math.max(-18,Math.min(22,pitch+(event.clientY-lastY)*.22));lastX=event.clientX;lastY=event.clientY;applyOrbit();};
    const onUp=()=>{dragging=false;svgFallback?.classList.remove("is-dragging");};
    const onReset=()=>{yaw=-12;pitch=0;applyOrbit();};
    const onPause=()=>{paused=!paused;visual?.classList.toggle("is-paused",paused||document.hidden);const button=document.getElementById("creator-stage-pause");if(button)button.textContent=paused?"▶":"Ⅱ";};
    const onVisibility=()=>{visual?.classList.toggle("is-paused",paused||document.hidden);};
    svgFallback?.addEventListener("pointerdown",onDown);
    svgFallback?.addEventListener("pointermove",onMove);
    svgFallback?.addEventListener("pointerup",onUp);
    svgFallback?.addEventListener("pointercancel",onUp);
    document.getElementById("creator-stage-reset")?.addEventListener("click",onReset);
    document.getElementById("creator-stage-pause")?.addEventListener("click",onPause);
    document.addEventListener("visibilitychange",onVisibility);
    applyOrbit();
    creatorStudioStageCleanup=()=>{
      svgFallback?.removeEventListener("pointerdown",onDown);svgFallback?.removeEventListener("pointermove",onMove);
      svgFallback?.removeEventListener("pointerup",onUp);svgFallback?.removeEventListener("pointercancel",onUp);
      document.getElementById("creator-stage-reset")?.removeEventListener("click",onReset);
      document.getElementById("creator-stage-pause")?.removeEventListener("click",onPause);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  };
  let gl;
  try{gl=canvas.getContext("webgl",{alpha:true,antialias:true,powerPreference:"high-performance",preserveDrawingBuffer:false})||canvas.getContext("experimental-webgl");}
  catch(error){gl=null;}
  if(!gl){showCompatibilityScene("This browser or device did not provide a WebGL context.");return;}
  canvas.hidden=false;
  try{
  const vertexSource="attribute vec3 aPosition;\nattribute vec3 aNormal;\nuniform mat4 uMvp;\nuniform mat4 uModel;\nvarying vec3 vNormal;\nvarying vec3 vPosition;\nvoid main(){ vec4 world=uModel*vec4(aPosition,1.0); vPosition=world.xyz; vNormal=normalize(mat3(uModel)*aNormal); gl_Position=uMvp*vec4(aPosition,1.0); }";
  const fragmentSource="precision mediump float;\nuniform vec3 uColor;\nuniform float uGlow;\nvarying vec3 vNormal;\nvarying vec3 vPosition;\nvoid main(){ vec3 n=normalize(vNormal); vec3 light=normalize(vec3(-0.38,0.82,0.46)); float diffuse=max(dot(n,light),0.0); float rim=pow(1.0-max(dot(n,normalize(vec3(0.0,0.4,1.0))),0.0),2.0); vec3 color=uColor*(0.38+diffuse*0.72)+uGlow*(rim*vec3(0.4,0.55,1.0)+vec3(0.04,0.08,0.16)); gl_FragColor=vec4(color,1.0); }";
  function shader(type,source){
    const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
    if(!gl.getShaderParameter(value,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(value);gl.deleteShader(value);throw new Error(message||"WebGL shader compilation failed.");}
    return value;
  }
  let program;
  try{
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"WebGL program link failed.");
  }catch(error){showCompatibilityScene(error.message||"The WebGL shaders could not initialize.");return;}
  const attributes={position:gl.getAttribLocation(program,"aPosition"),normal:gl.getAttribLocation(program,"aNormal")};
  const uniforms={mvp:gl.getUniformLocation(program,"uMvp"),model:gl.getUniformLocation(program,"uModel"),color:gl.getUniformLocation(program,"uColor"),glow:gl.getUniformLocation(program,"uGlow")};
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(0.028,0.045,0.082,0);
  function geometry(positions,normals){return {positions:new Float32Array(positions),normals:new Float32Array(normals),count:positions.length/3};}
  function boxGeometry(){
    const p=[],n=[];
    const faces=[
      [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]],
      [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]],
      [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]],
      [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]],
      [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]],
      [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]]
    ];
    for(const f of faces){
      const ids=[0,1,2,0,2,3];
      for(const id of ids){p.push(...f[id]);n.push(...f[4]);}
    }
    return geometry(p,n);
  }
  function cylinderGeometry(segments=48){
    const p=[],n=[];
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const p1=[Math.cos(a),-.5,Math.sin(a)],p2=[Math.cos(b),-.5,Math.sin(b)];
      const p3=[Math.cos(b),.5,Math.sin(b)],p4=[Math.cos(a),.5,Math.sin(a)];
      const ids=[p1,p3,p2,p1,p4,p3];
      for(const v of ids){p.push(...v);const l=Math.hypot(v[0],v[2])||1;n.push(v[0]/l,0,v[2]/l);}
      const bottom=[[0,-.5,0],p1,p2],top=[[0,.5,0],p3,p4];
      for(const v of bottom){p.push(...v);n.push(0,-1,0);}
      for(const v of top){p.push(...v);n.push(0,1,0);}
    }
    return geometry(p,n);
  }
  function torusGeometry(R=1,r=.08,major=64,minor=12){
    const p=[],n=[];
    for(let i=0;i<major;i++){
      const a=i/major*Math.PI*2,b=(i+1)/major*Math.PI*2;
      for(let j=0;j<minor;j++){
        const c=j/minor*Math.PI*2,d=(j+1)/minor*Math.PI*2;
        const point=(u,v)=>[(R+r*Math.cos(v))*Math.cos(u),(R+r*Math.cos(v))*Math.sin(u),r*Math.sin(v)];
        const normal=(u,v)=>[Math.cos(v)*Math.cos(u),Math.cos(v)*Math.sin(u),Math.sin(v)];
        const coords=[[a,c],[b,c],[b,d],[a,c],[b,d],[a,d]];
        for(const [u,v] of coords){p.push(...point(u,v));n.push(...normal(u,v));}
      }
    }
    return geometry(p,n);
  }
  const geometries={box:boxGeometry(),cylinder:cylinderGeometry(),torus:torusGeometry()};
  function buffer(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  for(const geo of Object.values(geometries)){geo.positionBuffer=buffer(geo.positions);geo.normalBuffer=buffer(geo.normals);}
  const objects=[];
  function add(shape,x,y,z,sx,sy,sz,color,glow=0,rx=0,ry=0,rz=0){
    objects.push({shape,x,y,z,sx,sy,sz,color,glow,rx,ry,rz});
  }
  add("cylinder",0,0.02,0,2.35,.18,2.35,[.12,.18,.31],.04);
  add("torus",0,.13,0,2.13,.04,2.13,[.15,.65,.82],.58,0,0,0);
  add("box",0,.53,.05,2.4,.16,1.05,[.2,.25,.43],.08);
  add("box",0,.45,.59,2.2,.065,.035,[.38,.3,.82],.56);
  add("box",-0.92,.85,-.16,.12,.55,.13,[.14,.2,.32],.02);
  add("box",.92,.85,-.16,.12,.55,.13,[.14,.2,.32],.02);
  add("box",0,1.33,-.22,1.78,1.12,.13,[.13,.17,.31],.1);
  add("box",0,1.33,-.137,1.63,.94,.025,[.24,.33,.65],.58);
  add("box",-.28,1.54,-.115,.92,.045,.012,[.36,.86,.92],.76);
  add("box",-.49,1.36,-.115,.58,.025,.012,[.67,.56,1],.64);
  add("box",.58,1.15,-.115,.38,.025,.012,[.4,.49,.76],.34);
  add("cylinder",-1.45,.59,.13,.14,.82,.14,[.13,.18,.29],.02);
  add("box",-1.45,1.05,.13,.53,.35,.38,[.24,.3,.48],.12);
  add("cylinder",-1.45,1.05,.35,.25,.24,.25,[.18,.31,.58],.2,Math.PI/2,0,0);
  add("torus",-1.45,1.05,.49,.16,.16,.16,[.24,.83,.88],.78);
  add("cylinder",1.43,.58,-.52,.065,.82,.065,[.22,.28,.42],.02);
  add("torus",1.43,1.28,-.52,.58,.58,.58,[.52,.39,.98],.7,0,0,0);
  add("torus",1.43,1.28,-.52,.48,.48,.48,[.24,.83,.83],.43,0,0,0);
  add("cylinder",-1.92,.55,-.72,.24,.92,.24,[.13,.2,.34],.06);
  add("cylinder",-1.92,1.13,-.72,.31,.12,.31,[.19,.29,.48],.14);
  add("cylinder",1.98,.44,.63,.19,.72,.19,[.13,.2,.34],.05);
  add("cylinder",1.98,.91,.63,.27,.11,.27,[.25,.34,.51],.12);
  add("torus",0,2.45,-.1,1.42,.025,1.42,[.22,.72,.9],.32,Math.PI/2,0,0);
  const yawState={yaw:.55,pitch:.28,drag:false,lastX:0,lastY:0,paused:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches||false};
  function matIdentity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
  function matMultiply(a,b){
    const out=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return out;
  }
  function matTranslate(x,y,z){const m=matIdentity();m[12]=x;m[13]=y;m[14]=z;return m;}
  function matScale(x,y,z){const m=matIdentity();m[0]=x;m[5]=y;m[10]=z;return m;}
  function matRotateX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
  function matRotateY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
  function matRotateZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
  function matPerspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),nf=1/(near-far),m=new Float32Array(16);
    m[0]=f/aspect;m[5]=f;m[10]=(far+near)*nf;m[11]=-1;m[14]=2*far*near*nf;return m;
  }
  function vNormalize(v){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];}
  function vCross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function vDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function matLookAt(eye,target,up){
    const z=vNormalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=vNormalize(vCross(up,z)),y=vCross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-vDot(x,eye),-vDot(y,eye),-vDot(z,eye),1]);
  }
  function modelMatrix(o,time){
    let m=matTranslate(o.x,o.y,o.z);
    m=matMultiply(m,matRotateY(o.ry+(o.shape==="torus"?time*.00018:0)));
    m=matMultiply(m,matRotateX(o.rx));
    m=matMultiply(m,matRotateZ(o.rz));
    return matMultiply(m,matScale(o.sx,o.sy,o.sz));
  }
  const resize=()=>{
    const rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.floor(rect.width)),height=Math.max(1,Math.floor(rect.height));
    const ratio=Math.min(window.devicePixelRatio||1,1.65);
    const w=Math.floor(width*ratio),h=Math.floor(height*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
  };
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
  observer?.observe(canvas);resize();
  let frame=0,disposed=false;
  function render(now){
    if(disposed)return;
    frame=requestAnimationFrame(render);
    try{
    if(yawState.paused&&now!==0){/* Render a stable frame while paused. */}
    else{
      objects[16].ry+=.0011;
      objects[17].ry-=.0008;
    }
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const aspect=canvas.width/Math.max(1,canvas.height);
    const projection=matPerspective(.73,aspect,.1,60);
    const radius=7.3,eye=[Math.sin(yawState.yaw)*radius,2.6+yawState.pitch*3,Math.cos(yawState.yaw)*radius],view=matLookAt(eye,[0,1,0],[0,1,0]);
    const vp=matMultiply(projection,view);
    for(const object of objects){
      const geo=geometries[object.shape],model=modelMatrix(object,now),mvp=matMultiply(vp,model);
      gl.bindBuffer(gl.ARRAY_BUFFER,geo.positionBuffer);gl.enableVertexAttribArray(attributes.position);gl.vertexAttribPointer(attributes.position,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,geo.normalBuffer);gl.enableVertexAttribArray(attributes.normal);gl.vertexAttribPointer(attributes.normal,3,gl.FLOAT,false,0,0);
      gl.uniformMatrix4fv(uniforms.mvp,false,mvp);gl.uniformMatrix4fv(uniforms.model,false,model);
      gl.uniform3fv(uniforms.color,object.color);gl.uniform1f(uniforms.glow,object.glow);
      gl.drawArrays(gl.TRIANGLES,0,geo.count);
    }
    }catch(error){
      if(disposed)return;
      const cleanup=creatorStudioStageCleanup;creatorStudioStageCleanup=null;cleanup?.();
      showCompatibilityScene(error.message||"The WebGL renderer stopped unexpectedly.");
    }
  }
  frame=requestAnimationFrame(render);
  const onDown=event=>{yawState.drag=true;yawState.lastX=event.clientX;yawState.lastY=event.clientY;canvas.setPointerCapture?.(event.pointerId);};
  const onMove=event=>{if(!yawState.drag)return;yawState.yaw+=(event.clientX-yawState.lastX)*.008;yawState.pitch=Math.max(-.35,Math.min(.6,yawState.pitch+(event.clientY-yawState.lastY)*.003));yawState.lastX=event.clientX;yawState.lastY=event.clientY;};
  const onUp=()=>{yawState.drag=false;};
  canvas.addEventListener("pointerdown",onDown);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",onUp);canvas.addEventListener("pointercancel",onUp);
  const reset=document.getElementById("creator-stage-reset");
  reset?.addEventListener("click",()=>{yawState.yaw=.55;yawState.pitch=.28;});
  const pause=document.getElementById("creator-stage-pause");
  pause?.addEventListener("click",()=>{yawState.paused=!yawState.paused;if(pause)pause.textContent=yawState.paused?"▶":"Ⅱ";});
  const onVisibility=()=>{if(document.hidden)yawState.paused=true;};
  document.addEventListener("visibilitychange",onVisibility);
  const onContextLost=event=>{
    event.preventDefault();
    const cleanup=creatorStudioStageCleanup;creatorStudioStageCleanup=null;cleanup?.();
    showCompatibilityScene("The browser released the WebGL context; the compatibility renderer is now active.");
  };
  canvas.addEventListener("webglcontextlost",onContextLost,false);
  creatorStudioStageCleanup=()=>{
    disposed=true;cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener("visibilitychange",onVisibility);
    canvas.removeEventListener("pointerdown",onDown);canvas.removeEventListener("pointermove",onMove);canvas.removeEventListener("pointerup",onUp);canvas.removeEventListener("pointercancel",onUp);
    canvas.removeEventListener("webglcontextlost",onContextLost);
    Object.values(geometries).forEach(geo=>{gl.deleteBuffer(geo.positionBuffer);gl.deleteBuffer(geo.normalBuffer);});
    gl.deleteProgram(program);
  };
  }catch(error){showCompatibilityScene(error.message||"The WebGL renderer could not initialize.");}
}
function disposeCreatorStudioStage(){if(creatorStudioStageCleanup){creatorStudioStageCleanup();creatorStudioStageCleanup=null;}}

async function finishPaypalCoinReturn(){
  const params=new URLSearchParams(window.location.search),status=params.get("paypal"),orderId=params.get("token");
  if(status==="cancel"){window.history.replaceState(null,"",window.location.pathname);toast("PayPal checkout was cancelled. No Coins were added.");return;}
  if(status!=="coins"||!orderId)return;
  window.history.replaceState(null,"",window.location.pathname);
  try{await api("/coins/purchase/capture",{method:"POST",body:JSON.stringify({orderId})});toast("Payment confirmed. Your Minglora Coins are ready.");await renderCoins();}
  catch(error){toast("PayPal return received, but the purchase could not be completed: "+error.message);}
}

function activateSilent(view){if(view!=='profile')stopProfilePresence();if(view!=='friends')stopPeopleDiscoveryRefresh();if(view!=='profile')state.profileTargetId='';state.view=view;syncMessageRefreshPolling();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));persistCurrentView();recordBrowserNavigation();}
async function loadGroups(){state.groups=(await api('/groups')).groups;}
async function renderGroups(){
  activateSilent('groups');await loadGroups();
  let html='<div class="page-heading"><h1>Groups</h1><button class="primary" id="create-group">＋ Create group</button></div><section class="card welcome"><h1>Find your people</h1><p>Join communities around your interests or start your own.</p></section>';
  if(state.groups.length){
    html+='<div class="groups-grid">'+state.groups.map(g=>{
      const owner=g.ownerId===state.user.id;
      let action='';
      if(!g.isMember)action='<button class="primary full" data-join-group="'+esc(g.id)+'">Join group</button>';
      else if(!owner)action='<button class="secondary full" data-leave-group="'+esc(g.id)+'">Leave group</button>';
      return '<article class="card group-card"><div class="group-icon">◉</div><h3>'+esc(g.name)+'</h3>'+(g.description?'<p>'+esc(g.description)+'</p>':'')+'<small>'+(g.memberCount??(g.members||[]).length)+' members · Created by '+esc(g.owner?.name||'account')+'</small><div class="group-card-actions"><button class="secondary full" data-open-group="'+esc(g.id)+'">Open group</button>'+action+'</div></article>';
    }).join('')+'</div>';
  }else{
    html+='<section class="card empty-state"><h3>No groups have been created yet</h3><p>Start a group and invite people to join. Groups will appear here after someone creates one.</p></section>';
  }
  setContent(html);$('#create-group').onclick=()=>openGroupModal();
  document.querySelectorAll('[data-open-group]').forEach(btn=>btn.addEventListener('click',()=>renderGroup(btn.dataset.openGroup)));
  document.querySelectorAll('[data-join-group]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api('/groups/'+btn.dataset.joinGroup+'/join',{method:'POST',body:'{}'});toast('You joined the group.');await renderGroups()}catch(e){toast(e.message)}}));
  document.querySelectorAll('[data-leave-group]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Leave this group?'))return;try{await api('/groups/'+btn.dataset.leaveGroup+'/join',{method:'DELETE',body:'{}'});toast('You left the group.');await renderGroups()}catch(e){toast(e.message)}}));
}
async function renderGroup(groupId){
  state.activeGroup=groupId;activateSilent('group');persistCurrentView();
  const data=await api('/groups/'+encodeURIComponent(groupId));
  const g=data.group;const isOwner=g.ownerId===state.user.id;
  let html='<section class="card group-detail-head"><button class="text-button" id="back-to-groups">← All groups</button><div class="group-icon">◉</div><h1>'+esc(g.name)+'</h1>'+(g.description?'<p>'+esc(g.description)+'</p>':'')+'<p class="muted">'+g.memberCount+' members · Created by '+esc(g.owner?.name||'account')+'</p><div class="group-members">'+(g.members||[]).slice(0,12).map(m=>'<span class="group-member" title="'+esc(m.name)+'">'+esc(m.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase())+'</span>').join('')+'</div>';
  if(g.isMember&&!isOwner)html+='<button class="secondary" id="leave-current-group">Leave group</button>';
  if(!g.isMember)html+='<button class="primary" id="join-current-group">Join group</button>';
  if(!isOwner)html+='<button class="secondary" id="report-group">Report group</button>';
  html+='</section>';
  if(g.isMember){
    html+='<section class="card group-post-composer"><h2>Group discussion</h2><form id="group-post-form"><label for="group-post-text">Share with this group</label><textarea id="group-post-text" name="text" maxlength="5000" placeholder="Write a group post..."></textarea><div class="field"><label>Photos and MP4 videos (up to 250 MB each)</label><div id="group-post-media-picker"></div></div><div class="group-form-actions"><small class="muted">Visible to group members and group visitors.</small><button class="primary" type="submit">Publish</button></div></form></section>';
  }
  if(data.posts.length){
    html+='<div class="group-post-list">'+data.posts.map(p=>'<article class="card group-post"><div class="post-head"><img class="avatar" src="'+avatar(p.author)+'" alt=""><div class="post-author"><strong>'+esc(p.author?.name||'Unknown account')+'</strong><small>'+timeAgo(p.createdAt)+'</small></div>'+(p.userId===state.user.id||isOwner?'<button class="post-menu" aria-label="Delete group post" data-delete-group-post="'+esc(p.id)+'">···</button>':'<button class="post-menu" aria-label="Report group post" data-report-group-post="'+esc(p.id)+'">⚑</button>')+'</div>'+(p.text?'<div class="post-text">'+esc(p.text)+'</div>':'')+renderPostMedia(p)+'</article>').join('')+'</div>';
  }else{
    html+='<section class="card empty-state"><h3>No group posts yet</h3><p>Be the first member to start a discussion.</p></section>';
  }
  setContent(html);
  const groupMediaPicker=$('#group-post-media-picker')?createMediaPicker($('#group-post-media-picker'),{slot:'group',maxFiles:10}):null;
  $('#back-to-groups')?.addEventListener('click',()=>renderGroups());
  $('#report-group')?.addEventListener('click',()=>openReportComposer('group',groupId));
  $('#join-current-group')?.addEventListener('click',async()=>{try{await api('/groups/'+groupId+'/join',{method:'POST',body:'{}'});toast('You joined the group.');await renderGroup(groupId)}catch(e){toast(e.message)}});
  $('#leave-current-group')?.addEventListener('click',async()=>{if(!window.confirm('Leave this group?'))return;try{await api('/groups/'+groupId+'/join',{method:'DELETE',body:'{}'});toast('You left the group.');await renderGroup(groupId)}catch(e){toast(e.message)}});
  $('#group-post-form')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;try{const values=new FormData(e.currentTarget),mediaIds=groupMediaPicker?await groupMediaPicker.upload():[];await api('/groups/'+groupId+'/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});groupMediaPicker?.destroy();toast('Group post published.');await renderGroup(groupId)}catch(err){toast(err.message);button.disabled=false;}});
  document.querySelectorAll('[data-report-group-post]').forEach(btn=>btn.addEventListener('click',()=>openReportComposer('post',btn.dataset.reportGroupPost)));
  document.querySelectorAll('[data-delete-group-post]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Delete this group post?'))return;try{await api('/groups/'+groupId+'/posts/'+btn.dataset.deleteGroupPost,{method:'DELETE',body:'{}'});toast('Group post deleted.');await renderGroup(groupId)}catch(err){toast(err.message)}}));
}
function openGroupModal(){const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<section class="modal"><div class="modal-head"><h2>Create a group</h2><button class="modal-close">×</button></div><form class="modal-body" id="group-form"><div class="field"><label>Group name</label><input name="name" minlength="3" maxlength="80" required placeholder="e.g. Local book club"></div><div class="field"><label>Description</label><textarea name="description" maxlength="500" placeholder="What brings this community together?"></textarea></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Create group</button></div></form></section>`;document.body.append(modal);modal.querySelectorAll('.modal-close,.modal-cancel').forEach(b=>b.onclick=()=>modal.remove());modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});modal.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await api('/groups',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});modal.remove();toast('Group created.');renderGroups()}catch(err){toast(err.message)}};}
async function openProfile(id,openEditor=false){stopProfilePresence();if(state.profileTargetId!==String(id))state.profileTab='posts';state.profileTargetId=String(id);persistCurrentView();try{const data=await api('/users/'+encodeURIComponent(id));const extras=await Promise.allSettled([api('/users/'+encodeURIComponent(id)+'/profile-status'),api('/users/'+encodeURIComponent(id)+'/check-ins'),api('/users/'+encodeURIComponent(id)+'/events'),api('/users/'+encodeURIComponent(id)+'/highlights')]);data.profileStatus=extras[0].status==='fulfilled'?extras[0].value.status||null:null;data.user.profileThought=data.profileStatus;if(data.user.id===state.user?.id)state.user.profileThought=data.profileStatus;data.checkIns=extras[1].status==='fulfilled'?extras[1].value.checkIns||[]:[];data.events=extras[2].status==='fulfilled'?extras[2].value.events||[]:[];data.highlights=extras[3].status==='fulfilled'?extras[3].value.highlights||[]:[];state.profile=data;renderProfile(data);if(openEditor)openEditProfile(data.user)}catch(e){toast(e.message)}}
window.addEventListener('minglora:open-profile-editor',()=>{if(state.user)void openProfile(state.user.id,true);});
window.addEventListener('minglora:open-profile',event=>{const userId=event.detail?.userId;if(state.user&&userId)void openProfile(String(userId));});

async function renderConnections(profileId,kind){
  if(!['followers','following','friends','subscribers'].includes(kind))return;
  state.activeConnections={profileId,kind};activateSilent('connections');persistCurrentView();
  try{
    const results=await Promise.all([api('/users/'+encodeURIComponent(profileId)+'/'+kind),api('/users/'+encodeURIComponent(profileId))]);
    const data=results[0],profile=results[1],users=data.users||[];
    const rows=users.map(member=>'<div class="settings-blocked-person connection-row"><img data-profile="'+esc(member.id)+'" src="'+avatar(member)+'" alt="View '+esc(member.name)+'’s profile"><div><strong data-profile="'+esc(member.id)+'" role="link" tabindex="0">'+esc(member.name)+'</strong><small data-profile="'+esc(member.id)+'" role="link" tabindex="0">@'+esc(member.username)+' '+verifiedProfileBadge(member)+'</small></div><button class="secondary" type="button" data-profile="'+esc(member.id)+'">View profile</button></div>').join('');
    setContent('<div class="page-heading"><div><h1>'+({followers:'Followers',following:'Following',friends:'Friends',subscribers:'Subscribers'})[kind]+'</h1><p class="muted">'+esc(profile.user.name)+' · '+data.count+' '+kind+'</p></div><button class="secondary" id="connections-back">Back to profile</button></div><section class="card">'+(rows||'<div class="empty-state"><h3>No '+kind+' yet</h3><p>'+(kind==='subscribers'?'Active subscribers will appear here when members subscribe.':'This list will appear when members connect.')+'</p></div>')+'</section>');
    $('#connections-back')?.addEventListener('click',()=>openProfile(profileId));
    bindProfileLinks($('#main-content'));
  }catch(error){toast(error.message);if(state.profile)renderProfile(state.profile);}
}

function openImageViewer(url,label='Image'){
  if(!url)return;
  const modal=document.createElement('div');modal.className='modal-backdrop image-viewer-backdrop';
  modal.innerHTML='<section class="image-viewer-modal" role="dialog" aria-modal="true" aria-label="'+esc(label)+'"><button type="button" class="image-viewer-close" aria-label="Close image">×</button><img src="'+esc(url)+'" alt="'+esc(label)+'"><p>'+esc(label)+'</p></section>';
  document.body.append(modal);
  const close=()=>modal.remove();
  modal.querySelector('.image-viewer-close').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  document.addEventListener('keydown',function onKey(event){if(event.key==='Escape'){close();document.removeEventListener('keydown',onKey);}});
}
const ABOUT_SECTION_DEFINITIONS=[
  ['personalDetails','Personal details','Basic details, location and personal information'],
  ['intro','Intro','A short introduction about you'],
  ['work','Work','Current and previous workplaces'],
  ['education','Education','Schools, colleges and qualifications'],
  ['hobbies','Hobbies','Things you enjoy doing'],
  ['interests','Interests','Music, films, books, sports, games and more'],
  ['travel','Travel','Places you have visited and want to explore'],
  ['links','Links','Personal websites, portfolios and social media'],
  ['contactInfo','Contact info','Ways people can contact you'],
  ['names','Names','Other names, nicknames and pronunciation'],
  ['details','Details','Languages, favourite quote and extra information'],
  ['aboutYou','About you','A little more about who you are']
];
const DEFAULT_ABOUT_SECTION_VISIBILITY_UI={
  personalDetails:'friends',intro:'public',work:'public',education:'public',hobbies:'public',
  interests:'public',travel:'public',links:'public',contactInfo:'private',names:'friends',
  details:'friends',aboutYou:'public'
};
function aboutRowMarkup(label,value,extraClass=''){
  if(value===undefined||value===null||String(value).trim()==='')return '';
  return '<div class="about-row '+extraClass+'"><span>'+esc(label)+'</span><strong>'+esc(String(value))+'</strong></div>';
}
function aboutChipsMarkup(items){
  return Array.isArray(items)&&items.length
    ?'<div class="about-chip-list">'+items.map(item=>'<span class="about-chip">'+esc(item)+'</span>').join('')+'</div>'
    :'';
}
function aboutSafeExternalUrl(value){
  try{
    const url=new URL(String(value||''));
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.')?url.href:'';
  }catch{return '';}
}
function aboutLinkMarkup(link){
  const href=aboutSafeExternalUrl(link?.url);
  if(!href)return '';
  const label=String(link.label||link.platform||new URL(href).hostname);
  return '<a class="about-social-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(label)+'</span><small>'+esc(link.platform||'Website')+'</small><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"></path><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"></path></svg></a>';
}
function aboutWorkMarkup(entries){
  const list=Array.isArray(entries)?entries:[];
  return list.filter(item=>item&&typeof item==='object'&&Object.values(item).some(value=>value&&value!==false)).map(item=>
    '<article class="about-entry-display"><strong>'+esc(item.position||item.company||'Work experience')+'</strong>'+
    (item.company?'<span>'+esc(item.company)+'</span>':'')+
    (item.city?'<small>'+esc(item.city)+'</small>':'')+
    (item.description?'<p>'+esc(item.description)+'</p>':'')+
    (item.startDate||item.endDate||item.isCurrent?'<small>'+esc(item.startDate||'')+(item.startDate||item.endDate?' – ':'')+esc(item.isCurrent?'Present':item.endDate||'')+'</small>':'')+
    '</article>'
  ).join('');
}
function aboutEducationMarkup(entries){
  const list=Array.isArray(entries)?entries:[];
  return list.filter(item=>item&&typeof item==='object'&&Object.values(item).some(value=>value&&value!==false)).map(item=>
    '<article class="about-entry-display"><strong>'+esc(item.school||'Education')+'</strong>'+
    (item.degree||item.fieldOfStudy?'<span>'+esc([item.degree,item.fieldOfStudy].filter(Boolean).join(' · '))+'</span>':'')+
    (item.city?'<small>'+esc(item.city)+'</small>':'')+
    (item.graduationYear?'<small>Graduation: '+esc(item.graduationYear)+'</small>':'')+
    (item.description?'<p>'+esc(item.description)+'</p>':'')+
    '</article>'
  ).join('');
}
function profileAboutMarkup(u,isMe){
  const sections=u.aboutSections||{};
  const personal={...(sections.personalDetails||{})};
  if(!personal.currentCity)personal.currentCity=u.city||u.location||'';
  if(!personal.country)personal.country=u.country||'';
  if(!personal.county)personal.county=u.county||'';
  if(!personal.parish)personal.parish=u.parish||'';
  if(!personal.gender)personal.gender=u.gender||'';
  if(!personal.relationshipStatus)personal.relationshipStatus=u.relationshipStatus||'';
  const intro={...(sections.intro||{})};
  if(!intro.bio)intro.bio=u.bio||'';
  const contact={...(sections.contactInfo||{})};
  if(!contact.phone)contact.phone=u.contactPhone||'';
  if(!contact.email&&isMe)contact.email=u.email||'';
  const travel=sections.travel||{},details=sections.details||{},aboutYou=sections.aboutYou||{};
  const values={
    personalDetails:[
      aboutRowMarkup('Birthday',personal.birthDate),
      aboutRowMarkup('Pronouns',personal.pronouns),
      aboutRowMarkup('Gender',personal.gender),
      aboutRowMarkup('Relationship status',personal.relationshipStatus),
      aboutRowMarkup('Current city',personal.currentCity),
      aboutRowMarkup('Hometown',personal.hometown),
      aboutRowMarkup('Country',personal.country),
      aboutRowMarkup('County',personal.county),
      aboutRowMarkup('Parish',personal.parish),
      (Array.isArray(personal.familyMembers)&&personal.familyMembers.length)?'<div class="about-list-group"><strong>Family and relationships</strong>'+aboutChipsMarkup(personal.familyMembers)+'</div>':''
    ].join(''),
    intro:aboutRowMarkup('Introduction',intro.bio,'about-row-bio'),
    work:aboutWorkMarkup(sections.work?.entries),
    education:aboutEducationMarkup(sections.education?.entries),
    hobbies:aboutChipsMarkup(sections.hobbies?.items),
    interests:aboutChipsMarkup(sections.interests?.items),
    travel:[
      (Array.isArray(travel.placesLived)&&travel.placesLived.length)?'<div class="about-list-group"><strong>Places lived</strong>'+aboutChipsMarkup(travel.placesLived)+'</div>':'',
      (Array.isArray(travel.visited)&&travel.visited.length)?'<div class="about-list-group"><strong>Places visited</strong>'+aboutChipsMarkup(travel.visited)+'</div>':'',
      (Array.isArray(travel.wantToVisit)&&travel.wantToVisit.length)?'<div class="about-list-group"><strong>Want to visit</strong>'+aboutChipsMarkup(travel.wantToVisit)+'</div>':''
    ].join(''),
    links:(Array.isArray(sections.links?.items)?sections.links.items:[]).map(aboutLinkMarkup).join(''),
    contactInfo:[
      contact.email?'<div class="about-row"><span>Email</span><strong><a href="mailto:'+esc(contact.email)+'">'+esc(contact.email)+'</a></strong></div>':'',
      contact.phone?'<div class="about-row"><span>Phone</span><strong><a href="tel:'+esc(contact.phone)+'">'+esc(contact.phone)+'</a></strong></div>':'',
      contact.whatsapp?'<div class="about-row"><span>WhatsApp</span><strong>'+esc(contact.whatsapp)+'</strong></div>':'',
      contact.website&&aboutSafeExternalUrl(contact.website)?'<div class="about-row"><span>Website</span><strong><a href="'+esc(aboutSafeExternalUrl(contact.website))+'" target="_blank" rel="noopener noreferrer">'+esc(contact.website)+'</a></strong></div>':'',
      contact.preferredContact?aboutRowMarkup('Preferred contact',contact.preferredContact):''
    ].join(''),
    names:[
      aboutRowMarkup('Other name',sections.names?.otherName),
      aboutRowMarkup('Nickname',sections.names?.nickname),
      aboutRowMarkup('Name pronunciation',sections.names?.pronunciation),
      aboutRowMarkup('Former name',sections.names?.formerName)
    ].join(''),
    details:[
      (Array.isArray(details.languages)&&details.languages.length)?'<div class="about-list-group"><strong>Languages</strong>'+aboutChipsMarkup(details.languages)+'</div>':'',
      details.favoriteQuote?aboutRowMarkup('Favourite quote',details.favoriteQuote,'about-row-bio'):'',
      details.otherDetails?aboutRowMarkup('Other details',details.otherDetails,'about-row-bio'):'',
      u.createdAt?aboutRowMarkup('Joined Minglora',new Date(u.createdAt).toLocaleDateString(undefined,{month:'long',year:'numeric'})):''
    ].join(''),
    aboutYou:aboutRowMarkup('About you',aboutYou.description,'about-row-bio')
  };
  return ABOUT_SECTION_DEFINITIONS.map(([key,label,description])=>{
    const content=values[key]||'';
    if(!content&&!isMe)return '';
    const edit=isMe
      ?'<button type="button" class="about-section-edit" data-edit-about-section="'+key+'" aria-label="Edit '+esc(label)+'" title="Edit '+esc(label)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button>'
      :'';
    return '<section class="about-section-card" data-about-section="'+key+'"><header><div><h4>'+esc(label)+'</h4><p>'+esc(description)+'</p></div>'+edit+'</header><div class="about-section-content">'+(content||'<p class="about-section-empty">Add your '+esc(label.toLowerCase())+' to complete this section.</p>')+'</div></section>';
  }).join('');
}
function aboutEditorField(name,label,value='',type='text',placeholder=''){
  return '<label class="field about-editor-field"><span>'+esc(label)+'</span><input type="'+type+'" data-about-field="'+name+'" value="'+esc(value||'')+'" placeholder="'+esc(placeholder)+'"></label>';
}
function aboutEditorTextarea(name,label,value='',placeholder=''){
  return '<label class="field about-editor-field"><span>'+esc(label)+'</span><textarea data-about-field="'+name+'" rows="4" placeholder="'+esc(placeholder)+'">'+esc(value||'')+'</textarea></label>';
}
function aboutLines(value){return Array.isArray(value)?value.join('\n'):'';}
function aboutEditorEntryRow(kind,item={}){
  const work=kind==='work';
  const fields=work
    ?[['company','Company / employer','text'],['position','Position / job title','text'],['city','City / location','text'],['description','Description','textarea'],['startDate','Start date','date'],['endDate','End date','date']]
    :[['school','School / college / university','text'],['degree','Degree / qualification','text'],['fieldOfStudy','Field of study','text'],['city','City / location','text'],['graduationYear','Graduation year','text'],['description','Description','textarea']];
  return '<article class="about-editor-entry" data-about-entry>'+fields.map(([key,label,type])=>type==='textarea'
    ?'<label class="field"><span>'+label+'</span><textarea data-entry-field="'+key+'" rows="2">'+esc(item[key]||'')+'</textarea></label>'
    :'<label class="field"><span>'+label+'</span><input type="'+type+'" data-entry-field="'+key+'" value="'+esc(item[key]||'')+'"></label>'
  ).join('')+(work?'<label class="about-editor-checkbox"><input type="checkbox" data-entry-field="isCurrent" '+(item.isCurrent?'checked':'')+'> I currently work here</label>':'')+
  '<button type="button" class="about-editor-remove" data-remove-about-entry>Remove this '+(work?'workplace':'school')+'</button></article>';
}
const ABOUT_SOCIAL_PLATFORMS=['Website','Instagram','Facebook','TikTok','YouTube','X','Threads','LinkedIn','Snapchat','Pinterest','Twitch','Discord','WhatsApp','Telegram','Reddit','Bluesky','Mastodon','Other'];
function aboutSocialLinkRow(item={}){
  return '<article class="about-social-editor-row" data-about-link-row><label class="field"><span>Platform</span><select data-link-field="platform">'+ABOUT_SOCIAL_PLATFORMS.map(platform=>'<option value="'+esc(platform)+'" '+(String(item.platform||'Website')===platform?'selected':'')+'>'+esc(platform)+'</option>').join('')+'</select></label><label class="field"><span>Profile URL</span><input type="url" data-link-field="url" value="'+esc(item.url||'')+'" placeholder="https://..."></label><label class="field"><span>Display label (optional)</span><input data-link-field="label" value="'+esc(item.label||'')+'" placeholder="My Instagram"></label><button type="button" class="about-editor-remove" data-remove-about-link>Remove link</button></article>';
}
function openAboutSectionEditor(sectionKey,u){
  const definition=ABOUT_SECTION_DEFINITIONS.find(item=>item[0]===sectionKey);
  if(!definition)return;
  const [,label,description]=definition;
  const sections=u.aboutSections||{},saved=sections[sectionKey]||{};
  const audience=u.aboutSectionVisibility?.[sectionKey]||DEFAULT_ABOUT_SECTION_VISIBILITY_UI[sectionKey]||'friends';
  let fields='';
  if(sectionKey==='personalDetails'){
    const personal={...saved};
    if(!personal.currentCity)personal.currentCity=u.city||u.location||'';
    if(!personal.country)personal.country=u.country||'';
    if(!personal.county)personal.county=u.county||'';
    if(!personal.parish)personal.parish=u.parish||'';
    if(!personal.gender)personal.gender=u.gender||'';
    if(!personal.relationshipStatus)personal.relationshipStatus=u.relationshipStatus||'';
    fields=aboutEditorField('birthDate','Date of birth',personal.birthDate||'','date')+
      aboutEditorField('pronouns','Pronouns',personal.pronouns,'text','e.g. she/her, he/him, they/them')+
      aboutEditorField('gender','Gender',personal.gender)+
      aboutEditorField('relationshipStatus','Relationship status',personal.relationshipStatus)+
      aboutEditorField('currentCity','Current city / town',personal.currentCity)+
      aboutEditorField('hometown','Hometown',personal.hometown)+
      aboutEditorField('country','Country',personal.country)+
      aboutEditorField('county','County',personal.county)+
      aboutEditorField('parish','Parish',personal.parish)+
      aboutEditorTextarea('familyMembers','Family members and relationships',aboutLines(personal.familyMembers),'Add one name and relationship per line');
  }else if(sectionKey==='intro'){
    fields=aboutEditorTextarea('bio','Intro / short bio',saved.bio||u.bio||'','Write a short introduction about yourself');
  }else if(sectionKey==='work'){
    fields='<div class="about-editor-repeater" data-about-repeater="work">'+(saved.entries||[]).map(item=>aboutEditorEntryRow('work',item)).join('')+'</div><button type="button" class="secondary about-editor-add" data-add-about-entry="work">＋ Add workplace</button><p class="about-editor-note">Add current and previous jobs. You can include your position, employer, location and dates.</p>';
  }else if(sectionKey==='education'){
    fields='<div class="about-editor-repeater" data-about-repeater="education">'+(saved.entries||[]).map(item=>aboutEditorEntryRow('education',item)).join('')+'</div><button type="button" class="secondary about-editor-add" data-add-about-entry="education">＋ Add school or qualification</button><p class="about-editor-note">Add schools, colleges, universities, degrees and other qualifications.</p>';
  }else if(sectionKey==='hobbies'){
    fields=aboutEditorTextarea('items','Your hobbies',aboutLines(saved.items),'Add one hobby per line');
  }else if(sectionKey==='interests'){
    fields=aboutEditorTextarea('items','Your interests',aboutLines(saved.items),'Add music, movies, TV, books, sports, games, artists, teams and more — one per line');
  }else if(sectionKey==='travel'){
    fields=aboutEditorTextarea('placesLived','Places you have lived',aboutLines(saved.placesLived),'Add one town, city or country per line')+
      aboutEditorTextarea('visited','Places you have visited',aboutLines(saved.visited),'Add one place per line')+
      aboutEditorTextarea('wantToVisit','Places you want to visit',aboutLines(saved.wantToVisit),'Add one destination per line');
  }else if(sectionKey==='links'){
    fields='<div class="about-social-editor-list" data-about-link-list>'+(saved.items||[]).map(aboutSocialLinkRow).join('')+'</div><button type="button" class="secondary about-editor-add" id="about-add-social-link">＋ Add social media or website link</button><p class="about-editor-note">Add full profile URLs for Instagram, Facebook, TikTok, YouTube, X, Threads, LinkedIn and other services. Links open in a new tab.</p>';
  }else if(sectionKey==='contactInfo'){
    const contact={...(saved||{})};if(!Object.hasOwn(contact,'phone'))contact.phone=u.contactPhone||'';if(!Object.hasOwn(contact,'email'))contact.email=u.email||'';
    fields=aboutEditorField('email','Email address',contact.email||'','email')+
      aboutEditorField('phone','Phone number',contact.phone||'','tel','Include + and country code')+
      aboutEditorField('whatsapp','WhatsApp number',contact.whatsapp||'','tel','Include + and country code')+
      aboutEditorField('website','Website',contact.website||'','url','https://...')+
      aboutEditorField('preferredContact','Preferred way to contact you',contact.preferredContact||'');
  }else if(sectionKey==='names'){
    fields=aboutEditorField('otherName','Other name',saved.otherName)+
      aboutEditorField('nickname','Nickname',saved.nickname)+
      aboutEditorField('pronunciation','How to pronounce your name',saved.pronunciation)+
      aboutEditorField('formerName','Former name',saved.formerName);
  }else if(sectionKey==='details'){
    fields=aboutEditorTextarea('languages','Languages you speak',aboutLines(saved.languages),'Add one language per line')+
      aboutEditorTextarea('favoriteQuote','Favourite quote',saved.favoriteQuote,'A quote that means something to you')+
      aboutEditorTextarea('otherDetails','Other details',saved.otherDetails,'Anything else you would like people to know');
  }else if(sectionKey==='aboutYou'){
    fields=aboutEditorTextarea('description','About you',saved.description,'Tell people a little more about yourself');
  }
  const modal=document.createElement('section');modal.className='card profile-inline-editor about-section-inline-editor';
  modal.innerHTML='<div class="about-section-inline-head"><div><h2 id="about-section-editor-title">Edit '+esc(label)+'</h2><small class="muted">'+esc(description)+'</small></div><button type="button" class="secondary about-inline-close">Close editor</button></div><form class="modal-body" id="about-section-editor-form">'+fields+'<label class="field about-audience-field"><span>Who can see this section?</span><select name="audience"><option value="public" '+(audience==='public'?'selected':'')+'>Public — everyone</option><option value="friends" '+(audience==='friends'?'selected':'')+'>Friends</option><option value="private" '+(audience==='private'?'selected':'')+'>Only me</option></select></label><p class="about-editor-status muted" role="status"></p><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Save '+esc(label)+'</button></div></form>';
  const profilePanel=$('#profile-tab-panel');
  if(profilePanel)profilePanel.append(modal);else $('#main-content').append(modal);
  const close=()=>modal.remove();
  modal.querySelectorAll('.about-inline-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
  modal.scrollIntoView({behavior:'smooth',block:'start'});
  const entryList=modal.querySelector('[data-about-repeater]');
  modal.querySelectorAll('[data-add-about-entry]').forEach(button=>button.addEventListener('click',()=>{
    entryList?.insertAdjacentHTML('beforeend',aboutEditorEntryRow(button.dataset.addAboutEntry,{}));
  }));
  entryList?.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-about-entry]');
    if(remove)remove.closest('[data-about-entry]')?.remove();
  });
  const linkList=modal.querySelector('[data-about-link-list]');
  modal.querySelector('#about-add-social-link')?.addEventListener('click',()=>linkList?.insertAdjacentHTML('beforeend',aboutSocialLinkRow({platform:'Website'})));
  linkList?.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-about-link]');
    if(remove)remove.closest('[data-about-link-row]')?.remove();
  });
  const form=modal.querySelector('#about-section-editor-form');
  const status=modal.querySelector('.about-editor-status');
  const fieldValue=name=>String(form.querySelector('[data-about-field="'+name+'"]')?.value||'').trim();
  const fieldLines=name=>fieldValue(name).split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent='Saving '+label.toLowerCase()+'…';
    try{
      let section={};
      if(sectionKey==='personalDetails'){
        for(const key of ['birthDate','pronouns','gender','relationshipStatus','currentCity','hometown','country','county','parish'])section[key]=fieldValue(key);
        section.familyMembers=fieldLines('familyMembers');
      }else if(sectionKey==='intro'){
        section.bio=fieldValue('bio');
      }else if(sectionKey==='work'||sectionKey==='education'){
        section.entries=[...form.querySelectorAll('[data-about-entry]')].map(row=>{
          const item={};
          row.querySelectorAll('[data-entry-field]').forEach(input=>{
            item[input.dataset.entryField]=input.type==='checkbox'?input.checked:String(input.value||'').trim();
          });
          return item;
        }).filter(item=>Object.entries(item).some(([key,value])=>key==='isCurrent'?value:Boolean(value)));
      }else if(sectionKey==='hobbies'||sectionKey==='interests'){
        section.items=fieldLines('items');
      }else if(sectionKey==='travel'){
        section.placesLived=fieldLines('placesLived');section.visited=fieldLines('visited');section.wantToVisit=fieldLines('wantToVisit');
      }else if(sectionKey==='links'){
        section.items=[...form.querySelectorAll('[data-about-link-row]')].map(row=>({
          platform:String(row.querySelector('[data-link-field="platform"]')?.value||'Website'),
          url:String(row.querySelector('[data-link-field="url"]')?.value||'').trim(),
          label:String(row.querySelector('[data-link-field="label"]')?.value||'').trim()
        })).filter(item=>item.url);
      }else if(sectionKey==='contactInfo'){
        for(const key of ['email','phone','whatsapp','website','preferredContact'])section[key]=fieldValue(key);
      }else if(sectionKey==='names'){
        for(const key of ['otherName','nickname','pronunciation','formerName'])section[key]=fieldValue(key);
      }else if(sectionKey==='details'){
        section.languages=fieldLines('languages');section.favoriteQuote=fieldValue('favoriteQuote');section.otherDetails=fieldValue('otherDetails');
      }else if(sectionKey==='aboutYou'){
        section.description=fieldValue('description');
      }
      const patch={aboutSections:{[sectionKey]:section},aboutSectionVisibility:{[sectionKey]:form.elements.audience.value}};
      if(sectionKey==='intro')patch.bio=section.bio;
      if(sectionKey==='personalDetails'){
        patch.location=section.currentCity;patch.city=section.currentCity;
        patch.country=section.country;patch.county=section.county;patch.parish=section.parish;
        patch.gender=section.gender;patch.relationshipStatus=section.relationshipStatus;
      }
      if(sectionKey==='contactInfo')patch.contactPhone=section.phone||'';
      const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(patch)});
      state.user={...state.user,...result.user};
      close();state.profileTab='about';await openProfile(state.user.id);
      state.profileTab='about';toast(label+' saved.');
    }catch(error){
      status.textContent='Could not save '+label.toLowerCase()+'. '+error.message;toast(error.message);button.disabled=false;
    }
  });
}
function profilePhotoTile(item,owner=false,albumId=''){
  const url=esc(item.url||'');
  const media=item.mediaType==='video'
    ?'<video controls playsinline preload="metadata" src="'+url+'"></video>'
    :'<img loading="lazy" src="'+url+'" alt="Photo shared on Minglora">';
  return '<article class="profile-media-tile">'+media+(item.postText?'<small>'+esc(item.postText.slice(0,90))+'</small>':'')+
    (owner&&albumId?'<button type="button" class="profile-media-remove" data-profile-photo-remove="'+esc(item.id)+'" data-album-id="'+esc(albumId)+'" aria-label="Remove photo from album">Remove</button>':'')+'</article>';
}
function getProfileSectionPrefs(profileId){const defaults={about:true,friends:true,photos:true,reels:true,groups:true,checkins:true,events:true,highlights:true};const saved=state.profile?.user?.id===profileId?state.profile.profileSections:null;if(saved)return {...defaults,...saved,checkins:saved.checkIns!==false};try{return {...defaults,...JSON.parse(localStorage.getItem('minglora-profile-sections:'+profileId)||'{}')};}catch{return defaults;}}

function profileIntroOverviewMarkup(data,isMe){
  const u=data.user||{};
  const sections=u.aboutSections||{};
  const personal=sections.personalDetails||{};
  const workEntries=Array.isArray(sections.work?.entries)?sections.work.entries:[];
  const educationEntries=Array.isArray(sections.education?.entries)?sections.education.entries:[];
  const currentWork=workEntries.find(item=>item&&Object.values(item).some(value=>value&&value!==false));
  const latestEducation=educationEntries.find(item=>item&&Object.values(item).some(value=>value&&value!==false));
  const location=[personal.currentCity||u.location,personal.country].filter(Boolean).map(value=>String(value).trim()).filter(Boolean);
  const bio=String(u.bio||(isMe?sections.intro?.bio:'')||'').trim();
  const workText=currentWork?[currentWork.position||currentWork.company,currentWork.position&&currentWork.company?'at '+currentWork.company:(!currentWork.position&&currentWork.company?'': '')].filter(Boolean).join(' '):'';
  const educationText=latestEducation?[latestEducation.degree,latestEducation.fieldOfStudy,latestEducation.school].filter(Boolean).join(' · '):'';
  const interests=[...(sections.hobbies?.items||[]),...(sections.interests?.items||[])].map(value=>String(value||'').trim()).filter(Boolean).filter((value,index,all)=>all.indexOf(value)===index).slice(0,8);
  const links=(Array.isArray(sections.links?.items)?sections.links.items:[]).map(aboutLinkMarkup).filter(Boolean).slice(0,4);
  const joined=u.createdAt&&!Number.isNaN(new Date(u.createdAt).getTime())?new Date(u.createdAt).toLocaleDateString(undefined,{month:'long',year:'numeric'}):'';
  const facts=[
    location.length?['LOCATION',location.join(', ')]:null,
    workText?['WORK',workText]:null,
    educationText?['EDUCATION',educationText]:null,
    joined?['MEMBER SINCE',joined]:null
  ].filter(Boolean);
  const factMarkup=facts.map(([label,value])=>'<div class="profile-overview-fact"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
  const layout=['standard','advanced','creator'].includes(u.profileLayout)?u.profileLayout:'advanced';
  const identity='<span class="profile-overview-identity'+(layout==='creator'?' profile-overview-identity--creator':'')+'">'+(layout==='creator'?'CREATOR STYLE':layout==='standard'?'STANDARD PROFILE':'ADVANCED PROFILE')+'</span>';
  const creatorLeague=u.creatorLeague?.initialized===true?'<span class="profile-overview-identity profile-overview-identity--creator">CREATOR LEAGUE · '+esc(u.creatorLeague.leagueClass||'')+'</span>':'';
  const layoutPicker=isMe?'<section class="profile-layout-picker"><label for="profile-layout-choice"><span>PROFILE LAYOUT</span><select id="profile-layout-choice" aria-label="Choose profile layout"><option value="standard" '+(layout==='standard'?'selected':'')+'>Standard</option><option value="advanced" '+(layout==='advanced'?'selected':'')+'>Advanced</option><option value="creator" '+(layout==='creator'?'selected':'')+'>Creator</option></select></label><small>Appearance only. This does not grant Creator access, badges or account permissions.</small></section>':'';
  let completionMarkup='';
  if(isMe){
    const checks=[
      ['Profile picture',Boolean(u.avatar),'edit'],
      ['Cover photo',Boolean(u.cover),'edit'],
      ['Introduction',Boolean(bio),'edit'],
      ['Work history',Boolean(currentWork),'about'],
      ['Education',Boolean(latestEducation),'about'],
      ['Interests',Boolean(interests.length),'about'],
      ['Links',Boolean(links.length),'about']
    ];
    const complete=checks.filter(([,done])=>done).length;
    const percent=Math.round(complete/checks.length*100);
    const next=checks.find(([,done])=>!done);
    const action=next?.[2]==='about'?'about':'edit';
    completionMarkup='<section class="profile-completion" aria-label="Profile completion">'+
      '<div class="profile-completion-heading"><div><span>PROFILE SETUP</span><strong>'+(percent===100?'Your profile is complete':complete+' of '+checks.length+' details added')+'</strong></div><b>'+percent+'%</b></div>'+
      '<div class="profile-completion-track" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>'+
      '<div class="profile-completion-footer"><span>'+(next?'Next: add '+next[0].toLowerCase():'All profile essentials are filled in')+'</span>'+
      (next?'<button type="button" class="text-button" '+(action==='about'?'data-profile-tab="about"':'id="edit-profile-completion"')+'>'+(action==='about'?'Add details':'Edit profile')+'</button>':'')+
      '</div></section>';
  }
  return '<div class="profile-established-overview">'+identity+creatorLeague+
    (bio?'<p class="profile-overview-bio">'+esc(bio)+'</p>':(isMe?'<p class="profile-overview-empty">Add an introduction so people can get to know you.</p>':'<p class="profile-overview-empty">No introduction has been shared.</p>'))+
    (factMarkup?'<div class="profile-overview-facts">'+factMarkup+'</div>':'')+
    (interests.length?'<div class="profile-overview-interests"><span>INTERESTS</span><div>'+interests.map(item=>'<span class="profile-overview-chip">'+esc(item)+'</span>').join('')+'</div></div>':'')+
    (links.length?'<div class="profile-overview-links" aria-label="Public profile links">'+links.join('')+'</div>':'')+
    layoutPicker+
    '<div class="profile-overview-actions">'+
      (isMe?'<button type="button" class="secondary" id="edit-about-inline">Edit profile</button>':'')+
      '<button type="button" class="text-button" data-profile-tab="about">View full About <span aria-hidden="true">→</span></button>'+
    '</div>'+completionMarkup+'</div>';
}


function profileBadgeCardMarkup(item){
  return "<article class='profile-award-card profile-award-card--"+item.kind+"'>"+
    "<div class='profile-award-art "+(item.artClass||"")+"'>"+item.artwork+"</div>"+
    "<div class='profile-award-copy'><span class='profile-award-category'>"+esc(item.category)+"</span>"+
    "<h3>"+esc(item.title)+"</h3><p>"+esc(item.description)+"</p>"+
    (item.note?"<small>"+esc(item.note)+"</small>":"")+"</div></article>";
}
function profileBadgesMarkup(data,isMe){
  const u=data.user||{};
  const groups=[
    {key:"official",title:"Official account recognition",description:"Minglora-issued account status and platform roles.",items:[]},
    {key:"creator",title:"Creator recognition",description:"Current creator programme standing.",items:[]},
    {key:"gifting",title:"Gifting achievements",description:"Milestones and access unlocked through Minglora gifting.",items:[]}
  ];
  const add=(key,item)=>groups.find(group=>group.key===key)?.items.push(item);
  if(u.verificationBadge==="blue"){
    add("official",{kind:"verified",category:"Account verification",title:"Minglora Verified",description:"This account holds the official Minglora blue verification badge.",artwork:verifiedProfileBadge(u),artClass:"profile-award-art--verified"});
  }
  if(u.platformBadge==="admin"){
    add("official",{kind:"admin",category:"Platform role",title:"Minglora Platform Admin",description:"Official platform administration role marker.",artwork:platformAdminProfileBadge(u),artClass:"profile-award-art--admin"});
  }
  const league=String(u.creatorLeague?.leagueClass||"").trim().toUpperCase();
  if(u.creatorLeague?.initialized===true&&/^(D[1-5]|C[1-5]|B[1-5]|A[1-3])$/.test(league)){
    add("creator",{kind:"league",category:"Creator League",title:"Creator League · "+league,description:"Current Creator League class: "+league+".",artwork:creatorLeagueProfileBadge(u),artClass:"profile-award-art--league"});
  }
  const badge=u.gifterBadge;
  if(badge?.level){
    const level=Math.max(1,Math.min(50,Math.floor(Number(badge.level)||1)));
    const tier=Math.max(1,Math.min(10,Math.ceil(level/5)));
    const badgeName=String(badge.badgeName||("Gifter LV "+level)).trim();
    const artwork=window.MingloraGifterBadgeArt?.render
      ? window.MingloraGifterBadgeArt.render({level,tier,badgeName})
      : "<span class='profile-badge-level-fallback'>LV "+level+"</span>";
    add("gifting",{kind:"gifter",category:"Gifter progression",title:badgeName,description:"Current Gifter achievement · Level "+level+" of 50.",note:badge.adminAwarded?"Official admin award · no Coin spending was added.":"Current unlocked Gifter level.",artwork,artClass:"profile-award-art--gifter"});
    if(badge.liveEntranceUnlocked){
      add("gifting",{kind:"live-entry",category:"LIVE access",title:"LIVE Entrance Unlocked",description:"This account has unlocked the special LIVE entrance.",artwork:"<span class='profile-badge-live-emblem' aria-hidden='true'><span>LIVE</span><b>↗</b></span>",artClass:"profile-award-art--live"});
    }
  }
  if(u.newGifterIdentity?.active){
    add("gifting",{kind:"new-gifter",category:"Gifter recognition",title:"New Gifter",description:"A time-limited recognition for qualifying new gifters.",artwork:"<span class='gp-new-gifter-identity' role='img' aria-label='New Gifter'>NEW GIFTER</span>",artClass:"profile-award-art--new-gifter"});
  }
  const activeGroups=groups.filter(group=>group.items.length);
  const badgeCount=activeGroups.reduce((total,group)=>total+group.items.length,0);
  const content=activeGroups.length
    ? activeGroups.map(group=>"<section class='profile-award-group' aria-label='"+esc(group.title)+"'><div class='profile-award-group-heading'><div><h3>"+esc(group.title)+"</h3><p>"+esc(group.description)+"</p></div><span>"+group.items.length+"</span></div><div class='profile-award-grid'>"+group.items.map(profileBadgeCardMarkup).join("")+"</div></section>").join("")
    : "<div class='profile-awards-empty'><span class='profile-awards-empty-icon' aria-hidden='true'>✦</span><h3>No badges have been awarded yet</h3><p>Official verification, creator recognition and earned gifting achievements will appear here when they are assigned to this account.</p></div>";
  return "<section class='card profile-badges-panel' aria-labelledby='profile-badges-title'>"+
    "<div class='profile-badges-heading'><div><span class='profile-badges-eyebrow'>PROFILE RECOGNITION</span><h2 id='profile-badges-title'>Badges &amp; achievements</h2><p>Official account recognition and earned Minglora milestones, presented in one place.</p></div>"+
    "<span class='profile-badges-count' aria-label='"+badgeCount+" badges'>"+badgeCount+" "+(badgeCount===1?"badge":"badges")+"</span></div>"+
    content+"</section>";
}

function profileTabMarkup(data,tab,aboutHtml,isMe){
  const posts=data.posts||[],albums=data.albums||[],photos=data.photos||[],reels=data.reels||[],friends=data.friends||[];
  if(tab==='badges')return profileBadgesMarkup(data,isMe);
  if(tab==='about')return '<section class="card profile-about"><div class="about-heading"><div><h3>About you</h3><p class="muted">Your details, story, work, education and the things you enjoy.</p></div></div><div class="profile-about-sections">'+(aboutHtml||'<p class="muted">No About details have been added yet.</p>')+'</div></section>';
  if(tab==='friends')return '<section class="card"><div class="page-heading"><h2>Friends</h2><span class="muted">'+friends.length+' friends</span></div>'+(friends.length?'<div class="profile-friends-grid">'+friends.map(member=>'<button type="button" class="profile-friend-card" data-profile="'+esc(member.id)+'"><img class="avatar" src="'+avatar(member)+'" alt=""><strong>'+esc(member.name)+'</strong><small>@'+esc(member.username)+' '+verifiedProfileBadge(member)+'</small></button>').join('')+'</div>':'<div class="empty-state"><h3>No friends to show</h3><p>Friends appear here when both members follow each other.</p></div>')+'</section>';
  if(tab==='photos'){
    const albumMarkup=albums.map(album=>{
      const cover=album.photos.find(photo=>photo.id===album.coverAssetId)||album.photos[0];
      return '<article class="profile-album-card"><button type="button" class="profile-album-cover" data-album-open="'+esc(album.id)+'">'+(cover?'<img src="'+esc(cover.url)+'" alt="">':'<span>▧</span>')+'</button><div class="profile-album-info"><strong>'+esc(album.title)+'</strong><small>'+album.photos.length+' photos · '+esc(album.visibility)+'</small>'+(album.description?'<p>'+esc(album.description)+'</p>':'')+(isMe?'<div class="profile-album-actions"><button type="button" class="secondary" data-album-edit="'+esc(album.id)+'">Edit / Add photos</button><button type="button" class="secondary" data-album-delete="'+esc(album.id)+'">Delete</button></div>':'')+'</div></article>';
    }).join('');
    const combined=[...photos,...albums.flatMap(album=>album.photos.map(photo=>({...photo,albumId:album.id})))];
    const unique=combined.filter((item,index,list)=>list.findIndex(other=>other.id===item.id)===index);
    return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Photos</h2><p class="muted">Individual photos and organised albums</p></div>'+(isMe?'<div class="profile-photo-actions"><button type="button" class="primary" id="profile-upload-photo">Upload single photo</button><button type="button" class="secondary" id="profile-create-album">Create album / Upload photos</button></div>':'')+'</div>'+
      (albums.length?'<h3 class="profile-subheading">Photo albums</h3><div class="profile-albums-grid">'+albumMarkup+'</div>':'<div class="empty-state"><h3>No albums yet</h3><p>'+(isMe?'Create an album and upload your first photos.':'This member has not created any public albums yet.')+'</p></div>')+
      '<h3 class="profile-subheading">All photos</h3>'+(unique.length?'<div class="profile-media-grid">'+unique.map(item=>profilePhotoTile(item,false)).join('')+'</div>':'<p class="muted">No individual photos have been shared yet.</p>')+'</section>';
  }
  if(tab==='reels')return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Reels</h2><p class="muted">Short videos shared on this profile</p></div>'+(isMe?'<button type="button" class="primary" id="profile-create-reel">Create reel</button>':'')+'</div>'+(reels.length?'<div class="profile-reels-grid">'+reels.map(item=>'<article class="profile-reel-tile"><video controls playsinline preload="metadata" src="'+esc(item.url)+'"></video><small>'+esc(item.postText||'Video')+'</small></article>').join('')+'</div>':'<div class="empty-state"><h3>No reels yet</h3><p>Videos shared by this member will appear here.</p></div>')+'</section>';
  if(tab==='videos')return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Videos</h2><p class="muted">All video posts on this profile</p></div>'+(isMe?'<button type="button" class="primary" id="profile-create-reel">Upload video</button>':'')+'</div>'+(reels.length?'<div class="profile-video-list">'+reels.map(item=>'<article class="profile-video-row"><video controls playsinline preload="metadata" src="'+esc(item.url)+'"></video><div><strong>'+esc(item.postText||'Video shared')+'</strong><small>'+esc(timeAgo(item.createdAt))+'</small></div></article>').join('')+'</div>':'<div class="empty-state"><h3>No videos yet</h3><p>Videos shared by this member will appear here.</p></div>')+'</section>';
  if(tab==='checkins'){const checkIns=data.checkIns||[];return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Check-ins</h2><p class="muted">Places shared by this member</p></div>'+(isMe?'<button type="button" class="primary" id="profile-create-checkin">Create check-in</button>':'')+'</div>'+(checkIns.length?'<div class="profile-checkin-list">'+checkIns.map(item=>'<article class="profile-checkin-card"><strong>⌖ '+esc(item.place)+'</strong>'+(item.note?'<p>'+esc(item.note)+'</p>':'')+'<small>'+esc(timeAgo(item.createdAt))+' · '+esc(item.visibility||'public')+'</small></article>').join('')+'</div>':'<div class="empty-state"><h3>No check-ins yet</h3><p>'+(isMe?'Share a place with the audience you choose.':'This member has not shared any check-ins.')+'</p></div>')+'</section>';}
  if(tab==='events'){const events=data.events||[];return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Events</h2><p class="muted">Events hosted or attended by this member</p></div>'+(isMe?'<button type="button" class="primary" id="profile-create-event">Create event</button>':'')+'</div>'+(events.length?'<div class="profile-event-list">'+events.map(item=>'<article class="profile-event-card"><div class="profile-event-date"><strong>'+esc(new Date(item.startAt).toLocaleDateString(undefined,{day:"2-digit"}))+'</strong><small>'+esc(new Date(item.startAt).toLocaleDateString(undefined,{month:"short"}))+'</small></div><div class="profile-event-main"><strong>'+esc(item.title)+'</strong><p>'+esc(item.description||'')+'</p><small>'+esc(new Date(item.startAt).toLocaleString())+(item.location?' · '+esc(item.location):'')+'</small><small>'+Number(item.rsvpCount||0)+' going · Hosted by '+esc(item.host?.name||'Minglora member')+'</small><div class="profile-event-rsvp"><button type="button" class="'+(item.myRsvp==='going'?'primary':'secondary')+'" data-event-id="'+esc(item.id)+'" data-event-rsvp="going">Going</button><button type="button" class="'+(item.myRsvp==='interested'?'primary':'secondary')+'" data-event-id="'+esc(item.id)+'" data-event-rsvp="interested">Interested</button>'+(item.myRsvp?'<button type="button" class="text-button" data-event-id="'+esc(item.id)+'" data-event-rsvp-remove>Remove RSVP</button>':'')+'</div></div></article>').join('')+'</div>':'<div class="empty-state"><h3>No events yet</h3><p>'+(isMe?'Create an event and let people choose whether they are going or interested.':'This member has no visible events.')+'</p></div>')+'</section>';}
  if(tab==='highlights'){const highlights=data.highlights||[];return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Highlights</h2><p class="muted">Stories saved on this profile</p></div>'+(isMe?'<button type="button" class="primary" id="profile-manage-highlights">Manage Highlights</button>':'')+'</div>'+(highlights.length?'<div class="profile-highlights-grid">'+highlights.map(item=>'<article class="profile-highlight-card">'+(item.coverUrl?'<img src="'+esc(item.coverUrl)+'" alt="">':'<span>✧</span>')+'<strong>'+esc(item.title)+'</strong><small>'+Number(item.storyCount||0)+' stories</small></article>').join('')+'</div>':'<div class="empty-state"><h3>No Highlights yet</h3><p>'+(isMe?'Save active or archived Stories as Highlights to keep them on your profile.':'This member has not added Highlights.')+'</p></div>')+'</section>';}
  if(tab==='groups'){const groups=data.groups||[];return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Groups</h2><p class="muted">Groups this member owns or belongs to</p></div></div>'+(groups.length?'<div class="profile-groups-list">'+groups.map(group=>'<button type="button" class="profile-group-row" data-open-group="'+esc(group.id)+'"><span class="profile-group-icon">◉</span><span><strong>'+esc(group.name)+'</strong><small>'+Number(group.memberCount||0)+' members · '+(group.isMember?'Member':'Owner')+'</small></span><b>›</b></button>').join('')+'</div>':'<div class="empty-state"><h3>No groups to show</h3><p>Groups this member joins or creates will appear here.</p></div>')+'</section>';}
  if(tab==='manage'){const prefs=getProfileSectionPrefs(state.profile.user.id);return '<section class="card profile-media-section"><div class="page-heading"><div><h2>Manage sections</h2><p class="muted">Choose which sections appear on your profile across your devices.</p></div></div><form id="profile-section-manager" class="profile-section-manager">'+[['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['groups','Groups'],['checkins','Check-ins'],['events','Events'],['highlights','Highlights']].map(([key,label])=>'<label><input type="checkbox" name="section" value="'+key+'" '+(prefs[key]!==false?'checked':'')+'><span>'+label+'</span></label>').join('')+'<button type="submit" class="primary">Save sections</button></form><p class="muted profile-section-note">Your section preferences are saved to your Minglora account.</p></section>';}
  if(tab==='gift-gallery')return '<section class="card profile-gift-gallery-shell"><div id="profile-gift-gallery" data-profile-gift-gallery><div class="empty-state"><h3>Loading Gift Gallery…</h3><p>Checking this member’s current weekly gifts.</p></div></div></section>';
  if(tab==='more')return '<section class="card profile-more-menu"><h2>More on this profile</h2><button type="button" data-profile-tab="checkins"><span>⌖</span><strong>Check-ins</strong><small>Places visited and shared</small><b>›</b></button><button type="button" data-profile-tab="events"><span>▦</span><strong>Events</strong><small>Events hosted and attended</small><b>›</b></button><button type="button" data-profile-tab="highlights"><span>✧</span><strong>Highlights</strong><small>Stories saved on this profile</small><b>›</b></button><button type="button" data-profile-tab="groups"><span>◉</span><strong>Groups</strong><small>Communities this member belongs to</small><b>›</b></button><button type="button" data-profile-tab="videos"><span>▣</span><strong>Videos</strong><small>Watch all videos shared here</small><b>›</b></button><button type="button" data-profile-tab="photos"><span>▧</span><strong>Photo albums</strong><small>Browse organised photo collections</small><b>›</b></button>'+(isMe?'<button type="button" data-profile-tab="manage"><span>⚙</span><strong>Manage sections</strong><small>Choose what appears on your profile</small><b>›</b></button>':'')+'<button type="button" data-profile-tab="posts"><span>☰</span><strong>Posts</strong><small>Return to profile posts</small><b>›</b></button></section>';
  return '<div class="profile-body profile-body--established"><section class="card profile-about profile-intro-card"><div class="about-heading"><div><h3>Intro</h3><p class="muted">A clearer introduction to this member.</p></div></div>'+profileIntroOverviewMarkup(data,isMe)+'</section><div class="profile-post-column">'+(isMe?'<div class="card profile-compose-card"><div class="composer-top"><img class="avatar" src="'+avatar(state.user)+'" alt=""><button class="composer-open" id="profile-composer">Share an update</button></div></div>':'')+(posts.length?posts.map(postCard).join(''):'<section class="card empty-state"><h3>No posts yet</h3><p>Posts shared by this profile will appear here.</p></section>')+'</div></div>';
}
function openProfileAlbumEditor(profileId,album=null){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal profile-album-editor" role="dialog" aria-modal="true" aria-labelledby="profile-album-editor-title"><div class="modal-head"><h2 id="profile-album-editor-title">'+(album?'Edit photo album':'Create photo album')+'</h2><button class="modal-close" type="button" aria-label="Close">×</button></div><form class="modal-body"><div class="field"><label>Album name<input name="title" maxlength="100" required value="'+esc(album?.title||'')+'" placeholder="e.g. Family, Holidays, Jamaica"></label></div><div class="field"><label>Description<textarea name="description" maxlength="500" placeholder="Add a description">'+esc(album?.description||'')+'</textarea></label></div><div class="field"><label>Who can see this album<select name="visibility"><option value="public" '+(album?.visibility==='public'?'selected':'')+'>Public</option><option value="friends" '+(album?.visibility==='friends'?'selected':'')+'>Friends</option><option value="private" '+(album?.visibility==='private'?'selected':'')+'>Only me</option></select></label></div><div class="field"><label>'+(album?'Add more photos':'Upload photos')+'</label><div data-profile-album-picker></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">'+(album?'Save album':'Create album')+'</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('[data-profile-album-picker]'),{slot:'post',maxFiles:30,accept:'image/jpeg,image/png,image/webp,image/avif'});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const submit=modal.querySelector('button[type="submit"]');submit.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      let savedAlbum;
      if(album){
        savedAlbum=(await api('/albums/'+encodeURIComponent(album.id),{method:'PATCH',body:JSON.stringify({title:values.get('title'),description:values.get('description'),visibility:values.get('visibility')})})).album;
      }else{
        savedAlbum=(await api('/albums',{method:'POST',body:JSON.stringify({title:values.get('title'),description:values.get('description'),visibility:values.get('visibility')})})).album;
      }
      if(mediaIds.length)await api('/albums/'+encodeURIComponent(savedAlbum.id)+'/photos',{method:'POST',body:JSON.stringify({mediaIds})});
      close();await openProfile(profileId);toast(album?'Album updated.':'Photo album created.');
    }catch(error){toast(error.message);submit.disabled=false;}
  });
}
function openProfilePhotoComposer(profileId){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="profile-photo-title"><div class="modal-head"><h2 id="profile-photo-title">Upload a photo</h2><button class="modal-close" type="button" aria-label="Close">×</button></div><form class="modal-body"><div class="field"><label>Caption<textarea name="text" maxlength="5000" placeholder="Write something about this photo"></textarea></label></div><div class="field"><label>Select multiple photos · zoom and rotate before upload (up to 10)</label><div data-profile-photo-picker></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Upload photo</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('[data-profile-photo-picker]'),{slot:'post',maxFiles:10,accept:'image/jpeg,image/png,image/webp,image/avif'});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const submit=modal.querySelector('button[type="submit"]');submit.disabled=true;
    try{
      if(!picker.hasSelection())throw new Error('Choose at least one photo to upload.');
      const mediaIds=await picker.upload(),values=new FormData(event.currentTarget);
      await api('/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});
      close();await openProfile(profileId);toast('Your photo has been uploaded.');
    }catch(error){toast(error.message);submit.disabled=false;}
  });
}
function openProfileReelComposer(profileId){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="profile-reel-title"><div class="modal-head"><h2 id="profile-reel-title">Create a reel</h2><button class="modal-close" type="button" aria-label="Close">×</button></div><form class="modal-body"><div class="field"><label>Caption<textarea name="text" maxlength="5000" placeholder="Write a caption for your reel"></textarea></label></div><div class="field"><label>Choose one or more video clips (up to 10)</label><div data-profile-reel-picker></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish reel</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('[data-profile-reel-picker]'),{slot:'post',maxFiles:10,accept:'video/mp4,video/webm,video/quicktime'});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const submit=modal.querySelector('button[type="submit"]');submit.disabled=true;
    try{
      if(!picker.hasSelection())throw new Error('Choose a video for your reel.');
      const mediaIds=await picker.upload(),values=new FormData(event.currentTarget);
      await api('/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});
      close();await openProfile(profileId);toast('Your reel has been published.');
    }catch(error){toast(error.message);submit.disabled=false;}
  });
}

function closeProfileOverflowMenu(){
  const menu=$('#profile-overflow-menu'),trigger=$('#profile-overflow-trigger');
  if(menu)menu.hidden=true;
  trigger?.setAttribute('aria-expanded','false');
}
function openProfileMenuInfo(title,message){
  const modal=document.createElement('div');modal.className='modal-backdrop profile-menu-modal-backdrop';
  modal.innerHTML='<section class="modal profile-menu-modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-head"><h2>'+esc(title)+'</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><p>'+esc(message)+'</p><div class="modal-actions"><button type="button" class="primary" data-profile-menu-close>Done</button></div></div></section>';
  document.body.append(modal);
  const close=()=>modal.remove();
  modal.querySelector('.modal-close')?.addEventListener('click',close);
  modal.querySelector('[data-profile-menu-close]')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
}
function openProfileViewAsPreview(u,data){
  const bioVisible=u.aboutVisibility?.bio!==false;
  const cover=u.cover?'<img src="'+esc(u.cover)+'" alt="" class="profile-view-as-cover-image">':'';
  const bio=bioVisible&&u.bio?'<p class="profile-view-as-bio">'+esc(u.bio)+'</p>':'';
  const modal=document.createElement('div');modal.className='modal-backdrop profile-menu-modal-backdrop';
  modal.innerHTML='<section class="modal profile-view-as-modal" role="dialog" aria-modal="true" aria-label="Public profile preview"><div class="modal-head"><div><h2>View as</h2><small class="muted">Public profile preview</small></div><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><div class="profile-view-as-card"><div class="profile-view-as-cover">'+cover+'</div><div class="profile-view-as-person"><img src="'+esc(avatar(u))+'" alt="" class="avatar"><div><strong class="profile-preview-name">'+esc(u.name)+platformAdminProfileBadge(u)+'</strong><small>@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</small></div></div>'+bio+'<div class="profile-view-as-counts"><span><strong>'+Number(data.followersCount||0).toLocaleString()+'</strong> followers</span><span><strong>'+Number(data.followingCount||0).toLocaleString()+'</strong> following</span><span><strong>'+(data.posts||[]).length+'</strong> posts</span></div></div><p class="profile-view-as-note">This is a read-only preview of your profile header. It does not simulate every audience or privacy rule.</p><div class="modal-actions"><button type="button" class="primary" data-profile-menu-close>Done</button></div></div></section>';
  document.body.append(modal);const close=()=>modal.remove();
  modal.querySelector('.modal-close')?.addEventListener('click',close);
  modal.querySelector('[data-profile-menu-close]')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
}
async function openProfilePrivacySettings(){
  try{
    const result=await api('/settings');const settings=result.settings||{},privacy=settings.privacy||{};
    const modal=document.createElement('div');modal.className='modal-backdrop profile-menu-modal-backdrop';
    modal.innerHTML='<section class="modal profile-menu-modal" role="dialog" aria-modal="true" aria-label="Profile and tagging settings"><div class="modal-head"><h2>Profile and tagging settings</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form id="profile-tagging-settings-form" class="modal-body"><div class="field"><label for="profile-visibility-setting">Who can see your profile?</label><select id="profile-visibility-setting" name="profileVisibility"><option value="public">Everyone</option><option value="friends">Friends</option><option value="private">Only me</option></select></div><p class="muted">Profile visibility is enforced by Minglora. Tag review and audience controls are not available yet.</p><div class="modal-actions"><button type="button" class="secondary" data-profile-menu-cancel>Cancel</button><button type="submit" class="primary">Save settings</button></div></form></section>';
    document.body.append(modal);
    const select=modal.querySelector('#profile-visibility-setting');if(select)select.value=['public','friends','private'].includes(privacy.profileVisibility)?privacy.profileVisibility:'public';
    const close=()=>modal.remove();
    modal.querySelector('.modal-close')?.addEventListener('click',close);
    modal.querySelector('[data-profile-menu-cancel]')?.addEventListener('click',close);
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelector('#profile-tagging-settings-form')?.addEventListener('submit',async event=>{
      event.preventDefault();const save=event.currentTarget.querySelector('[type="submit"]');save.disabled=true;
      try{const saved=await api('/settings',{method:'PATCH',body:JSON.stringify({privacy:{profileVisibility:select.value}})});state.settings=saved.settings;toast('Profile visibility settings saved.');close();}
      catch(error){toast(error.message);save.disabled=false;}
    });
  }catch(error){toast(error.message||'Could not load profile settings.');}
}
async function toggleProfilePrivacyLock(){
  try{
    const current=await api('/settings');const locked=current.settings?.privacy?.profileVisibility==='private';
    const next=locked?'public':'private';
    const saved=await api('/settings',{method:'PATCH',body:JSON.stringify({privacy:{profileVisibility:next}})});state.settings=saved.settings;
    const label=$('#profile-overflow-menu [data-profile-overflow-action="lock-toggle"] span:last-child');
    if(label)label.textContent=next==='private'?'Unlock profile':'Lock profile';
    toast(next==='private'?'Your profile is now locked.':'Your profile is public again.');
  }catch(error){toast(error.message||'Could not update profile visibility.');}
}

function bindProfileThoughtControls(root=document){
  root.querySelectorAll('[data-view-profile-thought-user]').forEach(button=>{
    if(button.dataset.profileThoughtBound==='true')return;
    button.dataset.profileThoughtBound='true';
    button.addEventListener('click',event=>{event.stopPropagation();void openProfileThoughtByUserId(button.dataset.viewProfileThoughtUser);});
  });
  root.querySelectorAll('[data-edit-profile-thought]').forEach(button=>{
    if(button.dataset.profileThoughtBound==='true')return;
    button.dataset.profileThoughtBound='true';
    button.addEventListener('click',event=>{event.stopPropagation();if(state.user)void openProfileStatusEditor(state.user);});
  });
}
async function openProfileThoughtByUserId(userId){
  if(!userId)return;
  try{
    const [profile,statusResult]=await Promise.all([
      api('/users/'+encodeURIComponent(userId)),
      api('/users/'+encodeURIComponent(userId)+'/profile-status')
    ]);
    if(!statusResult.status?.text)throw new Error('This thought is no longer available.');
    openProfileThoughtViewer(profile.user,statusResult.status);
  }catch(error){toast(error.message||'Could not open this thought.');}
}
function openProfileThoughtViewer(member,thought){
  if(!member||!thought?.text)return;
  const isOwner=member.id===state.user?.id,modal=document.createElement('div');modal.className='modal-backdrop ml-profile-thought-backdrop';
  const created=thought.createdAt?new Date(thought.createdAt).toLocaleString():'Recently shared';
  const expires=thought.expiresAt?new Date(thought.expiresAt).toLocaleString():'';
  modal.innerHTML='<section class="modal ml-profile-thought-viewer" role="dialog" aria-modal="true" aria-labelledby="ml-profile-thought-title"><div class="modal-head"><h2 id="ml-profile-thought-title">'+(isOwner?'Your thought':esc(member.name)+'’s thought')+'</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><div class="ml-thought-author"><img class="avatar" src="'+avatar(member)+'" alt=""><span><strong>'+esc(member.name||'Minglora member')+'</strong><small>@'+esc(member.username||'member')+(thought.mood?' · '+esc(thought.mood):'')+'</small></span></div><blockquote class="ml-thought-quote">'+esc(thought.text)+'</blockquote><p class="ml-thought-time">Shared '+esc(created)+(expires?' · Expires '+esc(expires):'')+'</p><div class="modal-actions">'+(isOwner?'<button type="button" class="secondary" data-thought-edit>Edit thought</button><button type="button" class="secondary" data-thought-remove>Remove thought</button>':'<button type="button" class="secondary" data-thought-profile>View profile</button>')+'<button type="button" class="primary" data-thought-close>Done</button></div></div></section>';
  document.body.append(modal);
  const close=()=>modal.remove();
  modal.querySelector('.modal-close')?.addEventListener('click',close);
  modal.querySelector('[data-thought-close]')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('[data-thought-edit]')?.addEventListener('click',()=>{close();void openProfileStatusEditor(member);});
  modal.querySelector('[data-thought-profile]')?.addEventListener('click',()=>{close();void openProfile(member.id);});
  modal.querySelector('[data-thought-remove]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await api('/profile-status',{method:'DELETE',body:'{}'});close();await openProfile(member.id);toast('Your thought was removed.');}
    catch(error){toast(error.message);button.disabled=false;}
  });
}

async function openProfileStatusEditor(profile){
  if(!profile||profile.id!==state.user?.id)return;const current=(state.profile?.user?.id===profile.id?state.profile.profileStatus:profile.profileThought)||null,modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-status-title"><div class="modal-head"><h2 id="profile-status-title">Share a thought</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="profile-status-form"><p class="ml-thought-editor-note">Your thought appears beside your profile picture so people can tap it to read.</p><div class="field"><label for="profile-status-text">Your thought</label><textarea id="profile-status-text" name="text" maxlength="120" required placeholder="What’s on your mind?">'+esc(current?.text||'')+'</textarea></div><div class="field"><label for="profile-status-mood">Mood or activity (optional)</label><input id="profile-status-mood" name="mood" maxlength="24" value="'+esc(current?.mood||'')+'"></div><div class="field"><label for="profile-status-audience">Who can see your thought?</label><select id="profile-status-audience" name="audience"><option value="public">Everyone</option><option value="friends">Friends</option><option value="close_friends">Close Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><div class="field"><label for="profile-status-expiry">How long it stays visible</label><select id="profile-status-expiry" name="expiresInHours"><option value="1">1 hour</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24" selected>24 hours</option><option value="48">2 days</option><option value="72">3 days</option><option value="168">7 days</option></select></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Share thought</button></div></form>'+(current?'<button type="button" class="text-button ml-thought-remove-inline" id="profile-status-remove">Remove current thought</button>':'')+'</section>';

  document.body.append(modal);const form=modal.querySelector('#profile-status-form'),close=()=>modal.remove();if(current?.audience)form.elements.audience.value=current.audience;
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#profile-status-remove')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await api('/profile-status',{method:'DELETE',body:'{}'});close();await openProfile(profile.id);toast('Your thought was removed.');}catch(error){toast(error.message);button.disabled=false;}});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const values=new FormData(form);await api('/profile-status',{method:'POST',body:JSON.stringify({text:values.get('text'),mood:values.get('mood'),audience:values.get('audience'),expiresInHours:Number(values.get('expiresInHours'))})});close();await openProfile(profile.id);toast('Thought shared.');}catch(error){toast(error.message);button.disabled=false;}});
}
async function openProfileArchiveManager(profileId){
  try{const posts=(await api('/profile/archive')).posts||[],modal=document.createElement('div');modal.className='modal-backdrop';
    const rows=posts.map(post=>{const media=(post.media||[]).map(item=>item.mediaType==='video'?'<video controls playsinline preload="metadata" src="'+esc(item.url)+'"></video>':'<img src="'+esc(item.url)+'" alt="Archived post media">').join('');return '<article class="profile-archive-item"><div class="profile-archive-copy">'+(post.text?'<p>'+esc(post.text)+'</p>':'<p class="muted">Media post</p>')+'<small>'+esc(post.archivedAt?new Date(post.archivedAt).toLocaleString():'Archived post')+'</small></div>'+(media?'<div class="profile-archive-media">'+media+'</div>':'')+'<button type="button" class="secondary" data-restore-archived-post="'+esc(post.id)+'">Restore post</button></article>';}).join('');
    modal.innerHTML='<section class="modal profile-archive-modal" role="dialog" aria-modal="true" aria-labelledby="profile-archive-title"><div class="modal-head"><h2 id="profile-archive-title">Your post archive</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body">'+(rows||'<div class="empty-state"><h3>Your archive is empty</h3><p>Posts you archive stay here until restored or deleted.</p></div>')+'</div></section>';
    document.body.append(modal);const close=()=>modal.remove();modal.querySelector('.modal-close')?.addEventListener('click',close);modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelectorAll('[data-restore-archived-post]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/profile/archive/'+encodeURIComponent(button.dataset.restoreArchivedPost),{method:'DELETE',body:'{}'});close();await openProfile(profileId);toast('Post restored to your profile.');await openProfileArchiveManager(profileId);}catch(error){toast(error.message);button.disabled=false;}}));
  }catch(error){toast(error.message||'Could not load your post archive.');}
}
async function openProfileActivityLog(profileId){
  try{const items=(await api('/users/'+encodeURIComponent(profileId)+'/activity')).activity||[],modal=document.createElement('div');modal.className='modal-backdrop';
    const rows=items.map(item=>'<li class="profile-activity-item"><span class="profile-activity-dot" aria-hidden="true"></span><div><strong>'+esc(item.summary||String(item.action||'Activity').replace(/_/g,' '))+'</strong><time datetime="'+esc(item.createdAt||'')+'">'+esc(item.createdAt?new Date(item.createdAt).toLocaleString():'')+'</time></div></li>').join('');
    modal.innerHTML='<section class="modal profile-activity-modal" role="dialog" aria-modal="true" aria-labelledby="profile-activity-title"><div class="modal-head"><h2 id="profile-activity-title">Activity log</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body">'+(rows?'<ol class="profile-activity-list">'+rows+'</ol>':'<div class="empty-state"><h3>No activity yet</h3><p>Your profile and account activity will appear here as you use Minglora.</p></div>')+'</div></section>';
    document.body.append(modal);const close=()=>modal.remove();modal.querySelector('.modal-close')?.addEventListener('click',close);modal.addEventListener('click',event=>{if(event.target===modal)close();});
  }catch(error){toast(error.message||'Could not load your activity log.');}
}
async function openProfileHighlightsManager(profileId){
  try{const items=(await api('/users/'+encodeURIComponent(profileId)+'/highlights')).highlights||[],modal=document.createElement('div');modal.className='modal-backdrop';
    const cards=items.map(item=>'<article class="profile-highlight-item">'+(item.coverUrl?'<img src="'+esc(item.coverUrl)+'" alt="">':'<div class="profile-highlight-placeholder">✧</div>')+'<div><strong>'+esc(item.title)+'</strong><small>'+Number(item.storyCount||0)+' stories</small></div>'+(profileId===state.user.id?'<button type="button" class="secondary" data-remove-highlight="'+esc(item.id)+'">Remove</button>':'')+'</article>').join('');
    modal.innerHTML='<section class="modal profile-highlights-modal" role="dialog" aria-modal="true" aria-labelledby="profile-highlights-title"><div class="modal-head"><h2 id="profile-highlights-title">Profile Highlights</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body">'+(cards||'<div class="empty-state"><h3>No Highlights yet</h3><p>Save Stories to keep them on your profile after their 24-hour period ends.</p></div>')+(profileId===state.user.id?'<div class="modal-actions"><button type="button" class="primary" id="profile-highlight-add">Create Highlight</button></div>':'')+'</div></section>';
    document.body.append(modal);const close=()=>modal.remove();modal.querySelector('.modal-close')?.addEventListener('click',close);modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelector('#profile-highlight-add')?.addEventListener('click',()=>{close();void openStoryArchiveManager(profileId);});
    modal.querySelectorAll('[data-remove-highlight]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/highlights/'+encodeURIComponent(button.dataset.removeHighlight),{method:'DELETE'});close();await openProfile(profileId);await openProfileHighlightsManager(profileId);toast('Highlight removed.');}catch(error){toast(error.message);button.disabled=false;}}));
  }catch(error){toast(error.message||'Could not load profile Highlights.');}
}
async function openStoryArchiveManager(profileId){
  try{const [activeResult,archiveResult]=await Promise.all([api('/stories'),api('/users/'+encodeURIComponent(profileId)+'/story-archive')]);const active=(activeResult.stories||[]).filter(story=>story.userId===profileId||story.author?.id===profileId),archived=archiveResult.stories||[],seen=new Set(),stories=[...active,...archived].filter(story=>{if(!story?.id||seen.has(story.id))return false;seen.add(story.id);return true;}),modal=document.createElement('div');modal.className='modal-backdrop';
    const rows=stories.map(story=>{const media=story.media?.url?(story.media.mediaType==='video'?'<video controls playsinline preload="metadata" src="'+esc(story.media.url)+'"></video>':'<img src="'+esc(story.media.url)+'" alt="">'):'';return '<label class="profile-story-archive-option"><input type="checkbox" name="storyId" value="'+esc(story.id)+'"><span class="profile-story-archive-preview">'+media+'</span><span class="profile-story-archive-copy"><strong>'+(esc((story.text||'').slice(0,90))||'Story')+'</strong><small>'+(story.archivedAt?'Archived ':'Published ')+esc(story.createdAt?new Date(story.createdAt).toLocaleString():'')+'</small></span></label>';}).join('');
    modal.innerHTML='<section class="modal profile-story-archive-modal" role="dialog" aria-modal="true" aria-labelledby="profile-story-archive-title"><div class="modal-head"><h2 id="profile-story-archive-title">Story archive & Highlights</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="profile-highlight-form"><p class="muted">Select up to 20 active or archived Stories to save as a permanent Highlight.</p><div class="field"><label for="profile-highlight-title">Highlight name</label><input id="profile-highlight-title" name="title" maxlength="50" required placeholder="e.g. Jamaica, Family, Travel"></div><div class="profile-story-archive-list">'+(rows||'<div class="empty-state"><h3>No Stories available</h3><p>Publish a Story first. Expired Stories are retained in your private archive.</p></div>')+'</div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary" '+(stories.length?'':'disabled')+'>Save Highlight</button></div></form></section>';
    document.body.append(modal);const close=()=>modal.remove();modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelector('#profile-highlight-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]'),storyIds=[...form.querySelectorAll('input[name="storyId"]:checked')].map(input=>input.value);if(!storyIds.length){toast('Select at least one Story.');return;}if(storyIds.length>20){toast('A Highlight can contain up to 20 Stories.');return;}button.disabled=true;try{const values=new FormData(form);await api('/highlights',{method:'POST',body:JSON.stringify({title:values.get('title'),storyIds})});close();await openProfile(profileId);await openProfileHighlightsManager(profileId);toast('Profile Highlight created.');}catch(error){toast(error.message);button.disabled=false;}});
  }catch(error){toast(error.message||'Could not load your Story archive.');}
}
function openProfileCheckInComposer(profileId){
  if(profileId!==state.user.id)return;const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-checkin-title"><div class="modal-head"><h2 id="profile-checkin-title">Create check-in</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="profile-checkin-form"><div class="field"><label for="profile-checkin-place">Place</label><input id="profile-checkin-place" name="place" minlength="2" maxlength="120" required placeholder="Where are you?"></div><div class="field"><label for="profile-checkin-note">Note (optional)</label><textarea id="profile-checkin-note" name="note" maxlength="500"></textarea></div><div class="field"><label for="profile-checkin-visibility">Who can see this check-in?</label><select id="profile-checkin-visibility" name="visibility"><option value="public">Everyone</option><option value="friends">Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Share check-in</button></div></form></section>';
  document.body.append(modal);const close=()=>modal.remove(),form=modal.querySelector('#profile-checkin-form');modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const values=new FormData(form);await api('/check-ins',{method:'POST',body:JSON.stringify({place:values.get('place'),note:values.get('note'),visibility:values.get('visibility')})});close();await openProfile(profileId);state.profileTab='checkins';renderProfile(state.profile);toast('Check-in shared.');}catch(error){toast(error.message);button.disabled=false;}});
}
function openProfileEventComposer(profileId){
  if(profileId!==state.user.id)return;const start=new Date(Date.now()+60*60*1000);start.setMinutes(0,0,0);const pad=value=>String(value).padStart(2,'0'),toLocal=date=>date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes()),modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-event-title"><div class="modal-head"><h2 id="profile-event-title">Create event</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="profile-event-form"><div class="field"><label for="profile-event-name">Event name</label><input id="profile-event-name" name="title" minlength="3" maxlength="100" required placeholder="Event name"></div><div class="field"><label for="profile-event-description">Description</label><textarea id="profile-event-description" name="description" maxlength="2000"></textarea></div><div class="field"><label for="profile-event-location">Location (optional)</label><input id="profile-event-location" name="location" maxlength="160" placeholder="Venue or online"></div><div class="field"><label for="profile-event-start">Starts</label><input id="profile-event-start" name="startAt" type="datetime-local" required value="'+toLocal(start)+'"></div><div class="field"><label for="profile-event-end">Ends (optional)</label><input id="profile-event-end" name="endAt" type="datetime-local"></div><div class="field"><label for="profile-event-visibility">Who can see this event?</label><select id="profile-event-visibility" name="visibility"><option value="public">Everyone</option><option value="friends">Friends</option><option value="private">Only me</option></select></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Create event</button></div></form></section>';
  document.body.append(modal);const close=()=>modal.remove(),form=modal.querySelector('#profile-event-form');modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const values=new FormData(form),startAt=new Date(String(values.get('startAt'))),endValue=String(values.get('endAt')||'').trim(),endAt=endValue?new Date(endValue):null;if(!Number.isFinite(startAt.getTime())||(endAt&&!Number.isFinite(endAt.getTime())))throw new Error('Enter valid event dates and times.');await api('/events',{method:'POST',body:JSON.stringify({title:values.get('title'),description:values.get('description'),location:values.get('location'),startAt:startAt.toISOString(),endAt:endAt?endAt.toISOString():null,visibility:values.get('visibility')})});close();await openProfile(profileId);state.profileTab='events';renderProfile(state.profile);toast('Event created.');}catch(error){toast(error.message);button.disabled=false;}});
}
async function saveProfileEventRsvp(eventId,status){
  try{await api('/events/'+encodeURIComponent(eventId)+'/rsvp',{method:'POST',body:JSON.stringify({status})});await openProfile(state.profile.user.id);state.profileTab='events';renderProfile(state.profile);toast('Event response saved.');}catch(error){toast(error.message);}
}
async function removeProfileEventRsvp(eventId){
  try{await api('/events/'+encodeURIComponent(eventId)+'/rsvp',{method:'DELETE',body:'{}'});await openProfile(state.profile.user.id);state.profileTab='events';renderProfile(state.profile);toast('Event response removed.');}catch(error){toast(error.message);}
}

async function openProfileVerificationManager(){
  let data;
  try{data=await api('/profile-verification');}
  catch(error){toast(error.message);return;}
  const status=String(data.verificationStatus||'not_submitted');
  const labels={
    not_submitted:'Not applied',pending:'Application under review',
    needs_information:'More information requested',verified:'Verified',
    rejected:'Application not approved',suspended:'Verification revoked'
  };
  const history=(data.applications||[]).map(item=>{
    const due=item.reviewDueAt?new Date(item.reviewDueAt).toLocaleString():'Not set';
    const flags=(item.autoScreeningFlags||[]).map(flag=>'<li>'+esc(flag.message||flag.code||'Review flag')+'</li>').join('');
    return '<article class="profile-verification-history"><div><strong>'+esc(labels[item.status]||item.status)+'</strong><small>'+esc(item.accountCategory)+' · '+new Date(item.submittedAt).toLocaleString()+'</small></div><p>'+esc(item.decisionNote||'Awaiting reviewer decision.')+'</p><small>Review target: '+esc(due)+'</small>'+(flags?'<ul>'+flags+'</ul>':'')+'</article>';
  }).join('');
  const formAvailable=['not_submitted','needs_information','rejected'].includes(status);
  const modal=document.createElement('div');modal.className='modal-backdrop profile-menu-modal-backdrop';
  modal.innerHTML='<section class="modal profile-verification-modal" role="dialog" aria-modal="true" aria-label="Minglora profile verification"><div class="modal-head"><div><h2>Minglora Verified</h2><small class="muted">Official blue verification badge</small></div><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><div class="profile-verification-current"><span class="profile-blue-verification" aria-hidden="true">✓</span><div><strong>'+esc(labels[status]||status)+'</strong><small>'+ (data.verificationBadge==='blue'?'The blue check appears beside your username.':'A reviewer checks your identity and independent public evidence before a badge is issued.')+'</small></div></div>'+(formAvailable?'<form id="profile-verification-application-form" class="profile-verification-form"><h3>Request profile verification</h3><p class="muted">Verification is for authentic people, creators, public figures, businesses and brands. Submit links that independently connect you or your organization to this Minglora profile. Do not upload passwords, private keys or sensitive identity numbers.</p><label>Account category<select name="accountCategory" required><option value="person">Person</option><option value="creator">Creator</option><option value="business">Business</option><option value="public_figure">Public figure</option><option value="brand">Brand / organization</option></select></label><label>Public name<input name="publicDisplayName" maxlength="120" required value="'+esc(state.profile?.user?.name||state.user?.name||'')+'"></label><label>Official website (HTTPS)<input name="officialWebsite" type="url" placeholder="https://example.com"></label><label>Independent evidence links<textarea name="evidenceLinks" rows="3" maxlength="4000" placeholder="One public HTTPS link per line. Official website, registry listing, verified social page or published coverage."></textarea></label><label>Why should this profile be verified?<textarea name="evidenceSummary" rows="4" minlength="30" maxlength="2000" required placeholder="Explain who you represent, what you are known for and how the links independently confirm this profile."></textarea></label><p class="muted">Minglora automatically checks the submitted information, then a reviewer inspects the evidence. The four-hour target is a review goal, not automatic approval.</p><button type="submit" class="primary full">Submit verification request</button></form>':'<p class="profile-verification-note">'+(status==='verified'?'Your profile is verified. The badge is displayed next to your username.':status==='pending'?'Your application is in the review queue. You will receive a Minglora notification when its status changes.':'Your application needs an update or a new submission. Review the decision note below before applying again.')+'</p>')+'<section class="profile-verification-history-list"><h3>Application history</h3>'+(history||'<p class="muted">No verification applications have been submitted yet.</p>')+'</section></div></section>';
  document.body.append(modal);
  const close=()=>modal.remove();
  modal.querySelector('.modal-close')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#profile-verification-application-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent='Submitting…';
    try{
      const values=new FormData(form),payload=Object.fromEntries(values.entries());
      payload.evidenceLinks=String(values.get('evidenceLinks')||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
      const result=await api('/profile-verification',{method:'POST',body:JSON.stringify(payload)});
      close();toast(result.notice||'Your profile verification request was submitted.');
      const refreshed=await api('/profile-verification');
      if(state.profile?.user?.id===state.user.id){
        state.profile.user.verificationStatus=refreshed.verificationStatus;
        state.profile.user.verificationBadge=refreshed.verificationBadge;
        renderProfile(state.profile);
      }
    }catch(error){toast(error.message);button.disabled=false;button.textContent='Submit verification request';}
  });
}

async function openProfileVerificationReviewDesk(){
  let data;
  try{data=await api('/admin/profile-verification/queue');}
  catch(error){toast(error.message);return;}
  const alerts=data.alerts||[],applications=data.applications||[];
  let html='<div class="profile-verification-detail-toolbar"><button class="text-button" id="profile-verification-review-back">← Back to profile</button></div><section class="profile-verification-section-heading"><div><span class="profile-verification-eyebrow">MINGLORA TRUST & SAFETY</span><h1>Profile verification review</h1><p>Review independent evidence before granting or removing a blue username badge. Applicants cannot review their own requests.</p></div></section>';
  html+='<section class="card verification-review-panel"><h2>Reviewer alerts · '+alerts.length+'</h2>';
  html+=alerts.length?alerts.map(alert=>'<article class="verification-review-item"><div><strong>'+esc(alert.title)+'</strong><p>'+esc(alert.body)+'</p><small>'+esc(alert.priority)+' priority · Due '+new Date(alert.due_at).toLocaleString()+'</small></div><button type="button" class="secondary" data-profile-verification-alert-read="'+esc(alert.id)+'">Mark read</button></article>').join(''):'<p class="muted">No unread profile verification alerts.</p>';
  html+='</section><section class="card verification-review-panel"><h2>Applications · '+applications.length+'</h2>';
  html+=applications.length?applications.map(item=>{
    const profile=item.profile||{};
    const overdue=new Date(item.review_due_at).getTime()<Date.now();
    const flags=(item.auto_screening_flags||[]).map(flag=>'<li>'+esc(flag.message||flag.code||'Review flag')+'</li>').join('');
    const links=(item.evidence_links||[]).map(url=>'<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(url)+'</a></li>').join('');
    const locked=item.canReview===false;
    return '<article class="verification-review-item profile-verification-review-card"><div><div class="verification-review-title-line"><strong>'+esc(profile.displayName||item.public_display_name)+'</strong><span class="verification-priority '+esc(item.review_priority)+'">'+esc(item.review_priority)+' priority</span></div><p>@'+esc(profile.username||'')+' · '+esc(item.account_category)+' · '+esc(item.status)+'</p><small>Automated screening: '+esc(item.auto_screening_status)+' · Score '+Number(item.auto_screening_score||0)+'/100</small><small class="'+(overdue?'verification-review-overdue':'')+'">Review target: '+new Date(item.review_due_at).toLocaleString()+(overdue?' · OVERDUE':'')+'</small><p>'+esc(item.evidence_summary)+'</p>'+(item.official_website?'<p>Official website: <a href="'+esc(item.official_website)+'" target="_blank" rel="noopener noreferrer">'+esc(item.official_website)+'</a></p>':'')+(links?'<h4>Evidence links</h4><ul>'+links+'</ul>':'<p class="verification-review-overdue">No independent evidence links supplied.</p>')+(flags?'<ul class="verification-auto-review-flags">'+flags+'</ul>':'<p class="muted">No automated screening flags; human review is still required.</p>')+'</div><div class="verification-review-actions">'+(locked?'<span class="verification-status">Your application · independent review required</span>':'<button class="primary" data-profile-verification-decision="verified" data-application-id="'+esc(item.id)+'">Verify profile</button><button class="secondary" data-profile-verification-decision="needs_information" data-application-id="'+esc(item.id)+'">Request information</button><button class="secondary" data-profile-verification-decision="rejected" data-application-id="'+esc(item.id)+'">Reject</button>')+'</div></article>';
  }).join(''):'<p class="muted">No profile verification applications are waiting for review.</p>';
  html+='</section>';
  setContent(html);
  $('#profile-verification-review-back')?.addEventListener('click',()=>openProfile(state.user.id));
  document.querySelectorAll('[data-profile-verification-alert-read]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await api('/admin/profile-verification/alerts/'+encodeURIComponent(button.dataset.profileVerificationAlertRead)+'/read',{method:'POST',body:'{}'});await openProfileVerificationReviewDesk();}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-profile-verification-decision]').forEach(button=>button.addEventListener('click',async()=>{
    const decision=button.dataset.profileVerificationDecision;
    const prompts={
      verified:'Record the independent evidence checked and why it confirms this profile.',
      needs_information:'Explain the additional evidence or clarification required.',
      rejected:'Record the reason this application does not meet verification standards.'
    };
    const note=window.prompt(prompts[decision]||'Record the review decision.');
    if(!note?.trim()||note.trim().length<5)return;
    if(decision==='verified'&&!window.confirm('Confirm that you independently checked the linked evidence and verified this identity or organization?'))return;
    button.disabled=true;
    try{
      await api('/admin/profile-verification/'+encodeURIComponent(button.dataset.applicationId)+'/review',{method:'PATCH',body:JSON.stringify({decision,note:note.trim()})});
      toast(decision==='verified'?'Profile verified. The blue tick will appear beside the username.':'Profile verification decision saved.');
      await openProfileVerificationReviewDesk();
    }catch(error){toast(error.message);button.disabled=false;}
  }));
}

async function handleProfileOverflowAction(action,u,data){
  closeProfileOverflowMenu();
  if(action==='view-as'){openProfileViewAsPreview(u,data);return;}
  if(action==='search'){
    const query=window.prompt('Search Minglora for people, posts, groups or Pages:','');
    if(query?.trim())try{await renderSearch(query.trim());}catch(error){toast(error.message);}
    return;
  }
  if(action==='highlights'){await openProfileHighlightsManager(u.id);return;}
  if(action==='status'){await openProfileStatusEditor(u);return;}
  if(action==='archive'){await openProfileArchiveManager(u.id);return;}
  if(action==='story-archive'){await openStoryArchiveManager(u.id);return;}
  if(action==='activity'){await openProfileActivityLog(u.id);return;}
  if(action==='privacy'){await openProfilePrivacySettings();return;}
  if(action==='lock-toggle'){await toggleProfilePrivacyLock();return;}
  if(action==='verified'){await openProfileVerificationManager();return;}
  if(action==='verification-review'){await openProfileVerificationReviewDesk();return;}
}
function renderProfile(data){
  activateSilent('profile');const u=data.user,isMe=u.id===state.user.id;
  startCreatorLeagueProfileRefresh(u.id);
  const relationshipActions=isMe
    ?'<div class="profile-actions profile-owner-actions"><button class="secondary profile-edit" id="edit-profile" type="button" aria-label="Edit profile"><svg class="profile-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg><span>Edit profile</span></button><button class="primary profile-edit" id="profile-add-story" type="button" aria-label="Add story"><svg class="profile-control-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v8M8 12h8"></path></svg><span>Add story</span></button></div>'
    :'<div class="profile-actions"><button class="primary profile-edit" id="profile-follow" data-following="'+(data.following?'true':'false')+'">'+(data.following?(data.friendship==='accepted'?'Friends · Following':'Following'):(data.friendship==='accepted'?'Friends':'Follow'))+'</button><button class="secondary profile-edit" id="profile-message">Message</button><button class="secondary profile-edit" data-profile-call="audio">Voice call</button><button class="secondary profile-edit" data-profile-call="video">Video call</button><button class="secondary profile-edit" id="profile-report">Report</button><button class="secondary profile-edit" id="profile-block">Block</button></div>';
  const aboutHtml=profileAboutMarkup(u,isMe);
  const profileThought=data.profileStatus||u.profileThought||null;
  const isAdminProfile=Boolean(isMe&&(u.platformBadge==='admin'||['platform_owner','admin','moderator'].includes(u.platformRole)));
  const profileThoughtMarkup=profileThought
    ? '<div class="profile-thought-row"><button type="button" class="profile-thought-card" data-view-profile-thought-user="'+esc(u.id)+'" aria-label="Read '+esc(u.name)+'’s thought">'+(profileThought.mood?'<span class="profile-thought-mood">'+esc(profileThought.mood)+'</span>':'')+'<span class="profile-thought-card-text">'+esc(String(profileThought.text||'').slice(0,180))+(String(profileThought.text||'').length>180?'…':'')+'</span></button></div>'
    : (isMe?'<div class="profile-thought-row"><button type="button" class="profile-thought-card profile-thought-card--empty" data-edit-profile-thought><span class="profile-thought-pencil" aria-hidden="true">✎</span><span><strong>Share thoughts</strong><small>Post a short update above your profile picture.</small></span></button></div>':'');
  const adminToolsMarkup=isAdminProfile
    ? '<section class="profile-admin-tools" aria-label="Admin profile controls"><div class="profile-admin-tools-heading"><div><span>ADMIN PROFILE</span><strong>Profile management</strong></div><p>Manage privacy, stories and profile details from one place.</p></div><div class="profile-admin-tools-grid">'+
      '<button type="button" class="profile-admin-tool" data-profile-admin-action="privacy"><span class="profile-admin-tool-icon" aria-hidden="true">⚙</span><span>Privacy Control</span></button>'+
      '<button type="button" class="profile-admin-tool" data-profile-admin-action="edit-story"><span class="profile-admin-tool-icon" aria-hidden="true">✎</span><span>Edit Story</span></button>'+
      '<button type="button" class="profile-admin-tool" id="profile-add-story"><span class="profile-admin-tool-icon" aria-hidden="true">＋</span><span>Add Story</span></button>'+
      '<button type="button" class="profile-admin-tool" id="profile-edit-avatar"><span class="profile-admin-tool-icon" aria-hidden="true">◎</span><span>Edit Profile Picture</span></button>'+
      '<button type="button" class="profile-admin-tool" id="profile-edit-admin-cover"><span class="profile-admin-tool-icon" aria-hidden="true">▧</span><span>Edit Cover</span></button>'+
      '<button type="button" class="profile-admin-tool profile-admin-tool--secondary" id="edit-profile"><span class="profile-admin-tool-icon" aria-hidden="true">▤</span><span>Edit Profile</span></button>'+
      '</div></section>'
    : '';
  const profileActionMarkup=isAdminProfile?adminToolsMarkup:relationshipActions;
  const tab=state.profileTab||'posts';
  setContent('<section class="card profile-header-card profile-layout-'+(['standard','advanced','creator'].includes(u.profileLayout)?u.profileLayout:'advanced')+(isMe?' profile-header-card--owner':' profile-header-card--viewer')+(isAdminProfile?' profile-header-card--admin':'')+'" style="padding:0"><div class="profile-cover">'+(u.cover?'<img class="profile-cover-image" data-view-image="'+esc(u.cover)+'" data-image-label="'+esc(u.name)+' cover photo" src="'+esc(u.cover)+'" alt="">':'<img class="profile-cover-image profile-cover-image--default" src="'+DEFAULT_PROFILE_COVER+'" alt="Minglora default cover">')+'</div>'+(isMe&&!isAdminProfile?'<div class="profile-media-action-row"><button type="button" class="profile-inline-media-edit" id="profile-edit-cover" title="Edit cover picture" aria-label="Edit cover picture"><svg class="profile-control-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m4 17 5-5 3 3 3-4 5 6"></path></svg><span>Edit cover</span></button></div>':'')+'<div class="profile-info'+(isAdminProfile?' profile-info--admin':'')+((profileThought||isMe)?' profile-info--with-thought':'')+'">'+profileThoughtMarkup+'<div class="profile-avatar-edit-wrap"><img class="avatar"'+(u.avatar?' data-view-image="'+esc(u.avatar)+'" data-image-label="'+esc(u.name)+' profile picture"':'')+' src="'+avatar(u)+'" alt="">'+(!isAdminProfile&&isMe?'<button type="button" class="profile-inline-media-edit profile-avatar-inline-edit" id="profile-edit-avatar" title="Edit profile picture" aria-label="Edit profile picture"><svg class="profile-control-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0M19 13v6m-3-3h6"></path></svg><span>Edit picture</span></button>':'')+'</div><div class="profile-info-main"><h1 class="profile-name-with-badges"><span>'+esc(u.name)+'</span>'+platformAdminProfileBadge(u)+'</h1><p class="profile-username-line">@'+esc(u.username)+' '+verifiedProfileBadge(u)+'</p>'+(data.profileStatus?'<p class="profile-status-badge sr-only" aria-label="Profile status">'+(data.profileStatus.mood?'<strong>'+esc(data.profileStatus.mood)+'</strong> · ':'')+esc(data.profileStatus.text)+' <small>· Expires '+esc(profileDate(data.profileStatus.expiresAt))+'</small></p>':'')+'</div>'+profileActionMarkup+'<div class="profile-counts" aria-label="Profile counts"><button type="button" class="connection-count" data-open-connections="followers"><strong>'+Number(data.followersCount||0)+'</strong><span>Followers</span></button><button type="button" class="connection-count" data-open-connections="following"><strong>'+Number(data.followingCount||0)+'</strong><span>Following</span></button><button type="button" class="connection-count" data-open-connections="friends"><strong>'+Number(data.friendsCount||0)+'</strong><span>Friends</span></button><button type="button" class="connection-count" data-open-connections="subscribers"><strong>'+Number(data.subscribersCount||0).toLocaleString()+'</strong><span>Subscribers</span></button><div class="profile-count-item"><strong>'+(data.posts||[]).length+'</strong><span>Posts</span></div><div class="profile-count-item"><strong>'+Number(data.likesCount||0).toLocaleString()+'</strong><span>Likes</span></div></div>'+'</div><nav class="profile-tabs" aria-label="Profile sections"><div class="profile-tabs-list">'+[['posts','All'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['badges','Badges'],['gift-gallery','Gift Gallery'],['more','More']].map(([key,label])=>'<button type="button" data-profile-tab="'+key+'" class="'+(tab===key?'active':'')+'" aria-current="'+(tab===key?'page':'false')+'">'+label+'</button>').join('')+'</div>'+(isMe?'<div class="profile-tabs-overflow"><button type="button" id="profile-overflow-trigger" class="profile-overflow-trigger" aria-label="More profile actions" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">···</span></button><div id="profile-overflow-menu" class="profile-overflow-menu" role="menu" aria-label="Profile actions" hidden><button type="button" role="menuitem" data-profile-overflow-action="view-as"><span aria-hidden="true">◉</span><span>View as</span></button><button type="button" role="menuitem" data-profile-overflow-action="search"><span aria-hidden="true">⌕</span><span>Search</span></button><button type="button" role="menuitem" data-profile-overflow-action="highlights"><span aria-hidden="true">✧</span><span>Add Highlights</span></button><button type="button" role="menuitem" data-profile-overflow-action="status" aria-label="Share a thought (Profile status)"><span aria-hidden="true">✎</span><span>Share a thought</span></button><div class="profile-overflow-divider"></div><button type="button" role="menuitem" data-profile-overflow-action="archive"><span aria-hidden="true">▣</span><span>Archive</span></button><button type="button" role="menuitem" data-profile-overflow-action="story-archive"><span aria-hidden="true">◷</span><span>Story archive</span></button><button type="button" role="menuitem" data-profile-overflow-action="activity"><span aria-hidden="true">≡</span><span>Activity log</span></button><button type="button" role="menuitem" data-profile-overflow-action="privacy"><span aria-hidden="true">⚙</span><span>Profile and tagging settings</span></button><button type="button" role="menuitem" data-profile-overflow-action="lock-toggle"><span aria-hidden="true">▣</span><span>Lock profile</span></button>'+(u.platformRole&&['platform_owner','admin','moderator'].includes(u.platformRole)?'<button type="button" role="menuitem" data-profile-overflow-action="verification-review"><span aria-hidden="true">✓</span><span>Profile verification review</span></button>':'')+'<div class="profile-overflow-divider"></div><button type="button" role="menuitem" data-profile-overflow-action="verified"><span aria-hidden="true">✔</span><span>Minglora Verified ✔️</span></button></div></div>':'')+'</nav></section><div id="profile-tab-panel"></div>');
  const showTab=nextTab=>{
    state.profileTab=nextTab;
    persistCurrentView();
    recordBrowserNavigation();
    document.querySelectorAll('.profile-tabs [data-profile-tab]').forEach(button=>{const selected=button.dataset.profileTab===nextTab||(button.dataset.profileTab==='more'&&['checkins','events','highlights','groups','videos','manage'].includes(nextTab));button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');});
    const panel=$('#profile-tab-panel');if(!panel)return;
    panel.innerHTML=profileTabMarkup(data,nextTab,aboutHtml,isMe);
    bindProfileTabActions(panel);
  };
  document.querySelectorAll('.profile-tabs [data-profile-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.profileTab)));
  const overflowTrigger=$('#profile-overflow-trigger'),overflowMenu=$('#profile-overflow-menu');
  overflowTrigger?.addEventListener('click',async event=>{
    event.stopPropagation();if(!overflowMenu)return;
    const opening=overflowMenu.hidden;overflowMenu.hidden=!opening;
    overflowTrigger.setAttribute('aria-expanded',opening?'true':'false');
    if(opening){
      try{const settings=await api('/settings');const locked=settings.settings?.privacy?.profileVisibility==='private';
        const label=overflowMenu.querySelector('[data-profile-overflow-action="lock-toggle"] span:last-child');
        if(label)label.textContent=locked?'Unlock profile':'Lock profile';
      }catch{}
    }
  });
  overflowMenu?.querySelectorAll('[data-profile-overflow-action]').forEach(button=>button.addEventListener('click',()=>handleProfileOverflowAction(button.dataset.profileOverflowAction,u,data)));

  $('#edit-profile')?.addEventListener('click',()=>openEditProfile(u));
  $('#profile-edit-avatar')?.addEventListener('click',()=>openEditProfile(u,'avatar'));
  $('#profile-edit-cover')?.addEventListener('click',()=>openEditProfile(u,'cover'));
  $('#profile-edit-admin-cover')?.addEventListener('click',()=>openEditProfile(u,'cover'));
  document.querySelectorAll('[data-profile-admin-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.profileAdminAction;
    if(action==='privacy')void openProfilePrivacySettings();
    else if(action==='edit-story')void openProfileStoryEditor(u.id);
  }));
  $('#profile-add-story')?.addEventListener('click',()=>openStoryComposer());
  $('#profile-follow')?.addEventListener('click',async()=>{
    const following=$('#profile-follow')?.dataset.following==='true';
    try{const result=await api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST',body:'{}'});toast(result.friends?'You are now friends through mutual follows.':(following?'Unfollowed member.':'Now following member.'));await openProfile(u.id);}
    catch(error){toast(error.message);}
  });
  $('#profile-message')?.addEventListener('click',()=>openMessageWindow(u));
  document.querySelectorAll('[data-profile-call]').forEach(button=>button.addEventListener('click',()=>startMingloraCall(u,button.dataset.profileCall)));
  $('#profile-report')?.addEventListener('click',()=>openReportComposer('user',u.id));
  $('#profile-block')?.addEventListener('click',async()=>{if(!window.confirm('Block '+u.name+'? You will no longer see each other’s profile, posts or messages.'))return;try{await api('/users/'+encodeURIComponent(u.id)+'/block',{method:'POST',body:'{}'});toast('Member blocked.');state.profile=null;state.view='feed';await loadPeople();await loadFeed('all');await renderFeed();await renderSidebar();}catch(error){toast(error.message);}});
  document.querySelectorAll('[data-open-connections]').forEach(button=>button.addEventListener('click',()=>renderConnections(u.id,button.dataset.openConnections)));
  document.querySelectorAll('[data-view-image]').forEach(image=>image.addEventListener('click',()=>{const url=image.dataset.viewImage;if(url)openImageViewer(url,image.dataset.imageLabel||'Profile image');}));
  showTab(tab);
}
async function loadProfileGiftGallery(panel,profileData){
  const root=panel?.querySelector('[data-profile-gift-gallery]');
  const member=profileData?.user;
  if(!root||!member?.id)return;
  root.innerHTML='<div class="empty-state"><h3>Loading Gift Gallery…</h3><p>Checking this member’s current weekly gifts.</p></div>';
  try{
    const gallery=await api('/users/'+encodeURIComponent(member.id)+'/gift-gallery');
    const isOwner=member.id===state.user?.id;
    const period=gallery.period||{};
    const resetAt=period.resetsAt?new Date(period.resetsAt):null;
    const timezone=String(period.timeZone||getMingloraDeviceTimeZone()||'America/Jamaica');
    const resetText=resetAt&&!Number.isNaN(resetAt.getTime())?resetAt.toLocaleString(undefined,{timeZone:timezone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Monday at midnight';
    const totals=gallery.totals||{gifts:0,giftTypes:0,coins:0,supporters:0};
    const safeMediaUrl=value=>{
      const url=String(value||'');
      return url.startsWith('/')||/^https:\/\//i.test(url)?url:'';
    };
    const cards=(gallery.entries||[]).map(entry=>{
      const target=Math.max(1,Number(entry.targetCount)||1);
      const progress=Math.max(0,Number(entry.leadingGifterCount)||0);
      const percent=Math.min(100,Math.round(progress/target*100));
      const image=safeMediaUrl(entry.imageUrl);
      const leader=entry.leadingGifter;
      return '<article class="gift-gallery-tile '+(entry.lit?'is-lit':'')+'">'+
        '<div class="gift-gallery-tile-top">'+(image?'<img class="gift-gallery-art" src="'+esc(image)+'" alt="'+esc(entry.giftName)+'" loading="lazy">':'<span class="gift-gallery-emoji" aria-hidden="true">'+esc(entry.emoji||'🎁')+'</span>')+
        '<span class="gift-gallery-light-status">'+(entry.lit?'✦ LIT':'IN PROGRESS')+'</span></div>'+
        '<div class="gift-gallery-tile-copy"><strong>'+esc(entry.giftName)+'</strong><small>'+Number(entry.giftCount||0).toLocaleString()+' received · '+Number(entry.totalCoins||0).toLocaleString()+' Coins</small>'+
        '<div class="gift-gallery-progress-label"><span>One gifter’s progress</span><strong>'+progress.toLocaleString()+' / '+target.toLocaleString()+'</strong></div>'+
        '<div class="gift-gallery-progress"><span style="width:'+percent+'%"></span></div>'+
        (leader?'<div class="gift-gallery-leader"><img src="'+avatar(leader)+'" alt=""><span><strong>'+esc(leader.name)+'</strong><small>'+(entry.lit?'Lit this gift':'Top Gifter')+' · '+progress.toLocaleString()+' sent</small></span><b>TOP GIFTER</b></div>':'<p class="muted gift-gallery-no-leader">No visible gifter yet</p>')+
        (isOwner?'<form class="gift-gallery-goal-form" data-gift-gallery-goal="'+esc(entry.giftCode)+'"><label>Gift target<input name="targetCount" type="number" min="1" max="10000" step="1" value="'+target+'"></label><button type="submit" class="secondary">Save goal</button></form>':'')+
        '</div></article>';
    }).join('');
    const settings=gallery.ownerSettings||{enabled:true,targets:{}};
    const preference=gallery.viewerPreference||{showInGalleries:true};
    root.innerHTML=
      '<div class="gift-gallery-heading"><div><span class="eyebrow">MINGLORA WEEKLY GIFT WALL</span><h2>Gift Gallery</h2><p class="muted">Every LIVE gift is tracked. A gift lights up when one viewer reaches its target, and the leading gifter is recognised for that gift.</p></div><div class="gift-gallery-reset"><strong>Weekly reset</strong><span>Monday · 12:00 AM</span><small>'+esc(resetText)+' · '+esc(timezone)+'</small></div></div>'+
      '<div class="gift-gallery-stats"><div><strong>'+Number(totals.gifts||0).toLocaleString()+'</strong><span>Gifts received</span></div><div><strong>'+Number(totals.giftTypes||0).toLocaleString()+'</strong><span>Gift types</span></div><div><strong>'+Number(totals.supporters||0).toLocaleString()+'</strong><span>Supporters</span></div><div><strong>'+Number(totals.coins||0).toLocaleString()+'</strong><span>Coins received</span></div></div>'+
      (isOwner?'<section class="gift-gallery-settings"><div><strong>Gift Gallery settings</strong><small>Control your wall and your own gifter privacy.</small></div><label><input id="gift-gallery-enabled" type="checkbox" '+(settings.enabled!==false?'checked':'')+'><span>Show my Gift Gallery on my profile</span></label><label><input id="gift-gallery-visible" type="checkbox" '+(preference.showInGalleries!==false?'checked':'')+'><span>Show my name in other members’ Gift Galleries</span></label><button type="button" class="primary" id="gift-gallery-save-settings">Save settings</button></section>':'')+
      (gallery.enabled===false?'<div class="empty-state"><h3>This Gift Gallery is turned off</h3><p>The owner has hidden their weekly Gift Gallery.</p></div>':cards?'<div class="gift-gallery-grid">'+cards+'</div>':'<div class="empty-state gift-gallery-empty"><span>🎁</span><h3>This week’s gallery is waiting for its first LIVE gift</h3><p>When viewers send gifts during a LIVE, each gift type will appear here with its progress and top gifter.</p></div>');
    root.querySelector('#gift-gallery-save-settings')?.addEventListener('click',async buttonEvent=>{
      const button=buttonEvent.currentTarget;
      button.disabled=true;
      try{
        await api('/gift-gallery/settings',{method:'PATCH',body:JSON.stringify({
          enabled:root.querySelector('#gift-gallery-enabled')?.checked===true,
          showInGalleries:root.querySelector('#gift-gallery-visible')?.checked===true
        })});
        await loadProfileGiftGallery(panel,profileData);
        toast('Gift Gallery settings saved.');
      }catch(error){toast(error.message);button.disabled=false;}
    });
    root.querySelectorAll('[data-gift-gallery-goal]').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=form.querySelector('[type="submit"]');
      const targetCount=Number(new FormData(form).get('targetCount'));
      button.disabled=true;
      try{
        await api('/gift-gallery/settings',{method:'PATCH',body:JSON.stringify({giftCode:form.dataset.giftGalleryGoal,targetCount})});
        await loadProfileGiftGallery(panel,profileData);
        toast('Gift target updated.');
      }catch(error){toast(error.message);button.disabled=false;}
    }));
  }catch(error){
    root.innerHTML='<div class="empty-state"><h3>Gift Gallery could not load</h3><p>'+esc(error.message||'Please refresh and try again.')+'</p><button type="button" class="secondary" id="gift-gallery-retry">Try again</button></div>';
    root.querySelector('#gift-gallery-retry')?.addEventListener('click',()=>loadProfileGiftGallery(panel,profileData));
  }
}
function bindProfileTabActions(panel){
  if(state.profileTab==='gift-gallery'&&state.profile)void loadProfileGiftGallery(panel,state.profile);
  panel.querySelector('#profile-section-manager')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
    const selected=new Set([...form.querySelectorAll('input[name="section"]:checked')].map(input=>input.value));
    const sections={about:selected.has('about'),friends:selected.has('friends'),photos:selected.has('photos'),reels:selected.has('reels'),groups:selected.has('groups'),checkIns:selected.has('checkins'),events:selected.has('events'),highlights:selected.has('highlights')};
    try{const result=await api('/profile-sections',{method:'PATCH',body:JSON.stringify({sections})});state.profile.profileSections=result.sections;state.profileTab='more';renderProfile(state.profile);toast('Profile sections saved to your account.');}catch(error){toast(error.message);button.disabled=false;}
  });
  panel.querySelectorAll('[data-open-group]').forEach(button=>button.addEventListener('click',()=>renderGroup(button.dataset.openGroup)));

  panel.querySelector('#edit-about-inline')?.addEventListener('click',()=>openEditProfile(state.profile.user));
  panel.querySelector('#edit-profile-completion')?.addEventListener('click',()=>openEditProfile(state.profile.user));
  panel.querySelector('#profile-layout-choice')?.addEventListener('change',async event=>{
    const control=event.currentTarget;
    const previous=state.profile?.user?.profileLayout||'advanced';
    const requested=control.value;
    if(!['standard','advanced','creator'].includes(requested)){control.value=previous;return;}
    control.disabled=true;
    try{
      const result=await api('/settings',{method:'PATCH',body:JSON.stringify({preferences:{profileLayout:requested}})});
      const saved=result.settings?.preferences?.profileLayout;
      if(!['standard','advanced','creator'].includes(saved))throw new Error('Minglora did not confirm the selected profile layout.');
      state.profile.user.profileLayout=saved;
      renderProfile(state.profile);
      toast('Profile layout saved.');
    }catch(error){
      control.value=previous;
      control.disabled=false;
      toast(error.message);
    }
  });
  panel.querySelectorAll('[data-edit-about-section]').forEach(button=>button.addEventListener('click',()=>openAboutSectionEditor(button.dataset.editAboutSection,state.profile.user)));
  panel.querySelector('#profile-composer')?.addEventListener('click',()=>openComposer());
  panel.querySelector('#profile-upload-photo')?.addEventListener('click',()=>openProfilePhotoComposer(state.profile.user.id));
  panel.querySelector('#profile-create-album')?.addEventListener('click',()=>openProfileAlbumEditor(state.profile.user.id));
  panel.querySelector('#profile-create-reel')?.addEventListener('click',()=>openProfileReelComposer(state.profile.user.id));
  panel.querySelector('#profile-create-checkin')?.addEventListener('click',()=>openProfileCheckInComposer(state.profile.user.id));
  panel.querySelector('#profile-create-event')?.addEventListener('click',()=>openProfileEventComposer(state.profile.user.id));
  panel.querySelector('#profile-manage-highlights')?.addEventListener('click',()=>openProfileHighlightsManager(state.profile.user.id));
  panel.querySelectorAll('[data-event-rsvp]').forEach(button=>button.addEventListener('click',()=>saveProfileEventRsvp(button.dataset.eventId,button.dataset.eventRsvp)));
  panel.querySelectorAll('[data-event-rsvp-remove]').forEach(button=>button.addEventListener('click',()=>removeProfileEventRsvp(button.dataset.eventId)));
  panel.querySelectorAll('[data-profile-tab]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.profile)return;state.profileTab=button.dataset.profileTab;renderProfile(state.profile);
  }));
  panel.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.profile)));
  panel.querySelectorAll('[data-album-edit]').forEach(button=>button.addEventListener('click',()=>{
    const album=(state.profile.albums||[]).find(item=>item.id===button.dataset.albumEdit);if(album)openProfileAlbumEditor(state.profile.user.id,album);
  }));
  panel.querySelectorAll('[data-album-delete]').forEach(button=>button.addEventListener('click',async()=>{
    const albumId=button.dataset.albumDelete;if(!window.confirm('Delete this album? The uploaded photos themselves will remain in your media.'))return;
    try{await api('/albums/'+encodeURIComponent(albumId),{method:'DELETE'});await openProfile(state.profile.user.id);state.profileTab='photos';}catch(error){toast(error.message);}
  }));
  panel.querySelectorAll('[data-profile-photo-remove]').forEach(button=>button.addEventListener('click',async()=>{
    try{await api('/albums/'+encodeURIComponent(button.dataset.albumId)+'/photos/'+encodeURIComponent(button.dataset.profilePhotoRemove),{method:'DELETE'});await openProfile(state.profile.user.id);state.profileTab='photos';}catch(error){toast(error.message);}
  }));
  panel.querySelectorAll('[data-album-open]').forEach(button=>button.addEventListener('click',()=>{
    const album=(state.profile.albums||[]).find(item=>item.id===button.dataset.albumOpen);if(!album)return;
    const photos=album.photos||[];const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<section class="modal profile-album-viewer" role="dialog" aria-modal="true" aria-label="'+esc(album.title)+'"><div class="modal-head"><div><h2>'+esc(album.title)+'</h2><small>'+photos.length+' photos</small></div><button class="modal-close" type="button" aria-label="Close">×</button></div><div class="modal-body"><div class="profile-media-grid">'+photos.map(photo=>profilePhotoTile(photo,state.profile.user.id===state.user.id,album.id)).join('')+'</div></div></section>';
    document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();modal.addEventListener('click',event=>{if(event.target===modal)modal.remove();});
    modal.querySelectorAll('[data-profile-photo-remove]').forEach(remove=>remove.addEventListener('click',async()=>{try{await api('/albums/'+encodeURIComponent(remove.dataset.albumId)+'/photos/'+encodeURIComponent(remove.dataset.profilePhotoRemove),{method:'DELETE'});modal.remove();await openProfile(state.profile.user.id);state.profileTab='photos';}catch(error){toast(error.message);}}));
  }));
}
function mediaMaxBytes(slot){
  return slot==='avatar'?10*1024*1024:slot==='cover'?20*1024*1024:slot==='sound'?50*1024*1024:slot==='story'?200*1024*1024:slot==='group'||slot==='page'?250*1024*1024:slot==='message'?100*1024*1024:slot==='ringtone'?20*1024*1024:500*1024*1024;
}
function mediaMaxLabel(slot){
  return slot==='avatar'?'10 MB':slot==='cover'?'20 MB':slot==='sound'?'50 MB':slot==='story'?'200 MB':slot==='group'||slot==='page'?'250 MB':slot==='message'?'100 MB':slot==='ringtone'?'20 MB':'500 MB';
}
async function uploadMediaFile(slot,file,zoom=1,rotation=0,onProgress=()=>{}){
  if(file.size>mediaMaxBytes(slot))throw new Error('This file is larger than the '+mediaMaxLabel(slot)+' limit for this media area.');
  let prepared=file;
  if(imageMime(file))prepared=await transformMediaImage(file,zoom,rotation);
  let mimeType=String(prepared.type||'').split(';')[0].trim().toLowerCase();
  if(!mimeType&&prepared.name?.toLowerCase().endsWith('.glb'))mimeType='model/gltf-binary';
  if((slot==='ringtone'||slot==='sound')&&(!mimeType||mimeType==='application/octet-stream')){
    const ext=String(prepared.name||'').toLowerCase().split('.').pop();
    const audioTypes={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',ogg:'audio/ogg',opus:'audio/ogg',webm:'audio/webm',wav:'audio/wav',flac:'audio/flac',aac:'audio/aac'};
    mimeType=audioTypes[ext]||mimeType;
  }
  if(slot==='ringtone'&&mimeType==='audio/x-m4a')mimeType='audio/mp4';
  if(slot==='ringtone'&&mimeType==='audio/mp3')mimeType='audio/mpeg';
  if(!mimeType)throw new Error('Minglora could not detect the selected file type. Choose a supported photo, video, audio or GLB file.');
  if(prepared.size>mediaMaxBytes(slot))throw new Error('This file is larger than the '+mediaMaxLabel(slot)+' limit for this media area.');
  const preparedUpload=await api('/media/upload/prepare',{method:'POST',body:JSON.stringify({slot,mimeType,byteSize:prepared.size,fileName:prepared.name||'Attachment'})});
  const uploadInfo=preparedUpload.upload||{};
  if(!preparedUpload.assetId||!uploadInfo.bucket||!uploadInfo.path)throw new Error('Minglora could not prepare this secure upload.');
  const canUseSignedStandard=Boolean(uploadInfo.signedUrl)&&prepared.size<=6*1024*1024;
  if(canUseSignedStandard){
    const formData=new FormData();
    formData.append('cacheControl','3600');
    formData.append('',prepared,prepared.name||'minglora-upload');
    const response=await fetch(uploadInfo.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:formData});
    if(!response.ok){
      const result=await response.json().catch(()=>({}));
      throw new Error(result.message||result.error||'Supabase could not accept this photo or file. Please retry.');
    }
    onProgress({bytesUploaded:prepared.size,bytesTotal:prepared.size,percentage:100,finalizing:true});
  }else{
    if(!window.tus?.Upload||!uploadInfo.endpoint||!uploadInfo.token)throw new Error('The secure resumable upload component did not load. Check your connection and try again.');
    try{
      await new Promise((resolve,reject)=>{
        try{
          const upload=new window.tus.Upload(prepared,{
            endpoint:uploadInfo.endpoint,
            retryDelays:[0,3000,5000,10000,20000],
            headers:{'x-signature':uploadInfo.token},
            uploadDataDuringCreation:true,
            removeFingerprintOnSuccess:true,
            storeFingerprintForResuming:false,
            chunkSize:6*1024*1024,
            metadata:{bucketName:uploadInfo.bucket,objectName:uploadInfo.path,contentType:mimeType,cacheControl:'3600'},
            onProgress:(bytesUploaded,bytesTotal)=>{
              const percentage=bytesTotal?Math.min(100,Math.round(bytesUploaded/bytesTotal*100)):0;
              onProgress({bytesUploaded,bytesTotal,percentage});
            },
            onError:error=>reject(new Error('Upload failed: '+(error?.message||'The connection was interrupted. Try again.'))),
            onSuccess:()=>resolve()
          });
          upload.start();
        }catch(error){reject(error);}
      });
    }catch(error){
      const reason=String(error?.message||error);
      if(!uploadInfo.signedUrl||!/(invalid compact jws|accessdenied|unauthorized|403)/i.test(reason))throw error;
      const formData=new FormData();
      formData.append('cacheControl','3600');
      formData.append('',prepared,prepared.name||'minglora-upload');
      const response=await fetch(uploadInfo.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:formData});
      if(!response.ok){
        const result=await response.json().catch(()=>({}));
        throw new Error(result.message||result.error||'The secure upload could not be completed. Please try again.');
      }
      onProgress({bytesUploaded:prepared.size,bytesTotal:prepared.size,percentage:100,finalizing:true});
    }
  }
  onProgress({bytesUploaded:prepared.size,bytesTotal:prepared.size,percentage:100,finalizing:true});
  const completed=await api('/media/upload/complete',{method:'POST',body:JSON.stringify({assetId:preparedUpload.assetId})});
  if(!completed.asset?.id)throw new Error('The file uploaded but Minglora could not register it.');
  return {...completed.asset,user:completed.user||null};
}
window.uploadMediaFile=uploadMediaFile;
async function uploadProfileImage(slot,file,zoom=1,rotation=0,onProgress=()=>{}){
  if(!file)return null;
  if(file.size>mediaMaxBytes(slot))throw new Error('Profile media must be '+mediaMaxLabel(slot)+' or smaller.');
  const allowed=['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','image/heic-sequence','image/heif-sequence'];
  if(!allowed.includes(file.type)&&!/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name||''))throw new Error('Choose a supported JPEG, PNG, WEBP, AVIF, HEIC or HEIF image.');
  return uploadMediaFile(slot,file,zoom,rotation,onProgress);
}

let mediaPickerSequence=0;
function mediaAccept(slot){
  if(slot==='sound')return 'audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,audio/x-wav,audio/flac,audio/aac,.mp3,.m4a,.mp4,.ogg,.opus,.webm,.wav,.flac,.aac';
  if(slot==='ringtone')return 'audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,audio/x-wav,audio/flac,audio/aac,.mp3,.m4a,.ogg,.opus,.webm,.wav,.flac,.aac';
  if(slot==='message')return 'image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/webm,application/pdf,text/plain,text/csv,application/zip,application/x-zip-compressed,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if(slot==='group'||slot==='page')return 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4';
  return slot==='story'?'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime': 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/webm,model/gltf-binary,.glb';
}
function imageMime(file){return ['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(file.type)||/\.hei[cf]$/i.test(file.name||'');}
async function transformMediaImage(file,zoom=1,rotation=0){
  const needsConversion=['image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(file.type)||/\.hei[cf]$/i.test(file.name||'');
  if(zoom<=1.001&&rotation===0&&!needsConversion)return file;
  const bitmap=await createImageBitmap(file);
  const swap=Math.abs(rotation%180)===90;
  const width=swap?bitmap.height:bitmap.width,height=swap?bitmap.width:bitmap.height;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw new Error('Image editing is not supported in this browser.');
  context.translate(width/2,height/2);context.rotate(rotation*Math.PI/180);context.scale(zoom,zoom);
  context.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);bitmap.close?.();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not prepare the edited image.')),'image/jpeg',.92));
  const base=(file.name||'minglora-image').replace(/\.[^.]+$/,'');
  return new File([blob],base+'-edited.jpg',{type:'image/jpeg',lastModified:Date.now()});
}

async function openDeviceCapture({mode='both',onCapture}={}){
  if(!navigator.mediaDevices?.getUserMedia){toast('Camera access is unavailable. Open Minglora over HTTPS in a browser that supports device camera access.');return;}
  const modal=document.createElement('div');modal.className='modal-backdrop device-camera-backdrop';
  modal.innerHTML='<section class="device-camera-modal" role="dialog" aria-modal="true" aria-label="Device camera"><div class="device-camera-header"><strong>Minglora camera</strong><button type="button" class="device-camera-close" aria-label="Close camera">×</button></div><video class="device-camera-preview" autoplay muted playsinline></video><p class="device-camera-status" role="status">Requesting camera permission…</p><div class="device-camera-controls"><button type="button" class="secondary" data-camera-switch>Switch camera</button><button type="button" class="secondary" data-camera-photo>Take photo</button><button type="button" class="primary" data-camera-record>Record video</button><button type="button" class="danger" data-camera-stop hidden>Stop recording</button></div></section>';
  document.body.append(modal);
  const video=modal.querySelector('.device-camera-preview'),status=modal.querySelector('.device-camera-status');
  const photoButton=modal.querySelector('[data-camera-photo]'),recordButton=modal.querySelector('[data-camera-record]'),stopButton=modal.querySelector('[data-camera-stop]');
  let stream=null,recorder=null,chunks=[],facingMode='environment',recording=false,closed=false;
  const stopTracks=()=>{if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}video.srcObject=null;};
  const close=()=>{if(closed)return;closed=true;try{if(recorder&&recorder.state!=='inactive')recorder.stop();}catch{}stopTracks();modal.remove();};
  const setControls=()=>{photoButton.hidden=mode==='video';recordButton.hidden=mode==='photo'||recording;stopButton.hidden=!recording;};
  const openStream=async()=>{
    stopTracks();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1080}},audio:mode!=='photo'});
    video.srcObject=stream;await video.play();
    status.textContent='Camera ready. Take a photo or record a video.';
  };
  const finishCapture=async(file)=>{
    if(!file||closed)return;
    close();
    try{await onCapture?.(file);}catch(error){toast(error.message||'The captured media could not be added.');}
  };
  modal.querySelector('.device-camera-close').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('[data-camera-switch]').onclick=async()=>{
    facingMode=facingMode==='environment'?'user':'environment';status.textContent='Switching camera…';
    try{await openStream();}catch(error){status.textContent=error.message||'Could not switch cameras.';toast(status.textContent);}
  };
  photoButton.onclick=async()=>{
    if(!video.videoWidth||!video.videoHeight){toast('The camera is still starting.');return;}
    const scale=Math.min(1,1920/video.videoWidth),canvas=document.createElement('canvas');
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    const context=canvas.getContext('2d');if(!context){toast('Photo capture is not supported by this browser.');return;}
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
    if(!blob){toast('Minglora could not capture this photo.');return;}
    await finishCapture(new File([blob],'minglora-photo-'+Date.now()+'.jpg',{type:'image/jpeg',lastModified:Date.now()}));
  };
  recordButton.onclick=()=>{
    if(!stream||typeof MediaRecorder==='undefined'){toast('Video recording is not supported by this browser.');return;}
    const candidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
    const mimeType=candidates.find(type=>MediaRecorder.isTypeSupported?.(type));
    try{
      recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);chunks=[];
      recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
      recorder.onerror=()=>{recording=false;setControls();status.textContent='Video recording failed.';};
      recorder.onstop=async()=>{
        recording=false;setControls();
        const type=recorder.mimeType||mimeType||'video/webm',extension=type.includes('mp4')?'mp4':'webm';
        const blob=new Blob(chunks,{type});
        if(blob.size)await finishCapture(new File([blob],'minglora-video-'+Date.now()+'.'+extension,{type,lastModified:Date.now()}));
        else status.textContent='No video was recorded.';
      };
      recorder.start(500);recording=true;setControls();status.textContent='Recording video… press Stop recording when finished.';
    }catch(error){toast(error.message||'Could not start video recording.');}
  };
  stopButton.onclick=()=>{if(recorder&&recorder.state!=='inactive')recorder.stop();};
  setControls();
  try{await openStream();}catch(error){status.textContent=error.message||'Camera permission was denied.';toast(status.textContent);photoButton.disabled=true;recordButton.disabled=true;}
}
async function openDeviceAudioCapture({onCapture}={}){
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
    toast('Microphone recording is not supported in this browser. Choose an audio file instead.');return;
  }
  const modal=document.createElement('div');modal.className='modal-backdrop device-audio-backdrop';
  modal.innerHTML='<section class="modal device-audio-modal" role="dialog" aria-modal="true" aria-labelledby="device-audio-title"><div class="modal-head"><div><span class="eyebrow">MINGLORA SOUNDS</span><h2 id="device-audio-title">Record original audio</h2></div><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><div class="audio-recording-indicator" data-audio-recording-indicator><span></span><span></span><span></span><span></span><span></span></div><p class="device-audio-status muted" role="status">Ready to record from your microphone.</p><audio controls hidden data-audio-recording-preview></audio><div class="modal-actions"><button type="button" class="secondary" data-audio-record-start>Start recording</button><button type="button" class="danger" data-audio-record-stop disabled>Stop recording</button></div><button type="button" class="secondary full modal-cancel">Cancel</button></div></section>';
  document.body.append(modal);
  const status=modal.querySelector('.device-audio-status'),start=modal.querySelector('[data-audio-record-start]'),stop=modal.querySelector('[data-audio-record-stop]'),preview=modal.querySelector('[data-audio-recording-preview]'),indicator=modal.querySelector('[data-audio-recording-indicator]');
  let stream=null,recorder=null,chunks=[],recordedFile=null,closed=false,startedAt=0;
  const stopTracks=()=>{if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}};
  const close=()=>{if(closed)return;closed=true;try{if(recorder&&recorder.state!=='inactive')recorder.stop();}catch{}stopTracks();if(preview.src)URL.revokeObjectURL(preview.src);modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  start.onclick=async()=>{
    start.disabled=true;status.textContent='Requesting microphone permission…';
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const candidates=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm','audio/ogg'];
      const mimeType=candidates.find(type=>MediaRecorder.isTypeSupported?.(type));
      recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);chunks=[];
      recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
      recorder.onerror=()=>{status.textContent='The microphone recording failed. Try again or choose an audio file.';start.disabled=false;stop.disabled=true;indicator.classList.remove('is-recording');stopTracks();};
      recorder.onstop=()=>{
        const type=recorder.mimeType||mimeType||'audio/webm';
        const extension=type.includes('ogg')?'ogg':type.includes('mp4')?'m4a':'webm';
        const blob=new Blob(chunks,{type});
        stopTracks();indicator.classList.remove('is-recording');stop.disabled=true;
        if(!blob.size){status.textContent='No audio was captured. Try recording again.';start.disabled=false;return;}
        recordedFile=new File([blob],'minglora-original-sound-'+Date.now()+'.'+extension,{type,lastModified:Date.now()});
        preview.src=URL.createObjectURL(recordedFile);preview.hidden=false;
        status.textContent='Recording ready · '+Math.max(1,Math.round(recordedFile.size/1024))+' KB. Preview it, then add it to your sound.';
        start.textContent='Record again';start.disabled=false;
        let add=modal.querySelector('[data-audio-record-add]');
        if(!add){add=document.createElement('button');add.type='button';add.className='primary';add.dataset.audioRecordAdd='true';add.textContent='Use this recording';modal.querySelector('.modal-actions').append(add);}
        add.onclick=async()=>{const file=recordedFile;close();try{await onCapture?.(file);}catch(error){toast(error.message||'The recording could not be added.');}};
      };
      recorder.start(500);startedAt=Date.now();stop.disabled=false;indicator.classList.add('is-recording');
      status.textContent='Recording… speak clearly and press Stop when finished.';
    }catch(error){status.textContent=error.message||'Microphone permission was denied.';start.disabled=false;stop.disabled=true;stopTracks();}
  };
  stop.onclick=()=>{if(recorder&&recorder.state!=='inactive'){status.textContent='Finalizing your recording…';recorder.stop();}};
}
function createMediaPicker(root,options={}){
  const slot=options.slot||'post',maxFiles=options.maxFiles||10,accept=options.accept||mediaAccept(slot),initialMedia=options.initialMedia||[],maxTotalBytes=Number.isFinite(options.maxTotalBytes)?Math.max(0,options.maxTotalBytes):Infinity;
  const pickerId='minglora-media-picker-'+(++mediaPickerSequence),entries=[],objectUrls=[];
  initialMedia.forEach(item=>entries.push({existing:true,id:item.id,url:item.url,mimeType:item.mimeType||'image/jpeg',mediaType:item.mediaType||'image',name:'Attached media',zoom:1,rotation:0}));
  root.innerHTML='<div class="media-picker"><div class="media-picker-actions"><button type="button" class="secondary" data-media-gallery>Choose from gallery / files</button><button type="button" class="secondary" data-media-camera>'+(slot==='sound'?'Record audio':'Take photo / video')+'</button><input type="file" class="media-picker-input" data-media-input accept="'+esc(accept)+'"'+(maxFiles>1?' multiple="multiple"':'')+'><input type="file" class="media-picker-input" data-media-camera-input accept="image/*,video/*" capture="environment"></div><p class="media-picker-help">Select multiple files at once, or drag and drop files here. Large uploads retry automatically when the connection briefly drops. Up to '+maxFiles+' files; '+mediaMaxLabel(slot)+' per file.'+(Number.isFinite(maxTotalBytes)?' Total selection limit: '+Math.round(maxTotalBytes/1024/1024)+' MB.':'')+'</p><div class="media-picker-items" data-media-items></div><p class="media-picker-status muted" data-media-status role="status"></p><progress class="media-upload-progress" max="100" value="0" hidden></progress></div>';
  const gallery=root.querySelector('[data-media-input]'),camera=root.querySelector('[data-media-camera-input]'),list=root.querySelector('[data-media-items]'),status=root.querySelector('[data-media-status]'),progress=root.querySelector('.media-upload-progress'),dropZone=root.querySelector('.media-picker');
  gallery.multiple=maxFiles>1;
  function mediaCard(entry,index){
    let preview='';
    if(entry.url&&entry.mediaType==='video')preview='<video controls playsinline preload="metadata" src="'+esc(entry.url)+'"></video>';
    else if(entry.url&&entry.mediaType==='audio')preview='<audio controls preload="metadata" src="'+esc(entry.url)+'"></audio>';
    else if(entry.url&&entry.mediaType==='model3d')preview='<model-viewer src="'+esc(entry.url)+'" alt="3D model preview" camera-controls auto-rotate></model-viewer>';
    else if(entry.url&&entry.mediaType==='document')preview='<a class="message-attachment-document" href="'+esc(entry.url)+'" target="_blank" rel="noopener">Open '+esc(entry.name||'file')+'</a>';
    else if(entry.url)preview='<img style="transform:scale('+entry.zoom+') rotate('+entry.rotation+'deg)" src="'+esc(entry.url)+'" alt="Selected image preview">';
    else if(entry.file&&imageMime(entry.file))preview='<img style="transform:scale('+entry.zoom+') rotate('+entry.rotation+'deg)" src="'+esc(entry.previewUrl)+'" alt="Selected image preview">';
    else if(entry.file&&entry.file.type.startsWith('video/'))preview='<video controls playsinline src="'+esc(entry.previewUrl)+'"></video>';
    else if(entry.file&&entry.file.type.startsWith('audio/'))preview='<audio controls src="'+esc(entry.previewUrl)+'"></audio>';
    else if(entry.file&&entry.file.type==='model/gltf-binary')preview='<div class="media-3d-placeholder">3D model selected · preview after upload</div>';
    else if(entry.file&&(entry.file.type==='application/pdf'||entry.file.type.startsWith('application/')||entry.file.type.startsWith('text/')))preview='<span class="message-attachment-document">Document selected · '+esc(entry.file.name)+'</span>';
    const edit=imageMime(entry.file)?'<label class="media-zoom-control">Zoom / crop <input type="range" min="1" max="2.5" step="0.05" value="'+entry.zoom+'" data-media-zoom="'+index+'"></label><button type="button" class="secondary" data-media-rotate="'+index+'">Rotate 90°</button>':'';
    return '<article class="media-picker-item"><div class="media-picker-preview">'+preview+'</div><div class="media-picker-meta"><strong>'+esc(entry.file?.name||entry.name||'Attached media')+'</strong><small>'+((entry.file?.size||entry.byteSize||0)/1024/1024).toFixed(2)+' MB</small><div class="media-picker-tools">'+edit+'<button type="button" class="secondary" data-media-remove="'+index+'">Remove</button></div></div></article>';
  }
  function render(){
    list.innerHTML=entries.map(mediaCard).join('');
    list.querySelectorAll('[data-media-zoom]').forEach(control=>control.addEventListener('input',()=>{const item=entries[Number(control.dataset.mediaZoom)];item.zoom=Number(control.value);const image=control.closest('.media-picker-item')?.querySelector('.media-picker-preview img');if(image)image.style.transform='scale('+item.zoom+') rotate('+item.rotation+'deg)';}));
    list.querySelectorAll('[data-media-rotate]').forEach(button=>button.addEventListener('click',()=>{const item=entries[Number(button.dataset.mediaRotate)];item.rotation=(item.rotation+90)%360;render();}));
    list.querySelectorAll('[data-media-remove]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.mediaRemove),item=entries[index];if(item.previewUrl){URL.revokeObjectURL(item.previewUrl);objectUrls.splice(objectUrls.indexOf(item.previewUrl),1);}entries.splice(index,1);render();}));
  }
  function addFiles(fileList){
    for(const file of Array.from(fileList||[])){
      if(entries.length>=maxFiles){status.textContent='You can select up to '+maxFiles+' files.';break;}
      if(file.size>mediaMaxBytes(slot)){status.textContent=file.name+' is over the '+mediaMaxLabel(slot)+' limit for this media area.';continue;}
      const selectedBytes=entries.reduce((total,entry)=>total+(Number(entry.file?.size||entry.byteSize)||0),0);
      if(selectedBytes+file.size>maxTotalBytes){status.textContent='Adding '+file.name+' would exceed the '+Math.round(maxTotalBytes/1024/1024)+' MB total selection limit. Remove a file or choose a smaller one.';continue;}
      const baseMime=String(file.type||'').split(';')[0].trim().toLowerCase();
      const allowed=accept.split(',').some(pattern=>pattern.trim().startsWith('.')?file.name.toLowerCase().endsWith(pattern.trim().toLowerCase()):pattern.trim().endsWith('/*')?baseMime.startsWith(pattern.trim().slice(0,-1)):baseMime===pattern.trim().toLowerCase());
      if(!allowed){status.textContent=file.name+' has an unsupported file type.';continue;}
      const previewUrl=URL.createObjectURL(file);objectUrls.push(previewUrl);
      entries.push({file,previewUrl,zoom:1,rotation:0,mediaType:file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type==='model/gltf-binary'?'model3d':'document'});
    }
    render();
  }
  gallery.addEventListener('change',()=>{const selected=[...gallery.files];addFiles(selected);gallery.value='';});
  camera.addEventListener('change',()=>{const selected=[...camera.files];addFiles(selected);camera.value='';});
  dropZone.addEventListener('dragenter',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dropZone.classList.add('is-dragging');});
  dropZone.addEventListener('dragover',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';dropZone.classList.add('is-dragging');});
  dropZone.addEventListener('dragleave',event=>{if(!dropZone.contains(event.relatedTarget))dropZone.classList.remove('is-dragging');});
  dropZone.addEventListener('drop',event=>{const files=event.dataTransfer?.files;if(!files?.length)return;event.preventDefault();dropZone.classList.remove('is-dragging');const before=entries.length;addFiles(files);const added=entries.length-before;if(added)status.textContent='Added '+added+' file'+(added===1?'':'s')+'. You can add more before publishing.';});
  root.querySelector('[data-media-gallery]').addEventListener('click',()=>gallery.click());
  root.querySelector('[data-media-camera]').addEventListener('click',()=>slot==='sound'?openDeviceAudioCapture({onCapture:file=>addFiles([file])}):openDeviceCapture({mode:'both',onCapture:file=>addFiles([file])}));
  render();
  return {
    hasSelection:()=>entries.length>0,
    selectedFiles:()=>entries.filter(entry=>!entry.existing&&entry.file).map(entry=>entry.file),
    async upload(){
      const ids=[];
      for(const entry of entries){
        if(entry.existing){ids.push(entry.id);continue;}
        status.textContent='Preparing '+(entry.file?.name||'media')+'…';progress.hidden=false;progress.value=0;
        const saved=await uploadMediaFile(slot,entry.file,entry.zoom,entry.rotation,update=>{progress.value=update.percentage;status.textContent=update.finalizing?'Upload complete. Saving media record…':'Uploading '+(entry.file?.name||'media')+' · '+update.percentage+'%';});
        ids.push(saved.id);
        entry.existing=true;entry.id=saved.id;entry.url=saved.previewUrl||null;entry.mediaType=saved.mediaType;entry.mimeType=saved.mimeType;entry.byteSize=saved.byteSize;entry.name=entry.file.name;entry.file=null;
      }
      status.textContent=ids.length?'Media uploaded and ready.':'No media selected.';progress.hidden=true;
      return ids;
    },
    destroy(){objectUrls.forEach(url=>URL.revokeObjectURL(url));root.innerHTML='';}
  };
}

function profileCropViewport(stage){
  // Absolute-positioned crop content is laid out in the padding box, not the
  // outer border box. Subtract the actual CSS borders while retaining fractions.
  const rect=stage.getBoundingClientRect();
  const style=getComputedStyle(stage);
  const borderX=(parseFloat(style.borderLeftWidth)||0)+(parseFloat(style.borderRightWidth)||0);
  const borderY=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
  return {width:Math.max(0,rect.width-borderX),height:Math.max(0,rect.height-borderY)};
}
function clampProfileCropPosition(stage,edit){
  const viewport=profileCropViewport(stage);
  if(!viewport.width||!viewport.height||!edit.imageWidth||!edit.imageHeight)return;
  const swapped=Math.abs(edit.rotation%180)===90;
  const rotatedWidth=swapped?edit.imageHeight:edit.imageWidth;
  const rotatedHeight=swapped?edit.imageWidth:edit.imageHeight;
  const fitScale=Math.max(viewport.width/rotatedWidth,viewport.height/rotatedHeight);
  const drawnWidth=rotatedWidth*fitScale*edit.zoom;
  const drawnHeight=rotatedHeight*fitScale*edit.zoom;
  const maxX=Math.max(0,(drawnWidth-viewport.width)/2),maxY=Math.max(0,(drawnHeight-viewport.height)/2);
  edit.offsetX=Math.max(-maxX,Math.min(maxX,edit.offsetX));
  edit.offsetY=Math.max(-maxY,Math.min(maxY,edit.offsetY));
}
function updateProfileCropPreview(stage,image,edit){
  const viewport=profileCropViewport(stage);
  if(!viewport.width||!viewport.height||!edit.imageWidth||!edit.imageHeight)return;
  clampProfileCropPosition(stage,edit);
  const swapped=Math.abs(edit.rotation%180)===90;
  const rotatedWidth=swapped?edit.imageHeight:edit.imageWidth;
  const rotatedHeight=swapped?edit.imageWidth:edit.imageHeight;
  const fitScale=Math.max(viewport.width/rotatedWidth,viewport.height/rotatedHeight);
  image.style.width=(edit.imageWidth*fitScale)+'px';
  image.style.height=(edit.imageHeight*fitScale)+'px';
  image.style.left='calc(50% + '+edit.offsetX+'px)';
  image.style.top='calc(50% + '+edit.offsetY+'px)';
  image.style.transform='translate(-50%,-50%) rotate('+edit.rotation+'deg) scale('+edit.zoom+')';
}
function bindProfileCropStage(stage,image,edit){
  const update=()=>updateProfileCropPreview(stage,image,edit);
  const clampZoom=value=>Math.max(1,Math.min(3,value));
  image.addEventListener('load',()=>{
    edit.imageWidth=image.naturalWidth||0;
    edit.imageHeight=image.naturalHeight||0;
    update();
  });
  if(image.complete&&image.naturalWidth){
    edit.imageWidth=image.naturalWidth;
    edit.imageHeight=image.naturalHeight;
    update();
  }
  const pointers=new Map();
  let drag=null,pinch=null;
  const beginDrag=pointer=>{
    drag={pointerId:pointer.pointerId,x:pointer.x,y:pointer.y,offsetX:edit.offsetX,offsetY:edit.offsetY};
    stage.classList.add('is-dragging');
  };
  const beginPinch=()=>{
    const active=[...pointers.values()].slice(0,2);
    if(active.length<2)return;
    drag=null;
    stage.classList.remove('is-dragging');
    const dx=active[1].x-active[0].x,dy=active[1].y-active[0].y;
    const rect=stage.getBoundingClientRect();
    pinch={
      distance:Math.max(1,Math.hypot(dx,dy)),
      zoom:edit.zoom,
      offsetX:edit.offsetX,
      offsetY:edit.offsetY,
      centerX:(active[0].x+active[1].x)/2-(rect.left+rect.width/2),
      centerY:(active[0].y+active[1].y)/2-(rect.top+rect.height/2)
    };
    stage.classList.add('is-zooming');
  };
  stage.addEventListener('pointerdown',event=>{
    if(!edit.fileSelected)return;
    const pointer={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
    pointers.set(event.pointerId,pointer);
    try{stage.setPointerCapture(event.pointerId);}catch{}
    if(pointers.size>=2)beginPinch();
    else beginDrag(pointer);
    event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{
    const pointer=pointers.get(event.pointerId);
    if(!pointer)return;
    pointer.x=event.clientX;
    pointer.y=event.clientY;
    if(pointers.size>=2&&pinch){
      const active=[...pointers.values()].slice(0,2);
      const dx=active[1].x-active[0].x,dy=active[1].y-active[0].y;
      const distance=Math.max(1,Math.hypot(dx,dy));
      const rect=stage.getBoundingClientRect();
      const centerX=(active[0].x+active[1].x)/2-(rect.left+rect.width/2);
      const centerY=(active[0].y+active[1].y)/2-(rect.top+rect.height/2);
      edit.zoom=clampZoom(pinch.zoom*(distance/pinch.distance));
      const scale=edit.zoom/pinch.zoom;
      edit.offsetX=centerX-scale*(pinch.centerX-pinch.offsetX);
      edit.offsetY=centerY-scale*(pinch.centerY-pinch.offsetY);
      update();
      event.preventDefault();
      return;
    }
    if(!drag||drag.pointerId!==event.pointerId)return;
    edit.offsetX=drag.offsetX+(event.clientX-drag.x);
    edit.offsetY=drag.offsetY+(event.clientY-drag.y);
    update();
    event.preventDefault();
  });
  const resumeGesture=()=>{
    if(pointers.size>=2){beginPinch();return;}
    pinch=null;
    stage.classList.remove('is-zooming');
    drag=null;
    const remaining=pointers.values().next().value;
    if(remaining)beginDrag(remaining);
    else stage.classList.remove('is-dragging');
  };
  const stop=event=>{
    if(event?.pointerId!=null&&!pointers.has(event.pointerId))return;
    if(event?.pointerId!=null)pointers.delete(event.pointerId);
    resumeGesture();
  };
  stage.addEventListener('pointerup',stop);
  stage.addEventListener('pointercancel',stop);
  stage.addEventListener('lostpointercapture',stop);
  stage.addEventListener('wheel',event=>{
    if(!edit.fileSelected||(!event.ctrlKey&&!event.metaKey))return;
    event.preventDefault();
    edit.zoom=clampZoom(edit.zoom*Math.exp(-event.deltaY*0.002));
    update();
  },{passive:false});
  return update;
}
async function transformProfileCrop(file,edit,stage,slot){
  let bitmap;
  try{bitmap=await createImageBitmap(file);}
  catch{throw new Error('This image could not be opened for cropping on this device. Choose a JPEG, PNG or WEBP image instead.');}
  try{
    const viewport=profileCropViewport(stage);
    if(!viewport.width||!viewport.height)throw new Error('The image crop preview is not ready. Select the photo again and try.');
    const outputWidth=slot==='avatar'?1080:1800;
    const outputHeight=Math.max(1,Math.round(outputWidth*viewport.height/viewport.width));
    const swapped=Math.abs(edit.rotation%180)===90;
    const rotatedWidth=swapped?bitmap.height:bitmap.width;
    const rotatedHeight=swapped?bitmap.width:bitmap.height;
    const fitScale=Math.max(outputWidth/rotatedWidth,outputHeight/rotatedHeight);
    const canvas=document.createElement('canvas');
    canvas.width=outputWidth;canvas.height=outputHeight;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Image cropping is not supported in this browser.');
    context.translate(
      outputWidth/2+edit.offsetX*(outputWidth/viewport.width),
      outputHeight/2+edit.offsetY*(outputHeight/viewport.height)
    );
    context.rotate(edit.rotation*Math.PI/180);
    context.scale(fitScale*edit.zoom,fitScale*edit.zoom);
    context.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
    const mimeType=file.type==='image/png'?'image/png':'image/jpeg';
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Minglora could not prepare the cropped image.')),mimeType,mimeType==='image/jpeg'?.92:undefined));
    const base=(file.name||'minglora-profile-image').replace(/\.[^.]+$/,'');
    const extension=mimeType==='image/png'?'png':'jpg';
    return new File([blob],base+'-profile-crop.'+extension,{type:mimeType,lastModified:Date.now()});
  }finally{bitmap.close?.();}
}

function openEditProfile(u,mediaOnly=null){
  if(!['avatar','cover'].includes(mediaOnly))mediaOnly=null;
  const aboutVisibility={bio:true,location:true,country:false,county:false,parish:false,city:false,gender:false,relationshipStatus:false,contactPhone:false,...(u.aboutVisibility||{})};
  const modal=document.createElement('section');modal.className='card profile-inline-editor';
  modal.innerHTML=`<div class="profile-inline-editor-content" aria-labelledby="edit-profile-title">
    <div class="modal-head"><h2 id="edit-profile-title">${mediaOnly==='avatar'?'Edit profile picture':mediaOnly==='cover'?'Edit cover picture':'Edit profile'}</h2><button class="modal-close" aria-label="Close">×</button></div>
    <form class="modal-body" id="edit-profile-form">
      <div class="profile-editor-details">
      <div class="field"><label for="edit-profile-name">Display name</label><input id="edit-profile-name" name="name" maxlength="120" value="${esc(u.name)}" required></div><div class="field"><label for="edit-profile-username">Username</label><input id="edit-profile-username" name="username" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" value="${esc(u.username)}" required><small class="muted">3–30 letters, numbers or underscores. Usernames are case-insensitive.</small></div>
      <div class="field"><label for="edit-profile-bio">Bio</label><textarea id="edit-profile-bio" name="bio" maxlength="500">${esc(u.bio||'')}</textarea></div>
      <div class="field"><label for="edit-profile-location">Location</label><input id="edit-profile-location" name="location" maxlength="120" value="${esc(u.location||'')}"><label class="about-toggle"><input type="checkbox" name="show_location" ${aboutVisibility.location?'checked':''}> Display location on my profile</label></div>
      <section class="about-editor-section"><h3>About details</h3><p class="muted">Choose what people can see. Hidden details remain saved privately.</p>
        <div class="field"><label for="edit-contact-phone">Contact phone</label><input id="edit-contact-phone" name="contactPhone" type="tel" inputmode="tel" autocomplete="tel" pattern="\+[1-9][0-9]{7,14}" maxlength="24" value="${esc(u.contactPhone||'')}" placeholder="+18765551234"><button class="secondary" type="button" id="request-phone-verification">Verify phone for Supabase</button><div id="phone-verification-panel" hidden><label for="phone-verification-code">SMS verification code</label><input id="phone-verification-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code"><button class="secondary" type="button" id="confirm-phone-verification">Confirm phone number</button></div><small id="phone-verification-status" class="muted" role="status">Verification saves this number in Supabase Auth. It remains hidden from your profile unless you enable Display.</small><label class="about-toggle"><input type="checkbox" name="show_contactPhone" ${aboutVisibility.contactPhone?'checked':''}> Display contact phone on my profile</label></div>
        <div class="about-editor-grid">
          <div class="field"><label for="edit-country">Country</label><input id="edit-country" name="country" maxlength="120" value="${esc(u.country||'')}"><label class="about-toggle"><input type="checkbox" name="show_country" ${aboutVisibility.country?'checked':''}> Display</label></div>
          <div class="field"><label for="edit-county">County</label><input id="edit-county" name="county" maxlength="120" value="${esc(u.county||'')}"><label class="about-toggle"><input type="checkbox" name="show_county" ${aboutVisibility.county?'checked':''}> Display</label></div>
          <div class="field"><label for="edit-parish">Parish</label><input id="edit-parish" name="parish" maxlength="120" value="${esc(u.parish||'')}"><label class="about-toggle"><input type="checkbox" name="show_parish" ${aboutVisibility.parish?'checked':''}> Display</label></div>
          <div class="field"><label for="edit-city">City / Town</label><input id="edit-city" name="city" maxlength="120" value="${esc(u.city||'')}"><label class="about-toggle"><input type="checkbox" name="show_city" ${aboutVisibility.city?'checked':''}> Display</label></div>
          <div class="field"><label for="edit-gender">Gender</label><input id="edit-gender" name="gender" maxlength="60" value="${esc(u.gender||'')}"><label class="about-toggle"><input type="checkbox" name="show_gender" ${aboutVisibility.gender?'checked':''}> Display</label></div>
          <div class="field"><label for="edit-relationship-status">Relationship status</label><input id="edit-relationship-status" name="relationshipStatus" maxlength="80" value="${esc(u.relationshipStatus||'')}"><label class="about-toggle"><input type="checkbox" name="show_relationshipStatus" ${aboutVisibility.relationshipStatus?'checked':''}> Display</label></div>
        </div>
        <div class="field"><label class="about-toggle"><input type="checkbox" name="show_bio" ${aboutVisibility.bio?'checked':''}> Display my bio on my profile</label></div>
      </section>
      </div>
      <div class="profile-upload-section" data-profile-media-section="avatar">
        <h3>Profile picture</h3>
        <div class="profile-crop-workspace profile-crop-workspace--avatar">
          <div class="profile-crop-visual">
            <div id="edit-avatar-preview" class="profile-crop-preview profile-crop-preview--avatar" role="img" aria-label="Circular profile picture crop preview"><img id="edit-avatar-crop-image" src="${esc(avatar(u))}" alt=""></div>
            <small class="profile-crop-caption">Circular preview — this is the shape people see on your profile.</small>
          </div>
          <div class="profile-upload-controls">
            <div class="profile-upload-buttons"><label class="secondary profile-file-button" for="edit-avatar-file">Choose from gallery / files</label><button class="secondary" type="button" id="edit-avatar-camera-button">Take photo</button></div>
            <input id="edit-avatar-file" class="profile-file-input" type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif">
            
            <div class="profile-crop-actions"><button class="secondary" type="button" id="edit-avatar-rotate" disabled>Rotate 90°</button><button class="secondary" type="button" id="edit-avatar-reset" disabled>Reset crop</button></div>
            <small>Drag with one finger to reposition. Pinch with two fingers to zoom on phones; hold Ctrl and scroll over the preview on a computer.</small>
          </div>
        </div>
      </div>
      <div class="profile-upload-section" data-profile-media-section="cover">
        <h3>Cover photo</h3>
        <div class="profile-crop-workspace profile-crop-workspace--cover">
          <div id="edit-cover-preview" class="profile-crop-preview profile-crop-preview--cover" role="img" aria-label="Wide rectangular cover photo crop preview"><img id="edit-cover-crop-image" src="${esc(u.cover||'data:,')}" alt=""></div>
          <small class="profile-crop-caption">Wide cover preview — the rectangular shape used across the top of your profile.</small>
          <div class="profile-upload-controls">
            <div class="profile-upload-buttons"><label class="secondary profile-file-button" for="edit-cover-file">Choose from gallery / files</label><button class="secondary" type="button" id="edit-cover-camera-button">Take cover photo</button></div>
            <input id="edit-cover-file" class="profile-file-input" type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif">
            
            <div class="profile-crop-actions"><button class="secondary" type="button" id="edit-cover-rotate" disabled>Rotate 90°</button><button class="secondary" type="button" id="edit-cover-reset" disabled>Reset crop</button></div>
            <small>Drag with one finger to reposition. Pinch with two fingers to zoom on phones; hold Ctrl and scroll over the preview on a computer.</small>
          </div>
        </div>
      </div>
      <p class="profile-upload-status muted" id="profile-upload-status" role="status">Profile details save automatically. Selected profile and cover photos upload securely when you select Save changes.</p>
      <div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary" id="save-profile-button">Save changes</button></div>
    </form></div>`;
  const profileHeader=$('#main-content .profile-header-card');
  if(profileHeader)profileHeader.insertAdjacentElement('afterend',modal);else $('#main-content').append(modal);
  modal.scrollIntoView({behavior:'smooth',block:'start'});
  if(mediaOnly){
    modal.classList.add('profile-editor-media-only','profile-editor-media-only--'+mediaOnly);
    modal.querySelector('.profile-editor-details').hidden=true;
    modal.querySelectorAll('[data-profile-media-section]').forEach(section=>{
      section.hidden=section.dataset.profileMediaSection!==mediaOnly;
    });
    modal.querySelector('#save-profile-button').textContent=mediaOnly==='avatar'?'Save profile picture':'Save cover picture';
    modal.querySelector('#profile-upload-status').textContent=mediaOnly==='avatar'
      ?'Choose or take a profile picture, drag to position it and pinch with two fingers to zoom, then save only the profile picture.'
      :'Choose or take a cover picture, drag to position it and pinch with two fingers to zoom, then save only the cover picture.';
  }
  const avatarInput=modal.querySelector('#edit-avatar-file');
  const coverInput=modal.querySelector('#edit-cover-file');
  const avatarEdit={zoom:1,rotation:0,offsetX:0,offsetY:0,imageWidth:0,imageHeight:0,fileSelected:false};
  const coverEdit={zoom:1,rotation:0,offsetX:0,offsetY:0,imageWidth:0,imageHeight:0,fileSelected:false};
  const avatarPreview=modal.querySelector('#edit-avatar-preview');
  const coverPreview=modal.querySelector('#edit-cover-preview');
  const avatarPreviewImage=modal.querySelector('#edit-avatar-crop-image');
  const coverPreviewImage=modal.querySelector('#edit-cover-crop-image');
  const previewUrls=[];
  const updateAvatarCrop=bindProfileCropStage(avatarPreview,avatarPreviewImage,avatarEdit);
  const updateCoverCrop=bindProfileCropStage(coverPreview,coverPreviewImage,coverEdit);
  function resetProfileCrop(edit,update){
    edit.zoom=1;edit.rotation=0;edit.offsetX=0;edit.offsetY=0;
    update();
  }
  function previewFile(input,stage,image,edit,slot){
    const file=input.files?.[0];if(!file)return;
    if(!imageMime(file)){toast('Choose a supported JPEG, PNG, WEBP, AVIF, HEIC or HEIF image.');input.value='';return;}
    if(file.size>mediaMaxBytes(slot)){toast('The '+(slot==='avatar'?'profile picture':'cover photo')+' must be '+mediaMaxLabel(slot)+' or smaller.');input.value='';return;}
    resetProfileCrop(edit,slot==='avatar'?updateAvatarCrop:updateCoverCrop);
    edit.fileSelected=true;stage.classList.add('has-selection');
    modal.querySelector('#edit-'+slot+'-rotate').disabled=false;
    modal.querySelector('#edit-'+slot+'-reset').disabled=false;
    const url=URL.createObjectURL(file);previewUrls.push(url);
    image.src=url;
    status.textContent=(slot==='avatar'?'Profile picture':'Cover photo')+' selected. Adjust the crop preview before saving.';
  }
  const updateBothCrops=()=>{updateAvatarCrop();updateCoverCrop();};
  window.addEventListener('resize',updateBothCrops);
  const phoneInput=modal.querySelector('#edit-contact-phone');
  const phoneStatus=modal.querySelector('#phone-verification-status');
  const status=modal.querySelector('#profile-upload-status');
  const phonePanel=modal.querySelector('#phone-verification-panel');
  const phoneRequest=modal.querySelector('#request-phone-verification');
  const phoneVerify=modal.querySelector('#confirm-phone-verification');
  phoneRequest.onclick=async()=>{
    const phone=String(phoneInput.value||'').trim();
    phoneRequest.disabled=true;phoneStatus.textContent='Requesting a verification code…';
    try{
      await api('/auth/phone/change',{method:'POST',body:JSON.stringify({phone})});
      phonePanel.hidden=false;phoneStatus.textContent='Code sent. Check your SMS messages and enter the six-digit code.';
      modal.querySelector('#phone-verification-code').focus();
    }catch(error){phoneStatus.textContent=error.message;toast(error.message);}
    finally{phoneRequest.disabled=false;}
  };
  phoneVerify.onclick=async()=>{
    const phone=String(phoneInput.value||'').trim(),token=String(modal.querySelector('#phone-verification-code').value||'').trim();
    phoneVerify.disabled=true;phoneStatus.textContent='Verifying phone number…';
    try{
      await api('/auth/phone/verify',{method:'POST',body:JSON.stringify({phone,token})});
      const saved=await api('/users/me',{method:'PATCH',body:JSON.stringify({contactPhone:phone})});
      state.user.contactPhone=saved.user.contactPhone;
      phoneStatus.textContent='Phone verified in Supabase Auth. The private contact number is saved.';
      phoneVerify.textContent='Verified';phoneVerify.disabled=true;
      state.user.contactPhone=phone;
    }catch(error){phoneStatus.textContent=error.message;toast(error.message);phoneVerify.disabled=false;}
  };
  avatarInput.addEventListener('change',()=>previewFile(avatarInput,avatarPreview,avatarPreviewImage,avatarEdit,'avatar'));
  coverInput.addEventListener('change',()=>previewFile(coverInput,coverPreview,coverPreviewImage,coverEdit,'cover'));
  modal.querySelector('#edit-avatar-camera-button').onclick=()=>openDeviceCapture({mode:'photo',onCapture:file=>{
    const transfer=new DataTransfer();transfer.items.add(file);avatarInput.files=transfer.files;
    previewFile(avatarInput,avatarPreview,avatarPreviewImage,avatarEdit,'avatar');
  }});
  modal.querySelector('#edit-cover-camera-button').onclick=()=>openDeviceCapture({mode:'photo',onCapture:file=>{
    const transfer=new DataTransfer();transfer.items.add(file);coverInput.files=transfer.files;
    previewFile(coverInput,coverPreview,coverPreviewImage,coverEdit,'cover');
  }});
  modal.querySelector('#edit-avatar-rotate').onclick=()=>{avatarEdit.rotation=(avatarEdit.rotation+90)%360;updateAvatarCrop();};
  modal.querySelector('#edit-cover-rotate').onclick=()=>{coverEdit.rotation=(coverEdit.rotation+90)%360;updateCoverCrop();};
  modal.querySelector('#edit-avatar-reset').onclick=()=>resetProfileCrop(avatarEdit,updateAvatarCrop);
  modal.querySelector('#edit-cover-reset').onclick=()=>resetProfileCrop(coverEdit,updateCoverCrop);
  const close=()=>{clearTimeout(profileSaveTimer);window.removeEventListener('resize',updateBothCrops);previewUrls.forEach(url=>URL.revokeObjectURL(url));modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  const profileForm=modal.querySelector('#edit-profile-form');
  const collectProfilePayload=()=>{
    const values=new FormData(profileForm);
    return {
      name:values.get('name'),username:values.get('username'),bio:values.get('bio'),location:values.get('location'),
      contactPhone:values.get('contactPhone'),country:values.get('country'),county:values.get('county'),
      parish:values.get('parish'),city:values.get('city'),gender:values.get('gender'),
      relationshipStatus:values.get('relationshipStatus'),
      aboutVisibility:{
        bio:profileForm.elements.show_bio.checked,location:profileForm.elements.show_location.checked,
        contactPhone:profileForm.elements.show_contactPhone.checked,country:profileForm.elements.show_country.checked,
        county:profileForm.elements.show_county.checked,parish:profileForm.elements.show_parish.checked,
        city:profileForm.elements.show_city.checked,gender:profileForm.elements.show_gender.checked,
        relationshipStatus:profileForm.elements.show_relationshipStatus.checked
      }
    };
  };
  let profileSaveTimer=null;
  let profileSaveQueue=Promise.resolve();
  function queueProfileAutosave(event){
    const target=event.target;
    if(target?.type==='file'||target?.type==='range')return;
    clearTimeout(profileSaveTimer);
    status.textContent='Unsaved profile changes — saving automatically…';
    profileSaveTimer=window.setTimeout(()=>{
      profileSaveQueue=profileSaveQueue.catch(()=>{}).then(async()=>{
        status.textContent='Saving profile details…';
        try{
          const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(collectProfilePayload())});
          state.user=result.user;
          status.textContent='Profile details saved to your account.';
        }catch(error){
          status.textContent='Profile changes were not saved. '+error.message;
          toast(error.message);
        }
      });
    },650);
  }
  profileForm.addEventListener('input',queueProfileAutosave);
  profileForm.addEventListener('change',queueProfileAutosave);
  avatarInput.addEventListener('change',()=>{if(avatarInput.files?.[0])status.textContent='Profile picture selected. Save changes to upload it securely.';});
  coverInput.addEventListener('change',()=>{if(coverInput.files?.[0])status.textContent='Cover photo selected. Save changes to upload it securely.';});
  profileForm.onsubmit=async event=>{
    event.preventDefault();
    const button=modal.querySelector('#save-profile-button');
    clearTimeout(profileSaveTimer);
    button.disabled=true;
    try{
      await profileSaveQueue.catch(()=>{});
      const targetInput=mediaOnly==='avatar'?avatarInput:mediaOnly==='cover'?coverInput:null;
      if(mediaOnly&&!targetInput?.files?.[0]){
        const label=mediaOnly==='avatar'?'profile picture':'cover picture';
        status.textContent='Choose a '+label+' before saving.';
        toast('Choose a '+label+' before saving.');
        button.disabled=false;
        return;
      }
      if((!mediaOnly||mediaOnly==='avatar')&&avatarInput.files?.[0]){
        status.textContent='Uploading profile picture…';
        const edited=await transformProfileCrop(avatarInput.files[0],avatarEdit,avatarPreview,'avatar');
        const uploaded=await uploadProfileImage('avatar',edited,1,0,update=>{status.textContent='Uploading profile picture… '+update.percentage+'%';});
        if(uploaded?.url)state.user={...state.user,avatar:uploaded.url};
      }
      if((!mediaOnly||mediaOnly==='cover')&&coverInput.files?.[0]){
        status.textContent='Uploading cover photo…';
        const edited=await transformProfileCrop(coverInput.files[0],coverEdit,coverPreview,'cover');
        const uploaded=await uploadProfileImage('cover',edited,1,0,update=>{status.textContent='Uploading cover photo… '+update.percentage+'%';});
        if(uploaded?.url)state.user={...state.user,cover:uploaded.url};
      }
      if(!mediaOnly){
        status.textContent='Saving profile details…';
        const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(collectProfilePayload())});
        state.user=result.user;
      }
      close();
      showApp();
      await openProfile(state.user.id);
      toast(mediaOnly==='avatar'?'Profile picture updated.':mediaOnly==='cover'?'Cover picture updated.':'Profile updated and saved.');
    }catch(error){
      status.textContent='Profile changes were not saved. '+error.message;
      toast(error.message);
    }finally{
      button.disabled=false;
    }
  };

}
async function openProfileStoryEditor(profileId){
  if(profileId!==state.user?.id)return;
  try{
    const result=await api('/stories');
    const stories=(result.stories||[]).filter(story=>story.userId===profileId||story.author?.id===profileId);
    const modal=document.createElement('div');
    modal.className='modal-backdrop';
    if(!stories.length){
      modal.innerHTML='<section class="modal profile-story-edit-modal" role="dialog" aria-modal="true" aria-labelledby="profile-story-edit-title"><div class="modal-head"><h2 id="profile-story-edit-title">Edit Story</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><div class="modal-body"><div class="empty-state"><h3>No active stories to edit</h3><p>Publish a story first. Your active stories can be edited here before they expire.</p></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Close</button><button type="button" class="primary" id="profile-story-edit-add">Add Story</button></div></div></section>';
      document.body.append(modal);
      const close=()=>modal.remove();
      modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
      modal.querySelector('#profile-story-edit-add')?.addEventListener('click',()=>{close();openStoryComposer();});
      modal.addEventListener('click',event=>{if(event.target===modal)close();});
      return;
    }
    const options=stories.map((story,index)=>'<option value="'+esc(story.id)+'" '+(index===0?'selected':'')+'>'+esc((story.text||'Story without text').slice(0,64))+' · '+esc(timeAgo(story.createdAt))+'</option>').join('');
    modal.innerHTML='<section class="modal profile-story-edit-modal" role="dialog" aria-modal="true" aria-labelledby="profile-story-edit-title"><div class="modal-head"><h2 id="profile-story-edit-title">Edit Story</h2><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="profile-story-edit-form"><p class="muted">Update the story text and audience. Published photos, videos and sound stay unchanged.</p><div class="field"><label for="profile-story-edit-select">Choose an active story</label><select id="profile-story-edit-select" name="storyId">'+options+'</select></div><div class="profile-story-edit-preview" id="profile-story-edit-preview"></div><div class="field"><label for="profile-story-edit-text">Story text</label><textarea id="profile-story-edit-text" name="text" maxlength="1000" placeholder="Add a message to your story..."></textarea></div><div class="field"><label for="profile-story-edit-audience">Who can see this story?</label><select id="profile-story-edit-audience" name="audience"><option value="public">Everyone</option><option value="friends">Friends</option><option value="close_friends">Close Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Save Story</button></div></form></section>';
    document.body.append(modal);
    const form=modal.querySelector('#profile-story-edit-form');
    const select=form.elements.storyId,textField=form.elements.text,audienceField=form.elements.audience,preview=modal.querySelector('#profile-story-edit-preview');
    const selectedStory=()=>stories.find(story=>story.id===select.value)||stories[0];
    const syncSelection=()=>{
      const story=selectedStory();
      textField.value=story.text||'';
      audienceField.value=['public','friends','close_friends','followers','private'].includes(story.audience)?story.audience:'public';
      const media=story.media?.url?(story.media.mediaType==='video'?'<video controls playsinline preload="metadata" src="'+esc(story.media.url)+'"></video>':'<img src="'+esc(story.media.url)+'" alt="Story media">'):'';
      preview.innerHTML=media||'<span class="muted">This story has no attached media.</span>';
    };
    const close=()=>modal.remove();
    modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    select.addEventListener('change',syncSelection);
    syncSelection();
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=form.querySelector('[type="submit"]'),story=selectedStory();
      if(!story)return;
      button.disabled=true;
      try{
        await api('/stories/'+encodeURIComponent(story.id),{method:'PATCH',body:JSON.stringify({text:textField.value,audience:audienceField.value})});
        close();
        await loadStories();
        if(state.view==='feed')await renderFeed();
        else if(state.view==='profile')await openProfile(profileId);
        toast('Story updated.');
      }catch(error){toast(error.message||'Could not update this story.');button.disabled=false;}
    });
  }catch(error){toast(error.message||'Could not load your active stories.');}
}

function openStoryComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="story-modal-title"><div class="modal-head"><h2 id="story-modal-title">Create a story</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="story-form"><div class="field"><label for="story-text">Text (optional)</label><textarea id="story-text" name="text" maxlength="1000" placeholder="Share a moment..."></textarea></div><div class="field"><label>Choose photos or videos (up to 10)</label><div id="story-media-picker"></div></div><div class="field"><label>Soundtrack</label><div id="story-soundtrack"></div></div><div class="field"><label for="story-audience">Audience</label><select id="story-audience" name="audience"><option value="public">Public</option><option value="friends">Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><p class="muted">Stories expire automatically after 24 hours.</p><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish story</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#story-media-picker'),{slot:'story',maxFiles:10,maxTotalBytes:500*1024*1024});
  const soundtrack=createSoundtrackEditor(modal.querySelector('#story-soundtrack'));
  const close=()=>{picker.destroy();soundtrack.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload(),track=soundtrack.value();
      if(!String(values.get('text')||'').trim()&&!mediaIds.length&&!track){toast('Write a Story, choose a photo/video or add a sound.');button.disabled=false;return;}
      await api('/stories',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds,audience:values.get('audience'),soundtrack:track})});
      close();await loadStories();if(state.view==='feed')await renderFeed();toast('Story published for 24 hours.');
    }catch(error){toast(error.message);button.disabled=false;}
  };
}

async function openStory(id){
  try{
    const result=await api('/stories/'+encodeURIComponent(id)+'/view',{method:'POST',body:'{}'});const s=result.story;const isOwner=s.userId===state.user.id;
    const viewers=isOwner&&Array.isArray(s.viewers)?s.viewers.filter(v=>v.user).map(v=>'<li>'+esc(v.user.name)+' <small>'+new Date(v.viewedAt).toLocaleString()+'</small></li>').join(''):'';
    const storyMedia=Array.isArray(s.mediaItems)&&s.mediaItems.length?s.mediaItems:(s.media?[s.media]:[]);
    let activeMediaIndex=0;
    const storyMediaMarkup=()=>{
      if(!storyMedia.length)return '';
      const current=storyMedia[activeMediaIndex];
      const controls=storyMedia.length>1?'<div class="story-media-controls"><button type="button" class="secondary" data-story-prev aria-label="Previous story item">‹</button><span>'+Number(activeMediaIndex+1)+' / '+storyMedia.length+'</span><button type="button" class="secondary" data-story-next aria-label="Next story item">›</button></div>':'';
      return '<div class="story-media-stage">'+renderSingleMedia(current,'story-viewer-image')+'</div>'+controls;
    };
    const modal=document.createElement('div');modal.className='modal-backdrop story-viewer-backdrop';
    modal.innerHTML='<section class="modal story-viewer" role="dialog" aria-modal="true" aria-labelledby="story-viewer-title"><div class="modal-head"><div><h2 id="story-viewer-title">'+esc(s.author?.name||'Story')+'</h2><small>'+timeAgo(s.createdAt)+' · expires '+new Date(s.expiresAt).toLocaleString()+'</small></div><button class="modal-close" aria-label="Close">×</button></div><div data-story-media-container>'+storyMediaMarkup()+'</div>'+renderPostSoundtrack({id:s.id,soundtrack:s.soundtrack})+(s.text?'<p class="story-viewer-text">'+esc(s.text)+'</p>':'')+(isOwner?'<section class="story-viewer-stats"><strong>'+result.story.viewCount+' views</strong>'+(viewers?'<ul>'+viewers+'</ul>':'<p class="muted">No other viewers yet.</p>')+'<button class="secondary full" id="delete-story">Delete story</button></section>':'<button class="secondary full" id="report-story">Report story</button>')+'</section>';
    document.body.append(modal);
    const moveStoryMedia=step=>{
      if(storyMedia.length<2)return;
      activeMediaIndex=(activeMediaIndex+step+storyMedia.length)%storyMedia.length;
      const container=modal.querySelector('[data-story-media-container]');
      container.innerHTML=storyMediaMarkup();
      bindSoundtrackPlayback(modal);
      container.querySelector('[data-story-prev]')?.addEventListener('click',()=>moveStoryMedia(-1));
      container.querySelector('[data-story-next]')?.addEventListener('click',()=>moveStoryMedia(1));
    };
    bindSoundtrackPlayback(modal);
    modal.querySelector('[data-story-prev]')?.addEventListener('click',()=>moveStoryMedia(-1));
    modal.querySelector('[data-story-next]')?.addEventListener('click',()=>moveStoryMedia(1));
    modal.querySelector('.modal-close').onclick=()=>{modal.remove();loadStories().catch(()=>{});};
    modal.addEventListener('click',e=>{if(e.target===modal){modal.remove();loadStories().catch(()=>{});}});
    modal.querySelector('#report-story')?.addEventListener('click',()=>{modal.remove();openReportComposer('story',s.id);});
    modal.querySelector('#delete-story')?.addEventListener('click',async()=>{if(!window.confirm('Delete this story?'))return;try{await api('/stories/'+encodeURIComponent(s.id),{method:'DELETE',body:'{}'});modal.remove();await loadStories();if(state.view==='feed')await renderFeed();toast('Story deleted.');}catch(err){toast(err.message);}});
  }catch(err){toast(err.message);}
}
async function loadPages(){
  const result=await api('/pages');
  state.pages=Array.isArray(result.pages)?result.pages:[];
}
function pageDirectoryCard(page){
  const owner=!!page.myRole||page.createdBy===state.user.id;
  const following=!!page.isFollowing;
  return '<article class="card page-card page-directory-card">'+
    '<div class="page-card-top"><div class="page-card-mark">'+esc((page.title||'P').slice(0,1).toUpperCase())+'</div>'+
    '<span class="page-category">'+esc(page.category||'Community')+'</span></div>'+
    '<h3>'+esc(page.title)+'</h3><p class="page-handle">@'+esc(page.handle)+'</p>'+
    (page.description?'<p class="page-directory-description">'+esc(page.description)+'</p>':'<p class="page-directory-description muted">Public Page</p>')+
    '<div class="page-directory-stats"><strong>'+Number(page.followerCount||0).toLocaleString()+'</strong><span>followers</span></div>'+
    '<div class="page-directory-actions"><button class="secondary full" data-open-page="'+esc(page.id)+'">View Page</button>'+
    (owner?'':'<button class="'+(following?'secondary':'primary')+' full" data-follow-page="'+esc(page.id)+'" data-following="'+(following?'true':'false')+'">'+(following?'Following · Unfollow':'Follow Page')+'</button>')+
    '</div></article>';
}
function renderPageDirectoryResults(){
  const root=$('#pages-directory-results');
  if(!root)return;
  const query=String(state.pageQuery||'').trim().toLowerCase();
  const category=String(state.pageCategory||'all');
  const sort=String(state.pageSort||'popular');
  let pages=(state.pages||[]).filter(page=>{
    const matches=[page.title,page.handle,page.description,page.category].join(' ').toLowerCase().includes(query);
    return matches&&(category==='all'||String(page.category||'').toLowerCase()===category);
  });
  pages.sort((a,b)=>{
    if(sort==='recent')return new Date(b.createdAt||0)-new Date(a.createdAt||0);
    if(sort==='az')return String(a.title||'').localeCompare(String(b.title||''));
    return Number(b.followerCount||0)-Number(a.followerCount||0);
  });
  root.innerHTML=pages.length?'<div class="pages-grid">'+pages.map(pageDirectoryCard).join('')+'</div>':
    '<section class="card empty-state"><h3>No matching Pages</h3><p>Try another search or category. Page results come from actual saved Minglora Pages.</p></section>';
  root.querySelectorAll('[data-open-page]').forEach(button=>button.addEventListener('click',()=>renderPage(button.dataset.openPage)));
  root.querySelectorAll('[data-follow-page]').forEach(button=>button.addEventListener('click',async()=>{
    const follow=button.dataset.following!=='true';
    button.disabled=true;
    try{
      await api('/pages/'+encodeURIComponent(button.dataset.followPage)+'/follow',{method:follow?'POST':'DELETE',body:'{}'});
      await renderPages();
      toast(follow?'Page followed.':'Page unfollowed.');
    }catch(error){toast(error.message);button.disabled=false;}
  }));
}
async function renderPages(){
  activateSilent('pages');
  await loadPages();
  const categories=[...new Set(state.pages.map(page=>String(page.category||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const categoryOptions='<option value="all">All categories</option>'+categories.map(category=>'<option value="'+esc(category.toLowerCase())+'">'+esc(category)+'</option>').join('');
  let html='<div class="page-heading"><div><p class="page-eyebrow">MINGLORA DISCOVERY</p><h1>Pages</h1><p class="muted">Discover creators, businesses, organisations and communities.</p></div><button class="primary" id="create-page">＋ Create Page</button></div>'+
    '<section class="card page-browse-hero"><div><span class="page-hero-kicker">YOUR PUBLIC PRESENCE</span><h2>Build a community around what matters.</h2><p>Create a dedicated identity for your brand, creative work or organisation. Manage its content and team separately from your personal profile.</p></div><div class="page-hero-stats"><strong>'+state.pages.length.toLocaleString()+'</strong><span>public Pages</span></div></section>'+
    (state.pageCreateOpen?'<section class="card page-create-panel"><div class="page-panel-heading"><div><p class="page-eyebrow">NEW PUBLIC IDENTITY</p><h2>Create a Page</h2><p>Set up the public name and identity. You can complete contact and business details after creation.</p></div><button class="secondary" type="button" id="cancel-create-page">Close</button></div>'+
      '<form id="create-page-form" class="page-create-form"><div class="field"><label for="page-title">Page name</label><input id="page-title" name="title" minlength="3" maxlength="160" required placeholder="Your brand, community or public identity"></div>'+
      '<div class="field"><label for="page-handle">Unique Page handle</label><input id="page-handle" name="handle" minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,29}" required placeholder="yourpage"><small>3–30 letters, numbers, underscores or hyphens.</small></div>'+
      '<div class="field"><label for="page-category">Category</label><input id="page-category" name="category" maxlength="60" placeholder="Creator, Music, Business, Community…"></div>'+
      '<div class="field"><label for="page-description">Description</label><textarea id="page-description" name="description" maxlength="2000" rows="3" placeholder="Tell people what this Page is about."></textarea></div>'+
      '<div class="page-form-actions"><button class="primary" type="submit">Create Page</button><p id="page-create-status" class="muted" role="status"></p></div></form></section>':'')+
    '<section class="page-directory-tools"><label class="page-search-field"><span>Search Pages</span><input id="pages-search" type="search" value="'+esc(state.pageQuery||'')+'" placeholder="Search name, handle or category"></label>'+
    '<label><span>Category</span><select id="pages-category">'+categoryOptions+'</select></label><label><span>Sort by</span><select id="pages-sort"><option value="popular">Most followers</option><option value="recent">Recently created</option><option value="az">Name A–Z</option></select></label></section>'+
    '<div class="page-section-heading"><div><p class="page-eyebrow">EXPLORE</p><h2>Discover Pages</h2></div><span>'+state.pages.length.toLocaleString()+' total</span></div>'+
    '<div id="pages-directory-results"></div>';
  setContent(html);
  if($('#pages-category'))$('#pages-category').value=state.pageCategory||'all';
  if($('#pages-sort'))$('#pages-sort').value=state.pageSort||'popular';
  $('#create-page')?.addEventListener('click',()=>{state.pageCreateOpen=!state.pageCreateOpen;renderPages();});
  $('#cancel-create-page')?.addEventListener('click',()=>{state.pageCreateOpen=false;renderPages();});
  $('#pages-search')?.addEventListener('input',event=>{state.pageQuery=event.target.value;renderPageDirectoryResults();});
  $('#pages-category')?.addEventListener('change',event=>{state.pageCategory=event.target.value;renderPageDirectoryResults();});
  $('#pages-sort')?.addEventListener('change',event=>{state.pageSort=event.target.value;renderPageDirectoryResults();});
  $('#create-page-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=$('#page-create-status');
    button.disabled=true;if(status)status.textContent='Creating Page…';
    try{
      const values=Object.fromEntries(new FormData(form));
      const result=await api('/pages',{method:'POST',body:JSON.stringify(values)});
      state.pageCreateOpen=false;state.pageQuery='';state.pageCategory='all';
      toast('Page created. Complete its public details and team settings next.');
      await renderPage(result.page.id,'settings');
    }catch(error){if(status)status.textContent=error.message;button.disabled=false;}
  });
  renderPageDirectoryResults();
}
function pageTabButton(active,tab,label){
  return '<button type="button" class="page-tab'+(active===tab?' is-active':'')+'" data-page-tab="'+tab+'" aria-current="'+(active===tab?'page':'false')+'">'+label+'</button>';
}
function pageAboutMarkup(page){
  const contactRows=[
    page.website?'<div><small>Website</small><a href="'+esc(page.website)+'" target="_blank" rel="noopener noreferrer">'+esc(page.website)+'</a></div>':'',
    page.contactEmail?'<div><small>Email</small><a href="mailto:'+esc(page.contactEmail)+'">'+esc(page.contactEmail)+'</a></div>':'',
    page.phone?'<div><small>Phone</small><a href="tel:'+esc(page.phone)+'">'+esc(page.phone)+'</a></div>':'',
    page.location?'<div><small>Location</small><strong>'+esc(page.location)+'</strong></div>':''
  ].filter(Boolean).join('');
  return '<section class="card page-information-card"><p class="page-eyebrow">ABOUT THIS PAGE</p><h2>About '+esc(page.title)+'</h2>'+
    (page.description?'<p class="page-about-description">'+esc(page.description)+'</p>':'<p class="muted">This Page has not added a description yet.</p>')+
    '<div class="page-information-grid"><div><small>Category</small><strong>'+esc(page.category||'Not specified')+'</strong></div><div><small>Page handle</small><strong>@'+esc(page.handle)+'</strong></div><div><small>Created</small><strong>'+esc(page.createdAt?new Date(page.createdAt).toLocaleDateString(): 'Date unavailable')+'</strong></div></div>'+
    (contactRows?'<div class="page-contact-grid">'+contactRows+'</div>':'<p class="muted">No public contact details have been added.</p>')+
    (page.actionLabel&&page.actionUrl?'<a class="primary page-action-link" href="'+esc(page.actionUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(page.actionLabel)+'</a>':'')+
    '</section>';
}
function pageSettingsMarkup(page){
  return '<section class="card page-settings-card"><p class="page-eyebrow">PAGE CONTROL CENTRE</p><h2>Edit public information</h2><p class="muted">Changes are saved to this Page and shown to visitors. Only Page owners and admins can edit these details.</p>'+
    '<form id="page-settings-form" class="page-settings-form">'+
    '<div class="field"><label for="edit-page-title">Page name</label><input id="edit-page-title" name="title" minlength="3" maxlength="160" required value="'+esc(page.title||'')+'"></div>'+
    '<div class="field"><label for="edit-page-handle">Page handle</label><input id="edit-page-handle" name="handle" minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,29}" required value="'+esc(page.handle||'')+'"></div>'+
    '<div class="field"><label for="edit-page-category">Category</label><input id="edit-page-category" name="category" maxlength="60" value="'+esc(page.category||'')+'"></div>'+
    '<div class="field"><label for="edit-page-description">Description</label><textarea id="edit-page-description" name="description" rows="4" maxlength="2000">'+esc(page.description||'')+'</textarea></div>'+
    '<div class="page-settings-divider"><h3>Business and contact details</h3><p>These details are public on the About tab.</p></div>'+
    '<div class="field"><label for="edit-page-website">Website</label><input id="edit-page-website" name="website" type="url" maxlength="500" placeholder="https://" value="'+esc(page.website||'')+'"></div>'+
    '<div class="field"><label for="edit-page-email">Public contact email</label><input id="edit-page-email" name="contactEmail" type="email" maxlength="254" value="'+esc(page.contactEmail||'')+'"></div>'+
    '<div class="field"><label for="edit-page-phone">Public phone</label><input id="edit-page-phone" name="phone" maxlength="50" value="'+esc(page.phone||'')+'"></div>'+
    '<div class="field"><label for="edit-page-location">Location</label><input id="edit-page-location" name="location" maxlength="160" value="'+esc(page.location||'')+'"></div>'+
    '<div class="page-settings-divider"><h3>Page action button</h3><p>Add both a button label and a secure website link, or leave both empty.</p></div>'+
    '<div class="field"><label for="edit-page-action-label">Button label</label><input id="edit-page-action-label" name="actionLabel" maxlength="40" value="'+esc(page.actionLabel||'')+'" placeholder="Visit website, Book now…"></div>'+
    '<div class="field"><label for="edit-page-action-url">Button destination</label><input id="edit-page-action-url" name="actionUrl" type="url" maxlength="500" value="'+esc(page.actionUrl||'')+'" placeholder="https://"></div>'+
    '<div class="page-form-actions"><button class="primary" type="submit">Save Page details</button><p id="page-settings-status" class="muted" role="status"></p></div></form>'+
    (page.myRole==='owner'?'<div class="page-danger-zone"><div><strong>Delete Page</strong><p>Deleting removes this Page, its Page posts, follows, team access and Page analytics.</p></div><button class="secondary danger-button" type="button" id="delete-page">Delete Page</button></div>':'')+
    '</section>';
}
function pageTeamMarkup(page,members){
  const roleOptions=page.myRole==='owner'?'<option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option>':'<option value="editor">Editor</option><option value="analyst">Analyst</option>';
  const rows=members.map(member=>{
    const account=member.user||{},isOwner=member.role==='owner',isSelf=account.id===state.user.id;
    const canEditRole=!isOwner&&!isSelf&&(page.myRole==='owner'||(page.myRole==='admin'&&member.role!=='admin'));
    const canRemove=!isOwner&&!isSelf&&(page.myRole==='owner'||(page.myRole==='admin'&&['editor','analyst'].includes(member.role)));
    const options=page.myRole==='owner'?'<option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option>':'<option value="editor">Editor</option><option value="analyst">Analyst</option>';
    return '<article class="page-team-member"><img src="'+avatar(account)+'" alt="" class="avatar"><div class="page-team-member-name"><strong>'+esc(account.name||account.username||'Minglora member')+'</strong><small>@'+esc(account.username||'member')+'</small></div>'+
      (isOwner?'<span class="page-role-badge">Owner</span>':'<span class="page-role-badge">'+esc(member.role)+'</span>')+
      (!canEditRole?'':'<form class="page-role-change-form" data-page-role-form="'+esc(account.id)+'"><select name="role" aria-label="Role for '+esc(account.username||'member')+'">'+options+'</select><button class="secondary" type="submit">Save role</button></form>')+
      (canRemove?'<button class="secondary danger-button" type="button" data-remove-page-member="'+esc(account.id)+'">Remove</button>':'')+
      '</article>';
  }).join('');
  return '<section class="card page-team-card"><p class="page-eyebrow">ACCESS CONTROL</p><h2>Page team</h2><p class="muted">Give existing Minglora members only the access they need. Owners retain control of Page ownership.</p>'+
    '<form id="page-team-add-form" class="page-team-add-form"><div class="field"><label for="page-team-username">Member username</label><input id="page-team-username" name="username" required placeholder="Enter an existing @username"></div><div class="field"><label for="page-team-role">Role</label><select id="page-team-role" name="role">'+roleOptions+'</select></div><button class="primary" type="submit">Add team member</button><p id="page-team-status" class="muted" role="status"></p></form>'+
    '<div class="page-team-list-heading"><h3>People with Page access</h3><span>'+members.length+' members</span></div>'+
    (rows?'<div class="page-team-list">'+rows+'</div>':'<p class="muted">No team members are listed yet.</p>')+
    '<div class="page-role-explainer"><p><strong>Admin</strong> — manage Page details and team access.</p><p><strong>Editor</strong> — publish Page posts and media.</p><p><strong>Analyst</strong> — view Page insights and follower information.</p></div></section>';
}
function pageInsightsMarkup(data){
  const metrics=data.metrics||{},series=Array.isArray(data.series)?data.series:[];
  const peak=Math.max(1,...series.map(item=>Number(item.visitors||0)));
  const bars=series.map(item=>{
    const count=Number(item.visitors||0),height=count?Math.max(5,Math.round(count/peak*100)):2;
    const label=new Date(item.date+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
    return '<div class="page-insight-day" title="'+esc(label+': '+count+' recorded visitors')+'"><div class="page-insight-bar-wrap"><span style="height:'+height+'%"></span></div><small>'+esc(label)+'</small></div>';
  }).join('');
  return '<section class="card page-insights-card"><div class="page-insights-heading"><div><p class="page-eyebrow">REAL PAGE ACTIVITY</p><h2>Insights</h2><p class="muted">These figures come from recorded Minglora account activity, not estimates.</p></div><label>Period <select id="page-insights-days"><option value="7"'+(data.days===7?' selected':'')+'>7 days</option><option value="30"'+(data.days===30?' selected':'')+'>30 days</option><option value="90"'+(data.days===90?' selected':'')+'>90 days</option></select></label></div>'+
    '<div class="page-insights-metrics"><article><small>Unique signed-in visitors</small><strong>'+Number(metrics.uniqueVisitors||0).toLocaleString()+'</strong></article><article><small>Followers</small><strong>'+Number(metrics.followers||0).toLocaleString()+'</strong></article><article><small>Published posts</small><strong>'+Number(metrics.publishedPosts||0).toLocaleString()+'</strong></article><article><small>Recorded visitor-days</small><strong>'+Number(metrics.visitorDays||0).toLocaleString()+'</strong></article></div>'+
    '<div class="page-insight-chart"><div class="page-insight-chart-title"><h3>Daily unique visitors</h3><span>Each signed-in member is counted once per day</span></div><div class="page-insight-bars">'+(bars||'<p class="muted">No visitor data is available for this period.</p>')+'</div></div>'+
    '<p class="page-insights-footnote">Page views by anonymous visitors and impressions are not included. Analytics start accumulating after this feature is deployed.</p></section>';
}
function pageFollowersMarkup(followers){
  const rows=followers.map(item=>{
    const account=item.user||{};
    return '<article class="page-follower-row"><img src="'+avatar(account)+'" class="avatar" alt=""><div><strong>'+esc(account.name||account.username||'Minglora member')+'</strong><small>@'+esc(account.username||'member')+'</small></div><span>Following since '+esc(item.createdAt?new Date(item.createdAt).toLocaleDateString():'date unavailable')+'</span></article>';
  }).join('');
  return '<section class="card page-followers-card"><p class="page-eyebrow">COMMUNITY</p><h2>Followers</h2><p class="muted">People who chose to follow this Page.</p><div class="page-followers-list">'+(rows||'<p class="muted">This Page does not have followers yet.</p>')+'</div></section>';
}
async function renderPage(pageId,requestedTab='posts',days=30){
  state.activePage=pageId;
  state.pageTab=String(requestedTab||'posts');
  state.pageDays=[7,30,90].includes(Number(days))?Number(days):30;
  activateSilent('page');
  const data=await api('/pages/'+encodeURIComponent(pageId));
  const page=data.page,posts=Array.isArray(data.posts)?data.posts:[];
  const canPublish=['owner','admin','editor'].includes(page.myRole);
  const canManage=['owner','admin'].includes(page.myRole);
  const canInsights=['owner','admin','analyst'].includes(page.myRole);
  const canDeletePage=page.myRole==='owner';
  const validTabs=['posts','about'];
  if(canInsights)validTabs.push('insights','followers');
  if(canManage)validTabs.push('team','settings');
  const tab=validTabs.includes(requestedTab)?requestedTab:'posts';
  let extraData=null;
  if(tab==='insights')extraData=await api('/pages/'+encodeURIComponent(pageId)+'/insights?days='+([7,30,90].includes(Number(days))?Number(days):30));
  if(tab==='team')extraData=await api('/pages/'+encodeURIComponent(pageId)+'/roles');
  if(tab==='followers')extraData=await api('/pages/'+encodeURIComponent(pageId)+'/followers');
  let html='<section class="card page-detail-head"><button class="text-button" id="back-to-pages">← All Pages</button>'+
    '<div class="page-detail-brand-row"><div class="page-card-mark page-detail-mark">'+esc((page.title||'P').slice(0,1).toUpperCase())+'</div><div><p class="page-eyebrow">MINGLORA PAGE</p><h1>'+esc(page.title)+'</h1><p class="page-handle">@'+esc(page.handle)+'</p>'+(page.category?'<span class="page-category">'+esc(page.category)+'</span>':'')+'</div></div>'+
    (page.description?'<p class="page-detail-description">'+esc(page.description)+'</p>':'')+
    '<div class="page-detail-stats"><div><strong>'+Number(page.followerCount||0).toLocaleString()+'</strong><span>Followers</span></div><div><strong>'+posts.length.toLocaleString()+'</strong><span>Published posts</span></div><div><strong>'+esc(page.myRole?String(page.myRole):'Public')+'</strong><span>Access</span></div></div>'+
    '<div class="page-detail-actions">'+(page.myRole?'':'<button class="'+(page.isFollowing?'secondary':'primary')+'" id="toggle-page-follow">'+(page.isFollowing?'Following · Unfollow':'Follow Page')+'</button><button class="secondary" id="report-page">Report Page</button>')+
    (canManage?'<button class="secondary" type="button" data-page-tab="settings">Manage Page</button>':'')+
    (page.actionLabel&&page.actionUrl?'<a class="primary page-action-link" href="'+esc(page.actionUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(page.actionLabel)+'</a>':'')+'</div></section>'+
    '<nav class="page-tabs" aria-label="Page sections">'+pageTabButton(tab,'posts','Posts')+pageTabButton(tab,'about','About')+
    (canInsights?pageTabButton(tab,'insights','Insights')+pageTabButton(tab,'followers','Followers'):'')+
    (canManage?pageTabButton(tab,'team','Team')+pageTabButton(tab,'settings','Settings'):'')+'</nav>';
  if(tab==='about')html+=pageAboutMarkup(page);
  else if(tab==='settings')html+=pageSettingsMarkup(page);
  else if(tab==='team')html+=pageTeamMarkup(page,extraData?.members||[]);
  else if(tab==='insights')html+=pageInsightsMarkup(extraData||{});
  else if(tab==='followers')html+=pageFollowersMarkup(extraData?.followers||[]);
  else{
    if(canPublish)html+='<section class="card page-post-composer"><div class="page-post-composer-heading"><div><p class="page-eyebrow">PUBLISHING AS THE PAGE</p><h2>Share an update</h2></div><span class="page-post-identity">'+esc(page.title)+'</span></div><form id="page-post-form"><div class="field"><label for="page-post-text">Post text</label><textarea id="page-post-text" name="text" maxlength="5000" placeholder="Share an update with your followers…"></textarea></div><div class="field"><label>Photos and MP4 videos (up to 250 MB each)</label><div id="page-post-media-picker"></div></div><button class="primary" type="submit">Publish Page post</button></form></section>';
    if(posts.length){
      html+='<div class="page-post-list">'+posts.map(post=>'<article class="card page-post"><div class="post-head"><img class="avatar" src="'+avatar(post.author)+'" alt=""><div class="post-author"><strong>'+esc(page.title)+'</strong><small>Published by '+esc(post.author?.name||'Minglora member')+' · '+timeAgo(post.createdAt)+'</small></div>'+(post.publishedBy===state.user.id||['owner','admin'].includes(page.myRole)?'<button class="post-menu" aria-label="Delete Page post" data-delete-page-post="'+esc(post.id)+'">···</button>':'<button class="post-menu" aria-label="Report Page post" data-report-page-post="'+esc(post.id)+'">⚑</button>')+'</div>'+(post.text?'<div class="post-text">'+esc(post.text)+'</div>':'')+renderPostMedia(post)+'</article>').join('')+'</div>';
    }else html+='<section class="card empty-state"><h3>No Page posts yet</h3><p>New updates published by this Page will show here.</p></section>';
  }
  setContent(html);
  const pageMediaPicker=$('#page-post-media-picker')?createMediaPicker($('#page-post-media-picker'),{slot:'page',maxFiles:10}):null;
  $('#back-to-pages')?.addEventListener('click',()=>renderPages());
  document.querySelectorAll('[data-page-tab]').forEach(button=>button.addEventListener('click',()=>renderPage(pageId,button.dataset.pageTab,days)));
  $('#report-page')?.addEventListener('click',()=>openReportComposer('page',pageId));
  $('#toggle-page-follow')?.addEventListener('click',async()=>{
    const following=!!page.isFollowing;
    try{await api('/pages/'+encodeURIComponent(pageId)+'/follow',{method:following?'DELETE':'POST',body:'{}'});await renderPage(pageId,tab,days);toast(following?'Page unfollowed.':'Page followed.');}
    catch(error){toast(error.message);}
  });
  $('#delete-page')?.addEventListener('click',async()=>{
    if(!window.confirm('Delete this Page and its posts, followers, team access and analytics?'))return;
    try{await api('/pages/'+encodeURIComponent(pageId),{method:'DELETE',body:'{}'});state.activePage=null;toast('Page deleted.');await renderPages();}
    catch(error){toast(error.message);}
  });
  $('#page-post-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=pageMediaPicker?await pageMediaPicker.upload():[];
      await api('/pages/'+encodeURIComponent(pageId)+'/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});
      toast('Page post published.');pageMediaPicker?.destroy();await renderPage(pageId,'posts');
    }catch(error){toast(error.message);button.disabled=false;}
  });
  document.querySelectorAll('[data-report-page-post]').forEach(button=>button.addEventListener('click',()=>openReportComposer('post',button.dataset.reportPagePost)));
  document.querySelectorAll('[data-delete-page-post]').forEach(button=>button.addEventListener('click',async()=>{
    if(!window.confirm('Delete this Page post?'))return;
    try{await api('/pages/'+encodeURIComponent(pageId)+'/posts/'+encodeURIComponent(button.dataset.deletePagePost),{method:'DELETE',body:'{}'});toast('Page post deleted.');await renderPage(pageId,'posts');}
    catch(error){toast(error.message);}
  }));
  $('#page-settings-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=$('#page-settings-status');
    button.disabled=true;if(status)status.textContent='Saving Page details…';
    try{
      const values=Object.fromEntries(new FormData(form));
      await api('/pages/'+encodeURIComponent(pageId),{method:'PATCH',body:JSON.stringify(values)});
      toast('Page details saved.');await renderPage(pageId,'settings');
    }catch(error){if(status)status.textContent=error.message;button.disabled=false;}
  });
  $('#page-team-add-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=$('#page-team-status');
    button.disabled=true;if(status)status.textContent='Adding team member…';
    try{
      const values=Object.fromEntries(new FormData(form));
      await api('/pages/'+encodeURIComponent(pageId)+'/roles',{method:'POST',body:JSON.stringify(values)});
      toast('Page team updated.');await renderPage(pageId,'team');
    }catch(error){if(status)status.textContent=error.message;button.disabled=false;}
  });
  document.querySelectorAll('[data-page-role-form]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const memberId=form.dataset.pageRoleForm,button=form.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      const values=Object.fromEntries(new FormData(form));
      await api('/pages/'+encodeURIComponent(pageId)+'/roles/'+encodeURIComponent(memberId),{method:'PATCH',body:JSON.stringify(values)});
      toast('Team role updated.');await renderPage(pageId,'team');
    }catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-remove-page-member]').forEach(button=>button.addEventListener('click',async()=>{
    if(!window.confirm('Remove this person from the Page team?'))return;
    button.disabled=true;
    try{await api('/pages/'+encodeURIComponent(pageId)+'/roles/'+encodeURIComponent(button.dataset.removePageMember),{method:'DELETE',body:'{}'});toast('Team member removed.');await renderPage(pageId,'team');}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  $('#page-insights-days')?.addEventListener('change',event=>renderPage(pageId,'insights',Number(event.target.value)));
}
async function renderSavedPosts({reload=true,preserveSearchFocus=false,caret=null}={}){
  activateSilent('saved');
  if(reload){
    const result=await api('/saved-posts');
    state.savedPosts=Array.isArray(result.posts)?result.posts:[];
    state.savedPostCollections=Array.isArray(result.collections)?result.collections:[];
  }
  const all=state.savedPosts||[];
  const query=String(state.savedSearch||'').trim().toLowerCase();
  let posts=all.filter(post=>{
    if(state.savedFilter==='favorites'&&!post.isFavorite)return false;
    if(state.savedFilter==='read-later'&&!post.readLater)return false;
    if(state.savedCollection!=='all'&&post.collectionId!==state.savedCollection)return false;
    if(!savedPostHasType(post,state.savedType))return false;
    if(query){
      const haystack=[post.text,post.author?.name,post.author?.username,post.note,...(post.tags||[])].join(' ').toLowerCase();
      if(!haystack.includes(query))return false;
    }
    return true;
  });
  const sorters={
    'saved-newest':(a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0),
    'saved-oldest':(a,b)=>new Date(a.savedAt||0)-new Date(b.savedAt||0),
    'post-newest':(a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0),
    'post-oldest':(a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0),
    'creator-az':(a,b)=>String(a.author?.name||'').localeCompare(String(b.author?.name||''))
  };
  posts=[...posts].sort(sorters[state.savedSort]||sorters['saved-newest']);
  const countFor=id=>all.filter(post=>post.collectionId===id).length;
  const favCount=all.filter(post=>post.isFavorite).length;
  const laterCount=all.filter(post=>post.readLater).length;
  const activeFilter=value=>state.savedFilter===value&&state.savedCollection==='all'?'active':'';
  const collectionMarkup=state.savedPostCollections.map(collection=>`
    <div class="saved-collection-chip ${state.savedCollection===collection.id?'active':''}">
      <button type="button" data-saved-collection-filter="${esc(collection.id)}"><span class="saved-collection-icon">▱</span><span>${esc(collection.title)}</span><b>${countFor(collection.id)}</b></button>
      <div class="saved-collection-actions">
        <button type="button" data-saved-rename="${esc(collection.id)}" aria-label="Rename ${esc(collection.title)}" title="Rename collection">✎</button>
        <button type="button" data-saved-delete-collection="${esc(collection.id)}" aria-label="Delete ${esc(collection.title)}" title="Delete collection">×</button>
      </div>
    </div>`).join('');
  const noItems=all.length===0
    ?`<section class="card empty-state saved-empty-state"><div class="saved-empty-art">▣</div><h3>Your saved library starts here</h3><p>Save posts from your feed and they will appear here. Only you can see what you save.</p></section>`
    :`<section class="card empty-state saved-empty-state"><div class="saved-empty-art">⌕</div><h3>No saved posts match these filters</h3><p>Try another search, content type, or collection.</p><button type="button" class="secondary" id="saved-clear-filters">Clear filters</button></section>`;
  setContent(`<div class="saved-library">
    <header class="saved-library-header">
      <div><span class="saved-eyebrow">YOUR PRIVATE LIBRARY</span><h1>Saved Posts</h1><p>Keep the posts worth coming back to, organized your way.</p></div>
      <button type="button" class="primary" id="saved-new-collection-toggle">＋ New collection</button>
    </header>
    <section class="saved-overview" aria-label="Saved Posts overview">
      <div><strong>${all.length}</strong><span>Saved posts</span></div>
      <div><strong>${state.savedPostCollections.length}</strong><span>Collections</span></div>
      <div><strong>${favCount}</strong><span>Favorites</span></div>
      <div><strong>${laterCount}</strong><span>Read later</span></div>
    </section>
    <form id="saved-collection-create" class="saved-inline-create hidden">
      <label for="saved-collection-title">Collection name</label>
      <input id="saved-collection-title" name="title" maxlength="40" minlength="2" placeholder="e.g. Ideas, Recipes, Places to visit" required>
      <button type="submit" class="primary">Create collection</button>
      <button type="button" class="secondary" id="saved-collection-cancel">Cancel</button>
    </form>
    <section class="saved-library-controls">
      <label class="saved-search-field"><span aria-hidden="true">⌕</span><input id="saved-search" type="search" value="${esc(state.savedSearch)}" placeholder="Search saved posts, creators, notes or tags…" aria-label="Search saved posts"></label>
      <label class="saved-select-label">Content type
        <select id="saved-type-filter">
          <option value="all" ${state.savedType==='all'?'selected':''}>All types</option>
          <option value="text" ${state.savedType==='text'?'selected':''}>Text posts</option>
          <option value="photo" ${state.savedType==='photo'?'selected':''}>Photos</option>
          <option value="video" ${state.savedType==='video'?'selected':''}>Videos</option>
          <option value="audio" ${state.savedType==='audio'?'selected':''}>Audio</option>
        </select>
      </label>
      <label class="saved-select-label">Sort by
        <select id="saved-sort">
          <option value="saved-newest" ${state.savedSort==='saved-newest'?'selected':''}>Recently saved</option>
          <option value="saved-oldest" ${state.savedSort==='saved-oldest'?'selected':''}>Saved oldest</option>
          <option value="post-newest" ${state.savedSort==='post-newest'?'selected':''}>Post newest</option>
          <option value="post-oldest" ${state.savedSort==='post-oldest'?'selected':''}>Post oldest</option>
          <option value="creator-az" ${state.savedSort==='creator-az'?'selected':''}>Creator A–Z</option>
        </select>
      </label>
    </section>
    <section class="saved-organize-section">
      <div class="saved-section-heading"><div><h2>Browse your library</h2><p>Smart shelves and your own collections</p></div></div>
      <div class="saved-collection-list">
        <button type="button" class="saved-smart-chip ${activeFilter('all')}" data-saved-filter="all"><span>▣</span><strong>All saved</strong><b>${all.length}</b></button>
        <button type="button" class="saved-smart-chip ${activeFilter('favorites')}" data-saved-filter="favorites"><span>★</span><strong>Favorites</strong><b>${favCount}</b></button>
        <button type="button" class="saved-smart-chip ${activeFilter('read-later')}" data-saved-filter="read-later"><span>◷</span><strong>Read later</strong><b>${laterCount}</b></button>
        ${collectionMarkup||'<span class="saved-no-collections">Create a collection to group related posts.</span>'}
      </div>
    </section>
    <section class="saved-results-section">
      <div class="saved-results-heading"><div><h2>${state.savedCollection!=='all'?esc(state.savedPostCollections.find(item=>item.id===state.savedCollection)?.title||'Collection'):state.savedFilter==='favorites'?'Your favorites':state.savedFilter==='read-later'?'Read later':'All saved posts'}</h2><p>${posts.length} ${posts.length===1?'post':'posts'} shown</p></div><span class="saved-private-label">🔒 Only you can see this</span></div>
      ${posts.length?`<div class="saved-post-list">${posts.map(post=>postCard(post,{saved:true})).join('')}</div>`:noItems}
    </section>
  </div>`);
  bindFeed();
  bindSavedPosts();
  if(preserveSearchFocus){const input=$('#saved-search');input?.focus();if(Number.isInteger(caret))input?.setSelectionRange(caret,caret);}
}
function bindSavedPosts(){
  const root=$('#main-content')||document;
  $('#saved-new-collection-toggle')?.addEventListener('click',()=>{
    const form=$('#saved-collection-create');if(!form)return;
    form.classList.toggle('hidden');if(!form.classList.contains('hidden'))$('#saved-collection-title')?.focus();
  });
  $('#saved-collection-cancel')?.addEventListener('click',()=>$('#saved-collection-create')?.classList.add('hidden'));
  $('#saved-collection-create')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      const title=String(new FormData(form).get('title')||'').trim();
      await api('/saved-posts/collections',{method:'POST',body:JSON.stringify({title})});
      state.savedCollection='all';toast('Collection created.');await renderSavedPosts();
    }catch(error){toast(error.message);button.disabled=false;}
  });
  $('#saved-search')?.addEventListener('input',event=>{const input=event.target;state.savedSearch=input.value;const caret=input.selectionStart;renderSavedPosts({reload:false,preserveSearchFocus:true,caret});});
  $('#saved-type-filter')?.addEventListener('change',event=>{state.savedType=event.target.value;renderSavedPosts({reload:false});});
  $('#saved-sort')?.addEventListener('change',event=>{state.savedSort=event.target.value;renderSavedPosts({reload:false});});
  root.querySelectorAll('[data-saved-filter]').forEach(button=>button.addEventListener('click',()=>{
    state.savedFilter=button.dataset.savedFilter;state.savedCollection='all';renderSavedPosts({reload:false});
  }));
  root.querySelectorAll('[data-saved-collection-filter]').forEach(button=>button.addEventListener('click',()=>{
    state.savedCollection=button.dataset.savedCollectionFilter;state.savedFilter='all';renderSavedPosts({reload:false});
  }));
  root.querySelectorAll('[data-saved-rename]').forEach(button=>button.addEventListener('click',async()=>{
    const collection=state.savedPostCollections.find(item=>item.id===button.dataset.savedRename);if(!collection)return;
    const title=window.prompt('Rename collection',collection.title);if(title===null)return;
    try{await api('/saved-posts/collections/'+encodeURIComponent(collection.id),{method:'PATCH',body:JSON.stringify({title})});toast('Collection renamed.');await renderSavedPosts();}
    catch(error){toast(error.message);}
  }));
  root.querySelectorAll('[data-saved-delete-collection]').forEach(button=>button.addEventListener('click',async()=>{
    const collection=state.savedPostCollections.find(item=>item.id===button.dataset.savedDeleteCollection);if(!collection)return;
    if(!window.confirm('Delete "'+collection.title+'"? Your saved posts will remain in All saved.'))return;
    try{await api('/saved-posts/collections/'+encodeURIComponent(collection.id),{method:'DELETE',body:'{}'});if(state.savedCollection===collection.id)state.savedCollection='all';toast('Collection deleted. Your saved posts were kept.');await renderSavedPosts();}
    catch(error){toast(error.message);}
  }));
  root.querySelectorAll('[data-saved-collection-select]').forEach(select=>select.addEventListener('change',async()=>{
    try{await api('/saved-posts/'+encodeURIComponent(select.dataset.savedCollectionSelect),{method:'PATCH',body:JSON.stringify({collectionId:select.value||null})});toast('Saved post moved.');await renderSavedPosts();}
    catch(error){toast(error.message);await renderSavedPosts();}
  }));
  root.querySelectorAll('[data-saved-favorite]').forEach(button=>button.addEventListener('click',async()=>{
    const post=state.savedPosts.find(item=>item.id===button.dataset.savedFavorite);if(!post)return;
    try{await api('/saved-posts/'+encodeURIComponent(post.id),{method:'PATCH',body:JSON.stringify({isFavorite:!post.isFavorite})});await renderSavedPosts();toast(post.isFavorite?'Removed from favorites.':'Added to favorites.');}
    catch(error){toast(error.message);}
  }));
  root.querySelectorAll('[data-saved-read-later]').forEach(button=>button.addEventListener('click',async()=>{
    const post=state.savedPosts.find(item=>item.id===button.dataset.savedReadLater);if(!post)return;
    try{await api('/saved-posts/'+encodeURIComponent(post.id),{method:'PATCH',body:JSON.stringify({readLater:!post.readLater})});await renderSavedPosts();toast(post.readLater?'Removed from Read Later.':'Added to Read Later.');}
    catch(error){toast(error.message);}
  }));
  root.querySelectorAll('[data-saved-note-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const form=root.querySelector('[data-saved-details-form="'+CSS.escape(button.dataset.savedNoteToggle)+'"]');
    if(form){form.classList.toggle('hidden');if(!form.classList.contains('hidden'))form.querySelector('textarea')?.focus();}
  }));
  root.querySelectorAll('[data-saved-details-cancel]').forEach(button=>button.addEventListener('click',()=>{
    root.querySelector('[data-saved-details-form="'+CSS.escape(button.dataset.savedDetailsCancel)+'"]')?.classList.add('hidden');
  }));
  root.querySelectorAll('[data-saved-details-form]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();const values=new FormData(form);
    const tags=String(values.get('tags')||'').split(',').map(tag=>tag.trim().replace(/^#+/,'')).filter(Boolean).slice(0,8);
    try{
      await api('/saved-posts/'+encodeURIComponent(form.dataset.savedDetailsForm),{method:'PATCH',body:JSON.stringify({note:values.get('note'),tags})});
      toast('Private note and tags saved.');await renderSavedPosts();
    }catch(error){toast(error.message);}
  }));
  $('#saved-clear-filters')?.addEventListener('click',()=>{
    state.savedSearch='';state.savedType='all';state.savedSort='saved-newest';state.savedFilter='all';state.savedCollection='all';renderSavedPosts({reload:false});
  });
}
const messagePickers=new Map();
const activeMessageRecordings=new Map();
const MESSAGE_STICKERS=[
  {id:'heart',emoji:'💖',label:'Love'},{id:'fire',emoji:'🔥',label:'Fire'},
  {id:'celebration',emoji:'🎉',label:'Celebrate'},{id:'crown',emoji:'👑',label:'Crown'},
  {id:'flower',emoji:'🌺',label:'Flower'},{id:'butterfly',emoji:'🦋',label:'Butterfly'},
  {id:'laugh',emoji:'😂',label:'Laugh'},{id:'party',emoji:'🥳',label:'Party'},
  {id:'clap',emoji:'👏',label:'Clap'},{id:'love',emoji:'😍',label:'Adore'}
];
const MESSAGE_QUICK_EMOJIS=['😀','😂','😍','🥰','😘','😭','😎','🥳','🔥','❤️','💖','👍','👏','🙏','🙌','✨','🌺','🦋'];
function messageAttachmentHtml(attachments=[]){
  return (attachments||[]).map(file=>{
    if(!file.url)return '';
    if(file.mediaType==='image')return '<a class="message-attachment-image" href="'+esc(file.url)+'" target="_blank" rel="noopener"><img src="'+esc(file.url)+'" alt="'+esc(file.name||'Image attachment')+'"></a>';
    if(file.mediaType==='video')return '<video class="message-attachment-video" controls playsinline src="'+esc(file.url)+'"></video>';
    if(file.mediaType==='audio')return '<audio controls src="'+esc(file.url)+'"></audio>';
    return '<a class="message-attachment-document" href="'+esc(file.url)+'" target="_blank" rel="noopener">📄 '+esc(file.name||'Open attachment')+'</a>';
  }).join('');
}
let messageRefreshTimer=null;
let messageRefreshInFlight=false;
let messageRefreshIntervalMs=0;
let messengerRealtimeSocket=null;
let messengerRealtimeReconnectTimer=null;
let messengerRealtimeReconnectAttempts=0;
const messengerTypingThrottle=new Map();
function sendMessengerRealtime(payload){
  if(!messengerRealtimeSocket||messengerRealtimeSocket.readyState!==WebSocket.OPEN)return false;
  try{messengerRealtimeSocket.send(JSON.stringify(payload));return true;}catch{return false;}
}
function stopMessengerRealtime(){
  if(messengerRealtimeReconnectTimer){clearTimeout(messengerRealtimeReconnectTimer);messengerRealtimeReconnectTimer=null;}
  if(messengerRealtimeSocket){
    messengerRealtimeSocket.onclose=null;
    try{messengerRealtimeSocket.close(1000,'Signed out');}catch{}
    messengerRealtimeSocket=null;
  }
  messengerRealtimeReconnectAttempts=0;
  state.messengerRealtimeConnected=false;
  state.messengerPresence={};state.messengerTyping={};
  syncMessageRefreshPolling();
}
function startMessengerRealtime(){
  if(!state.user||!('WebSocket' in window))return;
  if(messengerRealtimeSocket&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(messengerRealtimeSocket.readyState))return;
  if(messengerRealtimeReconnectTimer){clearTimeout(messengerRealtimeReconnectTimer);messengerRealtimeReconnectTimer=null;}
  const scheme=window.location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(scheme+'//'+window.location.host+'/api/messages/realtime');
  messengerRealtimeSocket=socket;
  socket.addEventListener('open',()=>{
    if(messengerRealtimeSocket!==socket)return;
    messengerRealtimeReconnectAttempts=0;state.messengerRealtimeConnected=true;
    syncMessageRefreshPolling();
    sendMessengerRealtime({type:'presence_refresh'});
    refreshMessageConversations().catch(()=>{});
  });
  socket.addEventListener('message',event=>{
    if(messengerRealtimeSocket!==socket)return;
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(!message||typeof message!=='object')return;
    if(message.type==='presence'){
      state.messengerPresence[message.userId]=Boolean(message.online);
      document.querySelectorAll('[data-message-window]').forEach(root=>{
        const id=root.dataset.messageWindow;
        const win=state.messageWindows.find(item=>item.user.id===id);
        if(win&&!win.isGroup&&win.user.id===message.userId)updateMessageWindowPresence(win);
      });
      if(state.messengerPanelOpen)renderMessengerPanelList();
      return;
    }
    if(message.type==='typing'){
      const key=String(message.conversationId||'')+':'+String(message.userId||'');
      if(message.active)state.messengerTyping[key]=Date.now();
      else delete state.messengerTyping[key];
      const win=state.messageWindows.find(item=>item.user.id===message.conversationId||item.groupId&&'group:'+item.groupId===message.conversationId);
      if(win)updateMessageWindowPresence(win);
      return;
    }
    if(message.type==='notification:new'){
      void pollBrowserNotifications();
      return;
    }
    if(message.type==='notification:changed'){
      void updateNotificationDot();
      if(state.view==='notifications')void renderNotifications().catch(()=>{});
      return;
    }
    if(['message:new','message:updated','message:deleted','message:expired','message:read','message:group-updated','message:group-removed','conversation:settings'].includes(message.type)){
      if(message.type==='message:group-removed'){
        state.messageWindows=state.messageWindows.filter(item=>item.groupId!==message.groupId);
        renderMessageWindows();
      }
      refreshMessageConversations().catch(()=>{});
    }
  });
  socket.addEventListener('close',()=>{
    if(messengerRealtimeSocket!==socket)return;
    messengerRealtimeSocket=null;state.messengerRealtimeConnected=false;
    state.messengerPresence={};state.messengerTyping={};
    state.messageWindows.filter(win=>!win.minimized).forEach(updateMessageWindowPresence);
    if(state.messengerPanelOpen)renderMessengerPanelList();
    syncMessageRefreshPolling();
    if(!state.user)return;
    messengerRealtimeReconnectAttempts=Math.min(messengerRealtimeReconnectAttempts+1,8);
    const delay=Math.min(15000,800*Math.pow(1.7,messengerRealtimeReconnectAttempts));
    messengerRealtimeReconnectTimer=setTimeout(()=>{messengerRealtimeReconnectTimer=null;startMessengerRealtime();},delay);
  });
  socket.addEventListener('error',()=>{try{socket.close();}catch{}});
}
function messageWindowConversationId(win){return win?.groupId?'group:'+win.groupId:String(win?.user?.id||'');}
function messengerTypingUsers(win){
  const conversationId=messageWindowConversationId(win),ownId=String(state.user?.id||'');
  const prefix=conversationId+':';
  return Object.keys(state.messengerTyping||{})
    .filter(key=>key.startsWith(prefix))
    .map(key=>key.slice(prefix.length))
    .filter(id=>id&&id!==ownId);
}
function isMessageTyping(win){return messengerTypingUsers(win).length>0;}
function updateMessageWindowPresence(win){
  if(!win)return;
  const root=document.querySelector('[data-message-window="'+CSS.escape(win.user.id)+'"]');
  const label=root?.querySelector('[data-message-presence]');
  if(!label)return;
  const typingUsers=messengerTypingUsers(win),typing=typingUsers.length>0;
  if(win.isGroup){
    const conversation=state.conversations.find(item=>item.user.id===win.user.id);
    const members=conversation?.group?.members||[];
    const names=typingUsers.map(id=>members.find(item=>item.id===id)?.user?.name).filter(Boolean);
    label.textContent=typing
      ?names.length===1?names[0]+' is typing…':names.length===2?names[0]+' and '+names[1]+' are typing…':typingUsers.length+' people are typing…'
      :(conversation?.group?.memberCount||members.length)+' members';
    label.classList.toggle('is-typing',typing);
    label.classList.remove('is-online');
    return;
  }
  const online=state.messengerPresence[win.user.id]===true;
  label.textContent=typing?'Typing…':online?'Active now':'';
  label.classList.toggle('is-typing',typing);
  label.classList.toggle('is-online',!typing&&online);
}
function messageTyping(win,active=true){
  const conversationId=messageWindowConversationId(win);
  if(!conversationId)return;
  if(!active){sendMessengerRealtime({type:'typing',conversationId,active:false});messengerTypingThrottle.delete(conversationId);return;}
  const last=messengerTypingThrottle.get(conversationId)||0;
  if(Date.now()-last<700)return;
  messengerTypingThrottle.set(conversationId,Date.now());
  sendMessengerRealtime({type:'typing',conversationId,active:true});
}
function openConversationTools(userId){
  const win=state.messageWindows.find(item=>item.user.id===userId);
  if(!win)return;
  const conversationId=messageWindowConversationId(win);
  const modal=document.createElement('div');
  modal.className='modal-backdrop';
  modal.innerHTML=
    '<section class="modal message-tools-modal" role="dialog" aria-modal="true" aria-labelledby="message-tools-title">'+
      '<div class="modal-head"><div><h2 id="message-tools-title">Chat tools</h2><small>'+esc(win.user.name||'Conversation')+'</small></div><button class="modal-close" type="button" aria-label="Close chat tools">×</button></div>'+
      '<div class="modal-body">'+
        '<nav class="message-tools-tabs" aria-label="Conversation tools">'+
          '<button type="button" class="active" data-tools-tab="search" aria-pressed="true">Search messages</button>'+
          '<button type="button" data-tools-tab="shared" aria-pressed="false">Shared media</button>'+
          '<button type="button" data-tools-tab="privacy" aria-pressed="false">Privacy</button>'+
        '</nav>'+
        '<section class="message-tools-view" data-tools-view="search">'+
          '<form class="message-tools-search-form" data-tools-search-form><input type="search" name="query" maxlength="120" minlength="2" placeholder="Search this conversation…" aria-label="Search messages in this conversation" required><button class="primary" type="submit">Search</button></form>'+
          '<div class="message-tools-results" data-tools-results aria-live="polite"><p class="muted">Search the messages in this chat. Results stay limited to this conversation.</p></div>'+
        '</section>'+
        '<section class="message-tools-view" data-tools-view="shared" hidden>'+
          '<div class="message-tools-filters" role="group" aria-label="Shared item types">'+
            '<button type="button" class="active" data-shared-kind="all">All</button>'+
            '<button type="button" data-shared-kind="photos">Photos</button>'+
            '<button type="button" data-shared-kind="videos">Videos</button>'+
            '<button type="button" data-shared-kind="audio">Audio</button>'+
            '<button type="button" data-shared-kind="files">Files</button>'+
            '<button type="button" data-shared-kind="links">Links</button>'+
          '</div>'+
          '<div class="message-tools-shared" data-tools-shared aria-live="polite"><p class="muted">Loading shared items…</p></div>'+
        '</section>'+
        '<section class="message-tools-view" data-tools-view="privacy" hidden><div class="message-tools-privacy" data-tools-privacy><p class="muted">Loading conversation privacy settings…</p></div></section>'+
      '</div>'+
    '</section>';
  document.body.append(modal);
  const close=()=>modal.remove();
  modal.querySelector('.modal-close')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelectorAll('[data-tools-tab]').forEach(button=>button.addEventListener('click',()=>{
    const active=button.dataset.toolsTab;
    modal.querySelectorAll('[data-tools-tab]').forEach(tab=>{
      const selected=tab===button;tab.classList.toggle('active',selected);tab.setAttribute('aria-pressed',String(selected));
    });
    modal.querySelectorAll('[data-tools-view]').forEach(view=>{view.hidden=view.dataset.toolsView!==active;});
    if(active==='shared'&&!modal.dataset.sharedLoaded)loadShared();
    if(active==='privacy'&&!modal.dataset.privacyLoaded)loadPrivacy();
    if(active==='search')modal.querySelector('input[name="query"]')?.focus();
  }));
  const searchForm=modal.querySelector('[data-tools-search-form]');
  const searchResults=modal.querySelector('[data-tools-results]');
  searchForm?.addEventListener('submit',async event=>{
    event.preventDefault();
    const query=String(searchForm.elements.query.value||'').trim();
    if(query.length<2){searchResults.textContent='Enter at least two characters.';return;}
    searchResults.innerHTML='<p class="muted">Searching messages…</p>';
    try{
      const data=await api('/messages/search?q='+encodeURIComponent(query)+'&conversationId='+encodeURIComponent(conversationId));
      const rows=Array.isArray(data.results)?data.results:[];
      searchResults.innerHTML=rows.length?rows.map(item=>
        '<button type="button" class="message-tools-result" data-search-message="'+esc(item.id)+'"><span><strong>'+esc(item.author?.name||'Minglora member')+'</strong><small>'+esc(timeAgo(item.createdAt))+'</small></span><span>'+esc(item.text||'Message')+'</span></button>'
      ).join(''):'<div class="message-tools-empty"><strong>No matching messages</strong><p>Try another word or phrase.</p></div>';
      searchResults.querySelectorAll('[data-search-message]').forEach(button=>button.addEventListener('click',()=>{
        const id=button.dataset.searchMessage;
        close();
        const current=state.messageWindows.find(item=>item.user.id===userId);
        if(current){current.minimized=false;renderMessageWindows();}
        requestAnimationFrame(()=>{
          const target=document.querySelector('[data-message-window="'+CSS.escape(userId)+'"] [data-message-id="'+CSS.escape(id)+'"]');
          target?.scrollIntoView({behavior:'smooth',block:'center'});
          target?.classList.add('is-search-match');
          window.setTimeout(()=>target?.classList.remove('is-search-match'),1800);
        });
      }));
    }catch(error){searchResults.textContent=error.message||'Message search is unavailable.';}
  });
  let sharedItems=[];
  let sharedKind='all';
  function sharedItemMarkup(item){
    const label=esc(item.name||item.url||'Shared item');
    const author=esc(item.author?.name||'Minglora member');
    if(item.kind==='photos')return '<a class="message-tools-media-card" href="'+esc(item.url)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(item.url)+'" alt="'+label+'"><span>'+label+'</span><small>'+author+'</small></a>';
    if(item.kind==='videos')return '<article class="message-tools-media-card"><video controls playsinline preload="metadata" src="'+esc(item.url)+'"></video><span>'+label+'</span><small>'+author+'</small></article>';
    if(item.kind==='audio')return '<article class="message-tools-media-card"><audio controls preload="none" src="'+esc(item.url)+'"></audio><span>'+label+'</span><small>'+author+'</small></article>';
    return '<a class="message-tools-file-card" href="'+esc(item.url)+'" target="_blank" rel="noopener"><strong>'+(item.kind==='links'?'↗':'▤')+' '+label+'</strong><small>'+author+'</small></a>';
  }
  function paintShared(){
    const filtered=sharedKind==='all'?sharedItems:sharedItems.filter(item=>item.kind===sharedKind);
    const root=modal.querySelector('[data-tools-shared]');
    root.innerHTML=filtered.length?'<div class="message-tools-shared-grid">'+filtered.map(sharedItemMarkup).join('')+'</div>':'<div class="message-tools-empty"><strong>Nothing shared here yet</strong><p>Photos, videos, audio, files and links shared in this chat will appear here.</p></div>';
  }
  async function loadShared(){
    modal.dataset.sharedLoaded='true';
    const root=modal.querySelector('[data-tools-shared]');
    root.innerHTML='<p class="muted">Loading shared items…</p>';
    try{
      const data=await api('/messages/shared?conversationId='+encodeURIComponent(conversationId));
      sharedItems=Array.isArray(data.items)?data.items:[];
      paintShared();
    }catch(error){root.textContent=error.message||'Shared items could not be loaded.';}
  }
  async function loadPrivacy(){
    modal.dataset.privacyLoaded='true';
    const root=modal.querySelector('[data-tools-privacy]');
    root.innerHTML='<p class="muted">Loading conversation privacy settings…</p>';
    try{
      const data=await api('/messages/settings?conversationId='+encodeURIComponent(conversationId));
      const settings=data.settings||{},seconds=Number(settings.disappearingAfterSeconds||0);
      const options=[{value:0,label:'Off'},{value:30,label:'After 30 seconds'},{value:300,label:'After 5 minutes'},{value:3600,label:'After 1 hour'},{value:86400,label:'After 24 hours'},{value:604800,label:'After 7 days'}];
      root.innerHTML='<div class="message-tools-privacy-card"><strong>Disappearing messages</strong><p>New messages are automatically removed for everyone after the selected time. This does not change older messages.</p><label class="field"><span>Delete new messages after</span><select name="disappearingAfterSeconds" '+(settings.canManage?'':'disabled')+'>'+options.map(option=>'<option value="'+option.value+'" '+(option.value===seconds?'selected':'')+'>'+option.label+'</option>').join('')+'</select></label><p class="muted" data-privacy-status>'+(settings.canManage?'This setting applies to everyone in this conversation.':'Only the group owner or an admin can change this setting.')+'</p>'+(settings.canManage?'<button type="button" class="primary" data-save-disappearing>Save setting</button>':'')+'</div>';
      root.querySelector('[data-save-disappearing]')?.addEventListener('click',async buttonEvent=>{
        const button=buttonEvent.currentTarget,status=root.querySelector('[data-privacy-status]');
        button.disabled=true;status.textContent='Saving…';
        try{
          const saved=await api('/messages/settings',{method:'PATCH',body:JSON.stringify({conversationId,disappearingAfterSeconds:Number(root.querySelector('select[name="disappearingAfterSeconds"]').value)})});
          status.textContent=saved.settings.disappearingAfterSeconds?'Saved. New messages will disappear automatically.':'Saved. Disappearing messages are off.';
          const index=state.conversations.findIndex(item=>item.user.id===userId);
          if(index>=0)state.conversations[index].messageSettings=saved.settings;
        }catch(error){status.textContent=error.message||'Could not save this setting.';}
        finally{button.disabled=false;}
      });
    }catch(error){root.textContent=error.message||'Conversation privacy settings could not be loaded.';}
  }
  modal.querySelectorAll('[data-shared-kind]').forEach(button=>button.addEventListener('click',()=>{
    sharedKind=button.dataset.sharedKind;
    modal.querySelectorAll('[data-shared-kind]').forEach(item=>item.classList.toggle('active',item===button));
    if(modal.dataset.sharedLoaded)paintShared();
  }));
  searchForm?.elements.query?.focus();
}
function renderMessageContent(messages=[]){
  if(!messages.length)return '<div class="message-window-empty">No messages yet. Say hello to start this chat.</div>';
  return messages.map(message=>{
    const mine=message.from===state.user.id;
    const receipt=mine?(message.groupId?(message.readState?.readCount+' of '+message.readState?.total+' seen'):(message.read?'Seen':'Sent')):'';
    const reply=message.replyToId?messages.find(item=>item.id===message.replyToId):null;
    const replyHtml=reply?'<div class="message-reply-preview"><strong>'+esc(reply.author?.name||'Replying to a message')+'</strong><span>'+esc(reply.unsent?'Message unavailable':reply.text||((reply.attachments||[]).length?'Attachment':'Message'))+'</span></div>':'';
    const expiryLabel=message.expiresAt?'<small class="message-expiry-label" title="This message will be removed automatically">Expires '+esc(new Date(message.expiresAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}))+'</small>':'';
    const content=message.unsent?'<p class="message-unsent-label">This message was unsent.</p>':(message.stickerId?'<div class="message-window-sticker">'+esc(message.text||'')+'</div>':(message.text?'<p>'+esc(message.text)+'</p>':''));
    const gif=message.unsent?'':(message.gifUrl?'<a class="message-attachment-gif" href="'+esc(message.gifUrl)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(message.gifUrl)+'" alt="GIF"></a>':'');
    const attachments=message.unsent?'':messageAttachmentHtml(message.attachments);
    const editable=mine&&!message.unsent&&!message.stickerId&&!message.gifUrl&&Boolean(message.text);
    const actions='<details class="message-bubble-actions"><summary aria-label="Message options" title="Message options">···</summary><div class="message-bubble-actions-menu">'+
      '<button type="button" data-message-reply="'+esc(message.id)+'">Reply</button>'+
      (editable?'<button type="button" data-message-edit="'+esc(message.id)+'">Edit message</button>':'')+
      '<button type="button" data-message-delete-me="'+esc(message.id)+'">Delete for me</button>'+
      (mine&&!message.unsent?'<button type="button" class="danger" data-message-unsend="'+esc(message.id)+'">Unsend for everyone</button>':'')+
    '</div></details>';
    const counts={};Object.values(message.reactions||{}).forEach(value=>{counts[value]=(counts[value]||0)+1;});
    const reactionHtml='<div class="message-reaction-row">'+['👍','❤️','😂','😮','😢','🙏'].map(reaction=>'<button type="button" class="message-reaction-button '+(message.reactions?.[state.user.id]===reaction?'is-selected':'')+'" data-message-react="'+esc(message.id)+'" data-reaction="'+reaction+'" aria-label="React '+reaction+'">'+reaction+(counts[reaction]?' <small>'+counts[reaction]+'</small>':'')+'</button>').join('')+'</div>';
    return '<article class="message-window-bubble '+(mine?'mine':'')+(message.stickerId?' is-sticker':'')+'" data-message-id="'+esc(message.id)+'">'+actions+replyHtml+content+gif+attachments+expiryLabel+reactionHtml+'<small>'+timeAgo(message.createdAt)+(message.editedAt?'<span class="message-edited-label">Edited</span>':'')+(receipt?' · '+receipt:'')+'</small></article>';
  }).join('');
}
function messageSignature(messages=[]){return messages.map(message=>[message.id,message.read?'1':'0',message.text||'',message.editedAt||'',message.unsent?'1':'0',(message.attachmentIds||[]).join(','),JSON.stringify(message.reactions||{}),message.replyToId||'',JSON.stringify(message.readBy||{})].join(':')).join('|');}
function syncMessageRefreshPolling(){
  if(messageRefreshTimer){clearInterval(messageRefreshTimer);messageRefreshTimer=null;messageRefreshIntervalMs=0;}
}
async function refreshMessageConversations(){
  if(!state.user||document.visibilityState==='hidden'||messageRefreshInFlight)return;
  messageRefreshInFlight=true;
  try{
    let result=await api('/messages');
    const received=(result.conversations||[]).flatMap(conversation=>(conversation.messages||[]).filter(message=>message.to===state.user.id||message.groupId).map(message=>({message,conversation})));
    if(!messageRefreshKnownIncomingPrimed){messageRefreshKnownIncomingPrimed=true;messageRefreshKnownIncomingIds=new Set(received.map(item=>item.message.id));}
    else{
      const fresh=received.filter(item=>!messageRefreshKnownIncomingIds.has(item.message.id));
      if(fresh.length){
        const restricted=new Set(state.settings?.preferences?.messengerRestrictedUserIds||[]);
        const eligibleFresh=fresh.filter(item=>!item.conversation.isRequest&&!restricted.has(item.conversation.user.id));
        if(eligibleFresh.length&&state.settings?.preferences?.messengerMessageSounds!==false)playMessengerMessageSound();
        if(eligibleFresh.length&&state.settings?.preferences?.messengerAutoOpenNewMessages===true){
          const peers=[...new Map(eligibleFresh.map(item=>[item.conversation.user.id,item.conversation.user])).values()];
          peers.forEach(member=>{if(!state.messageWindows.some(win=>win.user.id===member.id))openMessageWindow(member);});
        }
      }
      received.forEach(item=>messageRefreshKnownIncomingIds.add(item.message.id));
    }
    state.conversations=result.conversations||[];
    paintMessengerBadge(state.conversations);
    if(state.messengerPanelOpen)renderMessengerPanelList();
    if(state.view==='messages')updateMessageInboxRows();
    const activeIds=new Set(state.messageWindows.filter(win=>!win.minimized).map(win=>win.user.id));
    const unread=state.conversations.filter(conversation=>activeIds.has(conversation.user.id)&&(conversation.unreadCount||0)>0);
    if(unread.length){
      await Promise.all(unread.map(conversation=>conversation.groupId?api('/message-groups/'+encodeURIComponent(conversation.groupId)+'/read',{method:'POST',body:'{}'}).catch(()=>null):api('/messages/'+encodeURIComponent(conversation.user.id)+'/read',{method:'POST',body:'{}'}).catch(()=>null)));
      result=await api('/messages');
      state.conversations=result.conversations||[];
      paintMessengerBadge(state.conversations);
    }
    state.messageWindows.filter(win=>!win.minimized).forEach(win=>{
      const conversation=state.conversations.find(item=>item.user.id===win.user.id);
      const messages=conversation?.messages||[];
      const scroll=document.querySelector('[data-message-window="'+CSS.escape(win.user.id)+'"] .message-window-scroll');
      if(!scroll)return;
      const signature=messageSignature(messages);
      if(scroll.dataset.messageSignature===signature){updateMessageWindowPresence(win);return;}
      const nearBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<64;
      scroll.innerHTML=renderMessageContent(messages);
      scroll.dataset.messageSignature=signature;
      if(nearBottom)scroll.scrollTop=scroll.scrollHeight;
      updateMessageWindowPresence(win);
    });
    document.querySelectorAll('[data-inbox-peer]').forEach(row=>{
      const conversation=state.conversations.find(item=>item.user.id===row.dataset.inboxPeer);
      const meta=row.querySelector('.person-meta');
      if(!conversation||!meta)return;
      const badge=meta.querySelector('.inbox-unread-badge');
      if(conversation.unreadCount>0){
        const nextBadge=badge||document.createElement('span');
        nextBadge.className='inbox-unread-badge';
        nextBadge.textContent=String(conversation.unreadCount);
        if(!badge)meta.append(nextBadge);
      }else badge?.remove();
      const preview=meta.querySelector('small');
      const last=conversation.messages.at(-1);
      if(preview&&last)preview.textContent=last.text||((last.attachments||[]).length?'Attachment':'Open chat');
    });
  }catch{
    // Keep the existing conversation visible during transient connectivity loss.
  }finally{messageRefreshInFlight=false;}
}
async function reloadMessageWindows(){
  state.conversations=(await api('/messages')).conversations||[];
  paintMessengerBadge(state.conversations);
  renderMessageWindows();
  if(state.view==='messages')renderMessages().catch(error=>toast(error.message));
}
function messageSendTarget(userId,payload={}){
  const win=state.messageWindows.find(item=>item.user.id===userId);
  return win?.groupId?{groupId:win.groupId,...payload}:{to:userId,...payload};
}
function asyncSendMessage(userId,payload={}){return api('/messages',{method:'POST',body:JSON.stringify(messageSendTarget(userId,payload))});}
async function sendStickerMessage(userId,stickerId){
  try{await asyncSendMessage(userId,{stickerId});await reloadMessageWindows();}
  catch(error){toast(error.message);}
}
async function sendGifMessage(userId,gifUrl){
  try{await asyncSendMessage(userId,{gifUrl});await reloadMessageWindows();}
  catch(error){toast(error.message);}
}
async function toggleMessageReaction(messageId,reaction){
  try{await api('/messages/'+encodeURIComponent(messageId)+'/reactions',{method:'POST',body:JSON.stringify({reaction})});await reloadMessageWindows();}
  catch(error){toast(error.message);}
}
function setMessageReply(userId,messageId){
  const win=state.messageWindows.find(item=>item.user.id===userId);if(!win)return;
  const message=state.conversations.flatMap(item=>item.messages||[]).find(item=>item.id===messageId);if(!message)return;
  win.replyToId=message.id;win.replyPreview=message;
  renderMessageWindows();
  document.querySelector('[data-message-form="'+CSS.escape(userId)+'"] input[name="text"]')?.focus();
}
function openEditMessage(message){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal message-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-message-title"><div class="modal-head"><h2 id="edit-message-title">Edit message</h2><button class="modal-close" type="button" aria-label="Close">×</button></div><form class="modal-body" id="edit-message-form"><label class="field"><span>Message</span><textarea name="text" maxlength="3000" required></textarea></label><p class="auth-error" role="status"></p><div class="modal-actions"><button class="secondary modal-cancel" type="button">Cancel</button><button class="primary" type="submit">Save changes</button></div></form></section>';
  document.body.append(modal);
  const form=modal.querySelector('#edit-message-form');form.elements.text.value=message.text||'';
  const close=()=>modal.remove();
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector('.auth-error');button.disabled=true;
    try{
      await api('/messages/'+encodeURIComponent(message.id),{method:'PATCH',body:JSON.stringify({text:form.elements.text.value})});
      close();await reloadMessageWindows();toast('Message updated.');
    }catch(error){status.textContent=error.message;button.disabled=false;}
  });
}
async function removeMessageForMe(messageId){
  try{await api('/messages/'+encodeURIComponent(messageId),{method:'DELETE',body:JSON.stringify({scope:'me'})});await reloadMessageWindows();toast('Message deleted from your chat.');}
  catch(error){toast(error.message);}
}
async function unsendMessageForEveryone(messageId){
  if(!window.confirm('Unsend this message for everyone in the conversation?'))return;
  try{await api('/messages/'+encodeURIComponent(messageId),{method:'DELETE',body:JSON.stringify({scope:'everyone'})});await reloadMessageWindows();toast('Message unsent.');}
  catch(error){toast(error.message);}
}
async function removeMessageConversation(peerId){
  if(!peerId||!window.confirm('Remove this conversation from your inbox? The other person keeps their copy. New messages can make it appear again.'))return;
  try{
    await api('/messages/'+encodeURIComponent(peerId),{method:'DELETE',body:'{}'});
    cancelMessageVoiceRecording(peerId);
    state.messageWindows=state.messageWindows.filter(item=>item.user.id!==peerId);
    await reloadMessageWindows();
    toast('Conversation removed from your inbox.');
  }catch(error){toast(error.message);}
}
function cancelMessageVoiceRecording(userId){
  const recording=activeMessageRecordings.get(userId);
  if(!recording)return;
  recording.cancelled=true;
  try{if(recording.recorder.state!=='inactive')recording.recorder.stop();}catch{}
}
async function toggleMessageVoiceRecording(userId,button,status){
  const current=activeMessageRecordings.get(userId);
  if(current){button.disabled=true;status.textContent='Finishing voice note…';try{current.recorder.stop();}catch(error){button.disabled=false;toast(error.message);}return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Voice recording is not supported by this browser. Use the attachment button to select an audio file.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const preferred=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'];
    const mimeType=preferred.find(type=>MediaRecorder.isTypeSupported?.(type))||'';
    const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined),chunks=[];
    const recording={recorder,stream,chunks,cancelled:false};
    activeMessageRecordings.set(userId,recording);
    recorder.addEventListener('dataavailable',event=>{if(event.data?.size)chunks.push(event.data);});
    recorder.addEventListener('stop',async()=>{
      stream.getTracks().forEach(track=>track.stop());
      activeMessageRecordings.delete(userId);
      const liveButton=document.querySelector('[data-message-voice="'+CSS.escape(userId)+'"]');
      const liveStatus=document.querySelector('[data-message-record-status="'+CSS.escape(userId)+'"]');
      if(liveButton){liveButton.disabled=false;liveButton.classList.remove('is-recording');liveButton.textContent='🎤';}
      if(liveStatus)liveStatus.hidden=true;
      if(recording.cancelled)return;
      try{
        const type=String(recorder.mimeType||mimeType||'audio/webm').split(';')[0].trim().toLowerCase();
        const extension=type==='audio/ogg'?'ogg':type==='audio/mp4'?'m4a':'webm';
        const blob=new Blob(chunks,{type});
        if(!blob.size)throw new Error('Minglora did not receive any voice audio. Try recording again.');
        const file=new File([blob],'minglora-voice-note-'+Date.now()+'.'+extension,{type,lastModified:Date.now()});
        const asset=await uploadMediaFile('message',file);
        await asyncSendMessage(userId,{text:'',attachmentIds:[asset.id]});
        await reloadMessageWindows();
      }catch(error){toast(error.message||'The voice note could not be sent.');}
    },{once:true});
    recorder.start(250);
    button.classList.add('is-recording');button.textContent='■';
    status.hidden=false;status.textContent='Recording… tap ■ to stop and send';
  }catch(error){toast(error.name==='NotAllowedError'?'Allow microphone access to record a voice note.':(error.message||'Minglora could not start voice recording.'));}
}
function renderMessageWindows(){
  let dock=document.querySelector('#message-window-dock');
  if(!state.messageWindows.length){
    messagePickers.forEach(picker=>picker.destroy());messagePickers.clear();dock?.remove();syncMessageRefreshPolling();return;
  }
  if(!dock){dock=document.createElement('div');dock.id='message-window-dock';document.body.append(dock);}
  messagePickers.forEach(picker=>picker.destroy());messagePickers.clear();
  dock.innerHTML=state.messageWindows.slice().reverse().map(win=>{
    const conversation=state.conversations.find(item=>item.user.id===win.user.id),messages=conversation?.messages||[];
    const stickerButtons=MESSAGE_STICKERS.map(sticker=>'<button type="button" class="message-sticker-choice" data-message-sticker="'+sticker.id+'" aria-label="'+sticker.label+'">'+sticker.emoji+'</button>').join('');
    const emojiButtons=MESSAGE_QUICK_EMOJIS.map(emoji=>'<button type="button" class="message-emoji-choice" data-message-emoji="'+emoji+'" aria-label="Insert '+emoji+'">'+emoji+'</button>').join('');
    const replyMessage=win.replyToId?state.conversations.flatMap(item=>item.messages||[]).find(item=>item.id===win.replyToId):null;
    const replyBanner=replyMessage?'<div class="message-reply-composer"><span><strong>Replying to '+esc(replyMessage.author?.name||'message')+'</strong><small>'+esc(replyMessage.text||'Attachment')+'</small></span><button type="button" data-message-reply-clear="'+esc(win.user.id)+'" aria-label="Cancel reply">×</button></div>':'';
    const body=win.minimized?'':(
      '<div class="message-window-body"><div class="message-window-scroll" data-message-signature="'+esc(messageSignature(messages))+'">'+renderMessageContent(messages)+'</div>'+
      '<div class="message-window-composer">'+replyBanner+
        '<div class="message-window-attachment-drawer" data-message-attachment-drawer="'+esc(win.user.id)+'" hidden><div data-message-picker="'+esc(win.user.id)+'"></div></div>'+
        '<div class="message-window-sticker-panel" data-message-sticker-panel="'+esc(win.user.id)+'" hidden>'+stickerButtons+'</div>'+
        '<div class="message-window-emoji-panel" data-message-emoji-panel="'+esc(win.user.id)+'" hidden>'+emojiButtons+'</div>'+
        '<div class="message-window-gif-panel" data-message-gif-panel="'+esc(win.user.id)+'" hidden><form class="message-gif-search" data-message-gif-search="'+esc(win.user.id)+'"><input name="query" maxlength="80" placeholder="Search GIFs…" aria-label="Search GIFs"><button type="submit">Search</button></form><div class="message-gif-results" data-message-gif-results="'+esc(win.user.id)+'"><span>Search Tenor GIFs to send one.</span></div></div>'+
        '<div class="message-window-record-status" data-message-record-status="'+esc(win.user.id)+'" role="status" hidden>Recording voice note…</div>'+
        '<div class="message-window-toolbar"><button type="button" data-message-attach="'+esc(win.user.id)+'" title="Photos, videos and files" aria-label="Attach photos, videos and files">🖼</button><button type="button" data-message-voice="'+esc(win.user.id)+'" title="Voice note — record and send" aria-label="Record a voice note"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg></button><button type="button" data-message-open-stickers="'+esc(win.user.id)+'" title="Stickers" aria-label="Open stickers">✳</button><button type="button" data-message-open-gifs="'+esc(win.user.id)+'" title="GIFs" aria-label="Open GIF search">GIF</button></div>'+
        '<form class="message-window-form" data-message-form="'+esc(win.user.id)+'"><input name="text" maxlength="3000" placeholder="Aa" autocomplete="off" aria-label="Write a message"><button type="button" class="message-emoji-toggle" data-message-open-emoji="'+esc(win.user.id)+'" aria-label="Choose emoji" title="Emoji">😊</button><button class="message-send-button" type="submit" aria-label="Send message" title="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.2 21 12 3.4 3.8l-.1 6.4 12 1.8-12 1.8z" fill="currentColor"/></svg></button></form>'+
      '</div></div>'
    );
    const callControls=win.isGroup
      ?'<button type="button" class="message-window-call" data-message-group-audio="'+esc(win.groupId)+'" title="Start group voice call" aria-label="Start group voice call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.8 2 2 0 0 1 3.1 1.6h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L7 9.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 2 2.3z"/></svg></button><button type="button" class="message-window-call" data-message-group-video="'+esc(win.groupId)+'" title="Start group video call" aria-label="Start group video call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 10 7-4v12l-7-4z"/></svg></button><button type="button" class="message-window-call" data-message-group-manage="'+esc(win.groupId)+'" title="Group members" aria-label="Group members">'+messenger3dIcon('groups')+'</button>'
      :'<button class="message-window-call" type="button" data-message-audio="'+esc(win.user.id)+'" aria-label="Phone call" title="Phone call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.8 2 2 0 0 1 3.1 1.6h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L7 9.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 2 2.3z"/></svg></button><button class="message-window-call" type="button" data-message-video="'+esc(win.user.id)+'" aria-label="Video call" title="Video call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 10 7-4v12l-7-4z"/></svg></button><button class="message-window-call" type="button" data-message-remove="'+esc(win.user.id)+'" aria-label="Remove conversation" title="Remove conversation">···</button>';
    const profileControl=win.isGroup
      ?'<span class="message-window-profile is-group"><span class="message-group-avatar">'+messenger3dIcon('groups')+'</span><span><strong>'+esc(win.user.name)+'</strong><small data-message-presence>'+esc(conversation?.group?.memberCount||0)+' members</small></span></span>'
      :'<button class="message-window-profile" type="button" data-message-profile="'+esc(win.user.id)+'" aria-label="View '+esc(win.user.name)+' profile"><img src="'+avatar(win.user)+'" alt=""><span><strong>'+esc(win.user.name)+'</strong><small data-message-presence>'+(state.messengerPresence[win.user.id]===true?'Active now':'')+'</small></span></button>';
    return '<section class="message-window '+(win.minimized?'is-minimized':'')+(win.isGroup?' is-group-chat':'')+'" data-message-window="'+esc(win.user.id)+'" role="dialog" aria-label="Chat with '+esc(win.user.name)+'"><header class="message-window-header">'+profileControl+'<div class="message-window-controls"><button type="button" class="message-window-call" data-message-tools="'+esc(win.user.id)+'" title="Search messages and view shared media" aria-label="Search messages and view shared media">'+messenger3dIcon('search')+'</button>'+callControls+'<button type="button" data-message-minimize="'+esc(win.user.id)+'" aria-label="Minimize chat" title="Minimize">−</button><button type="button" data-message-close="'+esc(win.user.id)+'" aria-label="Close chat" title="Close">×</button></div></header>'+body+'</section>';
  }).join('');
  dock.querySelectorAll('[data-message-minimize]').forEach(button=>button.onclick=()=>{const win=state.messageWindows.find(item=>item.user.id===button.dataset.messageMinimize);if(win){win.minimized=!win.minimized;renderMessageWindows();}});
  dock.querySelectorAll('[data-message-close]').forEach(button=>button.onclick=()=>{const id=button.dataset.messageClose;cancelMessageVoiceRecording(id);state.messageWindows=state.messageWindows.filter(item=>item.user.id!==id);renderMessageWindows();syncMessageRefreshPolling();});
  dock.querySelectorAll('[data-message-profile]').forEach(button=>button.onclick=()=>openProfile(button.dataset.messageProfile));
  dock.querySelectorAll('[data-message-tools]').forEach(button=>button.onclick=()=>openConversationTools(button.dataset.messageTools));
  dock.querySelectorAll('[data-message-group-manage]').forEach(button=>button.onclick=()=>openMessageGroupSettings(button.dataset.messageGroupManage));
  dock.querySelectorAll('[data-message-reply-clear]').forEach(button=>button.onclick=()=>{const win=state.messageWindows.find(item=>item.user.id===button.dataset.messageReplyClear);if(win){win.replyToId=null;win.replyPreview=null;renderMessageWindows();}});
  dock.querySelectorAll('[data-message-remove]').forEach(button=>button.onclick=()=>removeMessageConversation(button.dataset.messageRemove));
  if(dock.dataset.messageActionsDelegated!=='true'){
    dock.dataset.messageActionsDelegated='true';
    dock.addEventListener('click',event=>{
      const button=event.target.closest('[data-message-edit],[data-message-delete-me],[data-message-unsend],[data-message-reply],[data-message-react]');
      if(!button||!dock.contains(button))return;
      button.closest('details')?.removeAttribute('open');
      if(button.hasAttribute('data-message-reply')){
        const messageId=button.dataset.messageReply;
        const win=button.closest('[data-message-window]');
        if(win)setMessageReply(win.dataset.messageWindow,messageId);
      }else if(button.hasAttribute('data-message-react')){
        toggleMessageReaction(button.dataset.messageReact,button.dataset.reaction);
      }else if(button.hasAttribute('data-message-edit')){
        const messageId=button.dataset.messageEdit;
        const message=state.conversations.flatMap(item=>item.messages||[]).find(item=>item.id===messageId);
        if(message)openEditMessage(message);
      }else if(button.hasAttribute('data-message-delete-me')){
        removeMessageForMe(button.dataset.messageDeleteMe);
      }else if(button.hasAttribute('data-message-unsend')){
        unsendMessageForEveryone(button.dataset.messageUnsend);
      }
    });
  }
  dock.querySelectorAll('[data-message-group-audio],[data-message-group-video]').forEach(button=>button.onclick=()=>{
    const groupId=button.dataset.messageGroupAudio||button.dataset.messageGroupVideo;
    const conversation=state.conversations.find(item=>item.groupId===groupId);
    if(!conversation?.group){toast('Group call participants could not be loaded.');return;}
    const participantIds=[...new Set((conversation.group.members||[]).map(member=>member.id).filter(id=>id&&id!==state.user.id))];
    if(!participantIds.length){toast('Add another member before starting a group call.');return;}
    const kind=button.dataset.messageGroupAudio?'audio':'video';
    if(participantIds.length<=7){
      startMingloraCall({id:conversation.user.id,name:conversation.group.name+' group call',avatar:conversation.user.avatar||''},kind,participantIds,conversation.group.id);
    }else{
      openMingloraGroupCallPicker(conversation,kind);
    }
  });
  dock.querySelectorAll('[data-message-audio]').forEach(button=>button.onclick=()=>{const win=state.messageWindows.find(item=>item.user.id===button.dataset.messageAudio);if(win)startMingloraCall(win.user,'audio');});
  dock.querySelectorAll('[data-message-video]').forEach(button=>button.onclick=()=>{const win=state.messageWindows.find(item=>item.user.id===button.dataset.messageVideo);if(win)startMingloraCall(win.user,'video');});
  dock.querySelectorAll('[data-message-attach]').forEach(button=>button.onclick=()=>{const drawer=dock.querySelector('[data-message-attachment-drawer="'+CSS.escape(button.dataset.messageAttach)+'"]');if(drawer)drawer.hidden=!drawer.hidden;});
  dock.querySelectorAll('[data-message-open-stickers]').forEach(button=>button.onclick=()=>{const id=button.dataset.messageOpenStickers,panel=dock.querySelector('[data-message-sticker-panel="'+CSS.escape(id)+'"]');if(panel)panel.hidden=!panel.hidden;const other=['emoji','gif'];other.forEach(name=>{const node=dock.querySelector('[data-message-'+name+'-panel="'+CSS.escape(id)+'"]');if(node)node.hidden=true;});});
  dock.querySelectorAll('[data-message-open-emoji]').forEach(button=>button.onclick=()=>{const id=button.dataset.messageOpenEmoji,panel=dock.querySelector('[data-message-emoji-panel="'+CSS.escape(id)+'"]');if(panel)panel.hidden=!panel.hidden;['sticker','gif'].forEach(name=>{const node=dock.querySelector('[data-message-'+name+'-panel="'+CSS.escape(id)+'"]');if(node)node.hidden=true;});});
  dock.querySelectorAll('[data-message-open-gifs]').forEach(button=>button.onclick=()=>{const id=button.dataset.messageOpenGifs,panel=dock.querySelector('[data-message-gif-panel="'+CSS.escape(id)+'"]');if(panel)panel.hidden=!panel.hidden;['sticker','emoji'].forEach(name=>{const node=dock.querySelector('[data-message-'+name+'-panel="'+CSS.escape(id)+'"]');if(node)node.hidden=true;});panel?.querySelector('input[name="query"]')?.focus();});
  dock.querySelectorAll('[data-message-voice]').forEach(button=>button.onclick=()=>toggleMessageVoiceRecording(button.dataset.messageVoice,button,dock.querySelector('[data-message-record-status="'+CSS.escape(button.dataset.messageVoice)+'"]')));
  dock.querySelectorAll('[data-message-sticker]').forEach(button=>button.onclick=()=>{const id=button.closest('[data-message-sticker-panel]')?.dataset.messageStickerPanel;if(id)sendStickerMessage(id,button.dataset.messageSticker);});
  dock.querySelectorAll('[data-message-emoji]').forEach(button=>button.onclick=()=>{const id=button.closest('[data-message-emoji-panel]')?.dataset.messageEmojiPanel,input=id?dock.querySelector('[data-message-form="'+CSS.escape(id)+'"] input[name="text"]'):null;if(!input)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;input.setRangeText(button.dataset.messageEmoji,start,end,'end');input.focus();});
  dock.querySelectorAll('[data-message-gif-search]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();const id=form.dataset.messageGifSearch,query=String(form.elements.query.value||'').trim(),results=dock.querySelector('[data-message-gif-results="'+CSS.escape(id)+'"]');
    if(!query||!results)return;
    results.innerHTML='<span>Searching GIFs…</span>';
    try{
      const data=await api('/messages/gifs?q='+encodeURIComponent(query));
      results.innerHTML=data.gifs?.length?data.gifs.map(gif=>'<button type="button" class="message-gif-result" data-send-gif="'+esc(gif.url)+'" aria-label="Send GIF"><img loading="lazy" src="'+esc(gif.previewUrl)+'" alt="'+esc(gif.title)+'"></button>').join(''):'<span>No GIFs found. Try another search.</span>';
      results.querySelectorAll('[data-send-gif]').forEach(button=>button.onclick=()=>sendGifMessage(id,button.dataset.sendGif));
    }catch(error){results.textContent=error.message;}
  }));
  state.messageWindows.filter(win=>!win.minimized).forEach(win=>{
    const root=dock.querySelector('[data-message-picker="'+CSS.escape(win.user.id)+'"]');
    if(root)messagePickers.set(win.user.id,createMediaPicker(root,{slot:'message',maxFiles:5,compact:true}));
    const form=dock.querySelector('[data-message-form="'+CSS.escape(win.user.id)+'"]');
    form?.elements.text?.addEventListener('input',()=>messageTyping(win,true));
    form?.elements.text?.addEventListener('blur',()=>messageTyping(win,false));
    form?.addEventListener('submit',async event=>{
      event.preventDefault();messageTyping(win,false);const button=form.querySelector('button[type="submit"]'),text=String(form.elements.text.value||'').trim(),picker=messagePickers.get(win.user.id);
      button.disabled=true;
      try{
        const attachmentIds=picker?await picker.upload():[];
        if(!text&&!attachmentIds.length){toast('Write a message or attach a file.');return;}
        await asyncSendMessage(win.user.id,{text,attachmentIds,replyToId:win.replyToId||undefined});
        form.elements.text.value='';win.replyToId=null;win.replyPreview=null;
        state.conversations=(await api('/messages')).conversations||[];
        renderMessageWindows();
        if(state.view==='messages')renderMessages().catch(error=>toast(error.message));
      }catch(error){toast(error.message);}
      finally{if(button.isConnected)button.disabled=false;}
    });
    const scroll=dock.querySelector('[data-message-window="'+CSS.escape(win.user.id)+'"] .message-window-scroll');
    if(scroll)scroll.scrollTop=scroll.scrollHeight;
  });
  syncMessageRefreshPolling();
}
async function openMessageWindow(member,options={}){
  if(!member?.id||member.id===state.user.id)return;
  const groupId=String(options.groupId||member.groupId||'');
  const isGroup=Boolean(groupId||member.isGroup);
  const windowId=isGroup?(groupId?'group:'+groupId:String(member.id)) : member.id;
  const windowUser={...member,id:windowId,isGroup};
  const existing=state.messageWindows.find(item=>item.user.id===windowId);
  if(existing){existing.minimized=false;}
  else{
    if(state.messageWindows.length>=5){toast('You can keep up to five chat windows open at once.');return;}
    state.messageWindows.push({user:windowUser,minimized:false,groupId:isGroup?groupId:null,isGroup});
  }
  renderMessageWindows();
  syncMessageRefreshPolling();
  try{
    state.conversations=(await api('/messages')).conversations||[];
    const conversation=state.conversations.find(item=>item.user.id===windowId);
    if(conversation?.unreadCount>0){
      if(isGroup&&groupId)await api('/message-groups/'+encodeURIComponent(groupId)+'/read',{method:'POST',body:'{}'});
      else await api('/messages/'+encodeURIComponent(member.id)+'/read',{method:'POST',body:'{}'});
      state.conversations=(await api('/messages')).conversations||[];
    }
    renderMessageWindows();
  }catch(error){toast(error.message);}
}
function paintMessengerBadge(conversations=[]){
  const count=(Array.isArray(conversations)?conversations:[]).reduce((total,item)=>total+Math.max(0,Number(item.unreadCount)||0),0);
  const badge=$('#messenger-unread-count');
  const button=$('#messenger-btn');
  if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('hidden',count===0);}
  if(button)button.setAttribute('aria-label',count?('Messenger, '+count+' unread messages'):'Messenger');
}
async function updateMessengerBadge(){
  if(!state.user)return;
  try{
    const conversations=(await api('/messages')).conversations||[];
    paintMessengerBadge(conversations);
    if(!messageRefreshKnownIncomingPrimed){
      messageRefreshKnownIncomingIds=new Set(conversations.flatMap(conversation=>(conversation.messages||[]).filter(message=>message.to===state.user.id).map(message=>message.id)));
      messageRefreshKnownIncomingPrimed=true;
    }
  }catch(error){console.warn('Messenger unread count unavailable:',error.message);}
}

function messengerPreferences(){return state.settings?.preferences||{};}
function messengerPreference(key,fallback){const value=messengerPreferences()[key];return value===undefined?fallback:value;}
function playMessengerMessageSound(){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    const context=callToneContext||messengerMessageSoundContext||new AudioContextClass();
    messengerMessageSoundContext=context;
    if(context.state!=='running')return;
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(740,start);oscillator.frequency.setValueAtTime(990,start+.075);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.075,start+.018);gain.gain.linearRampToValueAtTime(0,start+.17);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.18);
    oscillator.onended=()=>{try{oscillator.disconnect();gain.disconnect();}catch{}};
  }catch{}
}
function ensureMessengerPanel(){
  let panel=$('#messenger-panel');
  if(!panel){panel=document.createElement('aside');panel.id='messenger-panel';panel.className='messenger-panel';panel.hidden=true;panel.setAttribute('aria-label','Messenger chats');document.body.append(panel);}
  return panel;
}
function closeMessengerPanel(){
  state.messengerPanelOpen=false;state.messengerOptionsOpen=false;
  const panel=$('#messenger-panel');if(panel){panel.hidden=true;panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');}
  $('#messenger-btn')?.setAttribute('aria-expanded','false');
  syncMessageRefreshPolling();
}
async function openMessengerPanel(){
  const panel=ensureMessengerPanel();
  state.messengerPanelOpen=true;panel.hidden=false;panel.classList.add('is-open');panel.setAttribute('aria-hidden','false');
  $('#messenger-btn')?.setAttribute('aria-expanded','true');
  syncMessageRefreshPolling();
  renderMessengerPanel();
  try{const result=await api('/messages');state.conversations=result.conversations||[];paintMessengerBadge(state.conversations);renderMessengerPanelList();}
  catch(error){const list=$('#messenger-panel-list');if(list)list.innerHTML='<div class="messenger-empty-state"><span>'+messenger3dIcon('activity')+'</span><strong>Chats could not load</strong><p>'+esc(error.message)+'</p></div>';}
}
async function toggleMessengerPanel(){if(state.messengerPanelOpen)closeMessengerPanel();else await openMessengerPanel();}
function messengerToggleRow(key,label,icon,description,defaultValue){
  const enabled=messengerPreference(key,defaultValue);
  return '<div class="messenger-option-row"><span class="messenger-option-icon" aria-hidden="true">'+messenger3dIcon(icon,'messenger-3d-icon')+'</span><span class="messenger-option-copy"><strong>'+label+'</strong><small>'+description+'</small></span><button type="button" class="messenger-switch '+(enabled?'is-on':'')+'" data-messenger-setting="'+key+'" aria-label="'+label+': '+(enabled?'ON':'OFF')+'" aria-pressed="'+(enabled?'true':'false')+'"><span>'+(enabled?'ON':'OFF')+'</span></button></div>';
}
function messengerDestinationRow(destination,label,icon,description){
  return '<button type="button" class="messenger-option-link" data-messenger-destination="'+destination+'"><span class="messenger-option-icon" aria-hidden="true">'+messenger3dIcon(icon,'messenger-3d-icon')+'</span><span class="messenger-option-copy"><strong>'+label+'</strong><small>'+description+'</small></span><span class="messenger-option-chevron">'+messenger3dIcon('arrow-right','messenger-3d-icon')+'</span></button>';
}
function renderMessengerPanel(){
  if(!state.messengerPanelOpen)return;
  const panel=ensureMessengerPanel(),prefs=messengerPreferences();
  panel.innerHTML=
    '<header class="messenger-panel-header"><div class="messenger-panel-heading"><h2>Chats</h2><span>Stay connected on Minglora</span></div><div class="messenger-panel-actions">'+
    '<button type="button" class="messenger-panel-icon" data-messenger-new title="New message" aria-label="New message">'+messenger3dIcon('create')+'</button>'+
    '<button type="button" class="messenger-panel-icon" data-messenger-new-group title="Create group chat" aria-label="Create group chat">'+messenger3dIcon('groups')+'</button>'+
    '<button type="button" class="messenger-panel-icon" data-messenger-see title="See in Messenger" aria-label="See in Messenger">'+messenger3dIcon('external-link')+'</button>'+
    '<button type="button" class="messenger-panel-icon" data-messenger-options title="Messenger options" aria-label="Messenger options" aria-expanded="'+(state.messengerOptionsOpen?'true':'false')+'">'+messenger3dIcon('more')+'</button>'+
    '<button type="button" class="messenger-panel-icon messenger-panel-close" data-messenger-close title="Close chats" aria-label="Close chats">'+messenger3dIcon('close')+'</button></div></header>'+
    '<label class="messenger-search"><span aria-hidden="true">'+messenger3dIcon('search')+'</span><input id="messenger-search-input" type="search" placeholder="'+(state.messengerComposeMode?'Search people by name or username':'Search Messenger')+'" autocomplete="off" aria-label="'+(state.messengerComposeMode?'Search people':'Search Messenger')+'"></label>'+
    '<nav class="messenger-filter-tabs" aria-label="Filter chats">'+
    ['all','unread','groups','communities'].map(filter=>'<button type="button" data-messenger-filter="'+filter+'" class="'+(state.messengerFilter===filter?'active':'')+'" aria-pressed="'+(state.messengerFilter===filter?'true':'false')+'"><span>'+messenger3dIcon(({all:'messages',unread:'activity',groups:'groups',communities:'pages'})[filter])+'</span><span>'+({all:'All',unread:'Unread',groups:'Groups',communities:'Communities'}[filter])+'</span></button>').join('')+
    '</nav>'+
    '<div class="messenger-panel-list" id="messenger-panel-list" aria-live="polite"></div>'+
    '<footer class="messenger-panel-footer"><button type="button" data-messenger-see">'+messenger3dIcon('external-link')+'<span>See all in Messenger</span></button></footer>'+
    '<section class="messenger-options-menu '+(state.messengerOptionsOpen?'':'hidden')+'" id="messenger-options-menu" aria-label="Messenger settings">'+
    '<div class="messenger-options-heading"><strong>Messenger settings</strong><small>Control how you receive messages</small></div>'+
    messengerToggleRow('messengerIncomingCallSounds','Incoming call sounds','call','Play sound when someone calls you',true)+
    messengerToggleRow('messengerMessageSounds','Message sounds','sound','Play a sound for new messages',true)+
    messengerToggleRow('messengerAutoOpenNewMessages','Automatically open new messages','messages','Open a chat window when a new message arrives',false)+
    '<div class="messenger-options-divider"></div>'+
    messengerDestinationRow('privacy','Privacy settings','privacy','Manage your privacy and audience')+
    messengerToggleRow('messengerActiveStatus','Active status','activity','Let people see when you are active',true)+
    messengerDestinationRow('requests','Message requests','request','Review messages from people you do not follow mutually')+
    messengerDestinationRow('archived','Archived chats','archive','Find conversations you have archived')+
    messengerDestinationRow('delivery','Message delivery settings','delivery','Choose who can send you messages')+
    messengerDestinationRow('restricted','Restricted accounts','lock','Manage accounts you have restricted')+
    messengerDestinationRow('blocking','Block settings','block','Review and manage blocked accounts')+
    '</section>';
  const search=$('#messenger-search-input');if(search)search.value=state.messengerSearch||'';
  panel.querySelectorAll('[data-messenger-filter]').forEach(button=>button.onclick=()=>{state.messengerFilter=button.dataset.messengerFilter;state.messengerPanelSection='chats';state.messengerComposeMode=false;renderMessengerPanel();});
  panel.querySelector('[data-messenger-new]')?.addEventListener('click',()=>{state.messengerComposeMode=true;state.messengerPanelSection='chats';state.messengerSearch='';state.messengerComposeUsers=null;renderMessengerPanel();$('#messenger-search-input')?.focus();});
  panel.querySelector('[data-messenger-new-group]')?.addEventListener('click',()=>{state.messengerComposeMode=false;state.messengerPanelSection='create-group';state.messengerSearch='';state.messengerComposeUsers=null;renderMessengerPanelList();});
  panel.querySelectorAll('[data-messenger-see]').forEach(button=>button.onclick=()=>{closeMessengerPanel();activateNav('messages');});
  panel.querySelector('[data-messenger-options]')?.addEventListener('click',()=>{state.messengerOptionsOpen=!state.messengerOptionsOpen;renderMessengerPanel();});
  panel.querySelector('[data-messenger-close]')?.addEventListener('click',closeMessengerPanel);
  search?.addEventListener('input',()=>{state.messengerSearch=search.value;renderMessengerPanelList();});
  panel.querySelectorAll('[data-messenger-setting]').forEach(button=>button.onclick=()=>saveMessengerPreference(button.dataset.messengerSetting,button.getAttribute('aria-pressed')!=='true'));
  panel.querySelectorAll('[data-messenger-destination]').forEach(button=>button.onclick=()=>openMessengerDestination(button.dataset.messengerDestination));
  renderMessengerPanelList();
}
async function renderMessengerPanelList(){
  const list=$('#messenger-panel-list');if(!list||!state.messengerPanelOpen)return;
  const query=String(state.messengerSearch||'').trim().toLowerCase(),prefs=messengerPreferences();
  const archived=new Set(Array.isArray(prefs.messengerArchivedConversationIds)?prefs.messengerArchivedConversationIds:[]);
  const restricted=new Set(Array.isArray(prefs.messengerRestrictedUserIds)?prefs.messengerRestrictedUserIds:[]);
  if(state.messengerPanelSection==='create-group'){
    if(!Array.isArray(state.messengerComposeUsers)){
      if(state.messengerComposeLoading)return;
      state.messengerComposeLoading=true;
      list.innerHTML='<div class="messenger-empty-state"><span>'+messenger3dIcon('groups')+'</span><strong>Loading members</strong><p>Choose people to add to your Messenger group.</p></div>';
      try{state.messengerComposeUsers=(await api('/users')).users||[];}
      catch(error){list.innerHTML='<div class="messenger-empty-state"><strong>Members could not load</strong><p>'+esc(error.message)+'</p></div>';}
      finally{state.messengerComposeLoading=false;}
      if(!Array.isArray(state.messengerComposeUsers))return;
    }
    const members=state.messengerComposeUsers.filter(member=>member.id!==state.user?.id&&(!query||(String(member.name||'')+' '+String(member.username||'')).toLowerCase().includes(query))).slice(0,40);
    list.innerHTML='<div class="messenger-group-create-head"><button type="button" data-messenger-create-back>'+messenger3dIcon('arrow-left')+' Back</button><strong>New group chat</strong><small>Add people and start a shared conversation.</small></div>'+
      '<form class="messenger-group-create-form" id="messenger-group-create-form"><label>Group name<input name="name" maxlength="80" required placeholder="Name this group"></label><label>Description (optional)<input name="description" maxlength="500" placeholder="What is this group for?"></label><div class="messenger-group-member-heading"><strong>Add members</strong><span>'+members.length+' shown</span></div><div class="messenger-group-member-picker">'+
      (members.map(member=>'<label class="messenger-group-member-option"><input type="checkbox" name="memberIds" value="'+esc(member.id)+'"><img src="'+avatar(member)+'" alt=""><span><strong>'+esc(member.name||'Minglora member')+'</strong><small>@'+esc(member.username||'member')+'</small></span></label>').join('')||'<p class="muted">No members match this search.</p>')+
      '</div><button class="primary full" type="submit">Create group chat</button><p class="auth-error" role="status"></p></form>';
    list.querySelector('[data-messenger-create-back]')?.addEventListener('click',()=>{state.messengerPanelSection='chats';renderMessengerPanelList();});
    list.querySelector('#messenger-group-create-form')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),status=form.querySelector('.auth-error');
      const memberIds=[...form.querySelectorAll('input[name="memberIds"]:checked')].map(input=>input.value);
      button.disabled=true;status.textContent='';
      try{
        const result=await api('/message-groups',{method:'POST',body:JSON.stringify({name:form.elements.name.value,description:form.elements.description.value,memberIds})});
        state.conversations=(await api('/messages')).conversations||[];
        paintMessengerBadge(state.conversations);
        state.messengerPanelSection='chats';state.messengerFilter='groups';state.messengerSearch='';
        renderMessengerPanelList();
        const conversation=state.conversations.find(item=>item.groupId===result.group?.id);
        if(conversation)openMessageWindow(conversation.user,{groupId:conversation.groupId});
        toast('Group chat created.');
      }catch(error){status.textContent=error.message;button.disabled=false;}
    });
    return;
  }
  if(state.messengerComposeMode){
    if(!Array.isArray(state.messengerComposeUsers)){
      if(state.messengerComposeLoading)return;
      state.messengerComposeLoading=true;list.innerHTML='<div class="messenger-empty-state"><span>'+messenger3dIcon('search')+'</span><strong>Find someone to message</strong><p>Search for a Minglora member by name or username.</p></div>';
      try{state.messengerComposeUsers=(await api('/users')).users||[];}
      catch(error){list.innerHTML='<div class="messenger-empty-state"><span>'+messenger3dIcon('activity')+'</span><strong>Members could not load</strong><p>'+esc(error.message)+'</p></div>';}
      finally{state.messengerComposeLoading=false;}
      if(!Array.isArray(state.messengerComposeUsers))return;
    }
    const members=state.messengerComposeUsers.filter(member=>member.id!==state.user?.id&&(!query||(String(member.name||'')+' '+String(member.username||'')).toLowerCase().includes(query))).slice(0,30);
    list.innerHTML=members.length?members.map(member=>'<button type="button" class="messenger-compose-person" data-messenger-compose-to="'+esc(member.id)+'"><img src="'+avatar(member)+'" alt=""><span><strong>'+esc(member.name||'Minglora member')+'</strong><small>@'+esc(member.username||'member')+'</small></span><span class="messenger-compose-arrow">'+messenger3dIcon('arrow-right')+'</span></button>').join(''):'<div class="messenger-empty-state"><span>'+messenger3dIcon('friends')+'</span><strong>No members found</strong><p>Try a different name or username.</p></div>';
    list.querySelectorAll('[data-messenger-compose-to]').forEach(button=>button.onclick=()=>{const member=state.messengerComposeUsers.find(item=>item.id===button.dataset.messengerComposeTo);if(member){state.messengerComposeMode=false;openMessageWindow(member);}});
    return;
  }
  if(state.messengerPanelSection!=='chats'){
    const section=state.messengerPanelSection;
    let rows=[];
    if(section==='archived')rows=state.conversations.filter(item=>archived.has(item.user.id));
    if(section==='requests')rows=state.conversations.filter(item=>item.isRequest===true);
    if(section==='restricted')rows=state.conversations.filter(item=>restricted.has(item.user.id));
    const title=section==='archived'?'Archived chats':section==='requests'?'Message requests':'Restricted accounts';
    const rowsHtml=rows.map(conversation=>messengerConversationRow(conversation,section)).join('');
    list.innerHTML='<div class="messenger-subview-head"><button type="button" data-messenger-back aria-label="Back to chats">'+messenger3dIcon('arrow-left')+'</button><strong>'+title+'</strong></div>'+(rowsHtml||'<div class="messenger-empty-state"><span>'+messenger3dIcon(section==='requests'?'request':section==='archived'?'archive':'lock')+'</span><strong>'+(section==='requests'?'No message requests':section==='archived'?'No archived chats':'No restricted accounts')+'</strong><p>'+(section==='requests'?'Messages from people who are not mutual friends appear here when available.':section==='archived'?'Chats you archive will be kept here until you restore them.':'Accounts you restrict will be listed here.')+'</p></div>');
    list.querySelector('[data-messenger-back]')?.addEventListener('click',()=>{state.messengerPanelSection='chats';renderMessengerPanelList();});
    bindMessengerConversationRows(list,section);
    return;
  }
  let rows=state.conversations.filter(item=>!archived.has(item.user.id));
  if(state.messengerFilter==='unread')rows=rows.filter(item=>Number(item.unreadCount)>0);
  if(state.messengerFilter==='groups')rows=rows.filter(item=>item.isGroup===true||item.kind==='group'||item.type==='group');
  if(state.messengerFilter==='communities')rows=rows.filter(item=>item.isCommunity===true||item.kind==='community'||item.type==='community');
  if(query)rows=rows.filter(item=>(String(item.user?.name||'')+' '+String(item.user?.username||'')+' '+String(item.messages?.at(-1)?.text||'')).toLowerCase().includes(query));
  const heading=state.messengerFilter==='groups'?'Group chats':state.messengerFilter==='communities'?'Community chats':state.messengerFilter==='unread'?'Unread chats':'Your conversations';
  const rowsHtml=rows.map(conversation=>messengerConversationRow(conversation,'chats')).join('');
  const emptyMessage=state.messengerFilter==='groups'?'Create a group chat to start a shared conversation.':state.messengerFilter==='communities'?'Community conversations will appear here when available.':state.messengerFilter==='unread'?'You have no unread conversations.':'Your recent conversations will appear here. Start a chat with the new message button.';
  list.innerHTML='<div class="messenger-list-heading"><strong>'+heading+'</strong><span>'+rows.length+'</span></div>'+(rowsHtml||'<div class="messenger-empty-state"><span>'+messenger3dIcon(state.messengerFilter==='groups'?'groups':state.messengerFilter==='communities'?'pages':'messages')+'</span><strong>'+(state.messengerFilter==='unread'?'All caught up':'No chats to show')+'</strong><p>'+emptyMessage+'</p>'+(state.messengerFilter==='groups'||state.messengerFilter==='communities'?'<button type="button" data-messenger-browse-groups>Browse groups</button>':'')+'</div>');
  list.querySelector('[data-messenger-browse-groups]')?.addEventListener('click',()=>{closeMessengerPanel();activateNav('groups');});
  bindMessengerConversationRows(list,'chats');
}
function messengerConversationRow(conversation,section){
  const member=conversation.user||{},last=conversation.messages?.at(-1),isGroup=Boolean(conversation.groupId||member.isGroup);
  let preview=last?.text||((last?.attachments||[]).length?'Attachment':last?.gifUrl?'GIF':last?.stickerId?'Sticker':'Start chatting');
  if(isGroup&&last?.author?.name)preview=last.author.name+': '+preview;
  const unread=Number(conversation.unreadCount)||0,archived=section==='archived',restricted=section==='restricted';
  const online=!isGroup&&state.messengerPresence?.[member.id]===true;
  const action=archived?'<button type="button" class="messenger-chat-row-action" data-messenger-unarchive="'+esc(member.id)+'" title="Restore chat" aria-label="Restore chat">'+messenger3dIcon('restore')+'</button>':restricted?'<button type="button" class="messenger-chat-row-action" data-messenger-unrestrict="'+esc(member.id)+'" title="Unrestrict account" aria-label="Unrestrict account">'+messenger3dIcon('unlock')+'</button>':'<button type="button" class="messenger-chat-row-action" data-messenger-archive="'+esc(member.id)+'" title="Archive chat" aria-label="Archive chat">'+messenger3dIcon('archive')+'</button>'+(isGroup?'':'<button type="button" class="messenger-chat-row-action" data-messenger-restrict="'+esc(member.id)+'" title="Restrict account" aria-label="Restrict account">'+messenger3dIcon('lock')+'</button>');
  const avatarHtml=isGroup?'<span class="messenger-chat-avatar messenger-group-avatar">'+messenger3dIcon('groups')+'</span>':'<img class="messenger-chat-avatar" src="'+avatar(member)+'" alt="">';
  return '<article class="messenger-chat-row '+(isGroup?'is-group-row':'')+'" data-messenger-open="'+esc(member.id)+'" tabindex="0" role="button" aria-label="Open chat with '+esc(member.name||'Minglora member')+'">'+avatarHtml+(online?'<i class="messenger-chat-online-dot" aria-label="Active now"></i>':'')+'<span class="messenger-chat-copy"><strong>'+esc(member.name||'Minglora member')+'</strong><small>'+esc(isGroup?(conversation.group?.memberCount||0)+' members':preview)+'</small></span>'+(unread?'<span class="messenger-chat-unread">'+(unread>99?'99+':unread)+'</span>':'')+'<span class="messenger-chat-row-actions">'+action+'</span></article>';
}
function bindMessengerConversationRows(list,section){
  list.querySelectorAll('[data-messenger-open]').forEach(row=>{
    const open=()=>{const conversation=state.conversations.find(item=>item.user.id===row.dataset.messengerOpen);if(conversation)openMessageWindow(conversation.user,{groupId:conversation.groupId});};
    row.onclick=event=>{if(event.target.closest('button'))return;open();};
    row.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){event.preventDefault();open();}};
  });
  list.querySelectorAll('[data-messenger-archive]').forEach(button=>button.onclick=event=>{event.stopPropagation();updateMessengerAccountList('messengerArchivedConversationIds',button.dataset.messengerArchive,true);});
  list.querySelectorAll('[data-messenger-unarchive]').forEach(button=>button.onclick=event=>{event.stopPropagation();updateMessengerAccountList('messengerArchivedConversationIds',button.dataset.messengerUnarchive,false);});
  list.querySelectorAll('[data-messenger-restrict]').forEach(button=>button.onclick=event=>{event.stopPropagation();updateMessengerAccountList('messengerRestrictedUserIds',button.dataset.messengerRestrict,true);});
  list.querySelectorAll('[data-messenger-unrestrict]').forEach(button=>button.onclick=event=>{event.stopPropagation();updateMessengerAccountList('messengerRestrictedUserIds',button.dataset.messengerUnrestrict,false);});
}
async function updateMessengerAccountList(key,id,add){
  const current=Array.isArray(messengerPreferences()[key])?messengerPreferences()[key]:[];
  const next=add?[...new Set([...current,id])]:current.filter(value=>value!==id);
  await saveMessengerPreference(key,next);
  renderMessengerPanelList();
}
async function saveMessengerPreference(key,value){
  const currentSettings=state.settings||{privacy:{},notifications:{},preferences:{}};
  const previous=currentSettings.preferences?.[key];
  state.settings={...currentSettings,preferences:{...(currentSettings.preferences||{}),[key]:value}};
  renderMessengerPanel();
  try{
    const result=await api('/settings',{method:'PATCH',body:JSON.stringify({preferences:{[key]:value}})});
    state.settings=result.settings;
    window.dispatchEvent(new CustomEvent('minglora:settings-loaded',{detail:result.settings}));
    renderMessengerPanel();
    toast('Messenger setting saved.');
  }catch(error){
    state.settings={...currentSettings,preferences:{...(currentSettings.preferences||{}),[key]:previous}};
    renderMessengerPanel();
    toast('Could not save Messenger setting: '+error.message);
  }
}
async function openMessengerDestination(destination){
  const messengerViews=['requests','archived','restricted'];
  if(messengerViews.includes(destination)){
    state.messengerPanelSection=destination;state.messengerComposeMode=false;state.messengerSearch='';
    const search=$('#messenger-search-input');if(search)search.value='';
    state.messengerOptionsOpen=false;$('#messenger-options-menu')?.classList.add('hidden');
    renderMessengerPanelList();return;
  }
  const settingsRoutes={
    privacy:{section:'#settings-privacy'},
    delivery:{section:'#settings-privacy',focus:'[name="messageAudience"]'},
    blocking:{section:'#settings-blocking'}
  };
  const route=settingsRoutes[destination];
  if(!route){toast('That Messenger destination is not available.');return;}
  closeMessengerPanel();
  const open=window.MingloraSettings?.open;
  if(typeof open!=='function'){toast('Settings are not available right now.');return;}
  try{
    await open();
    const target=$(route.section);
    if(!target){toast('The requested settings section could not be opened.');return;}
    target.scrollIntoView({behavior:'smooth',block:'start'});
    if(route.focus)target.querySelector(route.focus)?.focus();
  }catch(error){toast(error.message||'Could not open Messenger settings.');}
}
async function renderMessages(){
  activateSilent('messages');
  const messageData=await api('/messages');
  state.conversations=messageData.conversations||[];
  paintMessengerBadge(state.conversations);
  const archivedIds=new Set(messengerPreferences().messengerArchivedConversationIds||[]);
  const visibleConversations=state.conversations.filter(conversation=>!archivedIds.has(conversation.user.id));
  const conversationRows=visibleConversations.length?visibleConversations.map(conversation=>{
    const last=conversation.messages.at(-1),preview=last?.text||((last?.attachments||[]).length?'Attachment':last?.gifUrl?'GIF':'Open chat');
    return '<div class="inbox-person-row" data-inbox-peer="'+esc(conversation.user.id)+'"><img class="avatar" src="'+avatar(conversation.user)+'" alt=""><div class="person-meta"><strong>'+esc(conversation.user.name)+'</strong><small>'+esc(preview)+'</small>'+(conversation.unreadCount?'<span class="inbox-unread-badge">'+conversation.unreadCount+'</span>':'')+'</div><div class="message-inbox-row-actions"><button class="secondary" type="button" data-open-inbox-chat="'+esc(conversation.user.id)+'">Open</button><button class="secondary" type="button" data-remove-inbox-chat="'+esc(conversation.user.id)+'">Remove</button></div></div>';
  }).join(''):'<div class="message-inbox-empty"><div class="empty-icon">'+messenger3dIcon('messages')+'</div><h3>No conversations yet</h3><p>Open another member’s profile and select Message to start a private chat.</p></div>';
  setContent('<div class="page-heading"><div><h1>Messenger</h1><p class="muted">Private conversations from your Minglora account, shared across your signed-in devices.</p></div><span class="eyebrow">'+visibleConversations.length+' conversations</span></div><section class="card"><div class="inbox-people-list">'+conversationRows+'</div></section>');
  document.querySelectorAll('[data-open-inbox-chat]').forEach(button=>button.onclick=()=>{
    const conversation=state.conversations.find(item=>item.user.id===button.dataset.openInboxChat);
    if(conversation)openMessageWindow(conversation.user);
  });
  document.querySelectorAll('[data-remove-inbox-chat]').forEach(button=>button.onclick=()=>removeMessageConversation(button.dataset.removeInboxChat));
  renderMessageWindows();
}

function stopCallTone(){
 if(callToneTimer){clearInterval(callToneTimer);callToneTimer=null;}
 if(callRingtoneAudio){callRingtoneAudio.pause();callRingtoneAudio.currentTime=0;callRingtoneAudio=null;}
 for(const node of callToneNodes){try{node.stop?.();node.disconnect?.();}catch{}}
 callToneNodes=[];
}
function playCallTone(frequencies,durationMs=900){
 primeCallAudio();if(!callToneContext||callToneContext.state!=='running')return false;
 const start=callToneContext.currentTime;
 for(const frequency of frequencies){
  const oscillator=callToneContext.createOscillator(),gain=callToneContext.createGain();
  oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(.12,start+.035);gain.gain.setValueAtTime(.12,start+Math.max(.05,durationMs/1000-.08));
  gain.gain.linearRampToValueAtTime(0,start+durationMs/1000);oscillator.connect(gain);gain.connect(callToneContext.destination);
  oscillator.start(start);oscillator.stop(start+durationMs/1000+.02);callToneNodes.push(oscillator,gain);
  oscillator.onended=()=>{try{oscillator.disconnect();gain.disconnect();}catch{}};
 }
 return true;
}
function startCallRingback(){stopCallTone();const pulse=()=>playCallTone([440,480],1850);setTimeout(pulse,120);callToneTimer=setInterval(pulse,6000);}
async function getCallRingtone(force=false){
 if(!force&&Date.now()-callRingtoneCache.loadedAt<300000)return callRingtoneCache.ringtone;
 try{const result=await api('/calls/ringtone');callRingtoneCache={loadedAt:Date.now(),ringtone:result.ringtone||null};}
 catch{callRingtoneCache={loadedAt:Date.now(),ringtone:null};}
 return callRingtoneCache.ringtone;
}
async function startIncomingRingtone(){
 if(state.settings?.preferences?.messengerIncomingCallSounds===false){stopCallTone();return false;}
 stopCallTone();const ringtone=await getCallRingtone();
 if(ringtone?.url){try{const audio=new Audio(ringtone.url);audio.loop=true;audio.preload='auto';audio.volume=.9;callRingtoneAudio=audio;await audio.play();return true;}catch{callRingtoneAudio=null;}}
 const started=playCallTone([440,480,620],950);callToneTimer=setInterval(()=>playCallTone([440,480,620],950),3000);return started;
}
function closeIncomingCallOverlay(){if(incomingCallStatusTimer){clearInterval(incomingCallStatusTimer);incomingCallStatusTimer=null;}if(incomingCallOverlay){incomingCallOverlay.remove();incomingCallOverlay=null;}stopCallTone();}
function closeOutgoingCallOverlay(){if(outgoingCallOverlay){outgoingCallOverlay.remove();outgoingCallOverlay=null;}stopCallTone();}
async function showIncomingCallOverlay(call){
 if(!call?.id||activeCallRoom||incomingCallOverlay?.dataset.callId===call.id)return;
 if(incomingCallOverlay)closeIncomingCallOverlay();
 const caller=call.caller||{},label=call.kind==='audio'?'Voice call':'Video call',overlay=document.createElement('div');
 overlay.className='call-overlay call-ringing-overlay';overlay.dataset.callId=call.id;
 overlay.innerHTML='<section class="call-ringing-card" role="dialog" aria-modal="true" aria-label="Incoming '+label.toLowerCase()+'"><div class="call-ringing-glow"></div><div class="call-ringing-avatar-wrap"><img class="call-ringing-avatar" src="'+esc(avatar(caller))+'" alt=""><span class="call-ringing-pulse"></span></div><span class="call-ringing-eyebrow">INCOMING MINGLORA CALL</span><h2>'+esc(caller.name||'Minglora member')+'</h2><p class="call-ringing-kind">'+label+'</p><p class="call-ringing-status">Your phone is ringing</p><div class="call-ringing-actions"><button type="button" class="call-answer-button" id="call-answer-incoming">Answer</button><button type="button" class="call-decline-button" id="call-decline-incoming">Decline</button></div><button type="button" class="call-enable-sound hidden" id="call-enable-ringtone">Tap to enable ringtone</button></section>';
 document.body.append(overlay);incomingCallOverlay=overlay;
 overlay.querySelector('#call-answer-incoming').onclick=async()=>{overlay.querySelector('#call-answer-incoming').disabled=true;closeIncomingCallOverlay();await answerMingloraCall(call.id);};
 overlay.querySelector('#call-decline-incoming').onclick=async()=>{overlay.querySelector('#call-decline-incoming').disabled=true;await declineMingloraCall(call.id);};
 overlay.querySelector('#call-enable-ringtone').onclick=async()=>{primeCallAudio();const ok=await startIncomingRingtone();if(ok)overlay.querySelector('#call-enable-ringtone').classList.add('hidden');};
 if(state.settings?.preferences?.messengerIncomingCallSounds!==false&&!await startIncomingRingtone())overlay.querySelector('#call-enable-ringtone').classList.remove('hidden');
 incomingCallStatusTimer=setInterval(async()=>{try{const s=await api('/calls/'+encodeURIComponent(call.id)+'/status');if(s.participantStatus!=='invited'||!['ringing','active'].includes(s.call.status))closeIncomingCallOverlay();}catch{closeIncomingCallOverlay();}},1600);
}
async function clearStaleMingloraCallNotifications(activeCallIds=[]){
 try{
  const registration=await navigator.serviceWorker?.getRegistration?.();
  if(!registration?.getNotifications)return;
  const valid=new Set(activeCallIds.map(String));
  const notifications=await registration.getNotifications();
  notifications.forEach(notification=>{
   const data=notification.data||{};
   if(data.type==='call'&&(!data.callId||!valid.has(String(data.callId))))notification.close();
  });
 }catch{}
}
async function pollIncomingCalls(){
 if(!state.user||incomingCallPollBusy||activeCallRoom||outgoingCallPending)return;
 incomingCallPollBusy=true;
 try{
  const result=await api('/calls/incoming'),calls=result.calls||[];
  await clearStaleMingloraCallNotifications(calls.map(call=>call.id));
  const call=calls[0];
  if(call&&!incomingCallOverlay)await showIncomingCallOverlay(call);
  else if(!call&&incomingCallOverlay)closeIncomingCallOverlay();
 }
 catch{}finally{incomingCallPollBusy=false;}
}
function startIncomingCallPolling(){if(incomingCallPollingTimer)clearInterval(incomingCallPollingTimer);incomingCallPollingTimer=null;if(!state.user)return;void pollIncomingCalls();incomingCallPollingTimer=setInterval(pollIncomingCalls,1800);}
function showOutgoingCallOverlay(member,call){
 closeIncomingCallOverlay();const overlay=document.createElement('div');overlay.className='call-overlay call-ringing-overlay call-outgoing-overlay';
 overlay.innerHTML='<section class="call-ringing-card" role="dialog" aria-modal="true" aria-label="Calling '+esc(member.name||'member')+'"><div class="call-ringing-glow"></div><div class="call-ringing-avatar-wrap"><img class="call-ringing-avatar" src="'+esc(avatar(member))+'" alt=""><span class="call-ringing-pulse"></span></div><span class="call-ringing-eyebrow">MINGLORA CALL</span><h2>'+esc(member.name||'Minglora member')+'</h2><p class="call-ringing-kind">'+(call.kind==='audio'?'Voice call':'Video call')+'</p><p class="call-ringing-status">Ringing…</p><button type="button" class="call-decline-button" id="call-cancel-outgoing">Cancel call</button></section>';
 document.body.append(overlay);outgoingCallOverlay=overlay;
 overlay.querySelector('#call-cancel-outgoing').onclick=async()=>{overlay.querySelector('#call-cancel-outgoing').disabled=true;if(outgoingCallPending)outgoingCallPending.cancelled=true;try{await api('/calls/'+encodeURIComponent(call.id)+'/cancel',{method:'POST',body:'{}'});}catch(e){toast(e.message);}closeOutgoingCallOverlay();outgoingCallPending=null;};
}
async function waitForCallAnswer(call,member){
 showOutgoingCallOverlay(member,call);startCallRingback();outgoingCallPending={callId:call.id,cancelled:false,starting:false};
 const deadline=Date.parse(call.ringExpiresAt||'')||Date.now()+45000;
 while(outgoingCallPending&&!outgoingCallPending.cancelled&&Date.now()<deadline){
  let response;try{response=await api('/calls/'+encodeURIComponent(call.id)+'/status');}catch(e){await api('/calls/'+encodeURIComponent(call.id)+'/cancel',{method:'POST',body:'{}'}).catch(()=>{});closeOutgoingCallOverlay();outgoingCallPending=null;toast(e.message);return;}
  const status=response.call?.status;
  if(status==='active'){
   closeOutgoingCallOverlay();outgoingCallPending=null;
   try{const joined=await api('/calls/'+encodeURIComponent(call.id)+'/join',{method:'POST',body:'{}'});await clearStaleMingloraCallNotifications([]);await openMingloraCall(joined.call,joined.liveKit);}catch(e){toast(e.message);}return;
  }
  if(['declined','missed','cancelled','ended'].includes(status)){closeOutgoingCallOverlay();outgoingCallPending=null;toast(status==='missed'?'No answer. The call was missed.':status==='declined'?'The call was declined.':'The call ended.');return;}
  await new Promise(resolve=>setTimeout(resolve,1300));
 }
 if(outgoingCallPending&&!outgoingCallPending.cancelled){try{await api('/calls/'+encodeURIComponent(call.id)+'/status');}catch{}closeOutgoingCallOverlay();outgoingCallPending=null;toast('No answer. The call has ended.');}
}
function openMingloraGroupCallPicker(conversation,kind){
 const candidates=(conversation.group?.members||[]).filter(member=>member.id&&member.id!==state.user.id);
 const modal=document.createElement('div');modal.className='modal-backdrop';
 modal.innerHTML='<section class="modal message-group-call-picker" role="dialog" aria-modal="true" aria-labelledby="message-group-call-title"><div class="modal-head"><div><h2 id="message-group-call-title">Start group '+(kind==='audio'?'voice':'video')+' call</h2><small>Select up to seven people to ring. You can invite more people while in the call.</small></div><button class="modal-close" type="button" aria-label="Close">×</button></div><form class="modal-body"><div class="message-group-call-members">'+candidates.map(member=>'<label class="message-group-call-member"><input type="checkbox" name="participantIds" value="'+esc(member.id)+'"><img src="'+avatar(member.user||{})+'" alt=""><span><strong>'+esc(member.user?.name||'Minglora member')+'</strong><small>@'+esc(member.user?.username||'member')+'</small></span></label>').join('')+'</div><p class="muted" data-call-selection-count>0 of 7 selected</p><p class="auth-error" role="status"></p><div class="modal-actions"><button type="button" class="secondary" data-call-picker-cancel>Cancel</button><button type="submit" class="primary" disabled>Start call</button></div></form></section>';
 document.body.append(modal);
 const close=()=>modal.remove(),form=modal.querySelector('form'),submit=form.querySelector('button[type="submit"]'),status=form.querySelector('.auth-error'),count=form.querySelector('[data-call-selection-count]');
 modal.querySelectorAll('.modal-close,[data-call-picker-cancel]').forEach(button=>button.addEventListener('click',close));
 modal.addEventListener('click',event=>{if(event.target===modal)close();});
 const update=()=>{
   const selected=[...form.querySelectorAll('input[name="participantIds"]:checked')];
   const full=selected.length>=7;
   form.querySelectorAll('input[name="participantIds"]').forEach(input=>{input.disabled=!input.checked&&full;});
   count.textContent=selected.length+' of 7 selected';
   submit.disabled=selected.length===0;
 };
 form.querySelectorAll('input[name="participantIds"]').forEach(input=>input.addEventListener('change',update));
 form.addEventListener('submit',async event=>{
   event.preventDefault();
   const ids=[...form.querySelectorAll('input[name="participantIds"]:checked')].map(input=>input.value);
   if(!ids.length||ids.length>7)return;
   submit.disabled=true;status.textContent='Starting call…';
   close();
   await startMingloraCall({id:conversation.user.id,name:conversation.group.name+' group call',avatar:conversation.user.avatar||''},kind,ids,conversation.group.id);
 });
}
async function startMingloraCall(member,kind='video',participantIds=null,groupId=null){
 if(!member?.id||!state.user||member.id===state.user.id)return;
 if(activeCallRoom||outgoingCallPending){toast('Finish or cancel your current call before starting another.');return;}
 // Reserve the outgoing state before the network request so a fast double tap
 // cannot create two simultaneous calls from the same device.
 outgoingCallPending={callId:null,cancelled:false,starting:true};
 try{
  primeCallAudio();
  const callPayload=Array.isArray(participantIds)&&participantIds.length?{participantIds,kind,...(groupId?{groupId}:{})}:{to:member.id,kind};
  const created=await api('/calls',{method:'POST',body:JSON.stringify(callPayload)});
  if(outgoingCallPending?.cancelled){
   await api('/calls/'+encodeURIComponent(created.call.id)+'/cancel',{method:'POST',body:'{}'}).catch(()=>{});
   outgoingCallPending=null;return;
  }
  await waitForCallAnswer(created.call,member);
 }catch(e){closeOutgoingCallOverlay();outgoingCallPending=null;toast(e.message);}
}
async function answerMingloraCall(callId){
 if(activeCallRoom||outgoingCallPending){toast('Finish or cancel your current call before answering another call.');return;}
 try{closeIncomingCallOverlay();const joined=await api('/calls/'+encodeURIComponent(callId)+'/join',{method:'POST',body:'{}'});await clearStaleMingloraCallNotifications([]);await openMingloraCall(joined.call,joined.liveKit);}
 catch(e){toast(e.message);void pollIncomingCalls();}
}
async function declineMingloraCall(callId){
 try{await api('/calls/'+encodeURIComponent(callId)+'/decline',{method:'POST',body:'{}'});if(incomingCallOverlay?.dataset.callId===callId)closeIncomingCallOverlay();toast('Call declined.');await renderNotifications();}
 catch(e){toast(e.message);}
}
async function openMingloraCall(call,liveKit){
  closeIncomingCallOverlay();closeOutgoingCallOverlay();
  if(activeCallRoom){toast('A call is already open.');return;}
  const client=window.LivekitClient;
  if(!client?.Room||!client?.RoomEvent){
    const action=call.createdBy===state.user.id?'end':'leave';
    await api('/calls/'+encodeURIComponent(call.id)+'/'+action,{method:'POST',body:'{}'}).catch(()=>{});
    toast('The call player could not load. Check your connection and try again.');return;
  }
  const overlay=document.createElement('div');overlay.className='call-overlay';
  overlay.innerHTML='<section class="call-panel" role="dialog" aria-modal="true" aria-label="Minglora call"><header class="call-panel-header"><div><strong>'+esc(call.kind==='audio'?'Voice call':'Video call')+'</strong><span id="call-connection-status">Connecting…</span></div><span id="call-participant-count">1 in call</span></header><div class="call-video-stage" id="call-video-stage"><div class="call-empty-stage">Connecting to secure call…</div></div><div id="call-audio-root" class="call-audio-root"></div><footer class="call-controls"><button type="button" class="secondary" id="call-microphone">Mute microphone</button><button type="button" class="secondary" id="call-camera">'+(call.kind==='video'?'Turn camera off':'Turn video on')+'</button><button type="button" class="secondary" id="call-add-people">Add people</button><button type="button" class="danger" id="call-leave">'+(call.createdBy===state.user.id?'End call for everyone':'Leave call')+'</button></footer></section>';
  document.body.append(overlay);activeCallOverlay=overlay;
  const room=new client.Room({adaptiveStream:true,dynacast:true});activeCallRoom=room;
  let microphoneEnabled=true,cameraEnabled=call.kind==='video',intentionallyLeaving=false;
  const status=overlay.querySelector('#call-connection-status'),count=overlay.querySelector('#call-participant-count'),stage=overlay.querySelector('#call-video-stage');
  const attach=(track,participant,local=false)=>{
    if(!track)return;
    const element=track.attach();
    if(track.kind==='video'){element.autoplay=true;element.playsInline=true;element.className='call-video-element';if(local)element.muted=true;element.dataset.identity=participant?.identity||'local';stage.querySelector('.call-empty-stage')?.remove();stage.append(element);}
    else{element.autoplay=true;element.playsInline=true;element.className='call-audio-element';overlay.querySelector('#call-audio-root').append(element);}
  };
  const updateCount=()=>{count.textContent=(Number(room.remoteParticipants?.size||0)+1)+' in call';};
  room.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>attach(track,participant,false));
  room.on(client.RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(element=>element.remove()));
  room.on(client.RoomEvent.ParticipantConnected,updateCount);
  room.on(client.RoomEvent.ParticipantDisconnected,updateCount);
  const closeOverlay=()=>{if(activeCallOverlay===overlay)activeCallOverlay=null;overlay.remove();};
  overlay.querySelector('#call-leave').onclick=async()=>{
    const button=overlay.querySelector('#call-leave');button.disabled=true;
    try{
      const action=call.createdBy===state.user.id?'end':'leave';
      await api('/calls/'+encodeURIComponent(call.id)+'/'+action,{method:'POST',body:'{}'});
      intentionallyLeaving=true;
    }catch(error){toast(error.message);}
    await room.disconnect();if(activeCallRoom===room)activeCallRoom=null;closeOverlay();
  };
  overlay.querySelector('#call-microphone').onclick=async()=>{
    try{microphoneEnabled=!microphoneEnabled;await room.localParticipant.setMicrophoneEnabled(microphoneEnabled);overlay.querySelector('#call-microphone').textContent=microphoneEnabled?'Mute microphone':'Unmute microphone';}
    catch(error){toast(error.message);}
  };
  overlay.querySelector('#call-camera').onclick=async()=>{
    try{cameraEnabled=!cameraEnabled;await room.localParticipant.setCameraEnabled(cameraEnabled);overlay.querySelector('#call-camera').textContent=cameraEnabled?'Turn camera off':'Turn video on';}
    catch(error){cameraEnabled=!cameraEnabled;toast(error.message);}
  };
  overlay.querySelector('#call-add-people').onclick=async()=>{
    try{
      const visible=(await api('/users')).users||[];
      const usernames=window.prompt('Enter usernames to add, separated by commas. Up to six people can be invited.');
      if(!usernames)return;
      const wanted=usernames.split(',').map(value=>value.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
      const userIds=visible.filter(member=>wanted.includes(String(member.username||'').toLowerCase())).map(member=>member.id);
      if(!userIds.length){toast('No matching members were found.');return;}
      const result=await api('/calls/'+encodeURIComponent(call.id)+'/invite',{method:'POST',body:JSON.stringify({userIds})});
      toast(result.count+' call invitation(s) sent.');
    }catch(error){toast(error.message);}
  };
  room.on(client.RoomEvent.Disconnected,()=>{
    if(activeCallRoom===room){
      activeCallRoom=null;closeOverlay();
      if(!intentionallyLeaving){
        const action=call.createdBy===state.user.id?'end':'leave';
        void api('/calls/'+encodeURIComponent(call.id)+'/'+action,{method:'POST',body:'{}'}).catch(error=>console.warn('Could not update call state after disconnect:',error.message));
        toast('The call connection ended.');
      }
    }
  });
  try{
    status.textContent='Connecting securely…';
    let timeout;
    try{await Promise.race([room.connect(liveKit.url,liveKit.token),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Could not connect to the call. Check your LiveKit server URL and network connection.')),20000);})]);}
    finally{if(timeout)clearTimeout(timeout);}
    status.textContent='Connected';
    await room.localParticipant.setMicrophoneEnabled(true);
    if(cameraEnabled)await room.localParticipant.setCameraEnabled(true);
    for(const publication of room.localParticipant.videoTrackPublications.values())if(publication.track)attach(publication.track,room.localParticipant,true);
    updateCount();
    overlay.querySelector('#call-microphone').disabled=false;
    overlay.querySelector('#call-camera').disabled=false;
  }catch(error){
    intentionallyLeaving=true;
    await room.disconnect().catch(()=>{});
    if(activeCallRoom===room)activeCallRoom=null;closeOverlay();toast(error.message||'The call could not connect.');
    if(call.createdBy===state.user.id)await api('/calls/'+encodeURIComponent(call.id)+'/end',{method:'POST',body:'{}'}).catch(()=>{});
    else await api('/calls/'+encodeURIComponent(call.id)+'/leave',{method:'POST',body:'{}'}).catch(()=>{});
  }
}
function notificationCategoryFor(item){
  const type=item?.type||'';
  if(['friend','reaction','comment','follow','profile_view'].includes(type))return 'social';
  if(type==='message')return 'messages';
  if(type==='call')return 'calls';
  if(['live','live_moderator'].includes(type))return 'live';
  if(['gift','fan_club'].includes(type))return 'gifts';
  if(type==='meetwave_invite')return 'meetWave';
  if(type==='league_match')return 'leagues';
  return 'other';
}
function notificationCategoryLabel(category){
  return ({social:'Social',messages:'Messages',calls:'Calls',live:'Minglora LIVE',gifts:'Gifts & Fan Club',meetWave:'MeetWave',leagues:'League matches',other:'Account & other'})[category]||'Notification';
}
function notificationCategoryIcon(item){
  return ({friend:'♧',reaction:'♡',comment:'▤',follow:'＋',profile_view:'◉',message:'✉',call:'☎',live:'●',live_moderator:'◆',gift:'🎁',fan_club:'★',meetwave_invite:'◈',league_match:'🏆'})[item?.type]||'◆';
}
function notificationMatchesFilter(item,filter){
  return filter==='all'||(filter==='unread'?!item.read:notificationCategoryFor(item)===filter);
}
async function markNotificationInCenter(id){
  await api('/notifications/'+encodeURIComponent(id)+'/read',{method:'POST',body:'{}'});
  const item=state.notifications.find(notification=>notification.id===id);
  if(item){item.read=true;item.readAt=new Date().toISOString();}
}
async function renderNotifications(){
  state.view='notifications';syncNavigationActive();persistCurrentView();recordBrowserNavigation();
  const response=await api('/notifications');
  state.notifications=Array.isArray(response.notifications)?response.notifications:[];
  const notifications=state.notifications;
  const unreadCount=notifications.filter(item=>!item.read).length;
  const readCount=notifications.length-unreadCount;
  const categoryCounts=response.categoryCounts||{};
  const filters=[
    ['all','All'],['unread','Unread'],['social','Social'],['messages','Messages'],
    ['calls','Calls'],['live','LIVE'],['gifts','Gifts'],['meetWave','MeetWave'],
    ['leagues','Leagues'],['other','Other']
  ];
  if(!filters.some(([key])=>key===notificationFilter))notificationFilter='all';
  const filterButtons=filters.map(([key,label])=>{
    const count=Number(categoryCounts[key]??(key==='all'?notifications.length:key==='unread'?unreadCount:notifications.filter(item=>notificationMatchesFilter(item,key)).length));
    return '<button type="button" class="notification-filter '+(notificationFilter===key?'active':'')+'" data-notice-filter="'+key+'" aria-pressed="'+(notificationFilter===key?'true':'false')+'"><span>'+label+'</span><b>'+count+'</b></button>';
  }).join('');
  const searchTerm=notificationSearch.trim().toLowerCase();
  const filtered=notifications.filter(item=>notificationMatchesFilter(item,notificationFilter)&&(!searchTerm||String(item.text||'').toLowerCase().includes(searchTerm)||String(item.actor?.name||'').toLowerCase().includes(searchTerm)||String(item.type||'').toLowerCase().includes(searchTerm)));
  const rows=filtered.map(item=>{
    const category=notificationCategoryFor(item);
    const actor=item.actor;
    const actorMarkup=actor
      ? '<img class="notification-avatar-image" data-profile="'+esc(actor.id||'')+'" src="'+esc(avatar(actor))+'" alt="Open '+esc(actor.name||'Minglora member')+'’s profile">'
      : '<span class="notification-avatar-fallback" aria-hidden="true">'+notificationCategoryIcon(item)+'</span>';
    const verified=actor?.verificationBadge==='blue'?'<span class="notification-verified" title="Minglora Verified" aria-label="Minglora Verified">✓</span>':'';
    let actions='';
    if(item.type==='call'&&item.callId){
      actions='<button type="button" class="primary" data-notice-answer="'+esc(item.id)+'" data-call-id="'+esc(item.callId)+'">Answer</button><button type="button" class="secondary" data-notice-decline="'+esc(item.id)+'" data-call-id="'+esc(item.callId)+'">Decline</button>';
    }else if(item.type==='live'&&item.liveSessionId){
      actions='<button type="button" class="secondary" data-notice-watch="'+esc(item.id)+'" data-live-id="'+esc(item.liveSessionId)+'">Watch LIVE</button>';
    }else if(item.type==='message'&&actor?.id){
      actions='<button type="button" class="secondary" data-notice-message="'+esc(item.id)+'" data-actor-id="'+esc(actor.id)+'">Open Messenger</button>';
    }else if(item.type==='league_match'){
      actions='<button type="button" class="secondary" data-notice-leagues="'+esc(item.id)+'">View matches</button>';
    }else if(item.type==='gift'||item.type==='fan_club'){
      actions='<button type="button" class="secondary" data-notice-gifts="'+esc(item.id)+'">Open Gifts</button>';
    }else if(item.type==='meetwave_invite'){
      actions='<button type="button" class="secondary" data-notice-meetwave="'+esc(item.id)+'">Open MeetWave</button>';
    }else if(actor?.id){
      actions='<button type="button" class="secondary" data-notice-profile="'+esc(item.id)+'" data-actor-id="'+esc(actor.id)+'"'+(item.type==='profile_view'?' data-profile-view-actor="'+esc(actor.id)+'"':'')+'>View profile</button>';
    }
    return '<article class="notification-card '+(item.read?'is-read':'is-unread')+'" data-notification-card="'+esc(item.id)+'" data-search="'+esc([item.text,actor?.name,item.type].filter(Boolean).join(' ').toLowerCase())+'">'+
      '<div class="notification-person">'+actorMarkup+verified+'</div>'+
      '<div class="notification-main"><div class="notification-meta"><span class="notification-category">'+notificationCategoryLabel(category)+'</span><time>'+esc(timeAgo(item.createdAt))+'</time></div>'+
      '<p class="notification-copy">'+esc(item.text||'You have a new Minglora notification.')+'</p>'+
      '<div class="notification-state"><span class="notification-state-dot"></span>'+ (item.read?'Read':'Unread') +'</div>'+
      (actions?'<div class="notification-actions">'+actions+'</div>':'')+
      '</div><div class="notification-tools">'+
      (item.read?'':'<button type="button" class="notification-tool" data-notice-read="'+esc(item.id)+'" aria-label="Mark notification as read" title="Mark as read">✓</button>')+
      '<button type="button" class="notification-tool delete" data-notice-delete="'+esc(item.id)+'" aria-label="Delete notification" title="Delete notification">×</button></div></article>';
  }).join('');
  const emptyMessage=notifications.length?'No notifications match this filter.':'You are all caught up. New activity will appear here when it happens.';
  setContent('<section class="notification-center">'+
    '<header class="notification-center-header"><div><span class="notification-eyebrow">YOUR ACTIVITY</span><h1>Notifications</h1><p>Stay on top of conversations, community activity, calls, LIVE, gifts and MeetWave.</p></div>'+
    '<div class="notification-header-count"><strong>'+unreadCount+'</strong><span>unread</span></div></header>'+
    '<section class="notification-summary"><div><strong>'+notifications.length+'</strong><span>Total notifications</span></div><div><strong>'+unreadCount+'</strong><span>Unread</span></div><div><strong>'+readCount+'</strong><span>Read</span></div></section>'+
    '<section class="notification-toolbar"><div class="notification-toolbar-heading"><h2>Notification inbox</h2><div class="notification-toolbar-actions">'+
    '<button type="button" class="secondary" id="notification-settings">Settings</button><button type="button" class="secondary" id="enable-browser-alerts">Enable device push</button></div></div>'+
    '<div class="notification-filter-list" role="group" aria-label="Filter notifications">'+filterButtons+'</div>'+
    '<div class="notification-search-row"><label class="notification-search"><span aria-hidden="true">⌕</span><input id="notification-search" type="search" value="'+esc(notificationSearch)+'" placeholder="Search notifications" aria-label="Search notifications"></label>'+
    '<div class="notification-bulk-actions"><button type="button" class="text-button" id="mark-read" '+(unreadCount?'':'disabled')+'>Mark all read</button><button type="button" class="text-button" id="clear-read-notifications" '+(readCount?'':'disabled')+'>Clear read</button><button type="button" class="text-button danger-text" id="clear-all-notifications" '+(notifications.length?'':'disabled')+'>Clear all</button></div></div></section>'+
    '<section class="notification-list" aria-label="Notification list">'+(rows||'<div class="notification-empty"><div class="notification-empty-icon">♢</div><h3>'+emptyMessage+'</h3><p>Choose another category or check back when something new happens.</p></div>')+
    '<p id="notification-search-empty" class="notification-search-empty" hidden>No notifications match your search.</p></section></section>');
  bindProfileLinks($('#main-content'));
  document.querySelectorAll('[data-notice-filter]').forEach(button=>button.addEventListener('click',()=>{notificationFilter=button.dataset.noticeFilter;renderNotifications();}));
  const searchInput=$('#notification-search');
  searchInput?.addEventListener('input',()=>{
    notificationSearch=searchInput.value;
    const term=notificationSearch.trim().toLowerCase();
    let visible=0;
    document.querySelectorAll('[data-notification-card]').forEach(card=>{
      card.hidden=!!term&&!String(card.dataset.search||'').includes(term);
      if(!card.hidden)visible++;
    });
    const empty=$('#notification-search-empty');
    if(empty)empty.hidden=visible>0||!term;
  });
  $('#enable-browser-alerts')?.addEventListener('click',enableMingloraPush);
  $('#notification-settings')?.addEventListener('click',()=>window.MingloraSettings?.open?.());
  document.querySelectorAll('[data-notice-read]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await markNotificationInCenter(button.dataset.noticeRead);await updateNotificationDot();await renderNotifications();}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-notice-delete]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await api('/notifications/'+encodeURIComponent(button.dataset.noticeDelete),{method:'DELETE',body:'{}'});await updateNotificationDot();await renderNotifications();}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-notice-answer]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await markNotificationInCenter(button.dataset.noticeAnswer);await updateNotificationDot();await answerMingloraCall(button.dataset.callId);}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-notice-decline]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await markNotificationInCenter(button.dataset.noticeDecline);await declineMingloraCall(button.dataset.callId);await updateNotificationDot();}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-notice-watch]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await markNotificationInCenter(button.dataset.noticeWatch);const data=await api('/live/sessions');const session=(data.sessions||[]).find(item=>item.id===button.dataset.liveId);if(!session){toast('This LIVE session has ended.');await renderNotifications();return;}await openLiveRoom(session,session.hostId===state.user.id?'host':'viewer');await updateNotificationDot();}
    catch(error){toast(error.message);button.disabled=false;}
  }));
  document.querySelectorAll('[data-notice-message]').forEach(button=>button.addEventListener('click',async()=>{
    const item=notifications.find(value=>value.id===button.dataset.noticeMessage);
    if(!item?.actor)return;
    try{await markNotificationInCenter(item.id);await updateNotificationDot();await openMessageWindow(item.actor);}
    catch(error){toast(error.message);}
  }));
  document.querySelectorAll('[data-notice-profile]').forEach(button=>button.addEventListener('click',async()=>{
    const item=notifications.find(value=>value.id===button.dataset.noticeProfile);
    if(!item?.actor?.id)return;
    try{await markNotificationInCenter(item.id);await updateNotificationDot();await openProfile(item.actor.id);}
    catch(error){toast(error.message);}
  }));
  document.querySelectorAll('[data-notice-gifts]').forEach(button=>button.addEventListener('click',async()=>{
    try{await markNotificationInCenter(button.dataset.noticeGifts);await updateNotificationDot();activateNav('gifts');}
    catch(error){toast(error.message);}
  }));
  document.querySelectorAll('[data-notice-leagues]').forEach(button=>button.addEventListener('click',async()=>{
    try{await markNotificationInCenter(button.dataset.noticeLeagues);await updateNotificationDot();activateNav('leagues');}
    catch(error){toast(error.message);}
  }));
  document.querySelectorAll('[data-notice-meetwave]').forEach(button=>button.addEventListener('click',async()=>{
    try{await markNotificationInCenter(button.dataset.noticeMeetwave);await updateNotificationDot();activateNav('meetwave');}
    catch(error){toast(error.message);}
  }));
  $('#mark-read')?.addEventListener('click',async()=>{
    try{await api('/notifications/read',{method:'POST',body:'{}'});toast('All notifications marked as read.');await updateNotificationDot();await renderNotifications();}
    catch(error){toast(error.message);}
  });
  $('#clear-read-notifications')?.addEventListener('click',async()=>{
    try{const result=await api('/notifications/clear',{method:'POST',body:JSON.stringify({readOnly:true})});toast(result.removed+' read notifications cleared.');await updateNotificationDot();await renderNotifications();}
    catch(error){toast(error.message);}
  });
  $('#clear-all-notifications')?.addEventListener('click',async()=>{
    if(!window.confirm('Delete all notifications from your inbox? This cannot be undone.'))return;
    try{const result=await api('/notifications/clear',{method:'POST',body:JSON.stringify({readOnly:false})});toast(result.removed+' notifications deleted.');await updateNotificationDot();await renderNotifications();}
    catch(error){toast(error.message);}
  });
}
async function pollBrowserNotifications(){
  if(!state.user)return;
  void updateMessengerBadge();
  try{
    const items=(await api('/notifications')).notifications||[];
    paintNotificationBadge(items);
    if(!browserNotificationPrimed){
      browserNotificationSeen=new Set(items.map(item=>item.id));
      browserNotificationPrimed=true;
    }else{
      const fresh=items.filter(item=>!browserNotificationSeen.has(item.id));
      for(const item of fresh){
        browserNotificationSeen.add(item.id);
        if(webPushSubscriptionActive||state.settings?.notifications?.push===false||!('Notification' in window)||Notification.permission!=='granted')continue;
        const title=item.type==='live'?'Minglora LIVE':item.type==='live_moderator'?'LIVE moderator update':item.type==='call'?'Incoming Minglora call':item.type==='profile_view'?'Profile view':item.type==='gift'?'New gift':item.type==='fan_club'?'Fan Club update':item.type==='meetwave_invite'?'MeetWave invitation':item.type==='league_match'?'League match update':item.type==='friend'?'Friend update':item.type==='reaction'?'Post reaction':item.type==='comment'?'New comment':item.type==='follow'?'New follower':item.type==='message'?'New Minglora message':'Minglora account update';
        const notice=new Notification(title,{body:item.text||'You have a new Minglora notification.',tag:'minglora-'+item.id,icon:'/assets/icons/minglora-push.svg'});
        notice.onclick=()=>{window.focus();renderNotifications();notice.close();};
      }
    }
    if(fresh.length&&state.view==='notifications')void renderNotifications();
  }catch{}
}
function startBrowserNotificationPolling(){
  if(browserNotificationTimer){clearInterval(browserNotificationTimer);browserNotificationTimer=null;}
  browserNotificationPrimed=false;browserNotificationSeen=new Set();
}
function paintNotificationBadge(items){
  const unread=(items||[]).filter(item=>!item.read).length;
  const dot=$('#notification-dot');
  if(dot)dot.classList.add('hidden');
  const badge=$('#notification-unread-count');
  if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',unread===0);}
  $('#notifications-btn')?.setAttribute('aria-label',unread?'Notifications, '+unread+' unread':'Notifications');
}
async function updateNotificationDot(){try{const result=await api('/notifications');paintNotificationBadge(result.notifications||[]);void updateMessengerBadge();}catch{}}
async function renderSearch(q){
  state.searchQuery=String(q||'').trim();
  activateSilent('search');
  const data=await api('/search?q='+encodeURIComponent(q));
  state.searchResults=data;
  const people=data.users||[],posts=data.posts||[],groups=data.groups||[],pages=data.pages||[];
  const section=(title,count,content)=>count?'<section class="card search-category"><header class="search-category-heading"><h2>'+esc(title)+'</h2><span>'+count+'</span></header>'+content+'</section>':'';
  const peopleHtml=people.length?'<div class="suggested-list">'+people.map(member=>'<div class="person-row"><img class="avatar" data-profile="'+esc(member.id)+'" alt="View '+esc(member.name)+'’s profile" src="'+avatar(member)+'"><div class="person-meta"><strong data-profile="'+esc(member.id)+'">'+esc(member.name)+'</strong><small>@'+esc(member.username)+' '+verifiedProfileBadge(member)+'</small></div><button class="mini-btn" data-profile="'+esc(member.id)+'">View</button></div>').join('')+'</div>':'';
  const postsHtml=posts.map(post=>postCard(post)).join('');
  const groupsHtml=groups.length?'<div class="search-result-list">'+groups.map(group=>'<article class="search-result-row"><div class="search-result-symbol">◉</div><div class="search-result-copy"><strong>'+esc(group.name)+'</strong><small>'+esc(group.description||'Community')+' · '+Number(group.memberCount||0)+' members</small></div><button class="mini-btn" data-open-group="'+esc(group.id)+'">Open</button></article>').join('')+'</div>':'';
  const pagesHtml=pages.length?'<div class="search-result-list">'+pages.map(page=>'<article class="search-result-row"><div class="page-card-mark">'+esc(String(page.title||'P').slice(0,1).toUpperCase())+'</div><div class="search-result-copy"><strong>'+esc(page.title)+'</strong><small>@'+esc(page.handle)+' · '+Number(page.followerCount||0)+' followers</small></div><button class="mini-btn" data-open-page="'+esc(page.id)+'">Open</button></article>').join('')+'</div>':'';
  const sections=[section('People',people.length,peopleHtml),section('Posts',posts.length,postsHtml),section('Groups',groups.length,groupsHtml),section('Pages',pages.length,pagesHtml)].join('');
  setContent('<div class="page-heading"><h1>Search results</h1><p class="muted">Discover people, conversations and communities.</p></div>'+(sections||'<section class="card empty-state"><h3>No results found</h3><p>Try another name, username, topic or community.</p></section>'));
  bindFeed();
  document.querySelectorAll('[data-open-group]').forEach(button=>button.addEventListener('click',()=>renderGroup(button.dataset.openGroup)));
  document.querySelectorAll('[data-open-page]').forEach(button=>button.addEventListener('click',()=>renderPage(button.dataset.openPage)));
}
function renderMoreHub(){
  const sections=[
    {title:'Connect & community',items:[
      {label:'MeetWave',detail:'Voice and video conversations',view:'meetwave',icon:messenger3dIcon('meetwave','mobile-hub-icon')},
      {label:'Friends',detail:'People you connect with',view:'friends',icon:messenger3dIcon('friends','mobile-hub-icon')},
      {label:'Groups',detail:'Communities and discussions',view:'groups',icon:messenger3dIcon('groups','mobile-hub-icon')},
      {label:'Pages',detail:'Public profiles and pages',view:'pages',icon:messenger3dIcon('pages','mobile-hub-icon')},
      {label:'Saved posts',detail:'Things you saved for later',view:'saved',icon:messenger3dIcon('saved','mobile-hub-icon')}
    ]},
    {title:'Creator & competition',items:[
      {label:'Creator Studio',detail:'Manage your creator activity',view:'creator',icon:messenger3dIcon('creator','mobile-hub-icon')},
      {label:'Leagues',detail:'Matches, rankings and rewards',view:'leagues',icon:'<span class="mobile-hub-emoji" aria-hidden="true">🏆</span>'},
      {label:'Gifts',detail:'Browse and send member gifts',view:'gifts',icon:'<span class="mobile-hub-emoji" aria-hidden="true">🎁</span>'},
      {label:'Gifters Level',detail:'Track your LV, Coins and badge collection',view:'gifter-progression',icon:'<span class="mobile-hub-emoji" aria-hidden="true">🏅</span>'},
      {label:'Recharge',detail:'Buy Coins or exchange available money balance for Minglora Coins',view:'coins',icon:messenger3dIcon('recharge','mobile-hub-icon')}
    ]},
    {title:'Your account',items:[
      {label:'My profile',detail:'View and update your profile',action:'profile',icon:'<span class="mobile-hub-emoji" aria-hidden="true">👤</span>'},
      {label:'Notifications',detail:'See your recent activity',action:'notifications',icon:messenger3dIcon('activity','mobile-hub-icon')},
      {label:'Settings & privacy',detail:'Account, safety and preferences',action:'settings',icon:messenger3dIcon('settings','mobile-hub-icon')},
      {label:'Appearance & themes',detail:'Change the Minglora look',action:'themes',icon:messenger3dIcon('palette','mobile-hub-icon')}
    ]}
  ];
  const sectionMarkup=sections.map(section=>'<section class="mobile-hub-section"><h2>'+section.title+'</h2><div class="mobile-hub-grid">'+section.items.map(item=>{
    const target=item.view?'data-mobile-hub-view="'+item.view+'"':'data-mobile-hub-action="'+item.action+'"';
    return '<button type="button" class="mobile-hub-link" '+target+'>'+item.icon+'<span class="mobile-hub-link-copy"><strong>'+item.label+'</strong><small>'+item.detail+'</small></span><span class="mobile-hub-chevron" aria-hidden="true">›</span></button>';
  }).join('')+'</div></section>').join('');
  setContent('<div class="mobile-hub"><header class="mobile-hub-heading"><h1>Explore Minglora</h1><p>Every section is listed here. Choose where you want to go.</p></header>'+sectionMarkup+'</div>');
  const root=$('#main-content');
  root.querySelectorAll('[data-mobile-hub-view]').forEach(button=>button.addEventListener('click',()=>activateNav(button.dataset.mobileHubView)));
  root.querySelectorAll('[data-mobile-hub-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.mobileHubAction;
    if(action==='profile')openProfile(state.user.id);
    else if(action==='notifications')renderNotifications();
    else if(action==='settings')window.MingloraSettings?.open?.();
    else if(action==='themes')openPaletteSwitcher();
  }));
}
async function renderView(){try{if(state.view==='more')renderMoreHub();else if(state.view==='feed'){await loadPeople();await loadFeed();await loadStories();await renderFeed()}else if(state.view==='gifts')await window.MingloraGifts?.render();else if(state.view==='gifter-progression')await window.MingloraGifterProgression?.render();else if(state.view==='live')await renderLive();else if(state.view==='live-pro')await renderLiveProStudio();else if(state.view==='leagues')await window.MingloraLeagues?.render();else if(state.view==='coins')await renderCoins();else if(state.view==='creator'){await renderCreator();if(state.restoreCreatorSection&&state.restoreCreatorSection!=='overview')await renderCreatorSection(state.restoreCreatorSection)}else if(state.view==='friends')await renderFriends();else if(state.view==='groups')await renderGroups();else if(state.view==='messages')await renderMessages();else if(state.view==='saved')await renderSavedPosts();else if(state.view==='pages')await renderPages();else if(state.view==='meetwave')await window.MingloraMeetWave?.render();else if(state.view==='connections'&&state.activeConnections)await renderConnections(state.activeConnections.profileId,state.activeConnections.kind);else if(state.view==='page'&&state.activePage)await renderPage(state.activePage,state.pageTab||'posts',state.pageDays||30);else if(state.view==='group'&&state.activeGroup)await renderGroup(state.activeGroup);else if(state.view==='profile'&&state.profileTargetId)await openProfile(state.profileTargetId);else if(state.view==='search'&&state.searchQuery)await renderSearch(state.searchQuery);else if(state.view==='notifications')await renderNotifications();}catch(e){setContent(`<section class="card empty-state"><h3>Could not load this page</h3><p>${esc(e.message)}</p><button class="primary" id="retry-view">Try again</button></section>`);$('#retry-view').onclick=renderView;}}
function bindNavigation(){
  bindPaletteSwitcher();
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>activateNav(el.dataset.view)));
  $('#home-brand').onclick=()=>activateNav('feed');
  $('#rail-profile').onclick=()=>openProfile(state.user.id);
  $('#profile-menu').onclick=()=>openProfile(state.user.id);
  $('#rail-notifications').onclick=()=>renderNotifications();
  $('#notifications-btn').onclick=()=>renderNotifications();
  $('#messenger-btn')?.addEventListener('click',toggleMessengerPanel);
  if(!document.documentElement.dataset.messengerOutsideBound){
    document.documentElement.dataset.messengerOutsideBound='true';
    // Keep Chats pinned while the user works elsewhere. Only explicit close controls
    // (the panel close button or Messenger toggle) may dismiss the panel.
  }
  $('#see-people').onclick=()=>activateNav('friends');
  $('#see-groups').onclick=()=>activateNav('groups');
  $('#search-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const q=$('#search-input').value.trim();
    if(q)try{await renderSearch(q)}catch(err){toast(err.message)}
  });
  const logout=async()=>{
    document.querySelectorAll('[data-logout]').forEach(button=>{button.disabled=true;});
    try{
      await api('/auth/logout',{method:'POST',body:'{}'});
    }finally{
      activeMessageRecordings.forEach((recording,userId)=>cancelMessageVoiceRecording(userId));
      try{sessionStorage.removeItem(lastViewStorageKey());}catch{}
      state.user=null;
      messageRefreshKnownIncomingIds=new Set();messageRefreshKnownIncomingPrimed=false;
      closeMessengerPanel();state.messageWindows=[];
      messagePickers.forEach(picker=>picker.destroy());
      messagePickers.clear();
      syncMessageRefreshPolling();
      showAuth();
    }
  };
  document.querySelectorAll('[data-logout]').forEach(button=>button.addEventListener('click',logout));
}
async function renderSidebar(){try{await loadPeople();await loadGroups();const suggestions=state.people.filter(p=>p.friendship!=='accepted').slice(0,4);$('#suggested-people').innerHTML=suggestions.length?suggestions.map(p=>`<div class="person-row"><button type="button" class="sidebar-profile-target" data-profile="${esc(p.id)}" aria-label="Open ${esc(p.name)}’s profile" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;border:0;padding:0;background:transparent;text-align:left;color:inherit;cursor:pointer"><img class="avatar" src="${avatar(p)}" alt=""><span class="person-meta"><strong>${esc(p.name)}</strong><small>Suggested for you</small></span></button><button class="mini-btn" data-sidebar-follow="${esc(p.id)}" data-following="${p.following?'true':'false'}">${p.following?'Following':'Follow'}</button><button type="button" class="mini-btn person-dismiss-mini" data-dismiss-suggestion="${esc(p.id)}" aria-label="Remove ${esc(p.name)} from People You May Know" title="Remove suggestion">×</button></div>`).join(''):'<small style="color:var(--muted)">No new suggestions.</small>';bindProfileLinks($('#suggested-people'));bindSuggestionDismissals($('#suggested-people'));$('#suggested-groups').innerHTML=state.groups.slice(0,3).map(g=>`<div class="group-row"><div class="group-icon">◉</div><div class="person-meta"><strong>${esc(g.name)}</strong><small>${g.members.length} members</small></div></div>`).join('')||'<small style="color:var(--muted)">No groups yet.</small>';$('#shortcut-groups').innerHTML=state.groups.filter(g=>g.isMember).slice(0,3).map(g=>`<button class="rail-link" data-shortcut-group="${esc(g.id)}"><span>◉</span>${esc(g.name)}</button>`).join('');document.querySelectorAll('[data-sidebar-follow]').forEach(btn=>btn.onclick=async()=>{try{const following=btn.dataset.following==='true';const result=await api(`/users/${btn.dataset.sidebarFollow}/follow`,{method:following?'DELETE':'POST',body:'{}'});toast(result.friends?'You are now friends through mutual follows.':(following?'Unfollowed member.':'Now following member.'));await loadPeople();await renderSidebar();if(state.view==='friends')await renderFriends();}catch(e){toast(e.message)}});$('#shortcut-groups').querySelectorAll('button').forEach(b=>b.onclick=()=>activateNav('groups'));}catch{}}
function bindProfileLinks(root=document){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('[data-profile]').forEach(element=>{
    if(element.dataset.profileLinkBound==='true')return;
    element.dataset.profileLinkBound='true';
    const nativeControl=element.matches('button,a,input,select,textarea');
    if(!nativeControl){
      element.setAttribute('role','link');
      element.setAttribute('tabindex','0');
      element.style.cursor='pointer';
    }
    const open=()=>{
      const profileId=String(element.dataset.profile||'').trim();
      if(profileId)void openProfile(profileId);
    };
    element.addEventListener('click',open);
    if(!nativeControl){
      element.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          open();
        }
      });
    }
  });
}
async function enterMingloraApp(user,showWelcome=false){
  state.user=user;showApp();bindNavigation();initializeBrowserNavigation();
  const params=new URLSearchParams(window.location.search);
  const isCreatorHubAdmin=String(user?.id||'')==='5b998c21-86b5-4621-ab37-e0808a2657b1'&&String(user?.email||'').trim().toLowerCase()==='creatorhubcreatornetwork@gmail.com'&&user?.platformRole==='platform_owner';
  if(isCreatorHubAdmin&&params.get('mfa-setup')==='required'){
    window.history.replaceState(null,'',window.location.pathname+window.location.hash);
    activateNav('feed');
    if(window.MingloraSettings?.open){
      await window.MingloraSettings.open();
      const status=document.querySelector('#mfa-status');
      if(status)status.textContent='Administrator protection is required. Scan this QR code with your authenticator app, then verify its current code.';
      if(!document.querySelector('#mfa-verify-form'))document.querySelector('#enroll-totp')?.click();
      document.querySelector('#settings-security')?.scrollIntoView({behavior:'smooth',block:'start'});
    }else toast('Open Settings → Security to finish administrator authenticator setup.');
    return;
  }
  await renderSidebar();await updateNotificationDot();await updateMessengerBadge();
  if(params.get('paypal')==='coins'||params.get('paypal')==='cancel'){await finishPaypalCoinReturn();if(state.view!=='coins')activateNav('feed');}
  else await restoreLastView();
  if(showWelcome)toast('Welcome to Minglora!');
}
function openMfaLogin(challengeId){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="mfa-login-title"><div class="modal-head"><h2 id="mfa-login-title">Verify it is you</h2><button class="modal-close" aria-label="Close">×</button></div><form id="mfa-login-form" class="modal-body"><p>Enter the current code from your authenticator app to finish signing in.</p><div class="field"><label for="mfa-login-code">Authenticator code</label><input id="mfa-login-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" minlength="6" maxlength="8" required></div><p class="auth-error" id="mfa-login-error"></p><button type="submit" class="primary full">Verify and sign in</button></form></section>';
  document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]'),error=modal.querySelector('#mfa-login-error');button.disabled=true;error.textContent='';
    try{const values=new FormData(event.currentTarget),result=await api('/auth/mfa/login',{method:'POST',body:JSON.stringify({challengeId,code:values.get('code')})});modal.remove();await enterMingloraApp(result.user);}
    catch(err){error.textContent=err.message;button.disabled=false;}
  });
}
let passwordRecoveryCooldownTimer=null;
function startPasswordRecoveryCooldown(button,seconds){
  if(!button)return false;
  const duration=Math.ceil(Number(seconds));
  if(!Number.isFinite(duration)||duration<=0)return false;
  if(passwordRecoveryCooldownTimer!==null)window.clearInterval(passwordRecoveryCooldownTimer);
  const label=button.dataset.defaultLabel||button.textContent.trim()||'Forgot password?';
  button.dataset.defaultLabel=label;
  let remaining=duration;
  const tick=()=>{
    if(remaining<=0){
      window.clearInterval(passwordRecoveryCooldownTimer);
      passwordRecoveryCooldownTimer=null;
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent=label;
      return;
    }
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent=`Try again in ${remaining}s`;
    remaining-=1;
  };
  tick();
  passwordRecoveryCooldownTimer=window.setInterval(tick,1000);
  return true;
}
$('#email-magic-link')?.addEventListener('click',async()=>{
  const button=$('#email-magic-link');
  if(button?.disabled)return;
  const email=String($('#login-form')?.elements.email?.value||'').trim();
  if(!email){window.alert('Enter your email address first, then choose Email me a sign-in link.');$('#login-form')?.elements.email?.focus();return;}
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  try{
    const result=await api('/auth/magic-link/request',{method:'POST',body:JSON.stringify({email})});
    window.alert(result.message||'Check your email for a secure Minglora sign-in link.');
    startPasswordRecoveryCooldown(button,60);
  }catch(error){
    window.alert(error.message);
    startPasswordRecoveryCooldown(button,error.retryAfterSeconds||(error.status===429?60:0));
    if(button&&passwordRecoveryCooldownTimer===null){button.disabled=false;button.removeAttribute('aria-busy');}
  }
});
$('#forgot-password')?.addEventListener('click',async()=>{
  const button=$('#forgot-password');
  if(button?.disabled)return;
  const email=String($('#login-form')?.elements.email?.value||'').trim();
  if(!email){window.alert('Enter your email address first, then choose Forgot password.');$('#login-form')?.elements.email?.focus();return;}
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  try{
    const result=await api('/auth/password/reset/request',{method:'POST',body:JSON.stringify({email})});
    window.alert(result.message||'Check your email for a recovery link.');
    startPasswordRecoveryCooldown(button,60);
  }catch(error){
    window.alert(error.message);
    startPasswordRecoveryCooldown(button,error.retryAfterSeconds||(error.status===429?60:0));
    if(button&&passwordRecoveryCooldownTimer===null){button.disabled=false;button.removeAttribute('aria-busy');}
  }
});
async function finishPasswordRecoveryFromLink(){
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(hash.get('type')!=='recovery'||!hash.get('access_token'))return;
  const accessToken=hash.get('access_token');
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><div class="modal-head"><h2 id="recovery-title">Set a new password</h2></div><form id="password-recovery-form" class="modal-body"><p>Choose a strong new password for your Minglora account.</p><label class="field"><span>New password</span><input name="password" type="password" minlength="10" maxlength="1024" autocomplete="new-password" required></label><label class="field"><span>Confirm password</span><input name="confirmPassword" type="password" minlength="10" maxlength="1024" autocomplete="new-password" required></label><p id="password-recovery-status" class="auth-error" role="status"></p><button class="primary full" type="submit">Update password</button></form></section>';
  document.body.append(modal);
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,values=new FormData(form),status=modal.querySelector('#password-recovery-status'),button=form.querySelector('button[type="submit"]');
    if(values.get('password')!==values.get('confirmPassword')){status.textContent='The passwords do not match.';return;}
    button.disabled=true;
    try{await api('/auth/password/reset/complete',{method:'POST',body:JSON.stringify({accessToken,password:values.get('password')})});modal.remove();showAuth();window.alert('Your password has been updated. Log in with your new password.');}
    catch(error){status.textContent=error.message;button.disabled=false;}
  });
}
async function finishMagicLinkFromUrl(){
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(hash.get('type')!=='magiclink')return false;
  const accessToken=hash.get('access_token')||'';
  const refreshToken=hash.get('refresh_token')||'';
  const expiresIn=Number(hash.get('expires_in'))||3600;
  const authError=hash.get('error_description')||hash.get('error_code')||'';
  // Remove one-time bearer credentials from the address bar and browser history
  // before sending them to Minglora's same-origin session exchange endpoint.
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  try{
    if(authError)throw new Error(authError);
    if(!accessToken||!refreshToken)throw new Error('This sign-in link is incomplete or expired. Request a new Minglora sign-in link.');
    const result=await api('/auth/magic-link/complete',{
      method:'POST',
      body:JSON.stringify({accessToken,refreshToken,expiresIn})
    });
    if(result.mfaRequired){openMfaLogin(result.challengeId);return true;}
    if(!result.user)throw new Error('Minglora could not finish your magic-link sign-in.');
    if(result.mfaEnrollmentRequired){const destination=new URL(window.location.href);destination.searchParams.set('mfa-setup','required');window.history.replaceState(null,'',destination.pathname+destination.search);}
    await enterMingloraApp(result.user);
  }catch(error){
    showAuth();
    const status=$('#login-error');
    if(status)status.textContent=error.message||'This sign-in link could not be verified. Request a new one.';
    else window.alert(error.message||'This sign-in link could not be verified. Request a new one.');
  }
  return true;
}

$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,error=$('#login-error'),button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  error.textContent='';button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    const data=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    if(data.mfaRequired){openMfaLogin(data.challengeId);return;}
    if(data.mfaEnrollmentRequired){const destination=new URL(window.location.href);destination.searchParams.set('mfa-setup','required');window.history.replaceState(null,'',destination.pathname+destination.search);}
    await enterMingloraApp(data.user);
  }catch(err){error.textContent=err.message;}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
});
$('#register-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,error=$('#register-error'),button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  error.textContent='';button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    const data=await api('/auth/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    if(data.confirmationRequired){error.textContent=data.message||'Check your email to confirm your account, then log in.';return;}
    if(!data.user)throw new Error('Account registration did not return a user profile.');
    state.user=data.user;showApp();bindNavigation();await renderSidebar();activateNav('feed');toast('Welcome to Minglora!');
  }catch(err){error.textContent=err.message;}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
});
(async()=>{await finishPasswordRecoveryFromLink();if(await finishMagicLinkFromUrl())return;try{const me=await api('/auth/me');if(me.user){await enterMingloraApp(me.user);}else showAuth()}catch{showAuth()}})();
