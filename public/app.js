const $ = s => document.querySelector(s);
const state = { user:null, view:'feed', feed:[], feedScope:'all', savedPosts:[], stories:[], people:[], discoveryLiveSessions:[], groups:[], notifications:[], conversations:[], activeConversation:null, messageWindows:[], activeGroup:null, pages:[], activePage:null, profile:null, searchResults:null, settings:null, activeConnections:null, liveStartFormat:'video_audio', marketplaceListings:[], marketplaceMode:'browse', activeMarketplaceListing:null };
const LIVE_ROOM_THEME_OPTIONS=[{value:'studio',label:'Creator Studio'},{value:'ocean',label:'Ocean Stage'},{value:'tropical',label:'Tropical Party'},{value:'royal',label:'Royal Lounge'},{value:'neon',label:'Neon Arena'},{value:'sunset',label:'Sunset Spotlight'},{value:'garden',label:'Garden Glow'},{value:'social',label:'Soft Social'}];
window.addEventListener('minglora:settings-loaded',event=>{state.settings=event.detail||null;const sort=$('#feed-sort');if(sort&&state.view==='feed'){sort.value=state.settings?.preferences?.feedSort==='oldest'?'old':'new';sort.dispatchEvent(new Event('change'));}renderPaletteSwitcher();});
const fallbackAvatar = name => {
  const initials = String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#dce8fb"/><text x="64" y="70" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#2457a7">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatar = u => esc(u?.avatar || fallbackAvatar(u?.name));
const timeAgo = date => {const sec=Math.max(0,(Date.now()-new Date(date).getTime())/1000);if(sec<60)return 'Just now';if(sec<3600)return `${Math.floor(sec/60)}m`;if(sec<86400)return `${Math.floor(sec/3600)}h`;if(sec<604800)return `${Math.floor(sec/86400)}d`;return new Date(date).toLocaleDateString();};
async function api(path, options={}) { const res=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data; }
let profilePresenceTimer=null;
let profilePresenceBusy=false;
function stopProfilePresence(){if(profilePresenceTimer){clearInterval(profilePresenceTimer);profilePresenceTimer=null;}profilePresenceBusy=false;}
function updateProfileInsights(insights){
  const views=$('#profile-views-count'),active=$('#profile-active-viewers-count');
  if(views)views.textContent=Number(insights?.profileViews30d||0).toLocaleString();
  if(active)active.textContent=Number(insights?.activeViewersCount||0).toLocaleString();
}
async function refreshProfilePresence(profileId){
  if(profilePresenceBusy||document.visibilityState!=='visible'||state.view!=='profile'||state.profile?.user?.id!==profileId)return;
  profilePresenceBusy=true;
  try{
    const result=await api(`/users/${encodeURIComponent(profileId)}/profile-presence`,{method:'POST',body:'{}'});
    if(result.profileInsights&&state.view==='profile'&&state.profile?.user?.id===profileId)updateProfileInsights(result.profileInsights);
  }catch(error){
    console.warn('Profile presence refresh failed:',error.message);
  }finally{profilePresenceBusy=false;}
}
function startProfilePresence(profileId){
  stopProfilePresence();
  void refreshProfilePresence(profileId);
  profilePresenceTimer=setInterval(()=>void refreshProfilePresence(profileId),20000);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&state.view==='profile'&&state.profile?.user?.id)void refreshProfilePresence(state.profile.user.id);
});

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
let browserNotificationTimer=null;
let browserNotificationSeen=new Set();
let browserNotificationPrimed=false;
let webPushSubscriptionActive=false;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function showAuth(){ $('#app').classList.add('hidden');$('#auth-screen').classList.remove('hidden'); }
function showApp(){ $('#auth-screen').classList.add('hidden');$('#app').classList.remove('hidden');$('#top-avatar').src=avatar(state.user);$('#rail-avatar').src=avatar(state.user);$('#top-name').textContent=state.user.name.split(' ')[0];$('#rail-name').textContent=state.user.name;window.dispatchEvent(new Event('minglora:session-ready'));startBrowserNotificationPolling();prepareMingloraServiceWorker();handleMingloraPushNavigation(); }
function base64UrlToBytes(value){
  const base64=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=base64+'='.repeat((4-base64.length%4)%4);
  return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}
async function prepareMingloraServiceWorker(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  try{
    const registration=await navigator.serviceWorker.register('/sw.js?v=20261031-studio-twin-palette-1',{scope:'/'});
    const subscription=await registration.pushManager.getSubscription();
    if(subscription){
      webPushSubscriptionActive=true;
      await api('/push/subscriptions',{method:'POST',body:JSON.stringify(subscription.toJSON())}).catch(()=>{});
    }
  }catch(error){console.warn('Minglora background push setup:',error.message);}
}
async function enableMingloraPush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){toast('This browser does not support device push notifications.');return;}
  try{
    const permission=Notification.permission==='granted'? 'granted':await Notification.requestPermission();
    if(permission!=='granted'){toast('Allow notifications in your browser settings to enable Minglora push.');return;}
    const [keyData,registration]=await Promise.all([
      api('/push/public-key'),
      navigator.serviceWorker.register('/sw.js',{scope:'/'})
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
    if(type==='call'&&callId){await answerMingloraCall(callId);return;}
    if(type==='decline-call'&&callId){await declineMingloraCall(callId);return;}
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
function activateNav(view){if(view!=='profile')stopProfilePresence();if(view!=='friends')stopPeopleDiscoveryRefresh();state.view=view;syncMessageRefreshPolling();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));renderView();}
function setContent(html){$('#main-content').innerHTML=html;}
function composer(){return `<section class="card"><div class="composer-top"><img class="avatar" src="${avatar(state.user)}" alt=""><button class="composer-open" id="open-composer">What's on your mind, ${esc(state.user.name.split(' ')[0])}?</button></div><div class="composer-actions"><button id="post-photo" class="photo">▣ &nbsp; Photo / link</button><button id="post-feeling" class="feeling">☻ &nbsp; Feeling / activity</button><button id="post-text">✎ &nbsp; Write post</button></div></section>`;}
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
function postCard(post){
  const author=post.author||{}, comments=post.comments||[];
  return `<article class="card post" data-post="${esc(post.id)}">
    <div class="post-head"><img class="avatar" data-profile="${esc(author.id||'')}" src="${avatar(author)}" alt="">
      <div class="post-author"><strong data-profile="${esc(author.id||'')}">${esc(author.name||'Unknown account')}</strong><small>${timeAgo(post.createdAt)} · ◉</small></div>
      <button class="post-menu" aria-label="Post options" data-post-menu="${esc(post.id)}">···</button>
    </div>
    ${post.text?`<div class="post-text">${esc(post.text)}</div>`:''}
    ${renderPostMedia(post)}
    <div class="post-stats"><span>👍 ${post.reactionCount||0} ${post.reactionCount===1?'reaction':'reactions'}</span><span>${comments.length} comments</span></div>
    <div class="post-actions">
      <button class="${post.myReaction?'liked':''}" data-react="${esc(post.id)}">${post.myReaction==='love'?'❤️':post.myReaction==='haha'?'😆':post.myReaction==='care'?'🤗':post.myReaction?'👍':'♡'} &nbsp; ${post.myReaction?esc(post.myReaction[0].toUpperCase()+post.myReaction.slice(1)):'Like'}</button>
      <button data-focus-comment="${esc(post.id)}">▢ &nbsp; Comment</button>
      <button data-toggle-save="${esc(post.id)}" data-saved="${post.isSaved?'true':'false'}">${post.isSaved?'▣ Saved':'▢ Save'}</button>
      <button data-share="${esc(post.id)}">↗ &nbsp; Share</button>
    </div>
    ${comments.length?`<div class="comments">${comments.slice(-3).map(c=>`<div class="comment"><img class="avatar" src="${avatar(c.author)}" alt=""><div class="comment-bubble"><strong>${esc(c.author?.name||'Member')}</strong>${esc(c.text)}${c.userId===state.user.id||post.userId===state.user.id?`<button class="comment-delete" data-delete-comment-post="${esc(post.id)}" data-delete-comment-id="${esc(c.id)}">Delete</button>`:''}</div>${c.userId!==state.user.id?`<button class="comment-delete" data-report-comment="${esc(c.id)}">Report</button>`:''}</div>`).join('')}</div>`:''}
    <form class="comment-form" data-comment-form="${esc(post.id)}"><img class="avatar" src="${avatar(state.user)}" alt=""><input name="text" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment" required><button type="submit">Send</button></form>
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
function bindFeed(){
  $('#create-story')?.addEventListener('click',()=>openStoryComposer());
  document.querySelectorAll('[data-open-story]').forEach(el=>el.addEventListener('click',()=>openStory(el.dataset.openStory)));
  $('#open-composer')?.addEventListener('click',()=>openComposer());
  $('#post-text')?.addEventListener('click',()=>openComposer());
  $('#post-photo')?.addEventListener('click',()=>openComposer(true));
  $('#post-feeling')?.addEventListener('click',()=>openComposer());
  document.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('click',()=>el.dataset.profile&&openProfile(el.dataset.profile)));
  document.querySelectorAll('[data-react]').forEach(el=>el.addEventListener('click',async()=>{
    try{await api(`/posts/${el.dataset.react}/reactions`,{method:'POST',body:JSON.stringify({reaction:'like'})});await refreshVisiblePosts();}
    catch(e){toast(e.message);}
  }));
  document.querySelectorAll('[data-comment-form]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const input=form.elements.text;
    try{await api(`/posts/${form.dataset.commentForm}/comments`,{method:'POST',body:JSON.stringify({text:input.value})});await refreshVisiblePosts();}
    catch(err){toast(err.message);}
  }));
  document.querySelectorAll('[data-report-comment]').forEach(btn=>btn.addEventListener('click',()=>openReportComposer('comment',btn.dataset.reportComment)));
  document.querySelectorAll('[data-delete-comment-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!window.confirm('Delete this comment?'))return;
    try{await api(`/posts/${btn.dataset.deleteCommentPost}/comments/${btn.dataset.deleteCommentId}`,{method:'DELETE',body:'{}'});await refreshVisiblePosts();toast('Comment deleted.');}
    catch(err){toast(err.message);}
  }));
  document.querySelectorAll('[data-focus-comment]').forEach(el=>el.addEventListener('click',()=>document.querySelector(`[data-comment-form="${el.dataset.focusComment}"] input`)?.focus()));
  document.querySelectorAll('[data-toggle-save]').forEach(btn=>btn.addEventListener('click',async()=>{
    const saving=btn.dataset.saved!=='true';
    try{await api(`/posts/${btn.dataset.toggleSave}/save`,{method:saving?'POST':'DELETE',body:'{}'});await refreshVisiblePosts();toast(saving?'Post saved.':'Post removed from saved posts.');}
    catch(err){toast(err.message);}
  }));
  document.querySelectorAll('[data-share]').forEach(el=>el.addEventListener('click',async()=>{
    const post=findVisiblePost(el.dataset.share);if(!post)return;
    try{await navigator.clipboard.writeText(`${location.origin}/#post-${post.id}`);toast('Post link copied.');}
    catch{toast('Copy this page URL to share the post.');}
  }));
  document.querySelectorAll('[data-post-menu]').forEach(el=>el.addEventListener('click',()=>{
    const post=findVisiblePost(el.dataset.postMenu);if(post)openPostOptions(post);
  }));
}
function openEditPost(post){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-post-title"><div class="modal-head"><h2 id="edit-post-title">Edit post</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="edit-post-form"><div class="field"><label for="edit-post-text">Post text</label><textarea id="edit-post-text" name="text" maxlength="5000">'+esc(post.text||'')+'</textarea></div><div class="field"><label>Photos, videos, audio and 3D files</label><div id="edit-post-media-picker"></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Save changes</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#edit-post-media-picker'),{slot:'post',initialMedia:post.media||[]});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      await api('/posts/'+encodeURIComponent(post.id),{method:'PATCH',body:JSON.stringify({text:values.get('text'),mediaIds})});
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
    ? '<button class="secondary full" data-post-action="edit">Edit post</button><button class="secondary full" data-post-action="delete">Delete post</button>'
    : `<button class="secondary full" data-post-action="report-post">Report this post</button><button class="secondary full" data-post-action="report-user">Report ${esc(author.name||'this member')}</button><button class="secondary full" data-post-action="block">Block ${esc(author.name||'this member')}</button>`;
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="post-options-title"><div class="modal-head"><h2 id="post-options-title">Post options</h2><button class="modal-close" aria-label="Close">×</button></div><div class="modal-body">${actions}<button type="button" class="secondary full modal-cancel">Cancel</button></div></section>`;
  document.body.append(modal);
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=()=>modal.remove());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('[data-post-action="edit"]')?.addEventListener('click',()=>{modal.remove();openEditPost(post);});
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
function renderStoriesPanel(){const seen=new Set();const visible=state.stories.filter(story=>{const id=story.author?.id;if(!id||seen.has(id))return false;seen.add(id);return true;});const cards=visible.map(story=>'<button class="story-card" data-open-story="'+esc(story.id)+'">'+(story.media?renderStoryPreview(story.media):('<span class="story-text-background">'+esc((story.text||'').slice(0,80))+'</span>'))+'<span class="story-shade"></span><img class="story-avatar" src="'+avatar(story.author)+'" alt=""><span class="story-author">'+esc(story.author?.name||'Unknown account')+'</span>'+(story.viewedByMe?'<span class="story-viewed">Viewed</span>':'')+'</button>').join('');return '<section class="card story-panel"><div class="story-panel-head"><h2>Stories</h2><button class="primary" id="create-story">＋ Add story</button></div>'+(visible.length?'<div class="story-cards">'+cards+'</div>':'<p class="story-empty">No stories yet. Add a story to share an update for 24 hours.</p>')+'</section>';}
async function renderFeed(){state.view='feed';const noPosts=state.feedScope==='following'?'You are not following anyone who has posted yet.':state.feedScope==='friends'?'Your friends have not shared posts yet.':'Share your first post or connect with people to see updates.';const title=state.feedScope==='following'?'Following feed':state.feedScope==='friends'?'Friends feed':'Recent posts';setContent(`<section class="card welcome"><h1>Good to see you, ${esc(state.user.name.split(' ')[0])} 👋</h1><p>Your community is here. Catch up and share something good.</p></section>${renderStoriesPanel()}${composer()}<div class="feed-header"><h2>${title}</h2><div class="feed-controls"><select id="feed-scope" class="sort-select" aria-label="Feed audience"><option value="all" ${state.feedScope==='all'?'selected':''}>All posts</option><option value="following" ${state.feedScope==='following'?'selected':''}>Following</option><option value="friends" ${state.feedScope==='friends'?'selected':''}>Friends</option></select><select id="feed-sort" class="sort-select" aria-label="Feed sort"><option value="new">Most recent</option><option value="old">Oldest first</option></select></div></div><div id="feed-list">${state.feed.length?state.feed.map(postCard).join(''):`<section class="card empty-state"><div class="empty-icon">✦</div><h3>No posts here yet</h3><p>${noPosts}</p></section>`}</div>`);bindFeed();$('#feed-scope')?.addEventListener('change',async e=>{try{await loadFeed(e.target.value);await renderFeed();}catch(err){toast(err.message);}});$('#feed-sort')?.addEventListener('change',e=>{const posts=[...state.feed].sort((a,b)=>e.target.value==='old'?new Date(a.createdAt)-new Date(b.createdAt):new Date(b.createdAt)-new Date(a.createdAt));$('#feed-list').innerHTML=posts.map(postCard).join('');bindFeed()});if(state.settings?.preferences?.feedSort==='oldest'){const sort=$('#feed-sort');if(sort){sort.value='old';sort.dispatchEvent(new Event('change'));}}}
function openComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="create-post-title"><div class="modal-head"><h2 id="create-post-title">Create a post</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="create-post-form"><div class="post-head"><img class="avatar" src="'+avatar(state.user)+'" alt=""><div class="post-author"><strong>'+esc(state.user.name)+'</strong><small>◉ Anyone can see this</small></div></div><div class="field"><textarea name="text" maxlength="5000" placeholder="What is on your mind?" aria-label="Post text"></textarea></div><div class="field"><label>Photos, videos, audio and 3D models</label><div id="create-post-media-picker"></div></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#create-post-media-picker'),{slot:'post',maxFiles:10});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      await api('/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});
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
      '<div class="person-title-group"><h3>'+esc(p.name)+'</h3><span>@'+esc(p.username)+'</span></div>'+
      (liveSession?'<span class="person-live-mini"><i></i> LIVE</span>':'')+'</div>'+
      '<p class="person-bio">'+(p.bio?esc(p.bio):'<span>No bio added yet.</span>')+'</p>'+
      '<div class="person-stat-row"><span><strong>'+followerCount+'</strong><small>Followers</small></span><span><strong>'+friendCount+'</strong><small>Friends</small></span><span><strong>'+postCount+'</strong><small>Posts</small></span></div>'+
      '<div class="person-mutual-context"><span class="person-mutual-glyph" aria-hidden="true">✦</span><span>'+(Number(p.mutualFriendsCount||0)>0?'<strong>'+Number(p.mutualFriendsCount).toLocaleString()+' mutual '+(Number(p.mutualFriendsCount)===1?'connection':'connections')+'</strong>':'No mutual connections yet')+'</span></div>'+
      (liveSession?'<div class="person-live-strip"><span><i></i><strong>'+Number(liveSession.viewerCount||0).toLocaleString()+'</strong> watching now</span><button type="button" data-watch-live="'+esc(liveSession.id)+'">Watch LIVE <b>↗</b></button></div>':'')+
      (hasActivity?'<div class="person-activity">'+storyPreview+recent+'</div>':'<div class="person-no-activity"><span class="person-no-activity-icon">✧</span><span><strong>No recent public activity</strong><small>New shared moments will appear here.</small></span></div>')+
      '<div class="person-card-actions"><button type="button" class="person-connect-btn" data-toggle-follow="'+esc(p.id)+'" data-following="'+(following?'true':'false')+'">'+(following?'<span>✓</span> ':'＋ ')+esc(followLabel)+'</button><button type="button" class="person-view-btn" data-profile="'+esc(p.id)+'">View profile <span>↗</span></button></div>'+
      '<button type="button" class="person-block-link" data-block-user="'+esc(p.id)+'">Block member</button>'+
    '</div></article>';
}
function peopleGridMarkup(){
  const others=state.people.filter(member=>member.friendship!=='accepted');
  return others.length?others.map(peopleCard).join(''):'<section class="card empty-state"><h3>You’re all caught up</h3><p>There are no new people to suggest right now.</p></section>';
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
  root.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('click',()=>openProfile(el.dataset.profile)));
  root.querySelectorAll('[data-open-profile-story]').forEach(el=>el.addEventListener('click',()=>openStory(el.dataset.openProfileStory)));
  root.querySelectorAll('[data-watch-live]').forEach(el=>el.addEventListener('click',()=>{
    const session=(state.discoveryLiveSessions||[]).find(item=>item.id===el.dataset.watchLive);
    if(session)openLiveRoom(session,'viewer').catch(error=>toast(error.message));
  }));
}
let peopleDiscoveryRefreshTimer=null;
let peopleDiscoveryRefreshBusy=false;
function stopPeopleDiscoveryRefresh(){
  if(peopleDiscoveryRefreshTimer){clearInterval(peopleDiscoveryRefreshTimer);peopleDiscoveryRefreshTimer=null;}
}
async function refreshPeopleDiscovery(){
  if(peopleDiscoveryRefreshBusy||state.view!=='friends'||document.visibilityState!=='visible')return;
  if(!$('#people-discovery-grid'))return;
  peopleDiscoveryRefreshBusy=true;
  try{
    const [peopleResult,liveResult]=await Promise.all([
      api('/discovery/people'),
      api('/live/sessions').catch(()=>({sessions:[]}))
    ]);
    state.people=peopleResult.users||[];
    state.discoveryLiveSessions=liveResult.sessions||[];
    const grid=$('#people-discovery-grid');
    if(grid){grid.innerHTML=peopleGridMarkup();bindPeople(grid);}
  }catch(error){console.warn('People discovery refresh failed:',error.message);}
  finally{peopleDiscoveryRefreshBusy=false;}
}
function startPeopleDiscoveryRefresh(){
  stopPeopleDiscoveryRefresh();
  peopleDiscoveryRefreshTimer=setInterval(()=>void refreshPeopleDiscovery(),20000);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&state.view==='friends')void refreshPeopleDiscovery();
});
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
    '<div class="feed-header"><h2>People you may know</h2><span class="people-refresh-note">Live member previews · refresh automatically</span></div>'+
    '<div id="people-discovery-grid" class="people-grid people-discovery-grid">'+peopleGridMarkup()+'</div>'+
    '<section class="card friends-list"><h2>Friends ('+friends.length+')</h2>'+
    (friends.length?friends.map(member=>'<div class="person-row" style="margin:12px 0"><img class="avatar" src="'+avatar(member)+'" alt=""><div class="person-meta"><strong>'+esc(member.name)+'</strong><small>@'+esc(member.username)+'</small></div><span class="muted">Mutual follow</span><button class="mini-btn" data-profile="'+esc(member.id)+'">View profile</button></div>').join(''):'<p class="muted">Follow each other to become friends. Your mutual connections will appear here.</p>')+'</section>');
  bindPeople(document);
  startPeopleDiscoveryRefresh();
}
let activeCallRoom=null;
let activeCallOverlay=null;
let activeLiveRoom=null;
let activeLiveSession=null;
let activeLiveRole=null;
let liveChatRefreshTimer=null;
let liveDirectoryRefreshTimer=null;
let liveCameraEnabled=true;
let liveMicrophoneEnabled=true;
let liveGiftCatalogue=[];
let liveSpeakerRefreshTimer=null;
let liveParticipantSyncTimer=null;
let liveParticipantSyncBusy=false;
let liveDirectoryFilter='all';

function stopLiveChatRefresh(){if(liveChatRefreshTimer){clearInterval(liveChatRefreshTimer);liveChatRefreshTimer=null;}}
function stopLiveDirectoryRefresh(){if(liveDirectoryRefreshTimer){clearInterval(liveDirectoryRefreshTimer);liveDirectoryRefreshTimer=null;}}
function liveMoney(minor){return "$"+(Number(minor||0)/100).toFixed(2);}
function liveSessionCardMarkup(session){
  const audioOnly=session.broadcastType==='audio_only';
  const type=audioOnly?'audio_only':'video_audio';
  const theme=LIVE_ROOM_THEME_OPTIONS.some(option=>option.value===session.liveTheme)?session.liveTheme:'studio';
  const presence=session.viewerCountVerified?'◉ '+Number(session.viewerCount||0).toLocaleString()+' in room':'Live presence unavailable';
  return "<article class='live-room-card' data-live-type='"+type+"'><div class='live-room-preview live-preview-theme-"+theme+(audioOnly?" live-room-preview-audio":"")+"'>"+
    "<span class='live-indicator'>LIVE</span><span class='live-type-pill "+(audioOnly?'audio':'video')+"'>"+(audioOnly?'AUDIO ONLY':'VIDEO + AUDIO')+"</span>"+
    "<span class='live-room-viewers'>"+presence+"</span>"+
    (audioOnly?"<div class='live-directory-audio-orb'><span>♪</span></div>":"<div class='live-room-avatar'><img src='"+avatar(session.host)+"' alt=''></div>")+
    "</div><div class='live-room-details'><strong>"+esc(session.title)+"</strong><span>"+esc(session.host?.name||'Minglora creator')+"</span><small>@"+esc(session.host?.username||'member')+
    "</small><button class='primary' data-watch-live='"+esc(session.id)+"'>"+(audioOnly?'Listen LIVE':'Watch LIVE')+"</button></div></article>";
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
function renderLiveDirectory(sessions,status,catalog,wallet){
  const liveReady=Boolean(status.configured&&status.connected===true);
  const liveStatusText=!status.configured?"Live provider not configured":liveReady?"LiveKit ready":"Live provider connection failed";
  const cards=sessions.length?sessions.map(liveSessionCardMarkup).join(""):status.liveDirectoryError
    ?"<section class='card empty-state'><div class='empty-icon'>📡</div><h3>LIVE directory unavailable</h3><p>"+esc(status.liveDirectoryError)+"</p></section>"
    :"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a video broadcast or an independent audio room and bring your community together.</p></section>";
  const packages=Array.isArray(catalog?.packages)?catalog.packages.slice(0,4):[];
  setContent("<div class='page-heading live-page-heading'><div><span class='eyebrow'>Minglora LIVE</span><h1>Go LIVE. Share the moment.</h1><p class='muted'>Real-time video, independent audio rooms, creator chat and animated 3D gifts.</p></div><span class='live-status-pill "+(liveReady?"ready":"unavailable")+"'>"+liveStatusText+"</span></div>"+
    "<section class='card live-start-card'><div><h2>Start your LIVE</h2><p class='muted'>Choose how people experience your broadcast. Audio Only never requests camera access.</p></div>"+
    "<form id='live-create-form' class='live-create-form'><fieldset class='live-format-picker'><legend>Broadcast format</legend>"+
      "<label class='live-format-card'><input type='radio' name='broadcastType' value='video_audio' "+(state.liveStartFormat==='video_audio'?'checked':'')+"><span class='live-format-icon'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-2#live'></use></svg></span><span><strong>Video + Audio</strong><small>Camera and microphone</small></span></label>"+
      "<label class='live-format-card'><input type='radio' name='broadcastType' value='audio_only' "+(state.liveStartFormat==='audio_only'?'checked':'')+"><span class='live-format-icon audio'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-2#microphone'></use></svg></span><span><strong>Audio Only</strong><small>Microphone, voice and audience</small></span></label></fieldset>"+
      "<input name='title' maxlength='120' required placeholder='What are you going LIVE about?'><select name='visibility' aria-label='Who can watch'><option value='public'>Everyone · Public</option><option value='friends'>Friends</option><option value='private'>Private room</option></select><button class='primary' type='submit' "+(liveReady?"":"disabled")+">🔴 Start LIVE</button></form>"+
    (liveReady?"":"<p class='form-hint'>"+esc(status.error||"Minglora could not verify its LiveKit connection. Check the server URL and API credentials.")+"</p>")+"</section>"+
    "<div class='feed-header'><h2>Live now</h2><button class='text-button' id='refresh-live'>Refresh</button></div>"+
    "<div class='live-directory-filters' role='group' aria-label='Filter LIVE broadcasts'><button type='button' data-live-filter='all' class='active'>All LIVE</button><button type='button' data-live-filter='video_audio'>Video + Audio</button><button type='button' data-live-filter='audio_only'>Audio Only</button></div>"+
    "<div class='live-room-grid'>"+cards+"</div>"+
    "<section class='card live-coins-promo'><div><span class='eyebrow'>Support your favourite creators</span><h2>Send LIVE gifts with Minglora Coins</h2><p class='muted'>Your gifts support creators through Minglora’s 50/50 earnings share.</p></div><div class='live-promo-actions'><strong>"+
    (wallet.wallet&&wallet.wallet.balance_coins!=null?Number(wallet.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable")+"</strong><button class='secondary' id='open-live-coins'>Recharge Coins</button></div>"+
    (packages.length?"<div class='live-package-preview'>"+packages.map(p=>"<span>"+Number(p.coin_amount).toLocaleString()+" Coins · "+liveMoney(p.price_minor)+"</span>").join("")+"</div>":"")+"</section>");
  $("#live-create-form")?.querySelectorAll("input[name='broadcastType']").forEach(input=>input.addEventListener("change",()=>{state.liveStartFormat=input.value;}));
  $("#live-create-form")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type='submit']");button.disabled=true;
    try{
      const values=new FormData(form);
      const result=await api("/live/sessions",{method:"POST",body:JSON.stringify({
        title:String(values.get("title")||"").trim(),visibility:values.get("visibility"),broadcastType:values.get("broadcastType")||"video_audio"
      })});
      await openLiveRoom(result.session,"host",result.liveKit);
    }catch(error){toast(error.message);button.disabled=false;}
  });
  $("#refresh-live")?.addEventListener("click",renderLive);
  $("#open-live-coins")?.addEventListener("click",()=>activateNav("coins"));
  bindLiveDirectoryCards(sessions);
}
async function refreshLiveDirectorySessions(){
  if(state.view!=='live'||activeLiveRoom){stopLiveDirectoryRefresh();return;}
  try{
    const data=await api('/live/sessions'),sessions=data.sessions||[],container=$('.live-room-grid');
    if(!container)return;
    container.innerHTML=sessions.length?sessions.map(liveSessionCardMarkup).join(""):"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a LIVE session and bring your community together.</p></section>";
    bindLiveDirectoryCards(sessions);
  }catch{}
}
async function renderLive(){
  activateSilent("live");stopLiveChatRefresh();stopLiveDirectoryRefresh();
  const results=await Promise.allSettled([
    api("/live/status"),
    api("/live/sessions"),
    api("/coins/catalog"),
    api("/coins/wallet")
  ]);
  const status=results[0].status==="fulfilled"
    ? results[0].value
    : {provider:"livekit",configured:false,connected:false,error:results[0].reason?.message||"Minglora could not check the LiveKit connection."};
  const sessionResult=results[1].status==="fulfilled"?results[1].value:null;
  const sessions=Array.isArray(sessionResult?.sessions)?sessionResult.sessions:[];
  if(!sessionResult)status.liveDirectoryError=results[1].reason?.message||"Minglora could not load the LIVE directory.";
  const catalog=results[2].status==="fulfilled"?results[2].value:{gifts:[],packages:[]};
  const wallet=results[3].status==="fulfilled"?results[3].value:{wallet:null,ledger:[]};
  liveGiftCatalogue=Array.isArray(catalog.gifts)?catalog.gifts:[];
  renderLiveDirectory(sessions,status,catalog,wallet);
  liveDirectoryRefreshTimer=setInterval(refreshLiveDirectorySessions,12000);
}
function attachLiveTrack(track,participant,local){
  if(!track)return;
  if(track.kind==="video"){
    const stage=$("#live-video-stage");if(!stage)return;
    const tile=document.createElement("div");tile.className="live-video-tile"+(local?" local":"");tile.dataset.participant=participant?.identity||"local";
    const element=track.attach();element.autoplay=true;element.playsInline=true;element.className="live-video-element";if(local)element.muted=true;
    tile.append(element);
    if(!local){const name=document.createElement("span");name.className="live-video-name";name.textContent=participant?.name||participant?.identity||"Guest";tile.append(name);}
    stage.append(tile);
  }else{
    const root=$("#live-audio-root");if(root){const element=track.attach();element.autoplay=true;root.append(element);}
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
async function refreshLiveSpeakerPanel(session,role,room){
  const root="/live/sessions/"+encodeURIComponent(session.id);
  if(role==="host"){
    const list=$("#live-speaker-request-list");if(!list)return;
    try{
      const data=await api(root+"/speaker-requests"),requests=data.requests||[];
      list.innerHTML=requests.length?requests.map(request=>{
        const label=request.status==="requested"?"Pending":request.status==="connected"?"On stage":"Approved";
        const actions=request.status==="requested"
          ?"<span class='live-speaker-actions'><button type='button' data-speaker-accept='"+esc(request.userId)+"'>Accept</button><button type='button' data-speaker-reject='"+esc(request.userId)+"'>Decline</button></span>"
          :"<span class='live-speaker-approved'>"+(request.connectedAt?"On stage":"Approved · waiting to join")+"</span>";
        return "<div class='live-speaker-request-row'><span class='live-speaker-avatar'>"+esc((request.user?.name||"M").slice(0,1).toUpperCase())+"</span><span class='live-speaker-meta'><strong>"+esc(request.user?.name||"Member")+"</strong><small>@"+esc(request.user?.username||"member")+" · "+label+"</small></span>"+actions+"</div>";
      }).join(""):"<p class='muted'>No speaker requests yet. Your audience can raise a hand to join the stage.</p>";
      list.querySelectorAll("[data-speaker-accept],[data-speaker-reject]").forEach(button=>button.addEventListener("click",async()=>{
        const speakerId=button.dataset.speakerAccept||button.dataset.speakerReject,decision=button.dataset.speakerAccept?"accept":"reject";
        button.disabled=true;
        try{await api(root+"/speaker-requests/"+encodeURIComponent(speakerId),{method:"PATCH",body:JSON.stringify({decision})});toast(decision==="accept"?"Speaker approved. They can now join the stage.":"Speaker request declined.");await refreshLiveSpeakerPanel(session,role,room);}
        catch(error){toast(error.message);button.disabled=false;}
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
async function refreshLiveChat(broadcastId){
  try{
    const data=await api("/live/sessions/"+encodeURIComponent(broadcastId)+"/chat"),list=$("#live-chat-list");if(!list)return;
    list.innerHTML=(data.messages||[]).map(message=>"<div class='live-chat-line'><strong>"+esc(message.user?.name||"Member")+"</strong><span>"+esc(message.body)+"</span><small>"+timeAgo(message.created_at)+"</small></div>").join("")||"<p class='muted'>Say hello to the LIVE community.</p>";
    list.scrollTop=list.scrollHeight;
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
async function openLiveRoom(session,role,issuedLiveKit){
  stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();
  const liveKit=issuedLiveKit||(await api("/live/sessions/"+encodeURIComponent(session.id)+"/join",{method:"POST",body:"{}"})).liveKit;
  // The server-issued token role is authoritative; never trust a caller-supplied guest role.
  role=liveKit?.role==="host"?"host":liveKit?.role==="guest"?"guest":"viewer";
  const broadcastType=session.broadcastType==="audio_only"?"audio_only":"video_audio";
  const client=window.LivekitClient;
  if(!client?.Room||!client?.RoomEvent){if(role!=="host")await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});throw new Error("The LIVE player could not load. Refresh Minglora and try again.");}
  const liveTheme=LIVE_ROOM_THEME_OPTIONS.some(option=>option.value===session.liveTheme)?session.liveTheme:'studio';
  activeLiveSession={...session,liveTheme,broadcastType};activeLiveRole=role;liveCameraEnabled=broadcastType==="video_audio";liveMicrophoneEnabled=true;
  const stageMarkup=broadcastType==="audio_only"
    ? "<div id='live-video-stage' class='live-video-stage live-audio-stage'><div class='live-audio-scene'><div class='live-audio-orb'><span class='live-audio-orbit orbit-one'></span><span class='live-audio-orbit orbit-two'></span><img src='"+avatar(session.host||state.user)+"' alt='' class='live-audio-host-avatar'></div><model-viewer class='live-audio-mic-model' src='/assets/gifts/minglora_golden_microphone.gltf' alt='Minglora 3D golden microphone' auto-rotate camera-controls interaction-prompt='none' shadow-intensity='1' exposure='1.15' loading='eager'></model-viewer><span class='live-audio-live-label'>LIVE AUDIO</span><h2>You're in the room</h2><p>Voice-first. Camera-free. Join the conversation.</p><div class='live-audio-waveform' id='live-audio-waveform' aria-label='Live audio activity'><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div id='live-speaker-list' class='live-speaker-list'><span class='muted'>Connecting speakers…</span></div></div>"
    : "<div id='live-video-stage' class='live-video-stage'><div class='live-video-placeholder'>Connecting to LIVE…</div></div>";
  const speakerTools=role==="host"
    ? "<section class='live-speaker-request-panel host'><div class='live-speaker-panel-heading'><strong>Speaker stage</strong><small>Up to 8 guest speakers</small></div><div id='live-speaker-request-list'><p class='muted'>Loading speaker requests…</p></div></section>"
    : role==="viewer"
      ? "<section class='live-speaker-request-panel'><div class='live-speaker-panel-heading'><strong>Join the conversation</strong><small>Request a microphone seat from the host</small></div><button type='button' class='secondary full' id='live-request-speaker'>Raise hand to speak</button><p id='live-speaker-request-status' class='muted'>You are listening as an audience member.</p></section>"
      : "<section class='live-speaker-request-panel guest'><strong>You're on stage</strong><small>Your microphone is live. Your camera stays off.</small></section>";
  setContent("<section class='live-player-shell live-theme-"+liveTheme+" "+(broadcastType==="audio_only"?"live-player-audio-only":"live-player-video-audio")+"'><div class='live-player-header'><button class='text-button' id='live-back'>← Live now</button><div><span class='live-indicator'>LIVE</span><span class='live-broadcast-type'>"+(broadcastType==="audio_only"?"AUDIO ONLY":"VIDEO + AUDIO")+"</span><strong>"+esc(session.title)+"</strong></div><span id='live-viewer-count' class='live-viewer-count'>Connecting…</span></div>"+
    "<div class='live-player-layout'><div class='live-video-column'>"+stageMarkup+"<div id='live-audio-root' class='live-audio-root'></div>"+
    "<div class='live-player-controls'><button id='live-mic-toggle' class='secondary' "+((role==="host"||role==="guest")?"":"disabled")+">"+((role==="host"||role==="guest")?"Mute microphone":"Microphone unavailable")+"</button>"+
    (role==="host"&&broadcastType==="video_audio"?"<button id='live-camera-toggle' class='secondary'>Turn camera off</button>":"")+
    "<button id='live-leave' class='danger'>"+(role==="host"?"End LIVE":role==="guest"?"Leave stage":"Leave LIVE")+"</button></div></div>"+
    "<aside class='live-community-panel'><div class='live-community-title'><div><strong>LIVE community</strong><small>Be kind. Keep it positive.</small></div></div>"+speakerTools+"<div id='live-chat-list' class='live-chat-list'><p class='muted'>Loading comments…</p></div>"+
    "<form id='live-chat-form' class='live-chat-form'><input name='body' maxlength='500' placeholder='Add a comment…' required><button type='submit'>Send</button></form>"+
    (role==="host"
      ? "<div class='live-gift-host-note'><strong>Your LIVE is ready for gifts</strong><p>Viewers can send you gifts while you are broadcasting.</p></div>"
      : "<div class='live-gift-panel'><div class='live-gift-heading'><strong>Send a gift</strong><span id='live-wallet-balance'>Loading Coins…</span></div><div id='live-gift-grid' class='live-gift-grid'></div><button class='text-button' id='live-recharge'>Recharge Minglora Coins</button></div>")+
    "</aside></div></section>");
  const room=new client.Room({adaptiveStream:true,dynacast:true});activeLiveRoom=room;
  const updatePresence=()=>{const count=Number(room.remoteParticipants?.size||0)+(role==="viewer"?0:1);const counter=$("#live-viewer-count");if(counter)counter.textContent=count.toLocaleString()+" in room";};
  const activeLiveSpeakerIds=new Set();
  const refreshSpeakerRoster=()=>renderLiveSpeakerRoster(room,role,session,activeLiveSpeakerIds);
  room.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>{attachLiveTrack(track,participant,false);refreshSpeakerRoster();});
  room.on(client.RoomEvent.TrackUnsubscribed,track=>{track.detach().forEach(element=>element.remove());refreshSpeakerRoster();});
  room.on(client.RoomEvent.ParticipantConnected,()=>{updatePresence();refreshSpeakerRoster();});
  room.on(client.RoomEvent.ParticipantDisconnected,()=>{updatePresence();refreshSpeakerRoster();});
  if(client.RoomEvent.TrackPublished)room.on(client.RoomEvent.TrackPublished,refreshSpeakerRoster);
  if(client.RoomEvent.TrackUnpublished)room.on(client.RoomEvent.TrackUnpublished,refreshSpeakerRoster);
  if(client.RoomEvent.ActiveSpeakersChanged)room.on(client.RoomEvent.ActiveSpeakersChanged,speakers=>{
    activeLiveSpeakerIds.clear();
    (Array.isArray(speakers)?speakers:[]).forEach(person=>activeLiveSpeakerIds.add(person.identity));
    $("#live-audio-waveform")?.classList.toggle("is-active",activeLiveSpeakerIds.size>0);
    refreshSpeakerRoster();
  });
  room.on(client.RoomEvent.Disconnected,()=>{if(activeLiveRoom===room)toast("Your LIVE connection was disconnected.");});
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
    if(role==="host"&&broadcastType==="video_audio"){
      await room.localParticipant.enableCameraAndMicrophone();
      for(const publication of room.localParticipant.videoTrackPublications.values())if(publication.track)attachLiveTrack(publication.track,room.localParticipant,true);
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
    }
    updatePresence();
    refreshSpeakerRoster();
    await syncLiveParticipantPresence(session);
    $("#live-mic-toggle").disabled=!(role==="host"||role==="guest");
    if($("#live-camera-toggle"))$("#live-camera-toggle").disabled=role!=="host";
    $("#live-mic-toggle")?.addEventListener("click",async()=>{try{liveMicrophoneEnabled=!liveMicrophoneEnabled;await room.localParticipant.setMicrophoneEnabled(liveMicrophoneEnabled);$("#live-mic-toggle").textContent=liveMicrophoneEnabled?"Mute microphone":"Unmute microphone";refreshSpeakerRoster();}catch(error){toast(error.message);}});
    $("#live-camera-toggle")?.addEventListener("click",async()=>{try{liveCameraEnabled=!liveCameraEnabled;await room.localParticipant.setCameraEnabled(liveCameraEnabled);$("#live-camera-toggle").textContent=liveCameraEnabled?"Turn camera off":"Turn camera on";}catch(error){toast(error.message);}});
    $("#live-leave")?.addEventListener("click",async()=>{
      const button=$("#live-leave");if(button)button.disabled=true;
      try{
        if(role==="host")await endHostedLiveSession(session);
        else await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"});
      }catch(error){
        toast(error.message);
        if(button)button.disabled=false;
        return;
      }
      stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-back")?.addEventListener("click",async()=>{
      if(role==="host"){toast("End your LIVE session before returning to the directory.");return;}
      await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});
      stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-chat-form")?.addEventListener("submit",async event=>{
      event.preventDefault();const form=event.currentTarget,body=String(form.elements.body.value||"").trim();if(!body)return;
      const button=form.querySelector("button");button.disabled=true;
      try{await api("/live/sessions/"+encodeURIComponent(session.id)+"/chat",{method:"POST",body:JSON.stringify({body})});form.reset();await refreshLiveChat(session.id);}
      catch(error){toast(error.message);}finally{button.disabled=false;}
    });
    if(role!=="host"){
      const economyResults=await Promise.allSettled([api("/coins/catalog"),api("/coins/wallet")]);
      const catalog=economyResults[0].status==="fulfilled"?economyResults[0].value:{gifts:[]};
      const wallet=economyResults[1].status==="fulfilled"?economyResults[1].value:{wallet:null};
      liveGiftCatalogue=Array.isArray(catalog.gifts)?catalog.gifts:[];
      const walletBalance=$("#live-wallet-balance");
      if(walletBalance)walletBalance.textContent=wallet.wallet&&wallet.wallet.balance_coins!=null
        ?Number(wallet.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable";
      const giftGrid=$("#live-gift-grid");
      if(giftGrid)giftGrid.innerHTML=liveGiftCatalogue.length?liveGiftCatalogue.map(gift=>"<button type='button' class='live-gift-button' data-live-gift='"+esc(gift.code)+"'><span class='live-gift-model-slot'>"+(gift.model_url?"<model-viewer src='"+esc(gift.model_url)+"' alt='"+esc(gift.name)+"' auto-rotate rotation-per-second='34deg' interaction-prompt='none'></model-viewer>":esc(gift.emoji))+"</span><strong>"+esc(gift.name)+"</strong><small>"+Number(gift.coin_price).toLocaleString()+" Coins</small></button>").join(""):"<p class='muted'>Gifts are temporarily unavailable. You can keep watching the LIVE stream.</p>";
      document.querySelectorAll("[data-live-gift]").forEach(button=>button.addEventListener("click",async()=>{
        button.disabled=true;
        try{
          const sent=await api("/live/sessions/"+encodeURIComponent(session.id)+"/gifts",{method:"POST",body:JSON.stringify({giftCode:button.dataset.liveGift})}),gift=sent.gift;
          toast((gift.emoji||"🎁")+" "+gift.giftName+" sent · "+Number(gift.coinAmount||0).toLocaleString()+" Minglora Coins");
          const walletResult=await api("/coins/wallet").catch(()=>null);
          const balanceElement=$("#live-wallet-balance");
          if(balanceElement)balanceElement.textContent=walletResult?.wallet&&walletResult.wallet.balance_coins!=null
            ?Number(walletResult.wallet.balance_coins).toLocaleString()+" Coins":"Balance unavailable";
          const stage=$("#live-video-stage"),catalogGift=liveGiftCatalogue.find(item=>item.code===button.dataset.liveGift)||{};
          if(stage){
            const effect=document.createElement("div");effect.className="live-gift-effect live-gift-effect-3d";
            effect.dataset.animationPreset=catalogGift.animation_preset||catalogGift.animation_key||"gift-float";
            if(catalogGift.model_url)effect.innerHTML="<model-viewer src='"+esc(catalogGift.model_url)+"' alt='"+esc(catalogGift.name||gift.giftName||"Minglora gift")+"' auto-rotate rotation-per-second='78deg' interaction-prompt='none'></model-viewer>";
            else effect.textContent=gift.emoji||"🎁";
            stage.append(effect);setTimeout(()=>effect.remove(),2600);
          }
        }catch(error){toast(error.message);}finally{button.disabled=false;}
      }));
      $("#live-recharge")?.addEventListener("click",()=>activateNav("coins"));
    }
    await refreshLiveChat(session.id);liveChatRefreshTimer=setInterval(()=>refreshLiveChat(session.id),5000);
    startLiveSpeakerRefresh(session,role,room);
    if(role==="host")toast(broadcastType==="audio_only"?"You are LIVE in Audio Only mode. Your camera was not requested.":"You are LIVE. Your camera and microphone are connected.");
    else if(role==="guest")toast("You're on stage. Your microphone is connected; camera publishing is disabled.");
  }catch(error){
    stopLiveChatRefresh();stopLiveSpeakerRefresh();stopLiveParticipantSync();await room.disconnect().catch(()=>{});activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;
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
  activateSilent("coins");const results=await Promise.all([api("/coins/catalog"),api("/coins/wallet")]),catalog=results[0],wallet=results[1];
  const balance=Number(wallet.wallet?.balance_coins||0),packages=catalog.packages||[];
  setContent("<div class='page-heading'><div><span class='eyebrow'>Minglora Coins</span><h1>Your Coins</h1><p class='muted'>Recharge securely and use Coins to support creators during LIVE.</p></div><div class='coin-balance-card'><small>Available balance</small><strong>"+balance.toLocaleString()+"</strong><span>Minglora Coins</span></div></div>"+
    "<section class='card'><div class='feed-header'><h2>Choose a recharge package</h2><span class='muted'>Secure PayPal checkout · USD</span></div><div class='coin-package-grid'>"+
    packages.map(pack=>"<button type='button' class='coin-package-card' data-coin-package='"+esc(pack.code)+"'><span>"+esc(pack.name)+"</span><strong>"+Number(pack.coin_amount).toLocaleString()+"</strong><small>Minglora Coins</small><b>"+liveMoney(pack.price_minor)+"</b></button>").join("")+
    "</div><form id='custom-coins-form' class='custom-coins-form'><label for='custom-coin-amount'>Or choose a custom amount</label><div><input id='custom-coin-amount' name='coinAmount' type='number' min='100' max='100000' step='2' value='200' required><button class='primary' type='submit'>Buy custom amount</button></div><small>100–100,000 Minglora Coins · 1 Coin = USD $0.01</small></form></section>"+
    "<section class='card'><div class='feed-header'><h2>Coin activity</h2><span class='muted'>Your latest wallet transactions</span></div>"+
    ((wallet.ledger||[]).length?wallet.ledger.slice(0,40).map(item=>"<div class='coin-ledger-row'><div><strong>"+esc(item.description||item.entry_type||"Wallet activity")+"</strong><small>"+timeAgo(item.created_at)+"</small></div><b class='"+(Number(item.delta_coins)>=0?"positive":"negative")+"'>"+(Number(item.delta_coins)>0?"+":"")+Number(item.delta_coins).toLocaleString()+" Coins</b></div>").join(""):"<p class='muted'>Your Coin activity will appear here.</p>")+"</section>");
  document.querySelectorAll("[data-coin-package]").forEach(button=>button.addEventListener("click",()=>startCoinPurchase({packageCode:button.dataset.coinPackage,button})));
  $("#custom-coins-form")?.addEventListener("submit",event=>{event.preventDefault();startCoinPurchase({coinAmount:Number(event.currentTarget.elements.coinAmount.value),button:event.currentTarget.querySelector("button")});});
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
  return "<svg class='creator-ico' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-2#"+esc(name)+"'></use></svg>";
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
      "<button type='button' class='live-format-card creator-live-format-card' data-creator-start-live='video_audio'><span class='live-format-icon'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-2#live'></use></svg></span><span><strong>Video LIVE</strong><small>Camera and microphone</small></span></button>"+
      "<button type='button' class='live-format-card creator-live-format-card' data-creator-start-live='audio_only'><span class='live-format-icon audio'><svg class='live-format-3d-icon' viewBox='0 0 64 64' aria-hidden='true'><use href='/assets/icons/navigation-3d.svg?v=20261031-creator-stage-sticky-fallback-2#microphone'></use></svg></span><span><strong>Audio LIVE</strong><small>Voice-first broadcast</small></span></button>"+
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
  const s=state.creatorStudio,profile=s.profile||{},insights=profile.profileInsights||{},user=profile.user||{};
  const posts=Array.isArray(profile.posts)?profile.posts:[];
  const pages=creatorOwnPages(),earnings=s.earnings||{};
  const totalViews=insights.profileViews30d;
  const activeViewers=insights.activeViewersCount;
  const preview=posts.slice(0,2).map(creatorPostCard).join("");
  return "<section class='creator-stage-card'><div class='creator-stage-copy'><span class='creator-stage-label'><i></i> MINGLORA CREATIVE WORKSPACE</span><h2>Make your next<br><em>moment matter.</em></h2><p>Plan your content, publish to your community and turn real audience activity into creator growth.</p><div class='creator-stage-actions'><button type='button' class='primary' data-creator-section='publish'>"+creatorIcon("create")+" Create a post</button><button type='button' class='secondary' data-creator-section='content'>Explore your content ↗</button></div><div class='creator-stage-note'>Your creator space is separate from the live broadcast room.</div></div>"+
    "<div class='creator-stage-visual'><canvas id='creator-stage-canvas' aria-label='Interactive real-time 3D Minglora creator production studio'></canvas>"+creatorStageSvgMarkup()+"<div class='creator-stage-caption'><span></span> LIVE WEBGL 3D SCENE <small>Drag to orbit</small></div><div class='creator-stage-controls'><button type='button' id='creator-stage-reset' aria-label='Reset 3D studio view'>↻</button><button type='button' id='creator-stage-pause' aria-label='Pause 3D studio animation'>Ⅱ</button></div><p class='creator-stage-fallback' id='creator-stage-fallback' hidden>3D compatibility renderer active.</p></div></section>"+
    "<div class='creator-section-title'><div><span class='creator-eyebrow'>CHANNEL OVERVIEW</span><h2>Your performance, at a glance</h2></div><button type='button' class='creator-inline-link' data-creator-section='analytics'>View analytics ↗</button></div>"+
    "<div class='creator-metrics-grid'>"+
      creatorMetric("Followers",creatorNumber(profile.followersCount),"Current profile audience","friends")+
      creatorMetric("Profile views · 30 days",totalViews==null?"Unavailable":creatorNumber(totalViews),"Recorded profile visits","explore")+
      creatorMetric("Active profile viewers",activeViewers==null?"Unavailable":creatorNumber(activeViewers),"Current recorded profile presence","activity")+
      creatorMetric("Published posts",creatorNumber(posts.length),"Your published personal posts","saved")+
    "</div>"+
    "<div class='creator-overview-lower'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR LATEST WORK</span><h3>Recent publications</h3></div><button type='button' class='creator-inline-link' data-creator-section='content'>View all ↗</button></div>"+(preview||creatorEmpty("Your content starts here","Publish a post and your real content will appear in this workspace.","create"))+"</section>"+
    "<section class='creator-studio-panel creator-shortcuts-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>CREATOR TOOLS</span><h3>Your workspace</h3></div></div>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='content'>"+creatorIcon("saved")+"<span><strong>Content library</strong><small>Manage your posts and media</small></span><b>↗</b></button>"+
      "<button type='button' class='creator-shortcut-row' data-creator-section='audience'>"+creatorIcon("friends")+"<span><strong>Audience</strong><small>Followers and real profile activity</small></span><b>↗</b></button>"+
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
  const s=state.creatorStudio,p=s.profile||{},ins=p.profileInsights||{};
  const followers=s.followers||[],following=s.following||[];
  const rows=(items,error)=>error?creatorEmpty('Audience list unavailable',error,'friends'):items.length?items.map(person=>"<article class='creator-audience-row'><img src='"+avatar(person)+"' alt=''><span><strong>"+esc(person.name||"Minglora member")+"</strong><small>@"+esc(person.username||"member")+"</small></span><button type='button' class='secondary' data-creator-view-profile='"+esc(person.id)+"'>View profile</button></article>").join(""):creatorEmpty("No members to show","This list is empty. Minglora does not add sample users or follower records.","friends");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>YOUR COMMUNITY</span><h2>Audience</h2><p>Real follower relationships and the profile activity Minglora currently records.</p></div><button type='button' class='secondary' id='creator-refresh-audience'>↻ Refresh audience</button></div>"+
    "<div class='creator-audience-summary'>"+creatorMetric("Followers",creatorNumber(p.followersCount),"Members following your profile","friends")+creatorMetric("Following",creatorNumber(p.followingCount),"Profiles you follow","profile")+creatorMetric("Profile views · 30 days",ins.profileViews30d==null?"Unavailable":creatorNumber(ins.profileViews30d),"Recorded profile views","explore")+creatorMetric("Active profile viewers",ins.activeViewersCount==null?"Unavailable":creatorNumber(ins.activeViewersCount),"Current recorded visitors","activity")+"</div>"+
    "<div class='creator-audience-columns'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR COMMUNITY</span><h3>Followers</h3></div><span class='creator-panel-count'>"+creatorNumber(p.followersCount)+"</span></div><div class='creator-audience-list'>"+rows(followers,s.audienceError)+"</div></section><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>YOUR NETWORK</span><h3>Following</h3></div><span class='creator-panel-count'>"+creatorNumber(p.followingCount)+"</span></div><div class='creator-audience-list'>"+rows(following,s.followingError)+"</div></section></div>";
}
function creatorAnalyticsMarkup(){
  const s=state.creatorStudio,p=s.profile||{},i=p.profileInsights||{};
  const posts=Array.isArray(p.posts)?p.posts:[];
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>MEASURE WHAT MATTERS</span><h2>Creator analytics</h2><p>Only metrics returned by Minglora’s existing profile insights API are displayed here.</p></div><button type='button' class='secondary' id='creator-refresh-analytics'>↻ Refresh</button></div>"+
    "<div class='creator-analytics-source'><span>✓</span><div><strong>Account-backed profile insights</strong><small>Counts below are recorded by Minglora. The current API does not yet expose watch time, post reach, click-through or daily growth series.</small></div></div>"+
    "<div class='creator-analytics-grid'>"+creatorMetric("Profile views · 30 days",i.profileViews30d==null?"Unavailable":creatorNumber(i.profileViews30d),"Recorded profile visits","explore")+creatorMetric("Active profile viewers",i.activeViewersCount==null?"Unavailable":creatorNumber(i.activeViewersCount),"Current profile presence records","activity")+creatorMetric("Followers",creatorNumber(p.followersCount),"Current follower relationship count","friends")+creatorMetric("Published posts",creatorNumber(posts.length),"Personal posts visible on your profile","saved")+"</div>"+
    "<section class='creator-studio-panel creator-analytics-limits'><span class='creator-eyebrow'>METRIC COVERAGE</span><h3>What Minglora can measure today</h3><div class='creator-coverage-list'><p><b>Available</b><span>Profile views in the last 30 days, active profile visitors, follower count, following count, published posts.</span></p><p><b>Not yet available</b><span>Per-post impressions, watch time, retention, completion, audience demographics, conversion funnels and time-series charts.</span></p></div></section>";
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
  const platformTotal=ledger.reduce((sum,row)=>sum+Number(row.platform_share_minor||0),0);
  const history=ledger.length?ledger.map(item=>"<article class='creator-ledger-row'><div><strong>LIVE gift earnings</strong><small>"+esc(item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable")+"</small></div><span class='creator-ledger-share'>Creator share "+creatorMoney(item.creator_share_minor)+"</span><strong>"+creatorMoney(item.creator_share_minor)+"</strong></article>").join(""):creatorEmpty("No creator earnings yet","Eligible gift earnings will appear here after real LIVE gift transactions are settled.","coins");
  const payoutHistory=payouts.length?payouts.map(item=>"<article class='creator-ledger-row'><div><strong>"+esc(String(item.status||"unknown").replace(/_/g," ").toUpperCase())+"</strong><small>"+esc(item.created_at?new Date(item.created_at).toLocaleString():"Date unavailable")+"</small></div><span class='creator-ledger-share'>PayPal payout</span><strong>"+creatorMoney(item.amount_minor)+"</strong></article>").join(""):creatorEmpty("No withdrawals yet","Confirmed payout requests will appear in this history.","coins");
  return "<div class='creator-subpage-heading'><div><span class='creator-eyebrow'>CREATOR BUSINESS</span><h2>Monetization</h2><p>Manage actual creator gift earnings and PayPal withdrawal details.</p></div><span class='creator-finance-lock'>"+creatorIcon("settings")+" Server-authoritative amounts</span></div>"+
    "<div class='creator-earning-metrics'>"+creatorMetric("Your eligible share",creatorMoney(data.earnedMinor),"50% creator share from eligible LIVE gifts","coins")+creatorMetric("Available to withdraw",creatorMoney(data.availableMinor),"Current server-calculated amount","saved")+creatorMetric("Minglora platform share",creatorMoney(platformTotal),"Recorded platform share from the ledger","profile")+"</div>"+
    "<div class='creator-monetization-grid'><section class='creator-studio-panel'><div class='creator-panel-heading'><div><span class='creator-eyebrow'>PAYOUT SETTINGS</span><h3>PayPal recipient</h3></div></div><p class='creator-settings-note'>Add or update the PayPal email used for creator withdrawals. Minglora sends a request only after checking the current available balance.</p><form id='creator-payout-account-form' class='creator-payout-form'><label class='creator-field-label' for='creator-paypal-email'>PayPal account email</label><input id='creator-paypal-email' name='paypalEmail' type='email' autocomplete='email' maxlength='254' required placeholder='your-paypal@example.com' value='"+esc(account?.paypal_email||"")+"'><button type='submit' class='primary'>Save payout email</button><p class='creator-inline-status' id='creator-payout-account-status' role='status'></p></form>"+
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
    $("#creator-refresh-audience")?.addEventListener("click",()=>renderCreatorSection("audience"));
  }
  if(section==="analytics"){
    $("#creator-refresh-analytics")?.addEventListener("click",async()=>{
      try{s.profile=await api("/users/"+encodeURIComponent(state.user.id));await renderCreatorSection("analytics");}
      catch(error){toast(error.message);}
    });
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

function activateSilent(view){if(view!=='profile')stopProfilePresence();if(view!=='friends')stopPeopleDiscoveryRefresh();state.view=view;syncMessageRefreshPolling();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}
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
  activateSilent('group');state.activeGroup=groupId;
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
async function openProfile(id,openEditor=false){stopProfilePresence();try{const data=await api(`/users/${id}`);state.profile=data;renderProfile(data);if(openEditor)openEditProfile(data.user)}catch(e){toast(e.message)}}
window.addEventListener('minglora:open-profile-editor',()=>{if(state.user)void openProfile(state.user.id,true);});

async function renderConnections(profileId,kind){
  if(!['followers','following','friends'].includes(kind))return;
  state.activeConnections={profileId,kind};activateSilent('connections');
  try{
    const results=await Promise.all([api('/users/'+encodeURIComponent(profileId)+'/'+kind),api('/users/'+encodeURIComponent(profileId))]);
    const data=results[0],profile=results[1],users=data.users||[];
    const rows=users.map(member=>'<div class="settings-blocked-person connection-row"><img src="'+avatar(member)+'" alt=""><div><strong>'+esc(member.name)+'</strong><small>@'+esc(member.username)+'</small></div><button class="secondary" type="button" data-profile="'+esc(member.id)+'">View profile</button></div>').join('');
    setContent('<div class="page-heading"><div><h1>'+(kind==='followers'?'Followers':kind==='following'?'Following':'Friends')+'</h1><p class="muted">'+esc(profile.user.name)+' · '+data.count+' '+kind+'</p></div><button class="secondary" id="connections-back">Back to profile</button></div><section class="card">'+(rows||'<div class="empty-state"><h3>No '+kind+' yet</h3><p>This list will appear when members connect.</p></div>')+'</section>');
    $('#connections-back')?.addEventListener('click',()=>openProfile(profileId));
    document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.profile)));
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
function renderProfile(data){
  activateSilent('profile');const u=data.user,isMe=u.id===state.user.id;
  const relationshipActions=isMe
    ? '<button class="secondary profile-edit" id="edit-profile">Edit profile</button>'
    : `<div class="profile-actions"><button class="primary profile-edit" id="profile-follow" data-following="${data.following?'true':'false'}">${data.following?(data.friendship==='accepted'?'Friends · Following':'Following'):(data.friendship==='accepted'?'Friends':'Follow')}</button><button class="secondary profile-edit" id="profile-message">Message</button><button class="secondary profile-edit" data-profile-call="audio">Voice call</button><button class="secondary profile-edit" data-profile-call="video">Video call</button><button class="secondary profile-edit" id="profile-report">Report</button><button class="secondary profile-edit" id="profile-block">Block</button></div>`;
  const aboutRows=[
    ['Bio',u.bio],['Location',u.location],
    ['Country',u.country],['County',u.county],
    ['Parish',u.parish],['City',u.city],['Gender',u.gender],
    ['Relationship status',u.relationshipStatus],['Contact phone',u.contactPhone]
  ].filter(([,value])=>String(value||'').trim());
  aboutRows.push(['Joined',new Date(u.createdAt).toLocaleDateString(undefined,{month:'long',year:'numeric'})]);
  const aboutHtml=aboutRows.map(([label,value])=>`<div class="about-row${label==='Bio'?' about-row-bio':''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  setContent(`<section class="card" style="padding:0;overflow:hidden"><div class="profile-cover" data-view-image="${esc(u.cover||'')}" data-image-label="${esc(u.name)} cover photo" style="${u.cover?`background-image:url('${esc(u.cover)}')`:''}"></div><div class="profile-info"><img class="avatar" data-view-image="${esc(u.avatar||'')}" data-image-label="${esc(u.name)} profile picture" src="${avatar(u)}" alt=""><div class="profile-info-main"><h1>${esc(u.name)}</h1><p>@${esc(u.username)}</p><p class="profile-counts"><button type="button" class="connection-count" data-open-connections="followers"><strong>${data.followersCount||0}</strong> followers</button><button type="button" class="connection-count" data-open-connections="following"><strong>${data.followingCount||0}</strong> following</button><button type="button" class="connection-count" data-open-connections="friends"><strong>${data.friendsCount||0}</strong> friends</button><span><strong>${data.posts.length}</strong> posts</span></p>${isMe?`<div class="profile-live-insights" aria-label="Profile analytics"><span><strong id="profile-views-count">${Number(data.profileInsights?.profileViews30d||0).toLocaleString()}</strong><small>Profile views · 30 days</small></span><span class="profile-viewing-now"><i aria-hidden="true"></i><strong id="profile-active-viewers-count">${Number(data.profileInsights?.activeViewersCount||0).toLocaleString()}</strong><small>Viewing now</small></span></div><p class="profile-insights-note">Visits from signed-in members. Each member counts once per day.</p>`:''}</div>${relationshipActions}</div><div class="profile-tabs"><button class="active">Posts</button><button id="profile-about-tab">About</button><button id="profile-friends-tab">Friends</button></div></section><div class="profile-body"><div class="card profile-about"><div class="about-heading"><h3>About</h3>${isMe?'<button class="text-button" id="edit-about-inline">Edit</button>':''}</div>${aboutHtml||'<p class="muted">No About details have been added yet.</p>'}</div><div><div class="card"><div class="composer-top"><img class="avatar" src="${avatar(state.user)}" alt=""><button class="composer-open" id="profile-composer">${isMe?'Share an update':`Share an update on ${esc(u.name.split(' ')[0])}'s profile`}</button></div></div>${data.posts.length?data.posts.map(postCard).join(''):'<section class="card empty-state"><h3>No posts yet</h3><p>Posts shared by this profile will appear here.</p></section>'}</div></div>`);
  bindFeed();
  $('#edit-profile')?.addEventListener('click',()=>openEditProfile(u));
  $('#edit-about-inline')?.addEventListener('click',()=>openEditProfile(u));
  $('#profile-follow')?.addEventListener('click',async()=>{
    const following=$('#profile-follow')?.dataset.following==='true';
    try{
      const result=await api(`/users/${u.id}/follow`,{method:following?'DELETE':'POST',body:'{}'});
      toast(result.friends?'You are now friends through mutual follows.':(following?'Unfollowed member.':'Now following member.'));
      await openProfile(u.id);
    }catch(e){toast(e.message);}
  });
  $('#profile-message')?.addEventListener('click',()=>openMessageWindow(u));
  document.querySelectorAll('[data-profile-call]').forEach(button=>button.addEventListener('click',()=>startMingloraCall(u,button.dataset.profileCall)));
  $('#profile-report')?.addEventListener('click',()=>openReportComposer('user',u.id));
  $('#profile-block')?.addEventListener('click',async()=>{if(!window.confirm(`Block ${u.name}? You will no longer see each other’s profile, posts or messages.`))return;try{await api(`/users/${u.id}/block`,{method:'POST',body:'{}'});toast('Member blocked.');state.profile=null;state.view='feed';await loadPeople();await loadFeed('all');await renderFeed();await renderSidebar()}catch(e){toast(e.message)}});
  $('#profile-composer')?.addEventListener('click',()=>openComposer());
  $('#profile-about-tab')?.addEventListener('click',()=>{document.querySelectorAll('.profile-tabs button').forEach(button=>button.classList.toggle('active',button.id==='profile-about-tab'));document.querySelector('.profile-about')?.scrollIntoView({behavior:'smooth'});});
  $('#profile-friends-tab')?.addEventListener('click',()=>renderConnections(u.id,'friends'));
  document.querySelectorAll('[data-open-connections]').forEach(button=>button.addEventListener('click',()=>renderConnections(u.id,button.dataset.openConnections)));
  document.querySelectorAll('[data-view-image]').forEach(image=>image.addEventListener('click',()=>{const url=image.dataset.viewImage;if(url)openImageViewer(url,image.dataset.imageLabel||'Profile image');}));
  startProfilePresence(u.id);
}
function mediaMaxBytes(slot){
  return slot==='avatar'?10*1024*1024:slot==='cover'?20*1024*1024:slot==='story'?200*1024*1024:slot==='marketplace'?15*1024*1024:slot==='group'||slot==='page'?250*1024*1024:slot==='message'?100*1024*1024:500*1024*1024;
}
function mediaMaxLabel(slot){
  return slot==='avatar'?'10 MB':slot==='cover'?'20 MB':slot==='story'?'200 MB':slot==='marketplace'?'15 MB':slot==='group'||slot==='page'?'250 MB':slot==='message'?'100 MB':'500 MB';
}
async function uploadMediaFile(slot,file,zoom=1,rotation=0,onProgress=()=>{}){
  if(file.size>mediaMaxBytes(slot))throw new Error('This file is larger than the '+mediaMaxLabel(slot)+' limit for this media area.');
  let prepared=file;
  if(imageMime(file))prepared=await transformMediaImage(file,zoom,rotation);
  let mimeType=String(prepared.type||'').split(';')[0].trim().toLowerCase();
  if(!mimeType&&prepared.name?.toLowerCase().endsWith('.glb'))mimeType='model/gltf-binary';
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
    if(!window.tus?.Upload||!uploadInfo.endpoint||!uploadInfo.token)throw new Error('The secure resumable upload component did not load. Refresh Minglora and try again.');
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
async function uploadProfileImage(slot,file,zoom=1,rotation=0,onProgress=()=>{}){
  if(!file)return null;
  if(file.size>mediaMaxBytes(slot))throw new Error('Profile media must be '+mediaMaxLabel(slot)+' or smaller.');
  const allowed=['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','image/heic-sequence','image/heif-sequence'];
  if(!allowed.includes(file.type)&&!/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name||''))throw new Error('Choose a supported JPEG, PNG, WEBP, AVIF, HEIC or HEIF image.');
  return uploadMediaFile(slot,file,zoom,rotation,onProgress);
}

let mediaPickerSequence=0;
function mediaAccept(slot){
  if(slot==='message')return 'image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/webm,application/pdf,text/plain,text/csv,application/zip,application/x-zip-compressed,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if(slot==='marketplace')return 'image/jpeg,image/png,image/webp,image/avif';
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
function createMediaPicker(root,options={}){
  const slot=options.slot||'post',maxFiles=options.maxFiles||10,accept=options.accept||mediaAccept(slot),initialMedia=options.initialMedia||[];
  const pickerId='minglora-media-picker-'+(++mediaPickerSequence),entries=[],objectUrls=[];
  initialMedia.forEach(item=>entries.push({existing:true,id:item.id,url:item.url,mimeType:item.mimeType||'image/jpeg',mediaType:item.mediaType||'image',name:'Attached media',zoom:1,rotation:0}));
  root.innerHTML='<div class="media-picker"><div class="media-picker-actions"><button type="button" class="secondary" data-media-gallery>Choose from gallery / files</button><button type="button" class="secondary" data-media-camera>Take photo / video</button><input type="file" class="media-picker-input" data-media-input accept="'+esc(accept)+'" '+(maxFiles>1?'multiple':'')+'><input type="file" class="media-picker-input" data-media-camera-input accept="image/*,video/*" capture="environment"></div><p class="media-picker-help">Select media from your gallery, folders or camera. Large uploads retry automatically when the connection briefly drops. Up to '+maxFiles+' files; '+mediaMaxLabel(slot)+' per file.</p><div class="media-picker-items" data-media-items></div><p class="media-picker-status muted" data-media-status role="status"></p><progress class="media-upload-progress" max="100" value="0" hidden></progress></div>';
  const gallery=root.querySelector('[data-media-input]'),camera=root.querySelector('[data-media-camera-input]'),list=root.querySelector('[data-media-items]'),status=root.querySelector('[data-media-status]'),progress=root.querySelector('.media-upload-progress');
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
      const baseMime=String(file.type||'').split(';')[0].trim().toLowerCase();
      const allowed=accept.split(',').some(pattern=>pattern.trim().startsWith('.')?file.name.toLowerCase().endsWith(pattern.trim().toLowerCase()):pattern.trim().endsWith('/*')?baseMime.startsWith(pattern.trim().slice(0,-1)):baseMime===pattern.trim().toLowerCase());
      if(!allowed){status.textContent=file.name+' has an unsupported file type.';continue;}
      const previewUrl=URL.createObjectURL(file);objectUrls.push(previewUrl);
      entries.push({file,previewUrl,zoom:1,rotation:0,mediaType:file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type==='model/gltf-binary'?'model3d':'document'});
    }
    render();
  }
  gallery.addEventListener('change',()=>{addFiles(gallery.files);gallery.value='';});
  camera.addEventListener('change',()=>{addFiles(camera.files);camera.value='';});
  root.querySelector('[data-media-gallery]').addEventListener('click',()=>gallery.click());
  root.querySelector('[data-media-camera]').addEventListener('click',()=>openDeviceCapture({mode:'both',onCapture:file=>addFiles([file])}));
  render();
  return {
    hasSelection:()=>entries.length>0,
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

function openEditProfile(u){
  const aboutVisibility={bio:true,location:true,country:false,county:false,parish:false,city:false,gender:false,relationshipStatus:false,contactPhone:false,...(u.aboutVisibility||{})};
  const modal=document.createElement('div');modal.className='modal-backdrop profile-editor-backdrop';
  modal.innerHTML=`<section class="modal profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
    <div class="modal-head"><h2 id="edit-profile-title">Edit profile</h2><button class="modal-close" aria-label="Close">×</button></div>
    <form class="modal-body" id="edit-profile-form">
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
      <div class="profile-upload-section">
        <h3>Profile picture</h3><div class="profile-upload-row"><img id="edit-avatar-preview" class="profile-upload-avatar" src="${avatar(u)}" alt="Profile picture preview"><div class="profile-upload-controls"><div class="profile-upload-buttons"><label class="secondary profile-file-button" for="edit-avatar-file">Choose from gallery / files</label><button class="secondary" type="button" id="edit-avatar-camera-button">Take photo</button></div><input id="edit-avatar-file" class="profile-file-input" type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"><input id="edit-avatar-camera" class="profile-file-input" type="file" accept="image/*" capture="environment"><label class="profile-zoom-control">Zoom / crop <input type="range" min="1" max="2.5" step="0.05" value="1" id="edit-avatar-zoom"></label><button class="secondary" type="button" id="edit-avatar-rotate">Rotate 90°</button><small>Choose from your phone gallery, files or use the camera. Adjust zoom and crop before saving.</small></div></div>
      </div>
      <div class="profile-upload-section">
        <h3>Cover photo</h3><div id="edit-cover-preview" class="profile-cover-upload-preview" role="img" aria-label="Cover photo preview"></div><div class="profile-upload-controls"><div class="profile-upload-buttons"><label class="secondary profile-file-button" for="edit-cover-file">Choose from gallery / files</label><button class="secondary" type="button" id="edit-cover-camera-button">Take cover photo</button></div><input id="edit-cover-file" class="profile-file-input" type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"><input id="edit-cover-camera" class="profile-file-input" type="file" accept="image/*" capture="environment"><label class="profile-zoom-control">Zoom / crop <input type="range" min="1" max="2.5" step="0.05" value="1" id="edit-cover-zoom"></label><button class="secondary" type="button" id="edit-cover-rotate">Rotate 90°</button><small>Use gallery, files or the device camera. Adjust zoom and crop before saving.</small></div>
      </div>
      <p class="profile-upload-status muted" id="profile-upload-status" role="status">Profile details save automatically. Selected profile and cover photos upload securely when you select Save changes.</p>
      <div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary" id="save-profile-button">Save changes</button></div>
    </form></section>`;
  document.body.append(modal);
  const avatarInput=modal.querySelector('#edit-avatar-file');
  const coverInput=modal.querySelector('#edit-cover-file');
  const avatarCamera=modal.querySelector('#edit-avatar-camera');
  const coverCamera=modal.querySelector('#edit-cover-camera');
  const avatarEdit={zoom:1,rotation:0},coverEdit={zoom:1,rotation:0};
  const avatarPreview=modal.querySelector('#edit-avatar-preview');
  const coverPreview=modal.querySelector('#edit-cover-preview');
  if(u.cover)coverPreview.style.backgroundImage='url("'+String(u.cover).replace(/["\\]/g,'')+'")';
  const previewUrls=[];
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
  function previewFile(input,target){
    const file=input.files?.[0];if(!file)return;
    if(!imageMime(file)){toast('Choose a supported JPEG, PNG, WEBP, AVIF, HEIC or HEIF image.');input.value='';return;}
    if(file.size>8*1024*1024){toast('Images must be 8 MB or smaller.');input.value='';return;}
    const url=URL.createObjectURL(file);previewUrls.push(url);if(target.tagName==='IMG')target.src=url;else{target.style.backgroundImage='url("'+url+'")';target.style.backgroundSize='cover';}target.classList.add('has-preview');
  }
  avatarInput.addEventListener('change',()=>{avatarEdit.zoom=1;avatarEdit.rotation=0;modal.querySelector('#edit-avatar-zoom').value='1';avatarPreview.style.transform='scale(1) rotate(0deg)';previewFile(avatarInput,avatarPreview);});
  coverInput.addEventListener('change',()=>{coverEdit.zoom=1;coverEdit.rotation=0;modal.querySelector('#edit-cover-zoom').value='1';coverPreview.style.transform='scale(1) rotate(0deg)';coverPreview.style.backgroundSize='cover';previewFile(coverInput,coverPreview);});
  function assignCameraFile(cameraInput,targetInput,targetPreview,editState,zoomInput){
    const file=cameraInput.files?.[0];if(!file)return;
    const transfer=new DataTransfer();transfer.items.add(file);targetInput.files=transfer.files;
    editState.zoom=1;editState.rotation=0;zoomInput.value='1';previewFile(targetInput,targetPreview);
  }
  modal.querySelector('#edit-avatar-camera-button').onclick=()=>openDeviceCapture({mode:'photo',onCapture:file=>{const transfer=new DataTransfer();transfer.items.add(file);avatarInput.files=transfer.files;avatarEdit.zoom=1;avatarEdit.rotation=0;modal.querySelector('#edit-avatar-zoom').value='1';previewFile(avatarInput,avatarPreview);}});
  modal.querySelector('#edit-cover-camera-button').onclick=()=>openDeviceCapture({mode:'photo',onCapture:file=>{const transfer=new DataTransfer();transfer.items.add(file);coverInput.files=transfer.files;coverEdit.zoom=1;coverEdit.rotation=0;modal.querySelector('#edit-cover-zoom').value='1';previewFile(coverInput,coverPreview);}});
  avatarCamera.addEventListener('change',()=>assignCameraFile(avatarCamera,avatarInput,avatarPreview,avatarEdit,modal.querySelector('#edit-avatar-zoom')));
  coverCamera.addEventListener('change',()=>assignCameraFile(coverCamera,coverInput,coverPreview,coverEdit,modal.querySelector('#edit-cover-zoom')));
  modal.querySelector('#edit-avatar-zoom').addEventListener('input',event=>{avatarEdit.zoom=Number(event.target.value);avatarPreview.style.transform='scale('+avatarEdit.zoom+') rotate('+avatarEdit.rotation+'deg)';});
  modal.querySelector('#edit-cover-zoom').addEventListener('input',event=>{coverEdit.zoom=Number(event.target.value);coverPreview.style.backgroundSize=(coverEdit.zoom*100)+'%';coverPreview.style.transform='rotate('+coverEdit.rotation+'deg)';});
  modal.querySelector('#edit-avatar-rotate').onclick=()=>{avatarEdit.rotation=(avatarEdit.rotation+90)%360;avatarPreview.style.transform='scale('+avatarEdit.zoom+') rotate('+avatarEdit.rotation+'deg)';};
  modal.querySelector('#edit-cover-rotate').onclick=()=>{coverEdit.rotation=(coverEdit.rotation+90)%360;coverPreview.style.transform='rotate('+coverEdit.rotation+'deg)';};
  const close=()=>{previewUrls.forEach(url=>URL.revokeObjectURL(url));modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
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
      if(avatarInput.files?.[0]){
        status.textContent='Uploading profile picture…';
        const edited=await transformMediaImage(avatarInput.files[0],avatarEdit.zoom,avatarEdit.rotation);
        await uploadProfileImage('avatar',edited,1,0,update=>{status.textContent='Uploading profile picture… '+update.percentage+'%';});
      }
      if(coverInput.files?.[0]){
        status.textContent='Uploading cover photo…';
        const edited=await transformMediaImage(coverInput.files[0],coverEdit.zoom,coverEdit.rotation);
        await uploadProfileImage('cover',edited,1,0,update=>{status.textContent='Uploading cover photo… '+update.percentage+'%';});
      }
      status.textContent='Saving profile details…';
      const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(collectProfilePayload())});
      state.user=result.user;
      close();
      showApp();
      await openProfile(state.user.id);
      toast('Profile updated and saved.');
    }catch(error){
      status.textContent='Profile changes were not saved. '+error.message;
      toast(error.message);
    }finally{
      button.disabled=false;
    }
  };

}
function openStoryComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="story-modal-title"><div class="modal-head"><h2 id="story-modal-title">Create a story</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="story-form"><div class="field"><label for="story-text">Text (optional)</label><textarea id="story-text" name="text" maxlength="1000" placeholder="Share a moment..."></textarea></div><div class="field"><label>Choose a photo or video</label><div id="story-media-picker"></div></div><div class="field"><label for="story-audience">Audience</label><select id="story-audience" name="audience"><option value="public">Public</option><option value="friends">Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><p class="muted">Stories expire automatically after 24 hours.</p><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish story</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#story-media-picker'),{slot:'story',maxFiles:1});
  const close=()=>{picker.destroy();modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=modal.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const values=new FormData(event.currentTarget),mediaIds=await picker.upload();
      if(!String(values.get('text')||'').trim()&&!mediaIds.length){toast('Write a story or choose a photo/video.');button.disabled=false;return;}
      await api('/stories',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaId:mediaIds[0]||null,audience:values.get('audience')})});
      close();await loadStories();if(state.view==='feed')await renderFeed();toast('Story published for 24 hours.');
    }catch(error){toast(error.message);button.disabled=false;}
  };
}
async function openStory(id){
  try{
    const result=await api('/stories/'+encodeURIComponent(id)+'/view',{method:'POST',body:'{}'});const s=result.story;const isOwner=s.userId===state.user.id;
    const viewers=isOwner&&Array.isArray(s.viewers)?s.viewers.filter(v=>v.user).map(v=>'<li>'+esc(v.user.name)+' <small>'+new Date(v.viewedAt).toLocaleString()+'</small></li>').join(''):'';
    const modal=document.createElement('div');modal.className='modal-backdrop story-viewer-backdrop';
    modal.innerHTML='<section class="modal story-viewer" role="dialog" aria-modal="true" aria-labelledby="story-viewer-title"><div class="modal-head"><div><h2 id="story-viewer-title">'+esc(s.author?.name||'Story')+'</h2><small>'+timeAgo(s.createdAt)+' · expires '+new Date(s.expiresAt).toLocaleString()+'</small></div><button class="modal-close" aria-label="Close">×</button></div>'+(s.media?renderSingleMedia(s.media,'story-viewer-image'):'')+(s.text?'<p class="story-viewer-text">'+esc(s.text)+'</p>':'')+(isOwner?'<section class="story-viewer-stats"><strong>'+result.story.viewCount+' views</strong>'+(viewers?'<ul>'+viewers+'</ul>':'<p class="muted">No other viewers yet.</p>')+'<button class="secondary full" id="delete-story">Delete story</button></section>':'<button class="secondary full" id="report-story">Report story</button>')+'</section>';
    document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>{modal.remove();loadStories().catch(()=>{});};modal.addEventListener('click',e=>{if(e.target===modal){modal.remove();loadStories().catch(()=>{});}});
    modal.querySelector('#report-story')?.addEventListener('click',()=>{modal.remove();openReportComposer('story',s.id);});
    modal.querySelector('#delete-story')?.addEventListener('click',async()=>{if(!window.confirm('Delete this story?'))return;try{await api('/stories/'+encodeURIComponent(s.id),{method:'DELETE',body:'{}'});modal.remove();await loadStories();if(state.view==='feed')await renderFeed();toast('Story deleted.');}catch(err){toast(err.message);}});
  }catch(err){toast(err.message);}
}
async function loadPages(){state.pages=(await api('/pages')).pages;}
async function renderPages(){
  activateSilent('pages');await loadPages();
  let html='<div class="page-heading"><h1>Pages</h1><button class="primary" id="create-page">＋ Create Page</button></div><section class="card welcome"><h1>Follow the things you care about</h1><p>Public identities for creators, organisations and community projects.</p></section>';
  if(state.pages.length){
    html+='<div class="pages-grid">'+state.pages.map(page=>{
      const owner=page.createdBy===state.user.id;
      return '<article class="card page-card"><div class="page-card-mark">'+esc((page.title||'P').slice(0,1).toUpperCase())+'</div><h3>'+esc(page.title)+'</h3><p class="page-handle">@'+esc(page.handle)+'</p>'+(page.category?'<span class="page-category">'+esc(page.category)+'</span>':'')+'<p>'+esc(page.description||'')+'</p><small>'+page.followerCount+' followers</small><button class="secondary full" data-open-page="'+esc(page.id)+'">Open Page</button>'+(owner?'':'<button class="primary full" data-follow-page="'+esc(page.id)+'" data-following="'+(page.isFollowing?'true':'false')+'">'+(page.isFollowing?'Following':'Follow Page')+'</button>')+'</article>';
    }).join('')+'</div>';
  }else{
    html+='<section class="card empty-state"><h3>No Pages have been created yet</h3><p>Create a Page for a real organisation, creator or community. It will appear here once saved.</p></section>';
  }
  setContent(html);
  $('#create-page').onclick=()=>openPageComposer();
  document.querySelectorAll('[data-open-page]').forEach(btn=>btn.addEventListener('click',()=>renderPage(btn.dataset.openPage)));
  document.querySelectorAll('[data-follow-page]').forEach(btn=>btn.addEventListener('click',async()=>{const follow=btn.dataset.following!=='true';try{await api('/pages/'+btn.dataset.followPage+'/follow',{method:follow?'POST':'DELETE',body:'{}'});await renderPages();toast(follow?'Page followed.':'Page unfollowed.');}catch(e){toast(e.message)}}));
}
function openPageComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="create-page-title"><div class="modal-head"><h2 id="create-page-title">Create a Page</h2><button class="modal-close" aria-label="Close">×</button></div><form id="create-page-form" class="modal-body"><div class="field"><label for="page-title">Page name</label><input id="page-title" name="title" minlength="3" maxlength="160" required></div><div class="field"><label for="page-handle">Unique handle</label><input id="page-handle" name="handle" minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,29}" required><small>Use 3–30 letters, numbers, underscores or hyphens.</small></div><div class="field"><label for="page-description">Description</label><textarea id="page-description" name="description" maxlength="2000"></textarea></div><div class="field"><label for="page-category">Category</label><input id="page-category" name="category" maxlength="60" placeholder="Community, Creator, Business..."></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Create Page</button></div></form></section>';
  document.body.append(modal);modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=()=>modal.remove());modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));try{const result=await api('/pages',{method:'POST',body:JSON.stringify(data)});modal.remove();toast('Page created.');await renderPage(result.page.id);}catch(err){toast(err.message);}};
}
async function renderPage(pageId){
  activateSilent('page');state.activePage=pageId;
  const data=await api('/pages/'+encodeURIComponent(pageId));const page=data.page;
  const canPublish=['owner','admin','editor'].includes(page.myRole);
  const canDeletePage=page.myRole==='owner';
  let html='<section class="card page-detail-head"><button class="text-button" id="back-to-pages">← All Pages</button><div class="page-card-mark page-detail-mark">'+esc((page.title||'P').slice(0,1).toUpperCase())+'</div><h1>'+esc(page.title)+'</h1><p class="page-handle">@'+esc(page.handle)+'</p>'+(page.category?'<span class="page-category">'+esc(page.category)+'</span>':'')+'<p>'+esc(page.description||'')+'</p><p class="muted">'+page.followerCount+' followers · Managed by '+esc(page.owner?.name||'account')+'</p><div class="page-detail-actions">'+(page.myRole?'':'<button class="primary" id="toggle-page-follow">'+(page.isFollowing?'Unfollow Page':'Follow Page')+'</button><button class="secondary" id="report-page">Report Page</button>')+(canDeletePage?'<button class="secondary" id="delete-page">Delete Page</button>':'')+'</div></section>';
  if(canPublish)html+='<section class="card page-post-composer"><h2>Publish as '+esc(page.title)+'</h2><form id="page-post-form"><div class="field"><label for="page-post-text">Post text</label><textarea id="page-post-text" name="text" maxlength="5000" placeholder="Share an update..."></textarea></div><div class="field"><label>Photos and MP4 videos (up to 250 MB each)</label><div id="page-post-media-picker"></div></div><button class="primary" type="submit">Publish Page post</button></form></section>';
  if(data.posts.length){
    html+='<div class="page-post-list">'+data.posts.map(post=>'<article class="card page-post"><div class="post-head"><img class="avatar" src="'+avatar(post.author)+'" alt=""><div class="post-author"><strong>'+esc(page.title)+'</strong><small>Published by '+esc(post.author?.name||'Unknown account')+' · '+timeAgo(post.createdAt)+'</small></div>'+(post.publishedBy===state.user.id||['owner','admin'].includes(page.myRole)?'<button class="post-menu" aria-label="Delete Page post" data-delete-page-post="'+esc(post.id)+'">···</button>':'<button class="post-menu" aria-label="Report Page post" data-report-page-post="'+esc(post.id)+'">⚑</button>')+'</div>'+(post.text?'<div class="post-text">'+esc(post.text)+'</div>':'')+renderPostMedia(post)+'</article>').join('')+'</div>';
  }else html+='<section class="card empty-state"><h3>No Page posts yet</h3><p>New updates published by this Page will show here.</p></section>';
  setContent(html);
  const pageMediaPicker=$('#page-post-media-picker')?createMediaPicker($('#page-post-media-picker'),{slot:'page',maxFiles:10}):null;
  $('#back-to-pages')?.addEventListener('click',()=>renderPages());
  $('#report-page')?.addEventListener('click',()=>openReportComposer('page',pageId));
  $('#toggle-page-follow')?.addEventListener('click',async()=>{try{await api('/pages/'+pageId+'/follow',{method:page.isFollowing?'DELETE':'POST',body:'{}'});await renderPage(pageId);toast(page.isFollowing?'Page unfollowed.':'Page followed.');}catch(e){toast(e.message)}});
  $('#delete-page')?.addEventListener('click',async()=>{if(!window.confirm('Delete this Page and its posts?'))return;try{await api('/pages/'+pageId,{method:'DELETE',body:'{}'});state.activePage=null;toast('Page deleted.');await renderPages();}catch(e){toast(e.message)}});
  $('#page-post-form')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;try{const values=new FormData(e.currentTarget),mediaIds=pageMediaPicker?await pageMediaPicker.upload():[];await api('/pages/'+pageId+'/posts',{method:'POST',body:JSON.stringify({text:values.get('text'),mediaIds})});toast('Page post published.');pageMediaPicker?.destroy();await renderPage(pageId);}catch(err){toast(err.message);button.disabled=false;}});
  document.querySelectorAll('[data-report-page-post]').forEach(btn=>btn.addEventListener('click',()=>openReportComposer('post',btn.dataset.reportPagePost)));
  document.querySelectorAll('[data-delete-page-post]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Delete this Page post?'))return;try{await api('/pages/'+pageId+'/posts/'+btn.dataset.deletePagePost,{method:'DELETE',body:'{}'});toast('Page post deleted.');await renderPage(pageId);}catch(err){toast(err.message)}}));
}
async function renderSavedPosts(){
  activateSilent('saved');
  state.savedPosts=(await api('/saved-posts')).posts;
  setContent(`<div class="page-heading"><h1>Saved posts</h1></div>${state.savedPosts.length?state.savedPosts.map(postCard).join(''):`<section class="card empty-state"><div class="empty-icon">▣</div><h3>No saved posts yet</h3><p>Use Save on a post to keep it here for later.</p></section>`}`);
  bindFeed();
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
function renderMessageContent(messages=[]){
  if(!messages.length)return '<div class="message-window-empty">No messages yet. Say hello to start this chat.</div>';
  return messages.map(message=>{
    const mine=message.from===state.user.id;
    const receipt=mine?(message.read?'Seen':'Sent'):'';
    const content=message.unsent?'<p class="message-unsent-label">This message was unsent.</p>':(message.stickerId?'<div class="message-window-sticker">'+esc(message.text||'')+'</div>':(message.text?'<p>'+esc(message.text)+'</p>':''));
    const gif=message.unsent?'':(message.gifUrl?'<a class="message-attachment-gif" href="'+esc(message.gifUrl)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(message.gifUrl)+'" alt="GIF"></a>':'');
    const attachments=message.unsent?'':messageAttachmentHtml(message.attachments);
    const editable=mine&&!message.unsent&&!message.stickerId&&!message.gifUrl&&Boolean(message.text);
    const actions='<details class="message-bubble-actions"><summary aria-label="Message options" title="Message options">···</summary><div class="message-bubble-actions-menu">'+(editable?'<button type="button" data-message-edit="'+esc(message.id)+'">Edit message</button>':'')+'<button type="button" data-message-delete-me="'+esc(message.id)+'">Delete for me</button>'+(mine&&!message.unsent?'<button type="button" class="danger" data-message-unsend="'+esc(message.id)+'">Unsend for everyone</button>':'')+'</div></details>';
    return '<article class="message-window-bubble '+(mine?'mine':'')+(message.stickerId?' is-sticker':'')+'" data-message-id="'+esc(message.id)+'">'+actions+content+gif+attachments+'<small>'+timeAgo(message.createdAt)+(message.editedAt?'<span class="message-edited-label">Edited</span>':'')+(receipt?' · '+receipt:'')+'</small></article>';
  }).join('');
}
function messageSignature(messages=[]){return messages.map(message=>[message.id,message.read?'1':'0',message.text||'',message.editedAt||'',message.unsent?'1':'0',(message.attachmentIds||[]).join(',')].join(':')).join('|');}
function syncMessageRefreshPolling(){
  const enabled=Boolean(state.user)&&(state.view==='messages'||state.messageWindows.length>0);
  if(enabled&&!messageRefreshTimer)messageRefreshTimer=setInterval(refreshMessageConversations,5000);
  if(!enabled&&messageRefreshTimer){clearInterval(messageRefreshTimer);messageRefreshTimer=null;}
}
async function refreshMessageConversations(){
  if(!state.user||document.visibilityState==='hidden'||messageRefreshInFlight)return;
  messageRefreshInFlight=true;
  try{
    let result=await api('/messages');
    state.conversations=result.conversations||[];
    const activeIds=new Set(state.messageWindows.filter(win=>!win.minimized).map(win=>win.user.id));
    const unread=state.conversations.filter(conversation=>activeIds.has(conversation.user.id)&&(conversation.unreadCount||0)>0);
    if(unread.length){
      await Promise.all(unread.map(conversation=>api('/messages/'+encodeURIComponent(conversation.user.id)+'/read',{method:'POST',body:'{}'}).catch(()=>null)));
      result=await api('/messages');
      state.conversations=result.conversations||[];
    }
    state.messageWindows.filter(win=>!win.minimized).forEach(win=>{
      const conversation=state.conversations.find(item=>item.user.id===win.user.id);
      const messages=conversation?.messages||[];
      const scroll=document.querySelector('[data-message-window="'+CSS.escape(win.user.id)+'"] .message-window-scroll');
      if(!scroll)return;
      const signature=messageSignature(messages);
      if(scroll.dataset.messageSignature===signature)return;
      const nearBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<64;
      scroll.innerHTML=renderMessageContent(messages);
      scroll.dataset.messageSignature=signature;
      if(nearBottom)scroll.scrollTop=scroll.scrollHeight;
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
  renderMessageWindows();
  if(state.view==='messages')renderMessages().catch(error=>toast(error.message));
}
async function sendStickerMessage(userId,stickerId){
  try{await api('/messages',{method:'POST',body:JSON.stringify({to:userId,stickerId})});await reloadMessageWindows();}
  catch(error){toast(error.message);}
}
async function sendGifMessage(userId,gifUrl){
  try{await api('/messages',{method:'POST',body:JSON.stringify({to:userId,gifUrl})});await reloadMessageWindows();}
  catch(error){toast(error.message);}
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
        await api('/messages',{method:'POST',body:JSON.stringify({to:userId,text:'',attachmentIds:[asset.id]})});
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
    const body=win.minimized?'':(
      '<div class="message-window-body"><div class="message-window-scroll" data-message-signature="'+esc(messageSignature(messages))+'">'+renderMessageContent(messages)+'</div>'+
      '<div class="message-window-composer">'+
        '<div class="message-window-attachment-drawer" data-message-attachment-drawer="'+esc(win.user.id)+'" hidden><div data-message-picker="'+esc(win.user.id)+'"></div></div>'+
        '<div class="message-window-sticker-panel" data-message-sticker-panel="'+esc(win.user.id)+'" hidden>'+stickerButtons+'</div>'+
        '<div class="message-window-emoji-panel" data-message-emoji-panel="'+esc(win.user.id)+'" hidden>'+emojiButtons+'</div>'+
        '<div class="message-window-gif-panel" data-message-gif-panel="'+esc(win.user.id)+'" hidden><form class="message-gif-search" data-message-gif-search="'+esc(win.user.id)+'"><input name="query" maxlength="80" placeholder="Search GIFs…" aria-label="Search GIFs"><button type="submit">Search</button></form><div class="message-gif-results" data-message-gif-results="'+esc(win.user.id)+'"><span>Search Tenor GIFs to send one.</span></div></div>'+
        '<div class="message-window-record-status" data-message-record-status="'+esc(win.user.id)+'" role="status" hidden>Recording voice note…</div>'+
        '<div class="message-window-toolbar"><button type="button" data-message-attach="'+esc(win.user.id)+'" title="Photos, videos and files" aria-label="Attach photos, videos and files">🖼</button><button type="button" data-message-voice="'+esc(win.user.id)+'" title="Voice note — record and send" aria-label="Record a voice note"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg></button><button type="button" data-message-open-stickers="'+esc(win.user.id)+'" title="Stickers" aria-label="Open stickers">✳</button><button type="button" data-message-open-gifs="'+esc(win.user.id)+'" title="GIFs" aria-label="Open GIF search">GIF</button></div>'+
        '<form class="message-window-form" data-message-form="'+esc(win.user.id)+'"><input name="text" maxlength="3000" placeholder="Aa" autocomplete="off" aria-label="Write a message"><button type="button" class="message-emoji-toggle" data-message-open-emoji="'+esc(win.user.id)+'" aria-label="Choose emoji" title="Emoji">😊</button><button class="message-send-button" type="submit" aria-label="Send message" title="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.2 21 12 3.4 3.8l-.1 6.4 12 1.8-12 1.8z" fill="currentColor"/></svg></button></form>'+
      '</div></div>'
    );
    return '<section class="message-window '+(win.minimized?'is-minimized':'')+'" data-message-window="'+esc(win.user.id)+'" role="dialog" aria-label="Chat with '+esc(win.user.name)+'"><header class="message-window-header"><button class="message-window-profile" type="button" data-message-profile="'+esc(win.user.id)+'" aria-label="View '+esc(win.user.name)+' profile"><img src="'+avatar(win.user)+'" alt=""><span><strong>'+esc(win.user.name)+'</strong><small>@'+esc(win.user.username||'member')+'</small></span></button><div class="message-window-controls"><button class="message-window-call" type="button" data-message-audio="'+esc(win.user.id)+'" aria-label="Phone call" title="Phone call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.8 2 2 0 0 1 3.1 1.6h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L7 9.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 2 2.3z"/></svg></button><button class="message-window-call" type="button" data-message-video="'+esc(win.user.id)+'" aria-label="Video call" title="Video call"><svg class="message-window-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 10 7-4v12l-7-4z"/></svg></button><button class="message-window-call" type="button" data-message-remove="'+esc(win.user.id)+'" aria-label="Remove conversation" title="Remove conversation">···</button><button type="button" data-message-minimize="'+esc(win.user.id)+'" aria-label="Minimize chat" title="Minimize">−</button><button type="button" data-message-close="'+esc(win.user.id)+'" aria-label="Close chat" title="Close">×</button></div></header>'+body+'</section>';
  }).join('');
  dock.querySelectorAll('[data-message-minimize]').forEach(button=>button.onclick=()=>{const win=state.messageWindows.find(item=>item.user.id===button.dataset.messageMinimize);if(win){win.minimized=!win.minimized;renderMessageWindows();}});
  dock.querySelectorAll('[data-message-close]').forEach(button=>button.onclick=()=>{const id=button.dataset.messageClose;cancelMessageVoiceRecording(id);state.messageWindows=state.messageWindows.filter(item=>item.user.id!==id);renderMessageWindows();syncMessageRefreshPolling();});
  dock.querySelectorAll('[data-message-profile]').forEach(button=>button.onclick=()=>openProfile(button.dataset.messageProfile));
  dock.querySelectorAll('[data-message-remove]').forEach(button=>button.onclick=()=>removeMessageConversation(button.dataset.messageRemove));
  if(dock.dataset.messageActionsDelegated!=='true'){
    dock.dataset.messageActionsDelegated='true';
    dock.addEventListener('click',event=>{
      const button=event.target.closest('[data-message-edit],[data-message-delete-me],[data-message-unsend]');
      if(!button||!dock.contains(button))return;
      button.closest('details')?.removeAttribute('open');
      if(button.hasAttribute('data-message-edit')){
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
    form?.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('button[type="submit"]'),text=String(form.elements.text.value||'').trim(),picker=messagePickers.get(win.user.id);
      button.disabled=true;
      try{
        const attachmentIds=picker?await picker.upload():[];
        if(!text&&!attachmentIds.length){toast('Write a message or attach a file.');return;}
        await api('/messages',{method:'POST',body:JSON.stringify({to:win.user.id,text,attachmentIds})});
        form.elements.text.value='';
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
async function openMessageWindow(member){
  if(!member?.id||member.id===state.user.id)return;
  const existing=state.messageWindows.find(item=>item.user.id===member.id);
  if(existing){existing.minimized=false;}
  else{
    if(state.messageWindows.length>=5){toast('You can keep up to five chat windows open at once.');return;}
    state.messageWindows.push({user:member,minimized:false});
  }
  renderMessageWindows();
  syncMessageRefreshPolling();
  try{
    state.conversations=(await api('/messages')).conversations||[];
    const conversation=state.conversations.find(item=>item.user.id===member.id);
    if(conversation?.unreadCount>0){
      await api('/messages/'+encodeURIComponent(member.id)+'/read',{method:'POST',body:'{}'});
      state.conversations=(await api('/messages')).conversations||[];
    }
    renderMessageWindows();
  }catch(error){toast(error.message);}
}
async function renderMessages(){
  activateSilent('messages');
  const messageData=await api('/messages');
  state.conversations=messageData.conversations||[];
  const conversationRows=state.conversations.length?state.conversations.map(conversation=>{
    const last=conversation.messages.at(-1),preview=last?.text||((last?.attachments||[]).length?'Attachment':last?.gifUrl?'GIF':'Open chat');
    return '<div class="inbox-person-row" data-inbox-peer="'+esc(conversation.user.id)+'"><img class="avatar" src="'+avatar(conversation.user)+'" alt=""><div class="person-meta"><strong>'+esc(conversation.user.name)+'</strong><small>'+esc(preview)+'</small>'+(conversation.unreadCount?'<span class="inbox-unread-badge">'+conversation.unreadCount+'</span>':'')+'</div><div class="message-inbox-row-actions"><button class="secondary" type="button" data-open-inbox-chat="'+esc(conversation.user.id)+'">Open</button><button class="secondary" type="button" data-remove-inbox-chat="'+esc(conversation.user.id)+'">Remove</button></div></div>';
  }).join(''):'<div class="message-inbox-empty"><div class="empty-icon">✉</div><h3>No conversations yet</h3><p>Open another member’s profile and select Message to start a private chat.</p></div>';
  setContent('<div class="page-heading"><div><h1>Messages</h1><p class="muted">Your conversations appear here after you send or receive a message.</p></div><span class="eyebrow">'+state.conversations.length+' conversations</span></div><section class="card"><div class="inbox-people-list">'+conversationRows+'</div></section>');
  document.querySelectorAll('[data-open-inbox-chat]').forEach(button=>button.onclick=()=>{
    const conversation=state.conversations.find(item=>item.user.id===button.dataset.openInboxChat);
    if(conversation)openMessageWindow(conversation.user);
  });
  document.querySelectorAll('[data-remove-inbox-chat]').forEach(button=>button.onclick=()=>removeMessageConversation(button.dataset.removeInboxChat));
  renderMessageWindows();
}

async function startMingloraCall(member,kind='video'){
  if(!member?.id||member.id===state.user.id)return;
  if(activeCallRoom){toast('Finish your current call before starting another.');return;}
  try{
    const created=await api('/calls',{method:'POST',body:JSON.stringify({to:member.id,kind})});
    await openMingloraCall(created.call,created.liveKit);
  }catch(error){toast(error.message);}
}
async function answerMingloraCall(callId){
  try{
    const joined=await api('/calls/'+encodeURIComponent(callId)+'/join',{method:'POST',body:'{}'});
    await openMingloraCall(joined.call,joined.liveKit);
  }catch(error){toast(error.message);}
}
async function declineMingloraCall(callId){
  try{await api('/calls/'+encodeURIComponent(callId)+'/leave',{method:'POST',body:'{}'});toast('Call declined.');await renderNotifications();}
  catch(error){toast(error.message);}
}
async function openMingloraCall(call,liveKit){
  if(activeCallRoom){toast('A call is already open.');return;}
  const client=window.LivekitClient;
  if(!client?.Room||!client?.RoomEvent){toast('The call player could not load. Refresh Minglora and try again.');return;}
  const overlay=document.createElement('div');overlay.className='call-overlay';
  overlay.innerHTML='<section class="call-panel" role="dialog" aria-modal="true" aria-label="Minglora call"><header class="call-panel-header"><div><strong>'+esc(call.kind==='audio'?'Voice call':'Video call')+'</strong><span id="call-connection-status">Connecting…</span></div><span id="call-participant-count">1 in call</span></header><div class="call-video-stage" id="call-video-stage"><div class="call-empty-stage">Connecting to secure call…</div></div><div id="call-audio-root" class="call-audio-root"></div><footer class="call-controls"><button type="button" class="secondary" id="call-microphone">Mute microphone</button><button type="button" class="secondary" id="call-camera">'+(call.kind==='video'?'Turn camera off':'Turn video on')+'</button><button type="button" class="secondary" id="call-add-people">Add people</button><button type="button" class="danger" id="call-leave">End call</button></footer></section>';
  document.body.append(overlay);activeCallOverlay=overlay;
  const room=new client.Room({adaptiveStream:true,dynacast:true});activeCallRoom=room;
  let microphoneEnabled=true,cameraEnabled=call.kind==='video';
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
  room.on(client.RoomEvent.Disconnected,()=>{if(activeCallRoom===room){activeCallRoom=null;closeOverlay();toast('The call connection ended.');}});
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
    await room.disconnect().catch(()=>{});
    if(activeCallRoom===room)activeCallRoom=null;closeOverlay();toast(error.message||'The call could not connect.');
    if(call.createdBy===state.user.id)await api('/calls/'+encodeURIComponent(call.id)+'/end',{method:'POST',body:'{}'}).catch(()=>{});
    else await api('/calls/'+encodeURIComponent(call.id)+'/leave',{method:'POST',body:'{}'}).catch(()=>{});
  }
}
async function renderNotifications(){
  state.notifications=(await api('/notifications')).notifications;
  const rows=state.notifications.map(n=>{
    const icon=n.type==='message'?'▤':n.type==='friend'?'♧':n.type==='call'?'📞':n.type==='live'?'🔴':n.type==='reaction'?'♡':'♢';
    let actions='';
    if(n.type==='call'&&n.callId)actions='<div class="notice-actions"><button class="primary" type="button" data-answer-call="'+esc(n.callId)+'">Answer</button><button class="secondary" type="button" data-decline-call="'+esc(n.callId)+'">Decline</button></div>';
    else if(n.type==='live'&&n.liveSessionId)actions='<div class="notice-actions"><button class="primary" type="button" data-watch-notified-live="'+esc(n.liveSessionId)+'">Watch LIVE</button></div>';
    else if(n.type==='message'&&n.actor?.id)actions='<div class="notice-actions"><button class="secondary" type="button" data-message-actor="'+esc(n.actor.id)+'">Open message</button></div>';
    return '<article class="notice-item '+(n.read?'':'unread')+'"><div class="notice-icon">'+icon+'</div><div class="notice-content"><p>'+esc(n.text)+'</p><small>'+timeAgo(n.createdAt)+'</small>'+actions+'</div></article>';
  }).join('');
  setContent('<div class="page-heading"><div><h1>Notifications</h1><p class="muted">Receive LIVE, call and message alerts, including when Minglora is in the background.</p></div><div class="notice-actions"><button class="secondary" id="enable-browser-alerts">Enable device push</button><button class="text-button" id="mark-read">Mark all read</button></div></div><section class="card">'+(rows||'<div class="empty-state"><div class="empty-icon">♢</div><h3>All quiet for now</h3><p>Your notifications will show up here.</p></div>')+'</section>');
  $('#enable-browser-alerts')?.addEventListener('click',enableMingloraPush);
  document.querySelectorAll('[data-answer-call]').forEach(button=>button.onclick=()=>answerMingloraCall(button.dataset.answerCall));
  document.querySelectorAll('[data-decline-call]').forEach(button=>button.onclick=()=>declineMingloraCall(button.dataset.declineCall));
  document.querySelectorAll('[data-message-actor]').forEach(button=>button.onclick=()=>{const item=state.notifications.find(notification=>notification.actor?.id===button.dataset.messageActor);if(item?.actor)openMessageWindow(item.actor);});
  document.querySelectorAll('[data-watch-notified-live]').forEach(button=>button.onclick=async()=>{
    try{const data=await api('/live/sessions');const session=(data.sessions||[]).find(item=>item.id===button.dataset.watchNotifiedLive);if(!session){toast('This LIVE session has ended.');return;}await openLiveRoom(session,session.hostId===state.user.id?'host':'viewer');}
    catch(error){toast(error.message);}
  });
  $('#mark-read').onclick=async()=>{await api('/notifications/read',{method:'POST',body:'{}'});toast('Notifications marked as read.');renderNotifications();updateNotificationDot();};
}
async function pollBrowserNotifications(){
  if(!state.user)return;
  try{
    const items=(await api('/notifications')).notifications||[];
    if(!browserNotificationPrimed){
      browserNotificationSeen=new Set(items.map(item=>item.id));
      browserNotificationPrimed=true;
    }else{
      const fresh=items.filter(item=>!browserNotificationSeen.has(item.id));
      for(const item of fresh){
        browserNotificationSeen.add(item.id);
        if(webPushSubscriptionActive||!['live','call','message'].includes(item.type)||!('Notification' in window)||Notification.permission!=='granted')continue;
        const title=item.type==='live'?'Minglora LIVE':item.type==='call'?'Incoming Minglora call':'New Minglora message';
        const notice=new Notification(title,{body:item.text||'You have a new Minglora notification.',tag:'minglora-'+item.id,icon:'/assets/icons/minglora-push.svg'});
        notice.onclick=()=>{window.focus();renderNotifications();notice.close();};
      }
    }
    $('#notification-dot')?.classList.toggle('hidden',!items.some(item=>!item.read));
  }catch{}
}
function startBrowserNotificationPolling(){
  if(browserNotificationTimer)clearInterval(browserNotificationTimer);
  browserNotificationPrimed=false;browserNotificationSeen=new Set();
  pollBrowserNotifications();
  browserNotificationTimer=setInterval(pollBrowserNotifications,12000);
}
async function updateNotificationDot(){try{const n=(await api('/notifications')).notifications;$('#notification-dot').classList.toggle('hidden',!n.some(x=>!x.read));}catch{}}
async function renderSearch(q){
  activateSilent('search');const data=await api('/search?q='+encodeURIComponent(q));state.searchResults=data;
  const pages=data.pages||[];
  const peopleHtml=data.users.length?'<div class="suggested-list">'+data.users.map(p=>'<div class="person-row"><img class="avatar" src="'+avatar(p)+'" alt=""><div class="person-meta"><strong>'+esc(p.name)+'</strong><small>@'+esc(p.username)+'</small></div><button class="mini-btn" data-profile="'+esc(p.id)+'">View</button></div>').join('')+'</div>':'<p class="muted">No matching people.</p>';
  const postsHtml=data.posts.length?data.posts.map(postCard).join(''):'<p class="muted">No matching posts.</p>';
  const groupsHtml=data.groups.length?data.groups.map(g=>'<div class="group-row"><div class="group-icon">◉</div><div><strong>'+esc(g.name)+'</strong><small>'+esc(g.description)+'</small></div></div>').join(''):'<p class="muted">No matching groups.</p>';
  const pagesHtml=pages.length?pages.map(page=>'<div class="person-row page-search-row"><div class="page-card-mark">'+esc(page.title.slice(0,1).toUpperCase())+'</div><div class="person-meta"><strong>'+esc(page.title)+'</strong><small>@'+esc(page.handle)+' · '+page.followerCount+' followers</small></div><button class="mini-btn" data-open-page="'+esc(page.id)+'">Open</button></div>').join(''):'<p class="muted">No matching Pages.</p>';
  setContent('<div class="page-heading"><h1>Search results</h1></div><section class="card"><h3>People</h3>'+peopleHtml+'</section><section class="card"><h3>Posts</h3>'+postsHtml+'</section><section class="card"><h3>Groups</h3>'+groupsHtml+'</section><section class="card"><h3>Pages</h3>'+pagesHtml+'</section>');
  bindFeed();
  document.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('click',()=>openProfile(el.dataset.profile)));
  document.querySelectorAll('[data-open-page]').forEach(el=>el.addEventListener('click',()=>renderPage(el.dataset.openPage)));
}
const MARKETPLACE_PRODUCT_CATEGORY_OPTIONS=[['electronics','Electronics'],['phones_computing','Phones & computing'],['fashion','Fashion & accessories'],['home_furniture','Home & furniture'],['vehicles','Vehicles'],['property','Property'],['beauty_health','Beauty & health'],['sports_outdoors','Sports & outdoors'],['toys_games','Toys & games'],['books_media','Books & media'],['food_grocery','Food & groceries'],['handmade_crafts','Handmade & crafts'],['collectibles','Collectibles'],['other','Other']];
const MARKETPLACE_SERVICE_CATEGORY_OPTIONS=[['home_repair','Home repair'],['technology','Technology & computer services'],['beauty_wellness','Beauty & wellness'],['education_tutoring','Education & tutoring'],['transport','Transport'],['events','Events'],['creative_design','Creative & design'],['professional','Professional services'],['cleaning','Cleaning'],['other','Other']];
const MARKETPLACE_CONDITION_LABELS={new:'New',like_new:'Like new',good:'Good',fair:'Fair',for_parts:'For parts / repair'};
function marketplaceMoney(listing){if(listing.priceType==='quote')return 'Request a quote';const amount=Number(listing.priceMinor||0)/100;try{return new Intl.NumberFormat(undefined,{style:'currency',currency:listing.currency||'JMD',maximumFractionDigits:2}).format(amount)+(listing.priceType==='hourly'?' / hour':listing.priceType==='from'?' · from':'');}catch{return (listing.currency||'JMD')+' '+amount.toFixed(2);}}
function marketplaceCategoryLabel(kind,category){const options=kind==='service'?MARKETPLACE_SERVICE_CATEGORY_OPTIONS:MARKETPLACE_PRODUCT_CATEGORY_OPTIONS;return options.find(item=>item[0]===category)?.[1]||'Marketplace';}
function marketplaceCard(listing){
  const image=listing.media?.[0]?.url;
  return '<article class="marketplace-listing-card"><button type="button" class="marketplace-card-open" data-open-marketplace-listing="'+esc(listing.id)+'" aria-label="Open '+esc(listing.title)+'"><div class="marketplace-card-image">'+(image?'<img loading="lazy" src="'+esc(image)+'" alt="'+esc(listing.title)+'">':'<div class="marketplace-image-placeholder"><span>'+(listing.kind==='service'?'✦':'◇')+'</span><small>'+esc(listing.kind==='service'?'Minglora Services':'Minglora Marketplace')+'</small></div>')+'<span class="marketplace-type-pill">'+(listing.kind==='service'?'Service':'Product')+'</span></div><div class="marketplace-card-copy"><small class="marketplace-category">'+esc(marketplaceCategoryLabel(listing.kind,listing.category))+'</small><h3>'+esc(listing.title)+'</h3><strong class="marketplace-price">'+esc(marketplaceMoney(listing))+'</strong><span class="marketplace-location">'+(listing.location?'⌖ '+esc(listing.location):'Available on Minglora')+'</span><span class="marketplace-seller"><img src="'+avatar(listing.seller)+'" alt=""><span>'+esc(listing.seller?.name||'Minglora seller')+'</span></span></div></button><div class="marketplace-card-actions"><button type="button" class="secondary" data-open-marketplace-listing="'+esc(listing.id)+'">View details</button><button type="button" class="marketplace-save '+(listing.isSaved?'is-saved':'')+'" data-save-marketplace-listing="'+esc(listing.id)+'" data-saved="'+(listing.isSaved?'true':'false')+'">'+(listing.isSaved?'♥ Saved':'♡ Save')+'</button></div></article>';
}
async function renderMarketplace(mode=state.marketplaceMode){
  if(mode==='orders')return renderMarketplaceOrders();
  if(mode==='order-detail')return renderMarketplaceOrderDetail(state.activeMarketplaceOrder);
  if(mode==='seller')return renderMarketplaceSeller();
  if(mode==='bookings')return renderMarketplaceBookings();
  if(mode==='jobs')return renderJobs();
  if(mode==='admin')return renderMarketplaceAdmin();
  activateSilent('marketplace');state.marketplaceMode=mode;state.activeMarketplaceListing=null;
  const query=$('#marketplace-query')?.value?.trim()||'',params=new URLSearchParams(),kind=mode==='products'?'product':mode==='services'?'service':'';
  if(kind)params.set('kind',kind);if(query)params.set('q',query);
  if(mode==='saved'||mode==='mine')state.marketplaceListings=(await api(mode==='saved'?'/marketplace/saved':'/marketplace/mine')).listings||[];
  else state.marketplaceListings=(await api('/marketplace/listings'+(params.toString()?'?'+params.toString():''))).listings||[];
  const tabs=[['browse','Discover'],['products','Products'],['services','Services'],['saved','Saved'],['mine','My listings'],['bookings','Bookings'],['orders','Orders'],['seller','Seller centre'],['jobs','Jobs'],['admin','Review desk']];
  let html='<section class="marketplace-hero"><div class="marketplace-hero-copy"><span class="marketplace-eyebrow">MINGLORA MARKETPLACE</span><h1>Discover more. Buy with confidence. Grow together.</h1><p>Explore real products and services from people and businesses in the Minglora community.</p><div class="marketplace-hero-actions"><button class="primary" id="marketplace-create-listing">＋ Create a listing</button><span>Real sellers · Real listings · No fabricated inventory</span></div></div><div class="marketplace-hero-art" aria-hidden="true"><span class="marketplace-art-orbit"></span><span class="marketplace-art-bag">✦</span><span class="marketplace-art-spark">✧</span></div></section>';
  html+='<nav class="marketplace-tabs" aria-label="Marketplace sections">'+tabs.map(([key,label])=>'<button type="button" data-marketplace-mode="'+key+'" class="'+(mode===key?'active':'')+'">'+label+'</button>').join('')+'</nav>';
  if(mode!=='saved'&&mode!=='mine')html+='<form class="marketplace-search" id="marketplace-search-form"><label class="marketplace-search-field"><span>⌕</span><input id="marketplace-query" name="q" value="'+esc(query)+'" placeholder="Search products, services, shops and more" aria-label="Search Marketplace"></label><button class="primary" type="submit">Search</button></form>';
  const title=mode==='saved'?'Saved listings':mode==='mine'?'Your listings':mode==='products'?'Products':mode==='services'?'Services':'Explore Marketplace';
  html+='<div class="marketplace-section-heading"><div><span class="marketplace-eyebrow">FIND WHAT YOU NEED</span><h2>'+title+'</h2></div>'+(mode==='mine'?'<button class="secondary" id="marketplace-create-listing-secondary">＋ New listing</button>':'<span class="marketplace-results-count">'+state.marketplaceListings.length+' listings</span>')+'</div>';
  if(state.marketplaceListings.length)html+='<div class="marketplace-grid">'+state.marketplaceListings.map(listing=>marketplaceCard(listing)+(listing.sellerId===state.user.id&&listing.status!=='active'?'<span class="marketplace-status">'+esc(listing.status)+'</span>':'')).join('')+'</div>';
  else html+='<section class="card empty-state marketplace-empty"><div class="empty-icon">◇</div><h3>'+(mode==='saved'?'Nothing saved yet':mode==='mine'?'You have not published a listing yet':'No matching listings yet')+'</h3><p>'+(mode==='saved'?'Save products and services to find them quickly later.':mode==='mine'?'Create your first product or service listing and make it discoverable.':'Try another search, or be the first to publish a listing in this category.')+'</p>'+(mode==='mine'||mode==='browse'?'<button class="primary" id="marketplace-create-listing-empty">Create a listing</button>':'')+'</section>';
  setContent(html);
  $('#marketplace-create-listing')?.addEventListener('click',openMarketplaceComposer);$('#marketplace-create-listing-secondary')?.addEventListener('click',openMarketplaceComposer);$('#marketplace-create-listing-empty')?.addEventListener('click',openMarketplaceComposer);
  document.querySelectorAll('[data-marketplace-mode]').forEach(button=>button.addEventListener('click',()=>renderMarketplace(button.dataset.marketplaceMode)));
  $('#marketplace-search-form')?.addEventListener('submit',event=>{event.preventDefault();renderMarketplace(mode);});
  document.querySelectorAll('[data-open-marketplace-listing]').forEach(button=>button.addEventListener('click',()=>renderMarketplaceListing(button.dataset.openMarketplaceListing)));
  document.querySelectorAll('[data-save-marketplace-listing]').forEach(button=>button.addEventListener('click',async()=>{const saved=button.dataset.saved==='true';try{await api('/marketplace/listings/'+encodeURIComponent(button.dataset.saveMarketplaceListing)+'/save',{method:saved?'DELETE':'POST',body:'{}'});toast(saved?'Listing removed from Saved.':'Listing saved.');await renderMarketplace(mode);}catch(error){toast(error.message);}}));
}
async function openMarketplaceComposer(){
  try{const result=await api('/marketplace/seller');if(result.seller?.status!=='approved'||result.seller?.identityStatus!=='verified'){toast('Apply to sell and complete seller verification before publishing a listing.');await renderMarketplace('seller');return;}}catch(error){toast(error.message);return;}
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal marketplace-modal" role="dialog" aria-modal="true" aria-labelledby="marketplace-create-title"><div class="modal-head"><div><span class="marketplace-eyebrow">SELL ON MINGLORA</span><h2 id="marketplace-create-title">Create a listing</h2></div><button type="button" class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="marketplace-create-form"><div class="marketplace-form-grid"><div class="field"><label for="marketplace-kind">What are you listing?</label><select id="marketplace-kind" name="kind"><option value="product">A product / item</option><option value="service">A service</option></select></div><div class="field"><label for="marketplace-category">Category</label><select id="marketplace-category" name="category" required></select></div></div><div class="field"><label for="marketplace-title">Listing title</label><input id="marketplace-title" name="title" minlength="5" maxlength="100" required placeholder="Describe what you are offering"></div><div class="field"><label for="marketplace-description">Description</label><textarea id="marketplace-description" name="description" minlength="20" maxlength="5000" required placeholder="Describe the product, condition, features or service you provide."></textarea></div><div class="marketplace-form-grid"><div class="field"><label for="marketplace-price-type">Pricing</label><select id="marketplace-price-type" name="priceType"><option value="fixed">Fixed price</option><option value="from">Starting from</option><option value="hourly">Hourly rate</option><option value="quote">Request a quote</option></select></div><div class="field" id="marketplace-price-field"><label for="marketplace-price">Price</label><input id="marketplace-price" name="price" type="number" min="0.01" max="999999999" step="0.01" placeholder="0.00"></div><div class="field"><label for="marketplace-currency">Currency</label><select id="marketplace-currency" name="currency"><option>JMD</option><option>USD</option><option>CAD</option><option>GBP</option><option>EUR</option><option>TTD</option><option>BBD</option><option>GYD</option></select></div></div><div id="marketplace-product-fields"><div class="marketplace-form-grid"><div class="field"><label for="marketplace-condition">Condition</label><select id="marketplace-condition" name="condition"><option value="new">New</option><option value="like_new">Like new</option><option value="good" selected>Good</option><option value="fair">Fair</option><option value="for_parts">For parts / repair</option></select></div><div class="field"><label for="marketplace-quantity">Available quantity</label><input id="marketplace-quantity" name="quantity" type="number" min="1" max="10000" value="1"></div></div><div class="field"><label>How can buyers receive it?</label><div class="marketplace-checks"><label><input type="checkbox" name="fulfillment" value="pickup" checked> Pickup</label><label><input type="checkbox" name="fulfillment" value="local_delivery"> Local delivery</label><label><input type="checkbox" name="fulfillment" value="shipping"> Shipping</label></div></div></div><div id="marketplace-service-fields" hidden><div class="field"><label for="marketplace-service-mode">Service delivery</label><select id="marketplace-service-mode" name="serviceMode"><option value="onsite">On-site</option><option value="remote">Remote</option><option value="both">Remote and on-site</option></select></div></div><div class="field"><label for="marketplace-location">Location (optional)</label><input id="marketplace-location" name="location" maxlength="120" placeholder="Town, parish, country or service area"></div><div class="field"><label for="marketplace-tags">Search tags (optional)</label><input id="marketplace-tags" name="tags" maxlength="240" placeholder="e.g. laptop, gaming, Kingston"></div><div class="field"><label>Listing photos</label><div id="marketplace-media-picker"></div></div><p class="muted">Only photos you upload are attached to your listing. Describe the item or service accurately.</p><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish listing</button></div></form></section>';
  document.body.append(modal);
  const picker=createMediaPicker(modal.querySelector('#marketplace-media-picker'),{slot:'marketplace',maxFiles:8,accept:'image/jpeg,image/png,image/webp,image/avif'});
  const kind=modal.querySelector('#marketplace-kind'),category=modal.querySelector('#marketplace-category'),priceType=modal.querySelector('#marketplace-price-type'),priceField=modal.querySelector('#marketplace-price-field');
  const fillCategories=()=>{const options=kind.value==='service'?MARKETPLACE_SERVICE_CATEGORY_OPTIONS:MARKETPLACE_PRODUCT_CATEGORY_OPTIONS;category.innerHTML=options.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');};
  const updateKind=()=>{const service=kind.value==='service';modal.querySelector('#marketplace-product-fields').hidden=service;modal.querySelector('#marketplace-service-fields').hidden=!service;priceType.disabled=!service;priceType.value='fixed';modal.querySelector('#marketplace-condition').disabled=service;modal.querySelector('#marketplace-quantity').disabled=service;modal.querySelectorAll('input[name="fulfillment"]').forEach(input=>input.disabled=service);priceField.hidden=service&&priceType.value==='quote';};
  kind.addEventListener('change',()=>{fillCategories();updateKind();});priceType.addEventListener('change',()=>{priceField.hidden=kind.value==='service'&&priceType.value==='quote';});fillCategories();updateKind();
  const close=()=>{picker.destroy();modal.remove();};modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#marketplace-create-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;try{const values=new FormData(form),payload=Object.fromEntries(values.entries());payload.fulfillment=values.getAll('fulfillment');payload.tags=String(values.get('tags')||'').split(',').map(value=>value.trim()).filter(Boolean);payload.mediaIds=await picker.upload();if(payload.kind==='service'&&payload.priceType==='quote')payload.price='';const result=await api('/marketplace/listings',{method:'POST',body:JSON.stringify(payload)});close();toast('Your listing is now published.');await renderMarketplace('mine');await renderMarketplaceListing(result.listing.id);}catch(error){toast(error.message);button.disabled=false;}});
}
async function renderMarketplaceListing(listingId){
  activateSilent('marketplace');state.activeMarketplaceListing=listingId;
  const listing=(await api('/marketplace/listings/'+encodeURIComponent(listingId))).listing,own=listing.sellerId===state.user.id;
  const images=(listing.media||[]).map(media=>renderSingleMedia(media,'marketplace-detail-image')).join('');
  const details=listing.kind==='product'?'<div><span>Condition</span><strong>'+esc(MARKETPLACE_CONDITION_LABELS[listing.condition]||listing.condition)+'</strong></div><div><span>Available</span><strong>'+Number(listing.quantity||0).toLocaleString()+'</strong></div><div><span>Fulfilment</span><strong>'+esc((listing.fulfillment||[]).map(value=>({pickup:'Pickup',local_delivery:'Local delivery',shipping:'Shipping'}[value]||value)).join(', '))+'</strong></div>':'<div><span>Service delivery</span><strong>'+esc(({remote:'Remote',onsite:'On-site',both:'Remote and on-site'}[listing.serviceMode]||'On-site'))+'</strong></div>';
  let html='<div class="marketplace-detail-toolbar"><button class="text-button" id="marketplace-back">← Back to Marketplace</button><span class="marketplace-status">'+esc(listing.status)+'</span></div><section class="card marketplace-detail"><div class="marketplace-detail-gallery">'+(images||'<div class="marketplace-image-placeholder"><span>◇</span><small>No photos uploaded</small></div>')+'</div><div class="marketplace-detail-copy"><span class="marketplace-eyebrow">'+(listing.kind==='service'?'MINGLORA SERVICES':'MINGLORA MARKETPLACE')+'</span><p class="marketplace-category">'+esc(marketplaceCategoryLabel(listing.kind,listing.category))+'</p><h1>'+esc(listing.title)+'</h1><strong class="marketplace-detail-price">'+esc(marketplaceMoney(listing))+'</strong><p class="marketplace-location">'+(listing.location?'⌖ '+esc(listing.location):'Location not specified')+'</p><div class="marketplace-detail-facts">'+details+'</div><div class="marketplace-description">'+esc(listing.description)+'</div><div class="marketplace-seller-card"><img src="'+avatar(listing.seller)+'" alt=""><div><strong>'+esc(listing.seller?.name||'Minglora seller')+'</strong><small>@'+esc(listing.seller?.username||'member')+'</small></div></div><div class="marketplace-detail-actions">'+(own?'<button class="secondary" id="marketplace-status-toggle">'+(listing.status==='active'?'Pause listing':'Activate listing')+'</button><button class="secondary" id="marketplace-mark-sold" '+(listing.status==='sold'?'disabled':'')+'>Mark sold</button><button class="secondary" id="marketplace-remove">Remove listing</button>':'<button class="secondary" id="marketplace-save-detail">'+(listing.isSaved?'♥ Saved':'♡ Save listing')+'</button><button class="secondary" id="marketplace-report">Report listing</button>')+'</div></div></section>';
  if(!own&&listing.kind==='product'&&listing.status==='active')html+='<section class="card marketplace-enquiry-card marketplace-commerce-panel"><h2>Review your purchase</h2><p>Get a server-calculated quote before any payment is requested. This does not reserve stock or charge you.</p><form id="marketplace-quote-form"><div class="marketplace-form-grid"><label>Quantity<input name="quantity" type="number" min="1" max="'+Number(listing.quantity||1)+'" value="1" required></label><label>Fulfilment<select name="fulfillment">'+(listing.fulfillment||[]).map(value=>'<option value="'+esc(value)+'">'+esc(({pickup:'Pickup',local_delivery:'Local delivery',shipping:'Shipping'}[value]||value))+'</option>').join('')+'</select></label></div><button type="submit" class="primary">Calculate checkout quote</button></form><div id="marketplace-quote-result" aria-live="polite"></div></section>';
  if(!own&&listing.kind==='service'&&listing.status==='active')html+='<section class="card marketplace-enquiry-card marketplace-commerce-panel"><h2>Request an appointment</h2><p>Choose a preferred start time. The provider must accept the request. This does not collect payment.</p><form id="marketplace-booking-form"><label>Preferred date and time<input name="startAt" type="datetime-local" required></label><label>Duration<select name="durationMinutes"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label><label>Notes (optional)<textarea name="message" maxlength="1500" placeholder="Tell the provider what you need."></textarea></label><button type="submit" class="primary">Request appointment</button></form></section>';
  if(!own&&listing.status==='active')html+='<section class="card marketplace-enquiry-card"><h2>Contact the seller</h2><p>Ask a question, request more details or discuss availability. Keep your conversation on Minglora.</p><form id="marketplace-enquiry-form"><textarea name="text" maxlength="2000" minlength="5" required placeholder="Hi, is this still available?"></textarea><button type="submit" class="primary">Send enquiry</button></form></section>';
  setContent(html);$('#marketplace-back')?.addEventListener('click',()=>renderMarketplace());
  $('#marketplace-status-toggle')?.addEventListener('click',async()=>{try{await api('/marketplace/listings/'+encodeURIComponent(listing.id),{method:'PATCH',body:JSON.stringify({status:listing.status==='active'?'paused':'active'})});toast('Listing status updated.');await renderMarketplaceListing(listing.id);}catch(error){toast(error.message);}});
  $('#marketplace-mark-sold')?.addEventListener('click',async()=>{if(!window.confirm('Mark this listing as sold?'))return;try{await api('/marketplace/listings/'+encodeURIComponent(listing.id),{method:'PATCH',body:JSON.stringify({status:'sold'})});toast('Listing marked as sold.');await renderMarketplaceListing(listing.id);}catch(error){toast(error.message);}});
  $('#marketplace-remove')?.addEventListener('click',async()=>{if(!window.confirm('Remove this listing from Marketplace?'))return;try{await api('/marketplace/listings/'+encodeURIComponent(listing.id),{method:'DELETE',body:'{}'});toast('Listing removed.');await renderMarketplace('mine');}catch(error){toast(error.message);}});
  $('#marketplace-save-detail')?.addEventListener('click',async()=>{try{await api('/marketplace/listings/'+encodeURIComponent(listing.id)+'/save',{method:listing.isSaved?'DELETE':'POST',body:'{}'});toast(listing.isSaved?'Listing removed from Saved.':'Listing saved.');await renderMarketplaceListing(listing.id);}catch(error){toast(error.message);}});
  $('#marketplace-report')?.addEventListener('click',()=>openReportComposer('marketplace_listing',listing.id));
  $('#marketplace-quote-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),result=$('#marketplace-quote-result');button.disabled=true;
    try{
      const values=new FormData(form),quantity=Number(values.get('quantity')),fulfillment=String(values.get('fulfillment')||'');
      const response=await api('/marketplace/checkout/quote',{method:'POST',body:JSON.stringify({items:[{listingId:listing.id,quantity}],fulfillmentByListing:{[listing.id]:fulfillment}})});
      const quote=response.quote,format=minor=>new Intl.NumberFormat(undefined,{style:'currency',currency:quote.currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
      result.innerHTML='<div class="marketplace-quote-summary"><strong>Quote '+esc(quote.id||'')+'</strong><dl><dt>Items</dt><dd>'+format(quote.itemSubtotalMinor)+'</dd><dt>Fulfilment</dt><dd>'+format(quote.fulfillmentMinor)+'</dd><dt>Commission preview</dt><dd>'+format(quote.marketplaceCommissionPreviewMinor)+'</dd><dt>Tax and customs</dt><dd>Not calculated</dd><dt>Total before tax</dt><dd>'+format(quote.totalMinorBeforeTax)+'</dd></dl><strong>Checkout is not enabled</strong><ul>'+quote.blockers.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul><small>This quote is informational only. No payment was taken and stock was not reserved.</small></div>';
    }catch(error){result.textContent=error.message;}finally{button.disabled=false;}
  });
  $('#marketplace-booking-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const values=new FormData(form);await api('/marketplace/bookings',{method:'POST',body:JSON.stringify({listingId:listing.id,startAt:values.get('startAt'),durationMinutes:Number(values.get('durationMinutes')),message:values.get('message')})});toast('Appointment request sent. No payment has been taken.');await renderMarketplace('bookings');}
    catch(error){toast(error.message);}finally{button.disabled=false;}
  });
  $('#marketplace-enquiry-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;try{await api('/marketplace/listings/'+encodeURIComponent(listing.id)+'/enquiries',{method:'POST',body:JSON.stringify({text:new FormData(form).get('text')})});form.reset();toast('Your enquiry was sent to the seller’s Minglora inbox.');}catch(error){toast(error.message);}finally{button.disabled=false;}});
}

async function renderMarketplaceSeller(){
  activateSilent('marketplace');
  const data=await api('/marketplace/seller'),seller=data.seller;
  let html='<div class="marketplace-detail-toolbar"><button class="text-button" id="seller-back-marketplace">← Marketplace</button></div><section class="card marketplace-commerce-panel"><span class="marketplace-eyebrow">MINGLORA SELLER CENTRE</span><h1>Build your shop on Minglora</h1><p>Seller approval and identity/business checks are required before publishing. Payout setup is a separate verified process.</p>';
  if(!seller){
    html+='<form id="marketplace-seller-application" class="marketplace-form-grid"><label>Seller type<select name="sellerType"><option value="individual">Individual seller</option><option value="business">Registered business</option></select></label><label>Store or business name<input name="storeName" minlength="2" maxlength="100" required placeholder="Your store name"></label><label>Country code<input name="countryCode" minlength="2" maxlength="2" value="JM" required></label><label>Seller contact email<input name="contactEmail" type="email" required value="'+esc(state.user.email||'')+'" placeholder="seller@example.com"></label><label class="marketplace-full-field">What do you sell?<textarea name="description" minlength="20" maxlength="1000" required placeholder="Describe your products or services and the customers you serve."></textarea></label><label class="marketplace-full-field marketplace-terms"><input type="checkbox" name="acceptTerms" value="true" required> I accept the current Minglora Seller Terms (version 2026-01).</label><input type="hidden" name="termsVersion" value="2026-01"><div class="marketplace-full-field"><button class="primary" type="submit">Submit seller application</button></div></form>';
  }else{
    const statuses={pending:'Application under review',approved:'Seller approved',rejected:'Application rejected',suspended:'Seller account suspended'};
    const identity={not_started:'Not started',pending:'Verification pending',verified:'Verified',rejected:'Verification rejected'};
    const payout={not_connected:'Not connected',pending:'Setup pending',verified:'Verified',restricted:'Restricted'};
    html+='<div class="marketplace-seller-status-grid"><div><small>Store</small><strong>'+esc(seller.storeName)+'</strong></div><div><small>Application</small><strong>'+esc(statuses[seller.status]||seller.status)+'</strong></div><div><small>Identity / business</small><strong>'+esc(identity[seller.identityStatus]||seller.identityStatus)+'</strong></div><div><small>Payout setup</small><strong>'+esc(payout[seller.payoutStatus]||seller.payoutStatus)+'</strong></div></div>';
    if(seller.status==='approved'&&seller.identityStatus==='verified')html+='<p class="muted">Your seller profile is approved. You can publish products and services. Marketplace payments and seller payouts are not yet enabled.</p><button class="primary" id="seller-create-listing">＋ Create a listing</button>';
    else html+='<p class="muted">Your application cannot publish listings until the Minglora team completes the required review. Payout setup is not activated by submitting this application.</p>';
    html+='<p class="marketplace-safety-note">Never send passwords, card details or full banking credentials through Minglora messages. Verification documents and payout connection must use approved secure flows.</p>';
  }
  html+='</section>';
  setContent(html);
  $('#seller-back-marketplace')?.addEventListener('click',()=>renderMarketplace('browse'));
  $('#seller-create-listing')?.addEventListener('click',openMarketplaceComposer);
  $('#marketplace-seller-application')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const values=new FormData(form),payload=Object.fromEntries(values.entries());payload.acceptTerms=values.get('acceptTerms')==='true';const result=await api('/marketplace/seller',{method:'POST',body:JSON.stringify(payload)});toast('Seller application submitted for review.');await renderMarketplaceSeller();}
    catch(error){toast(error.message);button.disabled=false;}
  });
}

async function renderMarketplaceAdmin(){
  activateSilent('marketplace');
  try{
    const data=await api('/marketplace/admin/queue');
    let html='<div class="marketplace-detail-toolbar"><button class="text-button" id="admin-back-marketplace">← Marketplace</button></div><section class="marketplace-section-heading"><div><span class="marketplace-eyebrow">MINGLORA OPERATIONS</span><h1>Marketplace review desk</h1><p>Human review is required before a seller or vacancy is approved.</p></div></section>';
    html+='<section class="card marketplace-admin-panel"><h2>Seller applications · '+data.sellers.length+'</h2>';
    if(data.sellers.length){
      html+=data.sellers.map(item=>'<article class="marketplace-review-item"><div><strong>'+esc(item.storeName)+'</strong><p>'+esc(item.sellerType)+' · '+esc(item.countryCode)+' · '+esc(item.contactEmail)+'</p><small>Identity status: '+esc(item.identityStatus)+'</small></div><div class="marketplace-card-actions"><button class="primary" data-review-seller="'+esc(item.userId)+'">Verify and approve</button><button class="secondary" data-reject-seller="'+esc(item.userId)+'">Reject</button></div></article>').join('');
    }else html+='<p class="muted">No seller applications are awaiting review.</p>';
    html+='</section><section class="card marketplace-admin-panel"><h2>Job vacancies · '+data.jobs.length+'</h2>';
    if(data.jobs.length){
      html+=data.jobs.map(item=>'<article class="marketplace-review-item"><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.companyName)+' · '+esc(item.location||'Remote')+'</p><small>'+esc(item.description.slice(0,220))+'</small></div><div class="marketplace-card-actions"><button class="primary" data-approve-job="'+esc(item.id)+'">Publish vacancy</button><button class="secondary" data-reject-job="'+esc(item.id)+'">Reject</button></div></article>').join('');
    }else html+='<p class="muted">No job vacancies are awaiting review.</p>';
    html+='</section><section class="card marketplace-admin-panel"><h2>Commerce activation</h2><span class="marketplace-status">Live checkout disabled</span><ul>'+data.commerce.blockers.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>';
    setContent(html);
    $('#admin-back-marketplace')?.addEventListener('click',()=>renderMarketplace());
    document.querySelectorAll('[data-review-seller]').forEach(button=>button.addEventListener('click',async()=>{
      const userId=button.dataset.reviewSeller;
      if(!window.confirm('Only continue after you have checked seller identity or business evidence through the approved secure process. Have you completed that check?'))return;
      const reason=window.prompt('Record which identity or business evidence was reviewed. This note is retained in the audit trail.');
      if(!reason?.trim())return;button.disabled=true;
      try{await api('/marketplace/admin/sellers/'+encodeURIComponent(userId)+'/review',{method:'PATCH',body:JSON.stringify({status:'approved',identityStatus:'verified',reason:reason.trim()})});toast('Seller approved and audit record saved.');await renderMarketplaceAdmin();}
      catch(error){toast(error.message);button.disabled=false;}
    }));
    document.querySelectorAll('[data-reject-seller]').forEach(button=>button.addEventListener('click',async()=>{
      const reason=window.prompt('Record the reason for rejecting this seller application.');
      if(!reason?.trim())return;button.disabled=true;
      try{await api('/marketplace/admin/sellers/'+encodeURIComponent(button.dataset.rejectSeller)+'/review',{method:'PATCH',body:JSON.stringify({status:'rejected',identityStatus:'rejected',reason:reason.trim()})});toast('Seller application rejected.');await renderMarketplaceAdmin();}
      catch(error){toast(error.message);button.disabled=false;}
    }));
    document.querySelectorAll('[data-approve-job],[data-reject-job]').forEach(button=>button.addEventListener('click',async()=>{
      const status=button.hasAttribute('data-approve-job')?'open':'rejected';
      const jobId=button.dataset.approveJob||button.dataset.rejectJob;
      const reason=window.prompt('Record the reason for this vacancy moderation decision.');
      if(!reason?.trim())return;button.disabled=true;
      try{await api('/jobs/'+encodeURIComponent(jobId)+'/review',{method:'PATCH',body:JSON.stringify({status,reason:reason.trim()})});toast(status==='open'?'Vacancy published.':'Vacancy rejected.');await renderMarketplaceAdmin();}
      catch(error){toast(error.message);button.disabled=false;}
    }));
  }catch(error){
    setContent('<section class="card empty-state"><h2>Review desk unavailable</h2><p>'+esc(error.message)+'</p><p>Moderator permission is required.</p></section>');
  }
}
async function renderMarketplaceBookings(){
  activateSilent('marketplace');const data=await api('/marketplace/bookings'),bookings=data.bookings||[];
  let html='<div class="marketplace-detail-toolbar"><button class="text-button" id="bookings-back-marketplace">← Marketplace</button></div><section class="marketplace-section-heading"><div><span class="marketplace-eyebrow">SERVICES</span><h1>Your appointments</h1></div></section>';
  if(!bookings.length)html+='<section class="card empty-state"><h3>No service appointments yet</h3><p>When you request or provide a service appointment, it will appear here.</p><button class="primary" id="bookings-discover">Explore services</button></section>';
  else html+='<div class="marketplace-booking-list">'+bookings.map(item=>{
    const ownSeller=item.sellerId===state.user.id,other=ownSeller?item.buyer:item.buyer;
    const actions=[];
    if(ownSeller&&item.status==='requested')actions.push('<button class="primary" data-booking-status="accepted" data-booking-id="'+esc(item.id)+'">Accept</button>','<button class="secondary" data-booking-status="declined" data-booking-id="'+esc(item.id)+'">Decline</button>');
    if(ownSeller&&item.status==='accepted')actions.push('<button class="primary" data-booking-status="completed_by_seller" data-booking-id="'+esc(item.id)+'">Mark service delivered</button>');
    if(!ownSeller&&['requested','accepted'].includes(item.status))actions.push('<button class="secondary" data-booking-status="cancelled" data-booking-id="'+esc(item.id)+'">Cancel request</button>');
    if(!ownSeller&&item.status==='completed_by_seller')actions.push('<button class="primary" data-booking-status="completed" data-booking-id="'+esc(item.id)+'">Confirm completion</button>','<button class="secondary" data-booking-status="disputed" data-booking-id="'+esc(item.id)+'">Report a problem</button>');
    return '<article class="card marketplace-booking-card"><div><span class="marketplace-status">'+esc(item.status.replaceAll('_',' '))+'</span><h3>'+esc(item.listingTitle||'Service appointment')+'</h3><p>'+ (ownSeller?'Customer: ':'Provider: ')+esc(item.otherName||'Minglora member')+'</p><small>'+new Date(item.startAt).toLocaleString()+' · '+Number(item.durationMinutes)+' minutes</small></div><div class="marketplace-card-actions">'+actions.join('')+'</div></article>';
  }).join('')+'</div>';
  setContent(html);$('#bookings-back-marketplace')?.addEventListener('click',()=>renderMarketplace());
  $('#bookings-discover')?.addEventListener('click',()=>renderMarketplace('services'));
  document.querySelectorAll('[data-booking-status]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/marketplace/bookings/'+encodeURIComponent(button.dataset.bookingId),{method:'PATCH',body:JSON.stringify({status:button.dataset.bookingStatus})});toast('Appointment updated.');await renderMarketplaceBookings();}catch(error){toast(error.message);button.disabled=false;}}));
}
const JOB_CATEGORY_OPTIONS=[['technology','Technology'],['administration','Administration'],['customer_service','Customer service'],['sales_marketing','Sales & marketing'],['finance','Finance'],['healthcare','Healthcare'],['education','Education'],['construction_trades','Construction & trades'],['transport_logistics','Transport & logistics'],['hospitality','Hospitality'],['creative_media','Creative & media'],['other','Other']];
async function renderJobs(mode='browse'){
  activateSilent('jobs');
  const query=$('#jobs-query')?.value?.trim()||'',params=new URLSearchParams();if(query)params.set('q',query);
  const data=mode==='mine'?(await api('/jobs/mine')):(await api('/jobs'+(params.toString()?'?'+params.toString():'')));
  const jobs=data.jobs||[];
  let html='<section class="marketplace-hero marketplace-jobs-hero"><div class="marketplace-hero-copy"><span class="marketplace-eyebrow">MINGLORA CAREERS</span><h1>Find your next opportunity.</h1><p>Discover vacancies shared by employers and businesses in the Minglora community.</p><div class="marketplace-hero-actions"><button class="primary" id="jobs-create">＋ Post a vacancy</button></div></div><div class="marketplace-hero-art" aria-hidden="true"><span class="marketplace-art-orbit"></span><span class="marketplace-art-bag">✧</span></div></section><nav class="marketplace-tabs" aria-label="Jobs sections"><button type="button" data-jobs-mode="browse" class="'+(mode==='browse'?'active':'')+'">Find jobs</button><button type="button" data-jobs-mode="mine" class="'+(mode==='mine'?'active':'')+'">My vacancies</button><button type="button" id="jobs-back-marketplace">Marketplace</button></nav>';
  if(mode==='browse')html+='<form class="marketplace-search" id="jobs-search-form"><label class="marketplace-search-field"><span>⌕</span><input id="jobs-query" name="q" value="'+esc(query)+'" placeholder="Search roles, companies and skills"></label><button type="submit" class="primary">Search jobs</button></form>';
  html+='<div class="marketplace-section-heading"><div><span class="marketplace-eyebrow">CAREER OPPORTUNITIES</span><h2>'+(mode==='mine'?'Your vacancies':'Open positions')+'</h2></div><span class="marketplace-results-count">'+jobs.length+' roles</span></div>';
  if(!jobs.length)html+='<section class="card empty-state"><h3>'+(mode==='mine'?'You have not posted a vacancy yet':'No matching jobs yet')+'</h3><p>'+(mode==='mine'?'Post a clear vacancy with responsibilities, location, work arrangement and application deadline.':'Try a different search or check back after employers publish vacancies.')+'</p>'+(mode==='mine'?'<button class="primary" id="jobs-create-empty">Post a vacancy</button>':'')+'</section>';
  else html+='<div class="marketplace-jobs-list">'+jobs.map(job=>{
    const owner=job.employerId===state.user.id;
    return '<article class="card marketplace-job-card"><div class="marketplace-job-head"><div><span class="marketplace-category">'+esc(JOB_CATEGORY_OPTIONS.find(item=>item[0]===job.category)?.[1]||job.category)+'</span><h3>'+esc(job.title)+'</h3><strong>'+esc(job.companyName)+'</strong></div><span class="marketplace-status">'+esc(job.status.replaceAll('_',' '))+'</span></div><p>'+esc(job.description)+'</p><div class="marketplace-job-meta"><span>⌖ '+esc(job.location||'Remote')+'</span><span>'+esc(job.employmentType.replaceAll('_',' '))+'</span><span>'+esc(job.workplaceType)+'</span><span>'+(job.salaryMinMinor!=null?esc(job.currency)+' '+(job.salaryMinMinor/100).toLocaleString():'Salary not specified')+(job.salaryMaxMinor!=null?' – '+(job.salaryMaxMinor/100).toLocaleString():'')+'</span></div><small>Apply by '+new Date(job.applicationDeadline).toLocaleDateString()+'</small><div class="marketplace-card-actions">'+(owner?'<button class="secondary" data-job-applications="'+esc(job.id)+'">View applicants</button>':mode==='browse'?'<button class="primary" data-job-apply="'+esc(job.id)+'">Apply now</button>':'')+'</div></article>';
  }).join('')+'</div>';
  setContent(html);
  $('#jobs-create')?.addEventListener('click',openJobComposer);$('#jobs-create-empty')?.addEventListener('click',openJobComposer);
  $('#jobs-back-marketplace')?.addEventListener('click',()=>renderMarketplace());
  document.querySelectorAll('[data-jobs-mode]').forEach(button=>button.addEventListener('click',()=>renderJobs(button.dataset.jobsMode)));
  $('#jobs-search-form')?.addEventListener('submit',event=>{event.preventDefault();renderJobs('browse');});
  document.querySelectorAll('[data-job-apply]').forEach(button=>button.addEventListener('click',()=>openJobApplication(button.dataset.jobApply)));
  document.querySelectorAll('[data-job-applications]').forEach(button=>button.addEventListener('click',()=>openJobApplications(button.dataset.jobApplications)));
}
function openJobComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal marketplace-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="marketplace-eyebrow">MINGLORA CAREERS</span><h2>Post a job vacancy</h2></div><button class="modal-close" type="button">×</button></div><form id="job-create-form" class="modal-body"><label>Job title<input name="title" minlength="5" maxlength="120" required></label><label>Company / employer name<input name="companyName" minlength="2" maxlength="120" required></label><label>Job description<textarea name="description" minlength="50" maxlength="6000" required placeholder="Responsibilities, requirements, qualifications and how to apply."></textarea></label><div class="marketplace-form-grid"><label>Category<select name="category">'+JOB_CATEGORY_OPTIONS.map(item=>'<option value="'+item[0]+'">'+item[1]+'</option>').join('')+'</select></label><label>Employment type<select name="employmentType"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="internship">Internship</option><option value="freelance">Freelance</option></select></label><label>Work arrangement<select name="workplaceType"><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label><label>Location<input name="location" maxlength="160" placeholder="Town, parish, country"></label><label>Salary currency<select name="currency"><option>JMD</option><option>USD</option><option>CAD</option><option>GBP</option><option>EUR</option></select></label><label>Salary minimum<input name="salaryMin" type="number" min="0" step="0.01"></label><label>Salary maximum<input name="salaryMax" type="number" min="0" step="0.01"></label><label>Application deadline<input name="applicationDeadline" type="datetime-local" required></label></div><p class="muted">Your vacancy enters moderation before it is visible to candidates. Do not include discriminatory or misleading requirements.</p><div class="modal-actions"><button class="secondary modal-cancel" type="button">Cancel</button><button class="primary" type="submit">Submit for review</button></div></form></section>';
  document.body.append(modal);const close=()=>modal.remove();modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#job-create-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;try{const payload=Object.fromEntries(new FormData(form).entries());const result=await api('/jobs',{method:'POST',body:JSON.stringify(payload)});close();toast(result.notice||'Vacancy submitted for review.');await renderJobs('mine');}catch(error){toast(error.message);button.disabled=false;}});
}
function openJobApplication(jobId){
  const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML='<section class="modal marketplace-modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>Apply for this job</h2><button class="modal-close" type="button">×</button></div><form class="modal-body" id="job-application-form"><label>Cover letter<textarea name="coverLetter" minlength="30" maxlength="5000" required placeholder="Explain your interest and relevant experience."></textarea></label><p class="muted">Your Minglora profile will be shared with the employer. CV uploads will be added through a protected document workflow.</p><div class="modal-actions"><button class="secondary modal-cancel" type="button">Cancel</button><button class="primary" type="submit">Submit application</button></div></form></section>';
  document.body.append(modal);const close=()=>modal.remove();modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('#job-application-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;try{await api('/jobs/'+encodeURIComponent(jobId)+'/applications',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});close();toast('Your application was submitted.');}catch(error){toast(error.message);button.disabled=false;}});
}
async function openJobApplications(jobId){
  try{
    const data=await api('/jobs/'+encodeURIComponent(jobId)+'/applications');
    const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML='<section class="modal marketplace-modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>Job applicants</h2><button class="modal-close" type="button">×</button></div><div class="modal-body">'+(data.applications.length?data.applications.map(item=>'<article class="marketplace-applicant"><strong>'+esc(item.candidate?.name||'Applicant')+'</strong><small>'+esc(item.candidate?.username?'@'+item.candidate.username:'')+' · '+esc(item.status)+'</small><p>'+esc(item.coverLetter)+'</p><div class="marketplace-card-actions">'+['reviewed','shortlisted','rejected','hired'].filter(status=>status!==item.status).map(status=>'<button class="secondary" data-application-status="'+status+'" data-application-id="'+esc(item.id)+'">'+status[0].toUpperCase()+status.slice(1)+'</button>').join('')+'</div></article>').join(''):'<p>No applications have been received.</p>')+'</div></section>';
    document.body.append(modal);const close=()=>modal.remove();modal.querySelectorAll('.modal-close').forEach(button=>button.addEventListener('click',close));modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelectorAll('[data-application-status]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/jobs/applications/'+encodeURIComponent(button.dataset.applicationId),{method:'PATCH',body:JSON.stringify({status:button.dataset.applicationStatus})});toast('Application status updated.');modal.remove();await openJobApplications(jobId);}catch(error){toast(error.message);button.disabled=false;}}));
  }catch(error){toast(error.message);}
}
async function renderView(){try{if(state.view==='feed'){await loadPeople();await loadFeed();await loadStories();await renderFeed()}else if(state.view==='live')await renderLive();else if(state.view==='coins')await renderCoins();else if(state.view==='creator')await renderCreator();else if(state.view==='friends')await renderFriends();else if(state.view==='groups')await renderGroups();else if(state.view==='messages')await renderMessages();else if(state.view==='saved')await renderSavedPosts();else if(state.view==='pages')await renderPages();else if(state.view==='marketplace')await renderMarketplace();else if(state.view==='jobs')await renderJobs();else if(state.view==='connections'&&state.activeConnections)await renderConnections(state.activeConnections.profileId,state.activeConnections.kind);else if(state.view==='page'&&state.activePage)await renderPage(state.activePage);else if(state.view==='group'&&state.activeGroup)await renderGroup(state.activeGroup);}catch(e){setContent(`<section class="card empty-state"><h3>Could not load this page</h3><p>${esc(e.message)}</p><button class="primary" id="retry-view">Try again</button></section>`);$('#retry-view').onclick=renderView;}}
function bindNavigation(){
  bindPaletteSwitcher();
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>activateNav(el.dataset.view)));
  $('#home-brand').onclick=()=>activateNav('feed');
  $('#rail-profile').onclick=()=>openProfile(state.user.id);
  $('#profile-menu').onclick=()=>openProfile(state.user.id);
  $('#rail-notifications').onclick=()=>renderNotifications();
  $('#notifications-btn').onclick=()=>renderNotifications();
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
      state.user=null;
      state.messageWindows=[];
      messagePickers.forEach(picker=>picker.destroy());
      messagePickers.clear();
      syncMessageRefreshPolling();
      showAuth();
    }
  };
  document.querySelectorAll('[data-logout]').forEach(button=>button.addEventListener('click',logout));
}
async function renderSidebar(){try{await loadPeople();await loadGroups();const suggestions=state.people.filter(p=>p.friendship!=='accepted').slice(0,4);$('#suggested-people').innerHTML=suggestions.length?suggestions.map(p=>`<div class="person-row"><img class="avatar" src="${avatar(p)}" alt=""><div class="person-meta"><strong>${esc(p.name)}</strong><small>Suggested for you</small></div><button class="mini-btn" data-sidebar-follow="${esc(p.id)}" data-following="${p.following?'true':'false'}">${p.following?'Following':'Follow'}</button></div>`).join(''):'<small style="color:var(--muted)">No new suggestions.</small>';$('#suggested-groups').innerHTML=state.groups.slice(0,3).map(g=>`<div class="group-row"><div class="group-icon">◉</div><div class="person-meta"><strong>${esc(g.name)}</strong><small>${g.members.length} members</small></div></div>`).join('')||'<small style="color:var(--muted)">No groups yet.</small>';$('#shortcut-groups').innerHTML=state.groups.filter(g=>g.isMember).slice(0,3).map(g=>`<button class="rail-link" data-shortcut-group="${esc(g.id)}"><span>◉</span>${esc(g.name)}</button>`).join('');document.querySelectorAll('[data-sidebar-follow]').forEach(btn=>btn.onclick=async()=>{try{const following=btn.dataset.following==='true';const result=await api(`/users/${btn.dataset.sidebarFollow}/follow`,{method:following?'DELETE':'POST',body:'{}'});toast(result.friends?'You are now friends through mutual follows.':(following?'Unfollowed member.':'Now following member.'));await loadPeople();await renderSidebar();if(state.view==='friends')await renderFriends();}catch(e){toast(e.message)}});$('#shortcut-groups').querySelectorAll('button').forEach(b=>b.onclick=()=>activateNav('groups'));}catch{}}
async function enterMingloraApp(user,showWelcome=false){
  state.user=user;showApp();bindNavigation();await renderSidebar();await updateNotificationDot();
  const params=new URLSearchParams(window.location.search);
  if(params.get('paypal')==='coins'||params.get('paypal')==='cancel'){await finishPaypalCoinReturn();if(state.view!=='coins')activateNav('feed');}
  else activateNav('feed');
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
$('#forgot-password')?.addEventListener('click',async()=>{
  const email=String($('#login-form')?.elements.email?.value||'').trim();
  if(!email){window.alert('Enter your email address first, then choose Forgot password.');$('#login-form')?.elements.email?.focus();return;}
  try{const result=await api('/auth/password/reset/request',{method:'POST',body:JSON.stringify({email})});window.alert(result.message||'Check your email for a recovery link.');}
  catch(error){window.alert(error.message);}
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
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#login-error');error.textContent='';try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});if(data.mfaRequired){openMfaLogin(data.challengeId);return;}await enterMingloraApp(data.user)}catch(err){error.textContent=err.message}});
$('#register-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#register-error');error.textContent='';try{const data=await api('/auth/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});if(data.confirmationRequired){error.textContent=data.message||'Check your email to confirm your account, then log in.';return;}if(!data.user)throw new Error('Account registration did not return a user profile.');state.user=data.user;showApp();bindNavigation();await renderSidebar();activateNav('feed');toast('Welcome to Minglora!')}catch(err){error.textContent=err.message}});
(async()=>{await finishPasswordRecoveryFromLink();try{const me=await api('/auth/me');if(me.user){await enterMingloraApp(me.user);}else showAuth()}catch{showAuth()}})();
