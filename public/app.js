const $ = s => document.querySelector(s);
const state = { user:null, view:'feed', feed:[], feedScope:'all', savedPosts:[], stories:[], people:[], groups:[], notifications:[], conversations:[], activeConversation:null, messageWindows:[], activeGroup:null, pages:[], activePage:null, profile:null, searchResults:null, settings:null, activeConnections:null };
window.addEventListener('minglora:settings-loaded',event=>{state.settings=event.detail||null;const sort=$('#feed-sort');if(sort&&state.view==='feed'){sort.value=state.settings?.preferences?.feedSort==='oldest'?'old':'new';sort.dispatchEvent(new Event('change'));}});
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
    const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
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
function activateNav(view){state.view=view;syncMessageRefreshPolling();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));renderView();}
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
  return [...state.feed,...state.savedPosts,...(state.profile?.posts||[]),...(state.searchResults?.posts||[])].find(post=>post.id===id);
}
async function refreshVisiblePosts(){
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
    const form=event.currentTarget,button=modal.querySelector('#save-profile-button');
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
  };;
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
async function renderView(){try{if(state.view==='feed'){await loadPeople();await loadFeed();await loadStories();await renderFeed()}else if(state.view==='live')await renderLive();else if(state.view==='coins')await renderCoins();else if(state.view==='creator')await renderCreator();else if(state.view==='friends')await renderFriends();else if(state.view==='groups')await renderGroups();else if(state.view==='messages')await renderMessages();else if(state.view==='saved')await renderSavedPosts();else if(state.view==='pages')await renderPages();else if(state.view==='connections'&&state.activeConnections)await renderConnections(state.activeConnections.profileId,state.activeConnections.kind);else if(state.view==='page'&&state.activePage)await renderPage(state.activePage);else if(state.view==='group'&&state.activeGroup)await renderGroup(state.activeGroup);}catch(e){setContent(`<section class="card empty-state"><h3>Could not load this page</h3><p>${esc(e.message)}</p><button class="primary" id="retry-view">Try again</button></section>`);$('#retry-view').onclick=renderView;}}
function bindNavigation(){
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
  $('#logout-btn').onclick=async()=>{
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
