const $ = s => document.querySelector(s);
const state = { user:null, view:'feed', feed:[], feedScope:'all', savedPosts:[], stories:[], people:[], groups:[], notifications:[], conversations:[], activeConversation:null, activeGroup:null, pages:[], activePage:null, profile:null, searchResults:null, settings:null };
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
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function showAuth(){ $('#app').classList.add('hidden');$('#auth-screen').classList.remove('hidden'); }
function showApp(){ $('#auth-screen').classList.add('hidden');$('#app').classList.remove('hidden');$('#top-avatar').src=avatar(state.user);$('#rail-avatar').src=avatar(state.user);$('#top-name').textContent=state.user.name.split(' ')[0];$('#rail-name').textContent=state.user.name;window.dispatchEvent(new Event('minglora:session-ready')); }
function activateNav(view){state.view=view;document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));renderView();}
function setContent(html){$('#main-content').innerHTML=html;}
function composer(){return `<section class="card"><div class="composer-top"><img class="avatar" src="${avatar(state.user)}" alt=""><button class="composer-open" id="open-composer">What's on your mind, ${esc(state.user.name.split(' ')[0])}?</button></div><div class="composer-actions"><button id="post-photo" class="photo">▣ &nbsp; Photo / link</button><button id="post-feeling" class="feeling">☻ &nbsp; Feeling / activity</button><button id="post-text">✎ &nbsp; Write post</button></div></section>`;}
function postCard(post){
  const author=post.author||{}, comments=post.comments||[];
  return `<article class="card post" data-post="${esc(post.id)}">
    <div class="post-head"><img class="avatar" data-profile="${esc(author.id||'')}" src="${avatar(author)}" alt="">
      <div class="post-author"><strong data-profile="${esc(author.id||'')}">${esc(author.name||'Unknown account')}</strong><small>${timeAgo(post.createdAt)} · ◉</small></div>
      <button class="post-menu" aria-label="Post options" data-post-menu="${esc(post.id)}">···</button>
    </div>
    ${post.text?`<div class="post-text">${esc(post.text)}</div>`:''}
    ${post.imageUrl?`<img class="post-image" loading="lazy" src="${esc(post.imageUrl)}" alt="Post attachment" onerror="this.style.display='none'">`:''}
    <div class="post-stats"><span>👍 ${post.reactionCount||0} ${post.reactionCount===1?'reaction':'reactions'}</span><span>${comments.length} comments</span></div>
    <div class="post-actions">
      <button class="${post.myReaction?'liked':''}" data-react="${esc(post.id)}">${post.myReaction==='love'?'❤️':post.myReaction==='haha'?'😆':post.myReaction==='care'?'🤗':post.myReaction?'👍':'♡'} &nbsp; ${post.myReaction?esc(post.myReaction[0].toUpperCase()+post.myReaction.slice(1)):'Like'}</button>
      <button data-focus-comment="${esc(post.id)}">▢ &nbsp; Comment</button>
      <button data-toggle-save="${esc(post.id)}" data-saved="${post.isSaved?'true':'false'}">${post.isSaved?'▣ Saved':'▢ Save'}</button>
      <button data-share="${esc(post.id)}">↗ &nbsp; Share</button>
    </div>
    ${comments.length?`<div class="comments">${comments.slice(-3).map(c=>`<div class="comment"><img class="avatar" src="${avatar(c.author)}" alt=""><div class="comment-bubble"><strong>${esc(c.author?.name||'Member')}</strong>${esc(c.text)}${c.userId===state.user.id||post.userId===state.user.id?`<button class="comment-delete" data-delete-comment-post="${esc(post.id)}" data-delete-comment-id="${esc(c.id)}">Delete</button>`:''}</div></div>`).join('')}</div>`:''}
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
  modal.innerHTML=`<section class="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="edit-post-title"><div class="modal-head"><h2 id="edit-post-title">Edit post</h2><button class="modal-close" aria-label="Close">×</button></div>
    <form class="modal-body" id="edit-post-form"><div class="field"><label for="edit-post-text">Post text</label><textarea id="edit-post-text" name="text" maxlength="5000">${esc(post.text||'')}</textarea></div>
    <div class="field"><label for="edit-post-image">Image URL (HTTPS, optional)</label><input id="edit-post-image" name="imageUrl" type="url" maxlength="2000" value="${esc(post.imageUrl||'')}"></div>
    <div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Save changes</button></div></form></section>`;
  document.body.append(modal);
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=()=>modal.remove());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('form').onsubmit=async e=>{
    e.preventDefault();
    try{await api(`/posts/${post.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});modal.remove();await refreshVisiblePosts();toast('Post updated.');}
    catch(err){toast(err.message);}
  };
}
function openPostOptions(post){
  const owner=post.userId===state.user.id, author=post.author||{};
  const modal=document.createElement('div');modal.className='modal-backdrop';
  const actions=owner
    ? '<button class="secondary full" data-post-action="edit">Edit post</button><button class="secondary full" data-post-action="delete">Delete post</button>'
    : `<button class="secondary full" data-post-action="block">Block ${esc(author.name||'this member')}</button>`;
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
  modal.querySelector('[data-post-action="block"]')?.addEventListener('click',async()=>{
    if(!window.confirm(`Block ${author.name||'this member'}? You will no longer see each other’s profile, posts or messages.`))return;
    try{await api(`/users/${post.userId}/block`,{method:'POST',body:'{}'});modal.remove();await refreshVisiblePosts();toast('Member blocked.');}
    catch(err){toast(err.message);}
  });
}
async function loadFeed(scope=state.feedScope||'all'){state.feedScope=scope;state.feed=(await api(`/feed?scope=${encodeURIComponent(state.feedScope)}`)).posts;}
async function loadStories(){state.stories=(await api('/stories')).stories;}
function renderStoriesPanel(){const seen=new Set();const visible=state.stories.filter(story=>{const id=story.author?.id;if(!id||seen.has(id))return false;seen.add(id);return true;});const cards=visible.map(story=>'<button class="story-card" data-open-story="'+esc(story.id)+'">'+(story.imageUrl?'<img class="story-image" src="'+esc(story.imageUrl)+'" alt="">':'<span class="story-text-background">'+esc((story.text||'').slice(0,80))+'</span>')+'<span class="story-shade"></span><img class="story-avatar" src="'+avatar(story.author)+'" alt=""><span class="story-author">'+esc(story.author?.name||'Unknown account')+'</span>'+(story.viewedByMe?'<span class="story-viewed">Viewed</span>':'')+'</button>').join('');return '<section class="card story-panel"><div class="story-panel-head"><h2>Stories</h2><button class="primary" id="create-story">＋ Add story</button></div>'+(visible.length?'<div class="story-cards">'+cards+'</div>':'<p class="story-empty">No stories yet. Add a story to share an update for 24 hours.</p>')+'</section>';}
async function renderFeed(){state.view='feed';const noPosts=state.feedScope==='following'?'You are not following anyone who has posted yet.':state.feedScope==='friends'?'Your friends have not shared posts yet.':'Share your first post or connect with people to see updates.';const title=state.feedScope==='following'?'Following feed':state.feedScope==='friends'?'Friends feed':'Recent posts';setContent(`<section class="card welcome"><h1>Good to see you, ${esc(state.user.name.split(' ')[0])} 👋</h1><p>Your community is here. Catch up and share something good.</p></section>${renderStoriesPanel()}${composer()}<div class="feed-header"><h2>${title}</h2><div class="feed-controls"><select id="feed-scope" class="sort-select" aria-label="Feed audience"><option value="all" ${state.feedScope==='all'?'selected':''}>All posts</option><option value="following" ${state.feedScope==='following'?'selected':''}>Following</option><option value="friends" ${state.feedScope==='friends'?'selected':''}>Friends</option></select><select id="feed-sort" class="sort-select" aria-label="Feed sort"><option value="new">Most recent</option><option value="old">Oldest first</option></select></div></div><div id="feed-list">${state.feed.length?state.feed.map(postCard).join(''):`<section class="card empty-state"><div class="empty-icon">✦</div><h3>No posts here yet</h3><p>${noPosts}</p></section>`}</div>`);bindFeed();$('#feed-scope')?.addEventListener('change',async e=>{try{await loadFeed(e.target.value);await renderFeed();}catch(err){toast(err.message);}});$('#feed-sort')?.addEventListener('change',e=>{const posts=[...state.feed].sort((a,b)=>e.target.value==='old'?new Date(a.createdAt)-new Date(b.createdAt):new Date(b.createdAt)-new Date(a.createdAt));$('#feed-list').innerHTML=posts.map(postCard).join('');bindFeed()});if(state.settings?.preferences?.feedSort==='oldest'){const sort=$('#feed-sort');if(sort){sort.value='old';sort.dispatchEvent(new Event('change'));}}}
function openComposer(withImage=false){const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<section class="modal composer-modal"><div class="modal-head"><h2>Create a post</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="create-post-form"><div class="post-head"><img class="avatar" src="${avatar(state.user)}" alt=""><div class="post-author"><strong>${esc(state.user.name)}</strong><small>◉ Anyone can see this</small></div></div><div class="field"><textarea name="text" maxlength="5000" placeholder="What's on your mind?" aria-label="Post text"></textarea></div><div class="field"><label for="image-url">Image URL (optional, HTTPS)</label><input id="image-url" name="imageUrl" type="url" placeholder="https://example.com/photo.jpg" value=""></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button type="submit" class="primary">Publish</button></div></form></section>`;document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>modal.remove();modal.querySelector('.modal-cancel').onclick=()=>modal.remove();if(withImage)modal.querySelector('[name=imageUrl]').focus();else modal.querySelector('[name=text]').focus();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});modal.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));try{await api('/posts',{method:'POST',body:JSON.stringify(data)});modal.remove();await loadFeed();await renderFeed();toast('Your post is published.');}catch(err){toast(err.message)}});}
async function loadPeople(){state.people=(await api('/users')).users;}
function peopleCard(p){
  const label=p.friendship==='accepted'?'Friends':p.friendship==='pending'?'Request sent':p.friendship==='incoming'?'Respond':'Add friend';
  return `<article class="card person-card"><div class="person-cover"></div><div class="person-card-content"><img class="avatar" src="${avatar(p)}" alt=""><h3>${esc(p.name)}</h3><p>${esc(p.bio||'Connect and get to know each other.')}</p>
    <button class="mini-btn" data-add-friend="${esc(p.id)}" ${p.friendship==='accepted'||p.friendship==='pending'?'disabled':''}>${label}</button>
    <button class="mini-btn" data-toggle-follow="${esc(p.id)}" data-following="${p.following?'true':'false'}">${p.following?'Following':'Follow'}</button>
    <button class="mini-btn" data-block-user="${esc(p.id)}">Block</button></div></article>`;
}
function bindPeople(){
  document.querySelectorAll('[data-add-friend]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await api(`/friends/${btn.dataset.addFriend}/request`,{method:'POST',body:'{}'});toast('Friend request sent.');await loadPeople();renderFriends();}
    catch(e){toast(e.message);}
  }));
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
  let f={friends:[],incoming:[]};try{f=await api('/friends')}catch{}
  const incoming=f.incoming.map(p=>({...p,friendship:'incoming'}));
  const others=state.people.filter(p=>p.friendship!=='accepted'&&p.friendship!=='declined');
  setContent(`<div class="page-heading"><h1>Friends</h1><span class="text-button">People you may know</span></div>
    ${incoming.length?`<section class="card"><h3>Friend requests</h3><div class="people-grid">${incoming.map(p=>`<article class="card person-card"><div class="person-cover"></div><div class="person-card-content"><img class="avatar" src="${avatar(p)}" alt=""><h3>${esc(p.name)}</h3><p>Wants to connect with you</p><div class="person-actions"><button class="primary full" data-accept-friend="${esc(p.id)}">Confirm</button><button class="secondary full" data-decline-friend="${esc(p.id)}">Decline</button></div></div></article>`).join('')}</div></section>`:''}
    <div class="feed-header"><h2>People you may know</h2></div><div class="people-grid">${others.length?others.map(peopleCard).join(''):`<section class="card empty-state"><h3>You're all caught up</h3><p>There are no new people to suggest right now.</p></section>`}</div>
    <section class="card friends-list"><h2>Friends (${f.friends.length})</h2>${f.friends.length?f.friends.map(p=>`<div class="person-row" style="margin:12px 0"><img class="avatar" src="${avatar(p)}" alt=""><div class="person-meta"><strong>${esc(p.name)}</strong><small>@${esc(p.username)}</small></div><button class="mini-btn" data-profile="${esc(p.id)}">View profile</button><button class="mini-btn" data-remove-friend="${esc(p.id)}">Unfriend</button></div>`).join(''):'<p class="muted">Your confirmed friends will appear here.</p>'}</section>`);
  bindPeople();
  document.querySelectorAll('[data-accept-friend]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/friends/${btn.dataset.acceptFriend}/accept`,{method:'POST',body:'{}'});toast('Friend request accepted.');await renderFriends();}catch(e){toast(e.message)}}));
  document.querySelectorAll('[data-decline-friend]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/friends/${btn.dataset.declineFriend}/decline`,{method:'POST',body:'{}'});toast('Friend request declined.');await renderFriends();}catch(e){toast(e.message)}}));
  document.querySelectorAll('[data-remove-friend]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Remove this friend?'))return;try{await api(`/friends/${btn.dataset.removeFriend}`,{method:'DELETE',body:'{}'});toast('Friend removed.');await renderFriends();}catch(e){toast(e.message)}}));
}
function activateSilent(view){state.view=view;document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}
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
  html+='</section>';
  if(g.isMember){
    html+='<section class="card group-post-composer"><h2>Group discussion</h2><form id="group-post-form"><label for="group-post-text">Share with this group</label><textarea id="group-post-text" name="text" maxlength="5000" required placeholder="Write a group post..."></textarea><div class="group-form-actions"><small class="muted">Visible to group members and group visitors.</small><button class="primary" type="submit">Publish</button></div></form></section>';
  }
  if(data.posts.length){
    html+='<div class="group-post-list">'+data.posts.map(p=>'<article class="card group-post"><div class="post-head"><img class="avatar" src="'+avatar(p.author)+'" alt=""><div class="post-author"><strong>'+esc(p.author?.name||'Unknown account')+'</strong><small>'+timeAgo(p.createdAt)+'</small></div>'+(p.userId===state.user.id||isOwner?'<button class="post-menu" aria-label="Delete group post" data-delete-group-post="'+esc(p.id)+'">···</button>':'')+'</div><div class="post-text">'+esc(p.text)+'</div></article>').join('')+'</div>';
  }else{
    html+='<section class="card empty-state"><h3>No group posts yet</h3><p>Be the first member to start a discussion.</p></section>';
  }
  setContent(html);
  $('#back-to-groups')?.addEventListener('click',()=>renderGroups());
  $('#join-current-group')?.addEventListener('click',async()=>{try{await api('/groups/'+groupId+'/join',{method:'POST',body:'{}'});toast('You joined the group.');await renderGroup(groupId)}catch(e){toast(e.message)}});
  $('#leave-current-group')?.addEventListener('click',async()=>{if(!window.confirm('Leave this group?'))return;try{await api('/groups/'+groupId+'/join',{method:'DELETE',body:'{}'});toast('You left the group.');await renderGroup(groupId)}catch(e){toast(e.message)}});
  $('#group-post-form')?.addEventListener('submit',async e=>{e.preventDefault();const text=e.currentTarget.elements.text.value;try{await api('/groups/'+groupId+'/posts',{method:'POST',body:JSON.stringify({text})});toast('Group post published.');await renderGroup(groupId)}catch(err){toast(err.message)}});
  document.querySelectorAll('[data-delete-group-post]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Delete this group post?'))return;try{await api('/groups/'+groupId+'/posts/'+btn.dataset.deleteGroupPost,{method:'DELETE',body:'{}'});toast('Group post deleted.');await renderGroup(groupId)}catch(err){toast(err.message)}}));
}
function openGroupModal(){const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<section class="modal"><div class="modal-head"><h2>Create a group</h2><button class="modal-close">×</button></div><form class="modal-body" id="group-form"><div class="field"><label>Group name</label><input name="name" minlength="3" maxlength="80" required placeholder="e.g. Local book club"></div><div class="field"><label>Description</label><textarea name="description" maxlength="500" placeholder="What brings this community together?"></textarea></div><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Create group</button></div></form></section>`;document.body.append(modal);modal.querySelectorAll('.modal-close,.modal-cancel').forEach(b=>b.onclick=()=>modal.remove());modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});modal.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await api('/groups',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});modal.remove();toast('Group created.');renderGroups()}catch(err){toast(err.message)}};}
async function openProfile(id){try{const data=await api(`/users/${id}`);state.profile=data;renderProfile(data)}catch(e){toast(e.message)}}
function renderProfile(data){
  activateSilent('profile');const u=data.user,isMe=u.id===state.user.id;
  const friendLabel=data.friendship==='accepted'?'✓ Friends':data.friendship==='pending'?'Request sent':'Add friend';
  const relationshipActions=isMe
    ? '<button class="secondary profile-edit" id="edit-profile">Edit profile</button>'
    : `<div class="profile-actions"><button class="primary profile-edit" id="profile-add-friend" ${data.friendship==='pending'?'disabled':''}>${friendLabel}</button><button class="secondary profile-edit" id="profile-follow">${data.following?'Following':'Follow'}</button><button class="secondary profile-edit" id="profile-block">Block</button></div>`;
  setContent(`<section class="card" style="padding:0;overflow:hidden"><div class="profile-cover" style="${u.cover?`background-image:url('${esc(u.cover)}')`:''}"></div><div class="profile-info"><img class="avatar" src="${avatar(u)}" alt=""><div class="profile-info-main"><h1>${esc(u.name)}</h1><p>@${esc(u.username)}</p><p>${esc(u.bio||'')}</p><p>${esc(u.location||'')}</p><p class="profile-counts"><strong>${data.followersCount||0}</strong> followers &nbsp; <strong>${data.followingCount||0}</strong> following &nbsp; <strong>${data.posts.length}</strong> posts</p></div>${relationshipActions}</div><div class="profile-tabs"><button class="active">Posts</button><button id="profile-about-tab">About</button><button id="profile-friends-tab">Friends</button></div></section><div class="profile-body"><div class="card profile-about"><h3>About</h3><p>⌖ &nbsp; ${esc(u.location||'Location not added')}</p><p>✎ &nbsp; ${esc(u.bio||'No bio yet.')}</p><p>◷ &nbsp; Joined ${new Date(u.createdAt).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</p></div><div><div class="card"><div class="composer-top"><img class="avatar" src="${avatar(state.user)}" alt=""><button class="composer-open" id="profile-composer">${isMe?'Share an update':`Share an update on ${esc(u.name.split(' ')[0])}'s profile`}</button></div></div>${data.posts.length?data.posts.map(postCard).join(''):'<section class="card empty-state"><h3>No posts yet</h3><p>Posts shared by this profile will appear here.</p></section>'}</div></div>`);
  bindFeed();
  $('#edit-profile')?.addEventListener('click',()=>openEditProfile(u));
  $('#profile-add-friend')?.addEventListener('click',async()=>{try{await api(`/friends/${u.id}/request`,{method:'POST',body:'{}'});toast('Friend request sent.');openProfile(u.id)}catch(e){toast(e.message)}});
  $('#profile-follow')?.addEventListener('click',async()=>{try{await api(`/users/${u.id}/follow`,{method:data.following?'DELETE':'POST',body:'{}'});toast(data.following?'Unfollowed member.':'Now following member.');await openProfile(u.id)}catch(e){toast(e.message)}});
  $('#profile-block')?.addEventListener('click',async()=>{if(!window.confirm(`Block ${u.name}? You will no longer see each other’s profile, posts or messages.`))return;try{await api(`/users/${u.id}/block`,{method:'POST',body:'{}'});toast('Member blocked.');state.profile=null;state.view='feed';await loadPeople();await loadFeed('all');await renderFeed();await renderSidebar()}catch(e){toast(e.message)}});
  $('#profile-composer')?.addEventListener('click',()=>openComposer());
  $('#profile-about-tab')?.addEventListener('click',()=>document.querySelector('.profile-about')?.scrollIntoView({behavior:'smooth'}));
  $('#profile-friends-tab')?.addEventListener('click',()=>activateNav('friends'));
}
async function fileAsBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read the selected image.'));
    reader.onload=()=>{const result=String(reader.result||'');const comma=result.indexOf(',');if(comma<0)return reject(new Error('The selected image could not be decoded.'));resolve(result.slice(comma+1));};
    reader.readAsDataURL(file);
  });
}
async function uploadProfileImage(slot,file){
  if(!file)return null;
  const allowed=['image/jpeg','image/png','image/webp','image/avif'];
  if(!allowed.includes(file.type))throw new Error('Choose a JPG, PNG, WEBP or AVIF image.');
  if(file.size>8*1024*1024)throw new Error('Profile and cover images must be 8 MB or smaller.');
  const base64=await fileAsBase64(file);
  return api('/media/upload',{method:'POST',body:JSON.stringify({slot,mimeType:file.type,base64})});
}
function openEditProfile(u){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML=`<section class="modal profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
    <div class="modal-head"><h2 id="edit-profile-title">Edit profile</h2><button class="modal-close" aria-label="Close">×</button></div>
    <form class="modal-body" id="edit-profile-form">
      <div class="field"><label for="edit-profile-name">Name</label><input id="edit-profile-name" name="name" maxlength="120" value="${esc(u.name)}" required></div>
      <div class="field"><label for="edit-profile-bio">Bio</label><textarea id="edit-profile-bio" name="bio" maxlength="500">${esc(u.bio||'')}</textarea></div>
      <div class="field"><label for="edit-profile-location">Location</label><input id="edit-profile-location" name="location" maxlength="120" value="${esc(u.location||'')}"></div>
      <div class="profile-upload-section">
        <h3>Profile picture</h3><div class="profile-upload-row"><img id="edit-avatar-preview" class="profile-upload-avatar" src="${avatar(u)}" alt="Profile picture preview"><div class="profile-upload-controls"><label class="secondary profile-file-button" for="edit-avatar-file">Choose from device</label><input id="edit-avatar-file" class="profile-file-input" type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp,image/avif"><small>Choose from your phone gallery, photos, files or folders. Maximum 8 MB.</small></div></div>
      </div>
      <div class="profile-upload-section">
        <h3>Cover photo</h3><div id="edit-cover-preview" class="profile-cover-upload-preview" role="img" aria-label="Cover photo preview"></div><div class="profile-upload-controls"><label class="secondary profile-file-button" for="edit-cover-file">Choose cover photo</label><input id="edit-cover-file" class="profile-file-input" type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/avif"><small>Browse your device gallery or folders. Maximum 8 MB.</small></div>
      </div>
      <p class="profile-upload-status muted" id="profile-upload-status" role="status">Your selected images upload securely to Minglora when you save.</p>
      <div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary" id="save-profile-button">Save changes</button></div>
    </form></section>`;
  document.body.append(modal);
  const avatarInput=modal.querySelector('#edit-avatar-file');
  const coverInput=modal.querySelector('#edit-cover-file');
  const avatarPreview=modal.querySelector('#edit-avatar-preview');
  const coverPreview=modal.querySelector('#edit-cover-preview');
  if(u.cover)coverPreview.style.backgroundImage='url("'+String(u.cover).replace(/["\\]/g,'')+'")';
  const previewUrls=[];
  function previewFile(input,target){
    const file=input.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)){toast('Choose a JPG, PNG, WEBP or AVIF image.');input.value='';return;}
    if(file.size>8*1024*1024){toast('Images must be 8 MB or smaller.');input.value='';return;}
    const url=URL.createObjectURL(file);previewUrls.push(url);if(target.tagName==='IMG')target.src=url;else target.style.backgroundImage='url("'+url+'")';target.classList.add('has-preview');
  }
  avatarInput.addEventListener('change',()=>previewFile(avatarInput,avatarPreview));
  coverInput.addEventListener('change',()=>previewFile(coverInput,coverPreview));
  const close=()=>{previewUrls.forEach(url=>URL.revokeObjectURL(url));modal.remove();};
  modal.querySelectorAll('.modal-close,.modal-cancel').forEach(button=>button.onclick=close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  modal.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=modal.querySelector('#save-profile-button'),status=modal.querySelector('#profile-upload-status');
    const values=new FormData(form);
    const payload={name:values.get('name'),bio:values.get('bio'),location:values.get('location')};
    button.disabled=true;
    try{
      if(avatarInput.files?.[0]){status.textContent='Uploading profile picture…';await uploadProfileImage('avatar',avatarInput.files[0]);}
      if(coverInput.files?.[0]){status.textContent='Uploading cover photo…';await uploadProfileImage('cover',coverInput.files[0]);}
      status.textContent='Saving profile details…';
      const result=await api('/users/me',{method:'PATCH',body:JSON.stringify(payload)});
      state.user=result.user;close();showApp();await openProfile(state.user.id);toast('Profile updated.');
    }catch(error){status.textContent=error.message;toast(error.message);}
    finally{button.disabled=false;}
  };
}
function openStoryComposer(){
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="story-modal-title"><div class="modal-head"><h2 id="story-modal-title">Create a story</h2><button class="modal-close" aria-label="Close">×</button></div><form class="modal-body" id="story-form"><div class="field"><label for="story-text">Text (optional)</label><textarea id="story-text" name="text" maxlength="1000" placeholder="Share a moment..."></textarea></div><div class="field"><label for="story-image">Image URL (HTTPS, optional)</label><input id="story-image" name="imageUrl" type="url" maxlength="2000" placeholder="https://example.com/image.jpg"></div><div class="field"><label for="story-audience">Audience</label><select id="story-audience" name="audience"><option value="public">Public</option><option value="friends">Friends</option><option value="followers">Followers</option><option value="private">Only me</option></select></div><p class="muted">Stories expire automatically after 24 hours.</p><div class="modal-actions"><button type="button" class="secondary modal-cancel">Cancel</button><button class="primary">Publish story</button></div></form></section>';
  document.body.append(modal);modal.querySelectorAll('.modal-close,.modal-cancel').forEach(btn=>btn.onclick=()=>modal.remove());modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(!String(data.text||'').trim()&&!String(data.imageUrl||'').trim()){toast('Add text or an image URL first.');return;}try{await api('/stories',{method:'POST',body:JSON.stringify(data)});modal.remove();await loadStories();if(state.view==='feed')await renderFeed();toast('Story published for 24 hours.');}catch(err){toast(err.message);}};
}
async function openStory(id){
  try{
    const result=await api('/stories/'+encodeURIComponent(id)+'/view',{method:'POST',body:'{}'});const s=result.story;const isOwner=s.userId===state.user.id;
    const viewers=isOwner&&Array.isArray(s.viewers)?s.viewers.filter(v=>v.user).map(v=>'<li>'+esc(v.user.name)+' <small>'+new Date(v.viewedAt).toLocaleString()+'</small></li>').join(''):'';
    const modal=document.createElement('div');modal.className='modal-backdrop story-viewer-backdrop';
    modal.innerHTML='<section class="modal story-viewer" role="dialog" aria-modal="true" aria-labelledby="story-viewer-title"><div class="modal-head"><div><h2 id="story-viewer-title">'+esc(s.author?.name||'Story')+'</h2><small>'+timeAgo(s.createdAt)+' · expires '+new Date(s.expiresAt).toLocaleString()+'</small></div><button class="modal-close" aria-label="Close">×</button></div>'+(s.imageUrl?'<img class="story-viewer-image" src="'+esc(s.imageUrl)+'" alt="Story image">':'')+(s.text?'<p class="story-viewer-text">'+esc(s.text)+'</p>':'')+(isOwner?'<section class="story-viewer-stats"><strong>'+result.story.viewCount+' views</strong>'+(viewers?'<ul>'+viewers+'</ul>':'<p class="muted">No other viewers yet.</p>')+'<button class="secondary full" id="delete-story">Delete story</button></section>':'')+'</section>';
    document.body.append(modal);modal.querySelector('.modal-close').onclick=()=>{modal.remove();loadStories().catch(()=>{});};modal.addEventListener('click',e=>{if(e.target===modal){modal.remove();loadStories().catch(()=>{});}});
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
  let html='<section class="card page-detail-head"><button class="text-button" id="back-to-pages">← All Pages</button><div class="page-card-mark page-detail-mark">'+esc((page.title||'P').slice(0,1).toUpperCase())+'</div><h1>'+esc(page.title)+'</h1><p class="page-handle">@'+esc(page.handle)+'</p>'+(page.category?'<span class="page-category">'+esc(page.category)+'</span>':'')+'<p>'+esc(page.description||'')+'</p><p class="muted">'+page.followerCount+' followers · Managed by '+esc(page.owner?.name||'account')+'</p><div class="page-detail-actions">'+(page.myRole?'':'<button class="primary" id="toggle-page-follow">'+(page.isFollowing?'Unfollow Page':'Follow Page')+'</button>')+(canDeletePage?'<button class="secondary" id="delete-page">Delete Page</button>':'')+'</div></section>';
  if(canPublish)html+='<section class="card page-post-composer"><h2>Publish as '+esc(page.title)+'</h2><form id="page-post-form"><div class="field"><label for="page-post-text">Post text</label><textarea id="page-post-text" name="text" maxlength="5000" placeholder="Share an update..." required></textarea></div><div class="field"><label for="page-post-image">HTTPS image URL (optional)</label><input id="page-post-image" type="url" name="imageUrl" maxlength="2000" placeholder="https://example.com/image.jpg"></div><button class="primary" type="submit">Publish Page post</button></form></section>';
  if(data.posts.length){
    html+='<div class="page-post-list">'+data.posts.map(post=>'<article class="card page-post"><div class="post-head"><img class="avatar" src="'+avatar(post.author)+'" alt=""><div class="post-author"><strong>'+esc(page.title)+'</strong><small>Published by '+esc(post.author?.name||'Unknown account')+' · '+timeAgo(post.createdAt)+'</small></div>'+(post.publishedBy===state.user.id||['owner','admin'].includes(page.myRole)?'<button class="post-menu" aria-label="Delete Page post" data-delete-page-post="'+esc(post.id)+'">···</button>':'')+'</div>'+(post.text?'<div class="post-text">'+esc(post.text)+'</div>':'')+(post.imageUrl?'<img class="post-image" loading="lazy" src="'+esc(post.imageUrl)+'" alt="Page post attachment">':'')+'</article>').join('')+'</div>';
  }else html+='<section class="card empty-state"><h3>No Page posts yet</h3><p>New updates published by this Page will show here.</p></section>';
  setContent(html);
  $('#back-to-pages')?.addEventListener('click',()=>renderPages());
  $('#toggle-page-follow')?.addEventListener('click',async()=>{try{await api('/pages/'+pageId+'/follow',{method:page.isFollowing?'DELETE':'POST',body:'{}'});await renderPage(pageId);toast(page.isFollowing?'Page unfollowed.':'Page followed.');}catch(e){toast(e.message)}});
  $('#delete-page')?.addEventListener('click',async()=>{if(!window.confirm('Delete this Page and its posts?'))return;try{await api('/pages/'+pageId,{method:'DELETE',body:'{}'});state.activePage=null;toast('Page deleted.');await renderPages();}catch(e){toast(e.message)}});
  $('#page-post-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const body=Object.fromEntries(new FormData(form));try{await api('/pages/'+pageId+'/posts',{method:'POST',body:JSON.stringify(body)});toast('Page post published.');await renderPage(pageId);}catch(err){toast(err.message)}});
  document.querySelectorAll('[data-delete-page-post]').forEach(btn=>btn.addEventListener('click',async()=>{if(!window.confirm('Delete this Page post?'))return;try{await api('/pages/'+pageId+'/posts/'+btn.dataset.deletePagePost,{method:'DELETE',body:'{}'});toast('Page post deleted.');await renderPage(pageId);}catch(err){toast(err.message)}}));
}
async function renderSavedPosts(){
  activateSilent('saved');
  state.savedPosts=(await api('/saved-posts')).posts;
  setContent(`<div class="page-heading"><h1>Saved posts</h1></div>${state.savedPosts.length?state.savedPosts.map(postCard).join(''):`<section class="card empty-state"><div class="empty-icon">▣</div><h3>No saved posts yet</h3><p>Use Save on a post to keep it here for later.</p></section>`}`);
  bindFeed();
}
async function renderMessages(){activateSilent('messages');state.conversations=(await api('/messages')).conversations;const peer=state.conversations.find(c=>c.user.id===state.activeConversation)||state.conversations[0];state.activeConversation=peer?.user.id||null;setContent(`<div class="page-heading"><h1>Messages</h1></div><section class="card" style="padding:0;overflow:hidden"><div class="message-layout"><aside class="message-peers">${state.conversations.length?state.conversations.map(c=>`<button class="conversation ${c.user.id===state.activeConversation?'active':''}" data-conversation="${esc(c.user.id)}"><img class="avatar" src="${avatar(c.user)}" alt=""><span><strong>${esc(c.user.name.split(' ')[0])}</strong><small>${esc(c.messages.at(-1)?.text||'Open chat')}</small></span></button>`).join(''):'<p style="font-size:11px;color:var(--muted)">No chats yet. Visit Friends to connect.</p>'}</aside><div class="message-area">${peer?`<div class="post-head" style="padding-bottom:10px;border-bottom:1px solid var(--line)"><img class="avatar" src="${avatar(peer.user)}" alt=""><div class="post-author"><strong>${esc(peer.user.name)}</strong><small>@${esc(peer.user.username)}</small></div></div><div class="message-scroll" id="message-scroll">${peer.messages.map(m=>`<div class="message-bubble ${m.from===state.user.id?'mine':''}">${esc(m.text)}<small>${timeAgo(m.createdAt)}</small></div>`).join('')}</div><form class="message-send" id="message-form"><input name="text" maxlength="3000" placeholder="Write a message…" required><button>Send</button></form>`:`<div class="empty-state"><div class="empty-icon">▤</div><h3>Your messages</h3><p>Start a conversation by connecting with another member.</p><button class="primary" id="go-friends">Find people</button></div>`}</div></div></section>`);document.querySelectorAll('[data-conversation]').forEach(btn=>btn.onclick=()=>{state.activeConversation=btn.dataset.conversation;renderMessages()});$('#go-friends')?.addEventListener('click',()=>activateNav('friends'));$('#message-scroll')?.scrollTo(0,99999);$('#message-form')?.addEventListener('submit',async e=>{e.preventDefault();const text=e.currentTarget.elements.text.value;try{await api('/messages',{method:'POST',body:JSON.stringify({to:state.activeConversation,text})});await renderMessages()}catch(err){toast(err.message)}});}
async function renderNotifications(){state.notifications=(await api('/notifications')).notifications;setContent(`<div class="page-heading"><h1>Notifications</h1><button class="text-button" id="mark-read">Mark all read</button></div><section class="card">${state.notifications.length?state.notifications.map(n=>`<div class="notice-item ${n.read?'':'unread'}"><div class="notice-icon">${n.type==='message'?'▤':n.type==='friend'?'♧':n.type==='reaction'?'♡':'♢'}</div><div><p>${esc(n.text)}</p><small>${timeAgo(n.createdAt)}</small></div></div>`).join(''):'<div class="empty-state"><div class="empty-icon">♢</div><h3>All quiet for now</h3><p>Your notifications will show up here.</p></div>'}</section>`);$('#mark-read').onclick=async()=>{await api('/notifications/read',{method:'POST',body:'{}'});toast('Notifications marked as read.');renderNotifications();updateNotificationDot()};}
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
async function renderView(){try{if(state.view==='feed'){await loadPeople();await loadFeed();await loadStories();await renderFeed()}else if(state.view==='friends')await renderFriends();else if(state.view==='groups')await renderGroups();else if(state.view==='messages')await renderMessages();else if(state.view==='saved')await renderSavedPosts();else if(state.view==='pages')await renderPages();else if(state.view==='page'&&state.activePage)await renderPage(state.activePage);else if(state.view==='group'&&state.activeGroup)await renderGroup(state.activeGroup);}catch(e){setContent(`<section class="card empty-state"><h3>Could not load this page</h3><p>${esc(e.message)}</p><button class="primary" id="retry-view">Try again</button></section>`);$('#retry-view').onclick=renderView;}}
function bindNavigation(){document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>activateNav(el.dataset.view)));$('#home-brand').onclick=()=>activateNav('feed');$('#rail-profile').onclick=()=>openProfile(state.user.id);$('#profile-menu').onclick=()=>openProfile(state.user.id);$('#rail-notifications').onclick=()=>renderNotifications();$('#notifications-btn').onclick=()=>renderNotifications();$('#see-people').onclick=()=>activateNav('friends');$('#see-groups').onclick=()=>activateNav('groups');$('#search-form').addEventListener('submit',async e=>{e.preventDefault();const q=$('#search-input').value.trim();if(q)try{await renderSearch(q)}catch(err){toast(err.message)}});$('#logout-btn').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}finally{state.user=null;showAuth()}};}
async function renderSidebar(){try{await loadPeople();await loadGroups();const suggestions=state.people.filter(p=>p.friendship!=='accepted').slice(0,4);$('#suggested-people').innerHTML=suggestions.length?suggestions.map(p=>`<div class="person-row"><img class="avatar" src="${avatar(p)}" alt=""><div class="person-meta"><strong>${esc(p.name)}</strong><small>Suggested for you</small></div><button class="mini-btn" data-sidebar-add="${esc(p.id)}">Add</button></div>`).join(''):'<small style="color:var(--muted)">No new suggestions.</small>';$('#suggested-groups').innerHTML=state.groups.slice(0,3).map(g=>`<div class="group-row"><div class="group-icon">◉</div><div class="person-meta"><strong>${esc(g.name)}</strong><small>${g.members.length} members</small></div></div>`).join('')||'<small style="color:var(--muted)">No groups yet.</small>';$('#shortcut-groups').innerHTML=state.groups.filter(g=>g.isMember).slice(0,3).map(g=>`<button class="rail-link" data-shortcut-group="${esc(g.id)}"><span>◉</span>${esc(g.name)}</button>`).join('');document.querySelectorAll('[data-sidebar-add]').forEach(btn=>btn.onclick=async()=>{try{await api(`/friends/${btn.dataset.sidebarAdd}/request`,{method:'POST',body:'{}'});toast('Friend request sent.');renderSidebar()}catch(e){toast(e.message)}});$('#shortcut-groups').querySelectorAll('button').forEach(b=>b.onclick=()=>activateNav('groups'));}catch{}}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#login-error');error.textContent='';try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});state.user=data.user;showApp();bindNavigation();await renderSidebar();await updateNotificationDot();activateNav('feed')}catch(err){error.textContent=err.message}});
$('#register-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#register-error');error.textContent='';try{const data=await api('/auth/register',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});if(data.confirmationRequired){error.textContent=data.message||'Check your email to confirm your account, then log in.';return;}if(!data.user)throw new Error('Account registration did not return a user profile.');state.user=data.user;showApp();bindNavigation();await renderSidebar();activateNav('feed');toast('Welcome to Minglora!')}catch(err){error.textContent=err.message}});
(async()=>{try{const me=await api('/auth/me');if(me.user){state.user=me.user;showApp();bindNavigation();await renderSidebar();await updateNotificationDot();await activateNav('feed')}else showAuth()}catch{showAuth()}})();
