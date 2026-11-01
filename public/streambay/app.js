const $ = selector => document.querySelector(selector);
const state = { user:null, videos:[], category:'All', route:'home', query:'', channelId:null };
const CATEGORIES = ['All','Music','Gaming','Education','News','Sports','Comedy','Technology','Travel','Food','Lifestyle','Other'];
const ICONS = '/assets/icons/navigation-3d.svg?v=20261101-streambay-1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = (id, cls='sb-3d-icon') => '<svg class="'+cls+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="'+ICONS+'#'+id+'"></use></svg>';
const fmt = value => Intl.NumberFormat(undefined,{notation:Number(value)>=10000?'compact':'standard',maximumFractionDigits:1}).format(Number(value)||0);
const ago = value => {
  const seconds = Math.max(0,(Date.now()-new Date(value).getTime())/1000);
  if(seconds<60)return 'just now';
  if(seconds<3600)return Math.floor(seconds/60)+' min ago';
  if(seconds<86400)return Math.floor(seconds/3600)+' hr ago';
  if(seconds<604800)return Math.floor(seconds/86400)+' days ago';
  return new Date(value).toLocaleDateString();
};
async function api(path, options={}) {
  const headers = {...(options.headers||{})};
  if(options.body && !(options.body instanceof FormData)) headers['Content-Type']='application/json';
  const response = await fetch(path,{credentials:'same-origin',...options,headers});
  const payload = response.status===204 ? {} : await response.json().catch(()=>({error:'Unexpected server response.'}));
  if(!response.ok) throw new Error(payload.error||'Request failed.');
  return payload;
}
function toast(message){
  const element=$('#toast');
  element.textContent=message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>element.classList.remove('show'),2800);
}
function initials(name='M'){
  return esc(String(name).trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'M');
}
function requireSignedIn(){
  if(state.user)return true;
  toast('Sign in to Minglora to use StreamBay.');
  $('#signInRequired').classList.remove('hidden');
  $('#streambayContent').classList.add('hidden');
  return false;
}
function setTitle(title,subtitle=''){
  $('#pageTitle').innerHTML='<h1>'+esc(title)+'</h1>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'');
}
function renderChips(){
  $('#chips').innerHTML=CATEGORIES.map(category=>'<button type="button" class="chip '+(state.category===category?'active':'')+'" data-category="'+esc(category)+'">'+esc(category)+'</button>').join('');
  $('#chips').classList.toggle('hidden',['watch','channel'].includes(state.route));
}
function showGrid(){
  $('#videoGrid').classList.remove('hidden');
  $('#watchView').classList.add('hidden');
  $('#channelView').classList.add('hidden');
  $('#pageTitle').classList.remove('hidden');
  $('#chips').classList.remove('hidden');
}
function thumb(video){
  const src=video.media?.url;
  const preview=src?'<video muted playsinline preload="metadata" src="'+esc(src)+'#t=1"></video>':'<div class="thumb-placeholder">'+icon('creator')+'</div>';
  return '<div class="thumb">'+preview+'<span class="duration">VIDEO</span></div>';
}
function videoCard(video){
  const owner=video.owner||{},own=Boolean(state.user&&video.ownerId===state.user.id);
  const actions=own?'<div class="video-management"><button type="button" data-edit-video="'+esc(video.id)+'">'+icon('settings')+'<span>Edit</span></button><button type="button" data-delete-video="'+esc(video.id)+'">'+icon('close')+'<span>Delete</span></button></div>':'';
  return '<article class="video-card" data-watch="'+esc(video.id)+'">'+thumb(video)+'<div class="video-meta">'+
    '<div class="channel-avatar" data-channel="'+esc(owner.id||'')+'">'+(owner.avatar?'<img loading="lazy" src="'+esc(owner.avatar)+'" alt="">':initials(owner.name))+'</div>'+
    '<div class="video-copy"><h3>'+esc(video.title)+'</h3><p class="creator" data-channel="'+esc(owner.id||'')+'">'+esc(owner.name||'Minglora creator')+'</p><p>'+fmt(video.views)+' views · '+ago(video.createdAt)+'</p></div></div>'+actions+'</article>';
}
function bindCards(root=document){
  root.querySelectorAll('[data-edit-video]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();const video=state.videos.find(item=>item.id===button.dataset.editVideo);if(video)openVideoEditor(video);}));
  root.querySelectorAll('[data-delete-video]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();deleteVideo(button.dataset.deleteVideo,button);}));
  root.querySelectorAll('[data-watch]').forEach(element=>element.addEventListener('click',event=>{
    if(event.target.closest('[data-channel]'))return;
    location.hash='watch/'+encodeURIComponent(element.dataset.watch);
  }));
  root.querySelectorAll('[data-channel]').forEach(element=>element.addEventListener('click',event=>{
    event.stopPropagation();
    const id=element.dataset.channel;
    if(id)location.hash='channel/'+encodeURIComponent(id);
  }));
}
async function loadVideos(){
  showGrid();
  renderChips();
  const subscriptionShelf=$('#subscriptionChannels');
  if(subscriptionShelf){subscriptionShelf.classList.toggle('hidden',state.route!=='subscriptions');subscriptionShelf.innerHTML='';}
  $('#videoGrid').innerHTML='<div class="loading">Loading videos…</div>';
  try{
    let rows=[];
    if(['subscriptions','history','uploads'].includes(state.route)&&!requireSignedIn())return;
    if(state.route==='history'){
      rows=(await api('/api/streambay/history')).videos||[];
    }else{
      const sort=state.route==='subscriptions'?'subscriptions':state.route==='explore'?'popular':'recent';
      const mine=state.route==='uploads'?'&mine=1':'';
      rows=(await api('/api/streambay/videos?sort='+sort+'&q='+encodeURIComponent(state.query)+mine)).videos||[];
      if(state.route==='subscriptions'){
        const channelData=await api('/api/streambay/subscriptions');
        const channels=channelData.channels||[];
        if(subscriptionShelf){
          subscriptionShelf.innerHTML=channels.length?'<h2>Channels you follow</h2><div class="subscription-channel-row">'+channels.map(channel=>'<button type="button" class="subscription-channel" data-subscription-channel="'+esc(channel.id)+'"><span class="channel-avatar">'+(channel.avatar?'<img loading="lazy" src="'+esc(channel.avatar)+'" alt="">':initials(channel.name))+'</span><strong>'+esc(channel.name)+'</strong><small>'+fmt(channel.subscribers)+' subscribers</small></button>').join('')+'</div>':'<div class="subscription-empty">You are not subscribed to any channels yet. Explore videos and subscribe to creators you enjoy.</div>';
          subscriptionShelf.querySelectorAll('[data-subscription-channel]').forEach(button=>button.addEventListener('click',()=>{location.hash='channel/'+encodeURIComponent(button.dataset.subscriptionChannel);}));
        }
      }
    }
    if(state.category!=='All')rows=rows.filter(video=>video.category===state.category);
    state.videos=rows;
    const headings={
      home:['Home','Fresh videos and creators worth your time.'],
      explore:['Explore','Discover popular videos from across Minglora.'],
      subscriptions:['Subscriptions','New videos from channels you follow.'],
      history:['History','Videos you have watched on StreamBay.'],
      uploads:['Your videos','Manage the videos published to your channel.']
    };
    const heading=headings[state.route]||headings.home;
    setTitle(heading[0],heading[1]);
    if(state.route==='history'&&rows.length){
      $('#pageTitle').insertAdjacentHTML('beforeend','<button type="button" class="textbtn clear-history" id="clearHistory">Clear history</button>');
      $('#clearHistory').addEventListener('click',clearHistory);
    }
    $('#videoGrid').innerHTML=rows.length?rows.map(videoCard).join():'<div class="empty"><strong>No videos found yet</strong><p>'+(state.route==='subscriptions'?'Subscribe to a channel to see new videos here.':state.route==='history'?'Your watch history will appear here.':'Try another search or category, or publish the first video.')+'</p></div>';
    bindCards($('#videoGrid'));
  }catch(error){
    $('#videoGrid').innerHTML='<div class="empty"><strong>Could not load videos</strong><p>'+esc(error.message)+'</p><button class="primary" id="retryVideos" type="button">Try again</button></div>';
    $('#retryVideos')?.addEventListener('click',loadVideos);
  }
}
async function clearHistory(){
  if(!requireSignedIn())return;
  try{await api('/api/streambay/history',{method:'DELETE'});toast('Watch history cleared.');await loadVideos();}
  catch(error){toast(error.message);}
}
function commentHtml(comment){
  const name=comment.user?.name||'Minglora member';
  return '<article class="comment"><div class="channel-avatar">'+(comment.user?.avatar?'<img src="'+esc(comment.user.avatar)+'" alt="">':initials(name))+'</div><div><small>'+esc(name)+' · '+ago(comment.createdAt)+'</small><p>'+esc(comment.text)+'</p></div></article>';
}
async function openWatch(id){
  state.route='watch';
  syncNavigation();
  state.channelId=null;
  renderChips();
  $('#pageTitle').classList.add('hidden');
  $('#videoGrid').classList.add('hidden');
  $('#watchView').classList.remove('hidden');
  $('#channelView').classList.add('hidden');
  $('#watchView').innerHTML='<div class="loading">Opening video…</div>';
  try{
    const result=await api('/api/streambay/videos/'+encodeURIComponent(id)+'/view');
    const video=result.video;
    if(!video.media?.url)throw new Error('The video file is not currently available.');
    const [commentData,channelData,suggestionsData]=await Promise.all([
      api('/api/streambay/videos/'+encodeURIComponent(id)+'/comments'),
      api('/api/streambay/channels/'+encodeURIComponent(video.owner.id)),
      api('/api/streambay/videos?sort=popular')
    ]);
    const channel=channelData.channel;
    const suggestions=(suggestionsData.videos||[]).filter(item=>item.id!==id).slice(0,6);
    $('#watchView').innerHTML='<div class="watch-layout"><div>'+
      '<div class="player"><video controls autoplay playsinline preload="metadata" src="'+esc(video.media.url)+'"></video></div>'+
      '<h1 class="watch-title">'+esc(video.title)+'</h1>'+
      '<div class="watch-actions"><div class="owner-row"><div class="channel-avatar" data-channel="'+esc(channel.id)+'">'+(channel.avatar?'<img src="'+esc(channel.avatar)+'" alt="">':initials(channel.name))+'</div><div class="details" data-channel="'+esc(channel.id)+'">'+esc(channel.name)+'<small>'+fmt(channel.subscribers)+' subscribers</small></div>'+
      (state.user?.id!==channel.id?'<button class="subscribe '+(channel.subscribed?'subscribed':'')+'" id="subscribeBtn" type="button">'+(channel.subscribed?'Subscribed':'Subscribe')+'</button>':'')+
      '</div><button class="action-pill" id="likeBtn" type="button">'+icon('saved')+'<span>'+fmt(video.likes)+' Likes</span></button>'+(state.user?.id===video.ownerId?'<button class="action-pill" id="watchEditVideo" type="button">'+icon('settings')+'<span>Edit</span></button><button class="action-pill" id="watchDeleteVideo" type="button">'+icon('close')+'<span>Delete</span></button>':'')+'</div>'+
      '<div class="description"><b>'+fmt(video.views)+' views · '+new Date(video.createdAt).toLocaleDateString()+' · '+esc(video.category)+'</b><p>'+esc(video.description||'No description provided.')+'</p></div>'+
      '<section class="comments"><h3>'+fmt(video.comments)+' Comments</h3><form class="comment-form" id="commentForm"><input name="text" maxlength="1000" placeholder="Add a comment…" required><button type="submit">Comment</button></form><div id="commentsList">'+((commentData.comments||[]).map(commentHtml).join()||'<p class="fineprint">Be the first to comment.</p>')+'</div></section>'+
      '</div><aside class="suggestions"><h3>Up next</h3>'+suggestions.map(item=>'<div class="suggestion" data-watch="'+esc(item.id)+'">'+thumb(item)+'<div><h4>'+esc(item.title)+'</h4><p>'+esc(item.owner?.name||'Creator')+'</p><p>'+fmt(item.views)+' views</p></div></div>').join('')+'</aside></div>';
    $('#watchEditVideo')?.addEventListener('click',()=>openVideoEditor(video));
    $('#watchDeleteVideo')?.addEventListener('click',()=>deleteVideo(id));
    $('#subscribeBtn')?.addEventListener('click',async()=>{
      if(!requireSignedIn())return;
      try{const update=await api('/api/streambay/channels/'+encodeURIComponent(channel.id)+'/subscribe',{method:'POST'});channel.subscribed=update.subscribed;channel.subscribers=update.subscribers;$('#subscribeBtn').textContent=update.subscribed?'Subscribed':'Subscribe';$('#subscribeBtn').classList.toggle('subscribed',update.subscribed);toast(update.subscribed?'Subscribed to channel':'Unsubscribed');}
      catch(error){toast(error.message);}
    });
    $('#likeBtn')?.addEventListener('click',async()=>{
      if(!requireSignedIn())return;
      try{const update=await api('/api/streambay/videos/'+encodeURIComponent(id)+'/like',{method:'POST'});$('#likeBtn').innerHTML=icon('saved')+'<span>'+fmt(update.likes)+' Likes</span>';toast(update.liked?'Video liked':'Like removed');}
      catch(error){toast(error.message);}
    });
    $('#commentForm')?.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!requireSignedIn())return;
      const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
      button.disabled=true;
      try{
        const update=await api('/api/streambay/videos/'+encodeURIComponent(id)+'/comments',{method:'POST',body:JSON.stringify({text:form.elements.text.value})});
        const list=$('#commentsList');
        if(list.querySelector('.fineprint'))list.innerHTML='';
        list.insertAdjacentHTML('beforeend',commentHtml(update.comment));
        form.reset();
      }catch(error){toast(error.message);}
      finally{button.disabled=false;}
    });
    bindCards($('#watchView'));
  }catch(error){
    $('#watchView').innerHTML='<div class="empty"><strong>Video unavailable</strong><p>'+esc(error.message)+'</p><a class="textbtn" href="#home">Back to Home</a></div>';
  }
}
function openVideoEditor(video){
  if(!requireSignedIn()||video.ownerId!==state.user.id)return;
  const form=$('#editVideoForm');
  form.elements.videoId.value=video.id;
  form.elements.title.value=video.title;
  form.elements.description.value=video.description||'';
  form.elements.category.value=video.category||'Other';
  $('#editVideoDialog').showModal();
}
async function deleteVideo(id,button){
  if(!requireSignedIn()||!confirm('Delete this video from your StreamBay channel? This also removes its comments, likes and watch-history entries.'))return;
  if(button)button.disabled=true;
  try{
    await api('/api/streambay/videos/'+encodeURIComponent(id),{method:'DELETE'});
    toast('Video deleted from your channel.');
    if(state.route==='watch'){location.hash='uploads';return;}
    await route();
  }catch(error){toast(error.message);}
  finally{if(button?.isConnected)button.disabled=false;}
}
async function openChannel(id){
  const requested=id==='me'?(state.user?.id||''):id;
  if(!requested){requireSignedIn();return;}
  state.route='channel';
  syncNavigation();
  state.channelId=requested;
  renderChips();
  $('#videoGrid').classList.add('hidden');
  $('#pageTitle').classList.add('hidden');
  $('#chips').classList.add('hidden');
  $('#watchView').classList.add('hidden');
  $('#channelView').classList.remove('hidden');
  $('#channelView').innerHTML='<div class="loading">Loading channel…</div>';
  try{
    const [channelResult,videoResult]=await Promise.all([
      api('/api/streambay/channels/'+encodeURIComponent(requested)),
      api('/api/streambay/channels/'+encodeURIComponent(requested)+'/videos')
    ]);
    const channel=channelResult.channel;
    const own=state.user?.id===channel.id;
    const videos=videoResult.videos||[];
    state.videos=videos;
    $('#channelView').innerHTML='<div class="channel-banner"></div><div class="channel-heading"><div class="channel-avatar">'+(channel.avatar?'<img src="'+esc(channel.avatar)+'" alt="">':initials(channel.name))+'</div><div class="channel-info"><h1>'+esc(channel.name)+'</h1><p>@'+esc(channel.handle)+' · '+fmt(channel.subscribers)+' subscribers · '+fmt(channel.videoCount)+' videos</p></div>'+
      (own?'<button class="action-pill" id="editChannel" type="button">Edit channel</button><button class="action-pill" id="yourVideos" type="button">'+icon('creator')+' Your videos</button>': '<button class="subscribe '+(channel.subscribed?'subscribed':'')+'" id="channelSubscribe" type="button">'+(channel.subscribed?'Subscribed':'Subscribe')+'</button>')+
      '</div><div class="channel-bio">'+esc(channel.bio||'Welcome to my StreamBay channel.')+'</div><div class="channel-tabs"><span>Videos</span><span>About</span></div><div class="video-grid">'+(videos.map(videoCard).join()||'<div class="empty">This channel has not published videos yet.</div>')+'</div>';
    $('#channelSubscribe')?.addEventListener('click',async()=>{
      if(!requireSignedIn())return;
      try{const update=await api('/api/streambay/channels/'+encodeURIComponent(channel.id)+'/subscribe',{method:'POST'});$('#channelSubscribe').textContent=update.subscribed?'Subscribed':'Subscribe';$('#channelSubscribe').classList.toggle('subscribed',update.subscribed);toast(update.subscribed?'Subscribed':'Unsubscribed');}
      catch(error){toast(error.message);}
    });
    $('#editChannel')?.addEventListener('click',()=>{
      $('#editForm').elements.name.value=channel.name;
      $('#editForm').elements.bio.value=channel.bio||'';
      $('#editDialog').showModal();
    });
    $('#yourVideos')?.addEventListener('click',()=>{location.hash='uploads';});
    bindCards($('#channelView'));
  }catch(error){
    $('#channelView').innerHTML='<div class="empty"><strong>Channel not found</strong><p>'+esc(error.message)+'</p></div>';
  }
}
function syncNavigation(){
  let active=state.route;
  if(active==='channel')active='channel';
  document.querySelectorAll('[data-nav]').forEach(link=>{
    const selected=link.dataset.nav===active;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  $('#sidebar').classList.remove('open');
}
async function route(){
  const parts=location.hash.replace(/^#/,'').split('/');
  const page=parts[0]||'home';
  const id=parts.slice(1).join('/');
  state.query='';
  $('#searchInput').value='';
  if(page==='watch'&&id){syncNavigation();return openWatch(decodeURIComponent(id));}
  if(page==='channel'){syncNavigation();return openChannel(decodeURIComponent(id||'me'));}
  state.route=['home','explore','subscriptions','history','uploads'].includes(page)?page:'home';
  syncNavigation();
  $('#watchView').classList.add('hidden');
  $('#channelView').classList.add('hidden');
  $('#videoGrid').classList.remove('hidden');
  $('#pageTitle').classList.remove('hidden');
  $('#chips').classList.remove('hidden');
  await loadVideos();
}
async function uploadVideo(file,onProgress){
  if(!file)throw new Error('Choose a video file.');
  if(file.size<1||file.size>500*1024*1024)throw new Error('Video must be between 1 byte and 500 MB.');
  let mime=file.type;
  if(!['video/mp4','video/webm','video/quicktime'].includes(mime)){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    mime=ext==='webm'?'video/webm':ext==='mov'?'video/quicktime':'video/mp4';
  }
  const prepared=await api('/api/media/upload/prepare',{method:'POST',body:JSON.stringify({slot:'post',mimeType:mime,byteSize:file.size,fileName:file.name||'streambay-video'})});
  const info=prepared.upload||{};
  if(!prepared.assetId||!info.bucket||!info.path)throw new Error('Minglora could not prepare the secure video upload.');
  if(info.signedUrl&&file.size<=6*1024*1024){
    const uploadBody=new FormData();
    uploadBody.append('cacheControl','3600');
    uploadBody.append('',file,file.name||'streambay-video');
    const response=await fetch(info.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:uploadBody});
    if(!response.ok)throw new Error('Minglora storage could not accept this video. Please retry.');
    onProgress(100);
  }else{
    if(!window.tus?.Upload||!info.endpoint||!info.token)throw new Error('Secure resumable video uploads are unavailable. Refresh and try again.');
    await new Promise((resolve,reject)=>{
      const upload=new window.tus.Upload(file,{
        endpoint:info.endpoint,
        retryDelays:[0,3000,5000,10000,20000],
        headers:{'x-signature':info.token},
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        storeFingerprintForResuming:false,
        chunkSize:6*1024*1024,
        metadata:{bucketName:info.bucket,objectName:info.path,contentType:mime,cacheControl:'3600'},
        onProgress:(sent,total)=>onProgress(total?Math.min(100,Math.round(sent/total*100)):0),
        onError:error=>reject(new Error('Video upload failed: '+(error?.message||'Connection interrupted.'))),
        onSuccess:resolve
      });
      upload.start();
    });
  }
  const completed=await api('/api/media/upload/complete',{method:'POST',body:JSON.stringify({assetId:prepared.assetId})});
  if(!completed.asset?.id)throw new Error('Video uploaded, but Minglora could not register the media file.');
  return completed.asset.id;
}
async function init(){
  try{
    const result=await api('/api/auth/me');
    state.user=result.user||null;
  }catch{state.user=null;}
  // Public discovery, channels and playback remain available without signing in.
  $('#signInRequired').classList.add('hidden');
  $('#streambayContent').classList.remove('hidden');
  if(!location.hash)location.hash='home';else await route();
}
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#uploadOpen').addEventListener('click',()=>{if(requireSignedIn())$('#uploadDialog').showModal();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.close).close()));
document.querySelectorAll('[data-nav]').forEach(link=>link.addEventListener('click',()=>{if(link.dataset.nav==='channel')location.hash='channel/me';}));
$('#searchForm').addEventListener('submit',event=>{
  event.preventDefault();
  state.query=$('#searchInput').value.trim();
  state.category='All';
  state.route='home';
  showGrid();
  renderChips();
  const run=async()=>{
    $('#videoGrid').innerHTML='<div class="loading">Searching StreamBay…</div>';
    try{
      const result=await api('/api/streambay/videos?q='+encodeURIComponent(state.query));
      const rows=result.videos||[];
      state.videos=rows;
      setTitle(state.query?'Search: '+state.query:'Home','Search results from StreamBay creators.');
      $('#videoGrid').innerHTML=rows.length?rows.map(videoCard).join():'<div class="empty"><strong>No videos found</strong><p>Try another search.</p></div>';
      bindCards($('#videoGrid'));
    }catch(error){$('#videoGrid').innerHTML='<div class="empty">'+esc(error.message)+'</div>';}
  };
  run();
});
$('#uploadForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!requireSignedIn())return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  const file=form.elements.video.files[0];
  button.disabled=true;
  button.textContent='Uploading…';
  $('#uploadStatus').textContent='Preparing secure upload…';
  $('#uploadProgress').hidden=false;
  $('#uploadProgress').value=0;
  try{
    const assetId=await uploadVideo(file,percentage=>{
      $('#uploadProgress').value=percentage;
      $('#uploadStatus').textContent='Uploading video: '+percentage+'%';
    });
    $('#uploadStatus').textContent='Publishing video…';
    const result=await api('/api/streambay/videos',{method:'POST',body:JSON.stringify({
      assetId,
      title:form.elements.title.value,
      description:form.elements.description.value,
      category:form.elements.category.value
    })});
    $('#uploadDialog').close();
    form.reset();
    $('#uploadProgress').hidden=true;
    toast('Your video is now published on StreamBay.');
    location.hash='watch/'+encodeURIComponent(result.video.id);
  }catch(error){
    $('#uploadStatus').textContent=error.message;
    toast(error.message);
  }finally{
    button.disabled=false;
    button.textContent='Upload and publish';
  }
});
$('#editVideoForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!requireSignedIn())return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),id=form.elements.videoId.value;
  button.disabled=true;
  try{
    await api('/api/streambay/videos/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({
      title:form.elements.title.value,description:form.elements.description.value,category:form.elements.category.value
    })});
    $('#editVideoDialog').close();
    toast('Video details updated.');
    if(location.hash.startsWith('#watch/'))await openWatch(id);
    else await route();
  }catch(error){toast(error.message);}
  finally{button.disabled=false;}
});
$('#editForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!requireSignedIn())return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
    await api('/api/streambay/channel',{method:'PATCH',body:JSON.stringify({name:form.elements.name.value,bio:form.elements.bio.value})});
    $('#editDialog').close();
    toast('StreamBay channel updated.');
    await openChannel('me');
  }catch(error){toast(error.message);}
  finally{button.disabled=false;}
});
document.addEventListener('click',event=>{
  const category=event.target.closest('[data-category]');
  if(category){
    state.category=category.dataset.category;
    renderChips();
    loadVideos();
  }
});
window.addEventListener('hashchange',route);
init();
