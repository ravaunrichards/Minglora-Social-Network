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
function peopleCard(p){
  const mutual=p.friendship==='accepted';
  return `<article class="card person-card"><div class="person-cover"></div><div class="person-card-content"><img class="avatar" src="${avatar(p)}" alt=""><h3>${esc(p.name)}</h3><p>${esc(p.bio||'Connect and get to know each other.')}</p>
    <button class="mini-btn" data-toggle-follow="${esc(p.id)}" data-following="${p.following?'true':'false'}">${p.following?(mutual?'Friends · Following':'Following'):(mutual?'Friends':'Follow')}</button>
    <button class="mini-btn" data-profile="${esc(p.id)}">View profile</button>
    <button class="mini-btn" data-block-user="${esc(p.id)}">Block</button></div></article>`;
}
function bindPeople(){
  document.querySelectorAll('[data-toggle-follow]').forEach(btn=>btn.addEventListener('click',async()=>{
    const following=btn.dataset.following==='true';
    try{await api(`/users/${btn.dataset.toggleFollow}/follow`,{method:following?'DELETE':'POST',body:'{}'});toast(following?'Unfollowed member.':'Now following member.');await loadPeople();renderFriends();}
    catch(e){toast(e.message);}
  }));
  document.querySelectorAll('[data-block-user]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!window.confirm('Block this member? You will no longer see each other’s profile, posts or messages.'))return;
    try{await api(`/users/${btn.dataset.blockUser}/block`,{method:'POST',body:'{}'});toast('Member blocked.');await loadPeople();renderFriends();await renderSidebar();}
    catch(e){toast(e.message);}
  }));
  document.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('click',()=>openProfile(el.dataset.profile)));
}
async function renderFriends(){
  activateSilent('friends');await loadPeople();
  const result=await api('/friends');
  const friends=result.friends||[];
  const others=state.people.filter(member=>member.friendship!=='accepted');
  setContent(`<div class="page-heading"><div><h1>Friends</h1><p class="muted">Friends are created automatically when two members follow each other.</p></div></div>
    <div class="feed-header"><h2>People you may know</h2></div><div class="people-grid">${others.length?others.map(peopleCard).join(''):`<section class="card empty-state"><h3>You're all caught up</h3><p>There are no new people to suggest right now.</p></section>`}</div>
    <section class="card friends-list"><h2>Friends (${friends.length})</h2>${friends.length?friends.map(member=>`<div class="person-row" style="margin:12px 0"><img class="avatar" src="${avatar(member)}" alt=""><div class="person-meta"><strong>${esc(member.name)}</strong><small>@${esc(member.username)}</small></div><span class="muted">Mutual follow</span><button class="mini-btn" data-profile="${esc(member.id)}">View profile</button></div>`).join(''):'<p class="muted">Follow each other to become friends. Your mutual connections will appear here.</p>'}</section>`);
  bindPeople();
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

function stopLiveChatRefresh(){if(liveChatRefreshTimer){clearInterval(liveChatRefreshTimer);liveChatRefreshTimer=null;}}
function stopLiveDirectoryRefresh(){if(liveDirectoryRefreshTimer){clearInterval(liveDirectoryRefreshTimer);liveDirectoryRefreshTimer=null;}}
function liveMoney(minor){return "$"+(Number(minor||0)/100).toFixed(2);}
function renderLiveDirectory(sessions,status,catalog,wallet){
  const liveReady=Boolean(status.configured&&status.connected===true);
  const liveStatusText=!status.configured?"Live provider not configured":liveReady?"Live video ready":"Live provider connection failed";
  const cards=sessions.length?sessions.map(session=>
    "<article class='live-room-card'><div class='live-room-preview'><span class='live-indicator'>LIVE</span><span class='live-room-viewers'>"+
    (session.viewerCountVerified?"◉ "+Number(session.viewerCount||0).toLocaleString()+" watching":"Viewers unavailable")+
    "</span><div class='live-room-avatar'><img src='"+avatar(session.host)+"' alt=''></div></div><div class='live-room-details'><strong>"+
    esc(session.title)+"</strong><span>"+esc(session.host?.name||"Minglora creator")+"</span><small>@"+esc(session.host?.username||"member")+
    "</small><button class='primary' data-watch-live='"+esc(session.id)+"'>Watch LIVE</button></div></article>"
  ).join(""):"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a LIVE session and bring your community together.</p></section>";
  const packages=(catalog.packages||[]).slice(0,4);
  setContent("<div class='page-heading live-page-heading'><div><span class='eyebrow'>Minglora LIVE</span><h1>Go LIVE. Share the moment.</h1><p class='muted'>Real-time video, creator chat and animated gifts.</p></div><span class='live-status-pill "+(liveReady?"ready":"unavailable")+"'>"+liveStatusText+"</span></div>"+
    "<section class='card live-start-card'><div><h2>Start your LIVE</h2><p class='muted'>Choose a title and who can watch. Your camera and microphone are requested after you start.</p></div><form id='live-create-form' class='live-create-form'><input name='title' maxlength='120' required placeholder='What are you going LIVE about?'><select name='visibility' aria-label='Who can watch'><option value='public'>Everyone · Public</option><option value='friends'>Friends</option><option value='private'>Private room</option></select><button class='primary' type='submit' "+(liveReady?"":"disabled")+">🔴 Start LIVE</button></form>"+
    (liveReady?"":"<p class='form-hint'>"+esc(status.error||"Minglora could not verify its LiveKit connection. Check the server URL and API credentials.")+"</p>")+"</section>"+
    "<div class='feed-header'><h2>Live now</h2><button class='text-button' id='refresh-live'>Refresh</button></div><div class='live-room-grid'>"+cards+"</div>"+
    "<section class='card live-coins-promo'><div><span class='eyebrow'>Support your favourite creators</span><h2>Send LIVE gifts with Minglora Coins</h2><p class='muted'>Your gifts support creators through Minglora’s 50/50 earnings share.</p></div><div class='live-promo-actions'><strong>"+
    Number(wallet.wallet?.balance_coins||0).toLocaleString()+" Coins</strong><button class='secondary' id='open-live-coins'>Recharge Coins</button></div>"+
    (packages.length?"<div class='live-package-preview'>"+packages.map(p=>"<span>"+Number(p.coin_amount).toLocaleString()+" Coins · "+liveMoney(p.price_minor)+"</span>").join("")+"</div>":"")+"</section>");
  $("#live-create-form")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type='submit']");button.disabled=true;
    try{const values=new FormData(form);const result=await api("/live/sessions",{method:"POST",body:JSON.stringify({title:String(values.get("title")||"").trim(),visibility:values.get("visibility")})});await openLiveRoom(result.session,"host",result.liveKit);}
    catch(error){toast(error.message);button.disabled=false;}
  });
  $("#refresh-live")?.addEventListener("click",renderLive);
  $("#open-live-coins")?.addEventListener("click",()=>activateNav("coins"));
  document.querySelectorAll("[data-watch-live]").forEach(button=>button.addEventListener("click",()=>{
    const session=sessions.find(item=>item.id===button.dataset.watchLive);if(session)openLiveRoom(session,session.hostId===state.user.id?"host":"viewer");
  }));
}
async function refreshLiveDirectorySessions(){
  if(state.view!=='live'||activeLiveRoom){stopLiveDirectoryRefresh();return;}
  try{
    const data=await api('/live/sessions'),sessions=data.sessions||[],container=$('.live-room-grid');
    if(!container)return;
    container.innerHTML=sessions.length?sessions.map(session=>
      "<article class='live-room-card'><div class='live-room-preview'><span class='live-indicator'>LIVE</span><span class='live-room-viewers'>"+
      (session.viewerCountVerified?"◉ "+Number(session.viewerCount||0).toLocaleString()+" watching":"Viewers unavailable")+
      "</span><div class='live-room-avatar'><img src='"+avatar(session.host)+"' alt=''></div></div><div class='live-room-details'><strong>"+
      esc(session.title)+"</strong><span>"+esc(session.host?.name||"Minglora creator")+"</span><small>@"+
      esc(session.host?.username||"member")+"</small><button class='primary' data-watch-live='"+esc(session.id)+"'>Watch LIVE</button></div></article>"
    ).join(""):"<section class='card empty-state'><div class='empty-icon'>🔴</div><h3>No one is live right now</h3><p>Start a LIVE session and bring your community together.</p></section>";
    document.querySelectorAll('[data-watch-live]').forEach(button=>button.onclick=()=>{
      const session=sessions.find(item=>item.id===button.dataset.watchLive);
      if(session)openLiveRoom(session,session.hostId===state.user.id?"host":"viewer").catch(error=>toast(error.message));
    });
  }catch{}
}
async function renderLive(){
  activateSilent("live");stopLiveChatRefresh();stopLiveDirectoryRefresh();
  const result=await Promise.all([api("/live/status"),api("/live/sessions"),api("/coins/catalog"),api("/coins/wallet")]);
  liveGiftCatalogue=result[2].gifts||[];renderLiveDirectory(result[1].sessions||[],result[0],result[2],result[3]);
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

async function refreshLiveChat(broadcastId){
  try{
    const data=await api("/live/sessions/"+encodeURIComponent(broadcastId)+"/chat"),list=$("#live-chat-list");if(!list)return;
    list.innerHTML=(data.messages||[]).map(message=>"<div class='live-chat-line'><strong>"+esc(message.user?.name||"Member")+"</strong><span>"+esc(message.body)+"</span><small>"+timeAgo(message.created_at)+"</small></div>").join("")||"<p class='muted'>Say hello to the LIVE community.</p>";
    list.scrollTop=list.scrollHeight;
  }catch(error){if($("#live-chat-list"))toast(error.message);}
}
async function openLiveRoom(session,role,issuedLiveKit){
  role=(session?.hostId===state.user?.id||role==="host")?"host":"viewer";
  stopLiveChatRefresh();
  const liveKit=issuedLiveKit||(await api("/live/sessions/"+encodeURIComponent(session.id)+"/join",{method:"POST",body:"{}"})).liveKit;
  const client=window.LivekitClient;
  if(!client?.Room||!client?.RoomEvent){if(role!=="host")await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});throw new Error("The LIVE player could not load. Refresh Minglora and try again.");}
  activeLiveSession=session;activeLiveRole=role;liveCameraEnabled=true;liveMicrophoneEnabled=true;
  setContent("<section class='live-player-shell'><div class='live-player-header'><button class='text-button' id='live-back'>← Live now</button><div><span class='live-indicator'>LIVE</span><strong>"+esc(session.title)+"</strong></div><span id='live-viewer-count' class='live-viewer-count'>Connecting…</span></div>"+
    "<div class='live-player-layout'><div class='live-video-column'><div id='live-video-stage' class='live-video-stage'><div class='live-video-placeholder'>Connecting to LIVE…</div></div><div id='live-audio-root' class='live-audio-root'></div>"+
    "<div class='live-player-controls'><button id='live-mic-toggle' class='secondary'>"+(role==="host"?"Mute microphone":"Microphone unavailable")+"</button><button id='live-camera-toggle' class='secondary'>"+(role==="host"?"Turn camera off":"Camera unavailable")+"</button><button id='live-leave' class='danger'>"+(role==="host"?"End LIVE":"Leave LIVE")+"</button></div></div>"+
    "<aside class='live-community-panel'><div class='live-community-title'><div><strong>LIVE community</strong><small>Be kind. Keep it positive.</small></div></div><div id='live-chat-list' class='live-chat-list'><p class='muted'>Loading comments…</p></div>"+
    "<form id='live-chat-form' class='live-chat-form'><input name='body' maxlength='500' placeholder='Add a comment…' required><button type='submit'>Send</button></form><div class='live-gift-panel'><div class='live-gift-heading'><strong>Send a gift</strong><span id='live-wallet-balance'>Loading Coins…</span></div>"+
    "<div id='live-gift-grid' class='live-gift-grid'></div><button class='text-button' id='live-recharge'>Recharge Minglora Coins</button></div></aside></div></section>");
  const room=new client.Room({adaptiveStream:true,dynacast:true});activeLiveRoom=room;
  const updatePresence=()=>{const count=Number(room.remoteParticipants?.size||0)+(role==="host"?1:0);const counter=$("#live-viewer-count");if(counter)counter.textContent=count.toLocaleString()+" in room";};
  room.on(client.RoomEvent.TrackSubscribed,(track,publication,participant)=>attachLiveTrack(track,participant,false));
  room.on(client.RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(element=>element.remove()));
  room.on(client.RoomEvent.ParticipantConnected,updatePresence);room.on(client.RoomEvent.ParticipantDisconnected,updatePresence);
  room.on(client.RoomEvent.Disconnected,()=>{if(activeLiveRoom===room)toast("Your LIVE connection was disconnected.");});
  try{
    let connectTimeout;
    try{
      await Promise.race([
        room.connect(liveKit.url,liveKit.token),
        new Promise((_,reject)=>{connectTimeout=setTimeout(()=>reject(new Error('Could not establish a LIVE connection within 20 seconds. Check the LiveKit server URL, firewall and network connection, then try again.')),20000);})
      ]);
    }finally{if(connectTimeout)clearTimeout(connectTimeout);}
    $(".live-video-placeholder")?.remove();
    if(role==="host"){
      await room.localParticipant.enableCameraAndMicrophone();
      for(const publication of room.localParticipant.videoTrackPublications.values())if(publication.track)attachLiveTrack(publication.track,room.localParticipant,true);
    }
    updatePresence();$("#live-mic-toggle").disabled=role!=="host";$("#live-camera-toggle").disabled=role!=="host";
    $("#live-mic-toggle")?.addEventListener("click",async()=>{try{liveMicrophoneEnabled=!liveMicrophoneEnabled;await room.localParticipant.setMicrophoneEnabled(liveMicrophoneEnabled);$("#live-mic-toggle").textContent=liveMicrophoneEnabled?"Mute microphone":"Unmute microphone";}catch(error){toast(error.message);}});
    $("#live-camera-toggle")?.addEventListener("click",async()=>{try{liveCameraEnabled=!liveCameraEnabled;await room.localParticipant.setCameraEnabled(liveCameraEnabled);$("#live-camera-toggle").textContent=liveCameraEnabled?"Turn camera off":"Turn camera on";}catch(error){toast(error.message);}});
    $("#live-leave")?.addEventListener("click",async()=>{
      const button=$("#live-leave");if(button)button.disabled=true;
      try{if(role==="host")await api("/live/sessions/"+encodeURIComponent(session.id)+"/end",{method:"POST",body:"{}"});else await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"});}catch(error){toast(error.message);}
      stopLiveChatRefresh();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-back")?.addEventListener("click",async()=>{
      if(role==="host"){toast("End your LIVE session before returning to the directory.");return;}
      await api("/live/sessions/"+encodeURIComponent(session.id)+"/leave",{method:"POST",body:"{}"}).catch(()=>{});
      stopLiveChatRefresh();await room.disconnect();activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;await renderLive();
    });
    $("#live-chat-form")?.addEventListener("submit",async event=>{
      event.preventDefault();const form=event.currentTarget,body=String(form.elements.body.value||"").trim();if(!body)return;
      const button=form.querySelector("button");button.disabled=true;
      try{await api("/live/sessions/"+encodeURIComponent(session.id)+"/chat",{method:"POST",body:JSON.stringify({body})});form.reset();await refreshLiveChat(session.id);}
      catch(error){toast(error.message);}finally{button.disabled=false;}
    });
    const results=await Promise.all([api("/coins/catalog"),api("/coins/wallet")]);liveGiftCatalogue=results[0].gifts||[];
    $("#live-wallet-balance").textContent=Number(results[1].wallet?.balance_coins||0).toLocaleString()+" Coins";
    $("#live-gift-grid").innerHTML=liveGiftCatalogue.map(gift=>"<button type='button' class='live-gift-button' data-live-gift='"+esc(gift.code)+"'><span class='live-gift-model-slot'>"+(gift.model_url?"<model-viewer src='"+esc(gift.model_url)+"' alt='"+esc(gift.name)+"' auto-rotate rotation-per-second='34deg' interaction-prompt='none'></model-viewer>":esc(gift.emoji))+"</span><strong>"+esc(gift.name)+"</strong><small>"+Number(gift.coin_price).toLocaleString()+" Coins</small></button>").join("");
    document.querySelectorAll("[data-live-gift]").forEach(button=>button.addEventListener("click",async()=>{
      button.disabled=true;
      try{
        const sent=await api("/live/sessions/"+encodeURIComponent(session.id)+"/gifts",{method:"POST",body:JSON.stringify({giftCode:button.dataset.liveGift})}),gift=sent.gift;
        toast((gift.emoji||"🎁")+" "+gift.giftName+" sent · "+Number(gift.coinAmount||0).toLocaleString()+" Minglora Coins");
        const wallet=await api("/coins/wallet");$("#live-wallet-balance").textContent=Number(wallet.wallet?.balance_coins||0).toLocaleString()+" Coins";
        const stage=$("#live-video-stage"),catalogGift=liveGiftCatalogue.find(item=>item.code===button.dataset.liveGift)||{};if(stage){const effect=document.createElement("div");effect.className="live-gift-effect live-gift-effect-3d";effect.dataset.animationPreset=catalogGift.animation_preset||catalogGift.animation_key||"gift-float";if(catalogGift.model_url){effect.innerHTML="<model-viewer src='"+esc(catalogGift.model_url)+"' alt='"+esc(catalogGift.name||gift.giftName||"Minglora gift")+"' auto-rotate rotation-per-second='78deg' interaction-prompt='none'></model-viewer>";}else effect.textContent=gift.emoji||"🎁";stage.append(effect);setTimeout(()=>effect.remove(),2600);}
      }catch(error){toast(error.message);}finally{button.disabled=false;}
    }));
    $("#live-recharge")?.addEventListener("click",()=>activateNav("coins"));
    await refreshLiveChat(session.id);liveChatRefreshTimer=setInterval(()=>refreshLiveChat(session.id),5000);
    if(role==="host")toast("You are LIVE. Your camera and microphone are connected.");
  }catch(error){
    stopLiveChatRefresh();await room.disconnect().catch(()=>{});activeLiveRoom=null;activeLiveSession=null;activeLiveRole=null;
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
  activateSilent("creator");const data=await api("/creator/earnings"),account=data.payoutAccount||null;
  const platformTotal=(data.ledger||[]).reduce((sum,row)=>sum+Number(row.platform_share_minor||0),0);
  setContent("<div class='page-heading'><div><span class='eyebrow'>Creator studio</span><h1>Creator earnings</h1><p class='muted'>A transparent 50/50 split of eligible LIVE gift revenue.</p></div></div><div class='creator-earnings-grid'>"+
    "<article class='card earnings-stat'><small>Your share · 50%</small><strong>"+liveMoney(data.earnedMinor)+"</strong><span>Creator earnings</span></article>"+
    "<article class='card earnings-stat'><small>Available to withdraw</small><strong>"+liveMoney(data.availableMinor)+"</strong><span>After existing payouts</span></article>"+
    "<article class='card earnings-stat'><small>Minglora platform share · 50%</small><strong>"+liveMoney(platformTotal)+"</strong><span>Platform share from gifts</span></article></div>"+
    "<section class='card'><h2>PayPal payout details</h2><p class='muted'>Add the PayPal email address where you receive creator payouts.</p><form id='creator-payout-account-form' class='creator-payout-form'><input type='email' name='paypalEmail' required maxlength='254' placeholder='your-paypal@example.com' value='"+esc(account?.paypal_email||"")+"'><button class='primary' type='submit'>Save payout email</button></form>"+
    "<form id='creator-withdraw-form' class='creator-payout-form'><label for='creator-payout-amount'>Withdraw amount (USD)</label><input id='creator-payout-amount' name='amount' type='number' min='1' step='0.01' max='"+(Number(data.availableMinor||0)/100).toFixed(2)+"' value='"+(Number(data.availableMinor||0)/100).toFixed(2)+"' required><button class='primary' type='submit' "+(account&&Number(data.availableMinor)>=100?"":"disabled")+">Withdraw with PayPal</button></form><small class='muted'>Minimum withdrawal USD $1.00. Payout status is updated after the provider confirms processing.</small></section>"+
    "<section class='card'><div class='feed-header'><h2>Earnings history</h2><span class='muted'>Your share and Minglora’s share are recorded separately</span></div>"+
    ((data.ledger||[]).length?data.ledger.map(item=>"<div class='coin-ledger-row'><div><strong>LIVE gift earnings</strong><small>"+timeAgo(item.created_at)+"</small></div><b class='positive'>"+liveMoney(item.creator_share_minor)+"</b></div>").join(""):"<p class='muted'>Eligible LIVE gift earnings will appear here.</p>")+"</section>"+
    "<section class='card'><h2>PayPal withdrawals</h2>"+((data.payouts||[]).length?data.payouts.map(item=>"<div class='coin-ledger-row'><div><strong>"+esc(String(item.status).toUpperCase())+"</strong><small>"+timeAgo(item.created_at)+"</small></div><b>"+liveMoney(item.amount_minor)+"</b></div>").join(""):"<p class='muted'>Your withdrawals will appear here.</p>")+"</section>");
  $("#creator-payout-account-form")?.addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");button.disabled=true;try{await api("/creator/payout-account",{method:"PUT",body:JSON.stringify({paypalEmail:form.elements.paypalEmail.value})});toast("PayPal payout details saved.");await renderCreator();}catch(error){toast(error.message);button.disabled=false;}});
  $("#creator-withdraw-form")?.addEventListener("submit",async event=>{event.preventDefault();const amount=Number(event.currentTarget.elements.amount.value);if(!Number.isFinite(amount)||amount<1){toast("The minimum payout is USD $1.00.");return;}const button=event.currentTarget.querySelector("button");button.disabled=true;try{const result=await api("/creator/payouts",{method:"POST",body:JSON.stringify({amountMinor:Math.round(amount*100)})});toast("PayPal payout submitted. Status: "+result.status+".");await renderCreator();}catch(error){toast(error.message);button.disabled=false;}});
}
async function finishPaypalCoinReturn(){
  const params=new URLSearchParams(window.location.search),status=params.get("paypal"),orderId=params.get("token");
  if(status==="cancel"){window.history.replaceState(null,"",window.location.pathname);toast("PayPal checkout was cancelled. No Coins were added.");return;}
  if(status!=="coins"||!orderId)return;
  window.history.replaceState(null,"",window.location.pathname);
  try{await api("/coins/purchase/capture",{method:"POST",body:JSON.stringify({orderId})});toast("Payment confirmed. Your Minglora Coins are ready.");await renderCoins();}
  catch(error){toast("PayPal return received, but the purchase could not be completed: "+error.message);}
}

function activateSilent(view){state.view=view;syncMessageRefreshPolling();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}
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
async function openProfile(id){try{const data=await api(`/users/${id}`);state.profile=data;renderProfile(data)}catch(e){toast(e.message)}}

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
    ['About',u.bio],['Location',u.location],['Country',u.country],['County',u.county],
    ['Parish',u.parish],['City',u.city],['Gender',u.gender],
    ['Relationship status',u.relationshipStatus],['Contact phone',u.contactPhone]
  ].filter(([,value])=>String(value||'').trim());
  aboutRows.push(['Joined',new Date(u.createdAt).toLocaleDateString(undefined,{month:'long',year:'numeric'})]);
  const aboutHtml=aboutRows.map(([label,value])=>`<div class="about-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  setContent(`<section class="card" style="padding:0;overflow:hidden"><div class="profile-cover" data-view-image="${esc(u.cover||'')}" data-image-label="${esc(u.name)} cover photo" style="${u.cover?`background-image:url('${esc(u.cover)}')`:''}"></div><div class="profile-info"><img class="avatar" data-view-image="${esc(u.avatar||'')}" data-image-label="${esc(u.name)} profile picture" src="${avatar(u)}" alt=""><div class="profile-info-main"><h1>${esc(u.name)}</h1><p>@${esc(u.username)}</p><p>${esc(u.bio||'')}</p><p>${esc(u.location||'')}</p><p class="profile-counts"><button type="button" class="connection-count" data-open-connections="followers"><strong>${data.followersCount||0}</strong> followers</button><button type="button" class="connection-count" data-open-connections="following"><strong>${data.followingCount||0}</strong> following</button><button type="button" class="connection-count" data-open-connections="friends"><strong>${data.friendsCount||0}</strong> friends</button><span><strong>${data.posts.length}</strong> posts</span></p></div>${relationshipActions}</div><div class="profile-tabs"><button class="active">Posts</button><button id="profile-about-tab">About</button><button id="profile-friends-tab">Friends</button></div></section><div class="profile-body"><div class="card profile-about"><div class="about-heading"><h3>About</h3>${isMe?'<button class="text-button" id="edit-about-inline">Edit</button>':''}</div>${aboutHtml||'<p class="muted">No About details have been added yet.</p>'}</div><div><div class="card"><div class="composer-top"><img class="avatar" src="${avatar(state.user)}" alt=""><button class="composer-open" id="profile-composer">${isMe?'Share an update':`Share an update on ${esc(u.name.split(' ')[0])}'s profile`}</button></div></div>${data.posts.length?data.posts.map(postCard).join(''):'<section class="card empty-state"><h3>No posts yet</h3><p>Posts shared by this profile will appear here.</p></section>'}</div></div>`);
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
}
function mediaMaxBytes(slot){
  return slot==='avatar'?10*1024*1024:slot==='cover'?20*1024*1024:slot==='story'?200*1024*1024:slot==='group'||slot==='page'?250*1024*1024:slot==='message'?100*1024*1024:500*1024*1024;
}
function mediaMaxLabel(slot){
  return slot==='avatar'?'10 MB':slot==='cover'?'20 MB':slot==='story'?'200 MB':slot==='group'||slot==='page'?'250 MB':slot==='message'?'100 MB':'500 MB';
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
  const modal=document.createElement('div');modal.className='modal-backdrop';
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
      <p class="profile-upload-status muted" id="profile-upload-status" role="status">Your selected images upload securely to Minglora when you save.</p>
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
  const phonePanel=modal.querySelector('#phone-verification-panel');
  const phoneRequest=modal.querySelector('#request-phone-verification');
  const phoneVerify=modal.querySelector('#confirm-phone-verification');
  phoneRequest.onclick=async()=>{
    const phone=String(phoneInput.value||'').trim();
    phoneRequest.disabled=true;phoneStatus.textContent='Requesting a verification code…';
    try{
      const saved=await api('/users/me',{method:'PATCH',body:JSON.stringify({contactPhone:phone})});
      state.user.contactPhone=saved.user.contactPhone;
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
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=modal.querySelector('#save-profile-button'),status=modal.querySelector('#profile-upload-status');
    const values=new FormData(form);
    const payload={
      name:values.get('name'),username:values.get('username'),bio:values.get('bio'),location:values.get('location'),
      contactPhone:values.get('contactPhone'),country:values.get('country'),county:values.get('county'),
      parish:values.get('parish'),city:values.get('city'),gender:values.get('gender'),
      relationshipStatus:values.get('relationshipStatus'),
      aboutVisibility:{
        bio:form.elements.show_bio.checked,location:form.elements.show_location.checked,
        contactPhone:form.elements.show_contactPhone.checked,country:form.elements.show_country.checked,
        county:form.elements.show_county.checked,parish:form.elements.show_parish.checked,
        city:form.elements.show_city.checked,gender:form.elements.show_gender.checked,
        relationshipStatus:form.elements.show_relationshipStatus.checked
      }
    };
    button.disabled=true;
    try{
      if(avatarInput.files?.[0]){status.textContent='Uploading profile picture…';const edited=await transformMediaImage(avatarInput.files[0],avatarEdit.zoom,avatarEdit.rotation);await uploadProfileImage('avatar',edited,1,0,update=>{status.textContent='Uploading profile picture… '+update.percentage+'%';});}
      if(coverInput.files?.[0]){status.textContent='Uploading cover photo…';const edited=await transformMediaImage(coverInput.files[0],coverEdit.zoom,coverEdit.rotation);await uploadProfileImage('cover',edited,1,0,update=>{status.textContent='Uploading cover photo… '+update.percentage+'%';});}
      status.textContent='Saving profile details…';
      const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(payload)});
      state.user=result.user;close();showApp();await openProfile(state.user.id);toast('Profile updated.');
    }catch(error){status.textContent=error.message;toast(error.message);}
    finally{button.disabled=false;}
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
