/* Minglora service worker: stable active-page shell caching, email-link handoff refresh, and background Web Push. */
// Coin funding-source wallet and secure marketing-budget controls.
const CACHE_NAME='minglora-shell-v113-pinch-zoom-photo-crop-1';
const SHELL=['/','/assets/default-profile-cover.svg?v=20261106-profile-defaults-1','/assets/default-profile-avatar-3d.svg?v=20261106-profile-defaults-2','/manifest.webmanifest','/styles.css?v=20261106-pinch-zoom-photo-crop-1'','/mobile-layout.css?v=20261105-flow-navigation-1','/layout-safety.css?v=20261105-page-flow-contract-2','/meetwave.css?v=20261106-user-controlled-refresh-1','/meetwave.js?v=20261106-user-controlled-refresh-1','/marketplace.css?v=20261031-marketplace-commerce-3','/auth-screen.js?v=20261031-community-photo-auth-1','/gift-effects.js?v=20261104-minglora-gift-motion-2','/gifts.js?v=20261105-gift-preview-visible-1','/leagues.css?v=20261106-match-powerups-3d-preview-1','/leagues.js?v=20261106-user-controlled-refresh-1','/assets/match-powerups/minglora_momentum_boost.gltf','/assets/match-powerups/minglora_shield.gltf','/assets/match-powerups/minglora_time_boost.gltf','/assets/match-powerups/minglora_score_multiplier.gltf','/gifter-progression.css?v=20261106-user-controlled-refresh-1','/gifter-progression.js?v=20261106-user-controlled-refresh-1','/gifter-badge-3d.css?v=20261105-gifter-badge-3d-1','/gifter-badge-art.js?v=20261105-gifter-badge-3d-1','/assets/gifters-level-up.png','/app.js?v=20261106-pinch-zoom-photo-crop-1'','/admin-profile-layout.css?v=20261106-admin-cover-management-1','/auth-login.js?v=20261105-admin-mfa-enrollment-1','/settings.js?v=20261106-refresh-controls-removed-1','/admin-centre.css?v=20261105-admin-badge-verification-1-promotional-cash-reserve-1','/admin-centre.js?v=20261106-user-controlled-refresh-1','/profile-alignment.css?v=20261106-people-avatar-label-fix-3','/profile-established.css?v=20261106-established-profile-1','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2'];
self.addEventListener('install',event=>{
  // Let the browser keep the current worker until every open app tab has closed.
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));
});
self.addEventListener('activate',event=>{
  // Activation happens after the old app session ends; do not seize control of open pages.
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('minglora-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-cache'}).catch(()=>caches.match('/')));
    return;
  }
  if(['style','script','font'].includes(request.destination)){
    event.respondWith(fetch(request,{cache:'no-cache'}).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request)));
    return;
  }
  if(url.pathname.startsWith('/assets/match-powerups/')&&url.pathname.endsWith('.gltf')){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
      return response;
    })));
    return;
  }
  if(request.destination==='image'){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
      return response;
    })));
  }
});
self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}catch{payload={body:event.data?.text()||'You have a new Minglora notification.'};}
  const data=payload.data||{};
  const type=String(data.type||'notification');
  const params=new URLSearchParams({'minglora-push':type});
  for(const key of ['callId','liveSessionId','actorId','notificationId','roomId','invitationId','matchId','sellerId'])if(data[key])params.set(key,String(data[key]));
  const url='/?'+params.toString();
  const actions=type==='call'?[{action:'answer',title:'Answer'},{action:'decline',title:'Decline'}]:
    type==='live'?[{action:'watch',title:'Watch LIVE'}]:
    type==='message'?[{action:'open',title:'Open message'}]:[];
  const isCall=type==='call';
  event.waitUntil(self.registration.showNotification(payload.title||'Minglora', {
    body:payload.body||'You have a new notification.',
    tag:payload.tag||(isCall?'minglora-call-'+String(data.callId||'incoming'):'minglora-notification'),
    icon:'/assets/icons/minglora-push.svg',
    badge:'/assets/icons/minglora-push.svg',
    renotify:isCall,
    requireInteraction:isCall,
    silent:false,
    vibrate:isCall?[900,450,900,450,1200]:[180,100,180],
    data:{url,type,...data},
    actions
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const params=new URLSearchParams({'minglora-push':String(data.type||'notification')});
  for(const key of ['callId','liveSessionId','actorId','notificationId'])if(data[key])params.set(key,String(data[key]));
  if(event.action==='decline'&&data.callId)params.set('minglora-push','decline-call');
  else if(event.action==='answer'&&data.callId)params.set('minglora-push','answer-call');
  const target=new URL('/?'+params.toString(),self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const exactTarget=windows.find(client=>client.url===target);
    if(exactTarget){
      await exactTarget.focus();
      return;
    }
    // Open notification destinations separately; never redirect the page already in use.
    await self.clients.openWindow(target);
  })());
});
