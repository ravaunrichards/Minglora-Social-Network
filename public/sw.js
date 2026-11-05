/* Minglora service worker: update-friendly shell caching, email-link handoff refresh, and background Web Push. */
// Coin funding-source wallet and secure marketing-budget controls.
const CACHE_NAME='minglora-shell-v93-flow-layout-safety-1';
const SHELL=['/','/manifest.webmanifest','/styles.css?v=20261105-live-layout-expand-1-live-fullscreen-organized-sidepanel-2','/mobile-layout.css?v=20261105-flow-navigation-1','/layout-safety.css?v=20261105-page-flow-contract-1','/meetwave.css?v=20261105-flow-dialogs-1','/marketplace.css?v=20261031-marketplace-commerce-3','/auth-screen.js?v=20261031-community-photo-auth-1','/gift-effects.js?v=20261104-minglora-gift-motion-2','/gifts.js?v=20261105-promotional-gift-wallet-1','/leagues.css?v=20261104-league-refresh-dedupe-2','/leagues.js?v=20261104-league-refresh-dedupe-2','/gifter-progression.css?v=20261105-admin-badge-verification-1','/gifter-progression.js?v=20261105-admin-badge-verification-1','/gifter-badge-3d.css?v=20261105-gifter-badge-3d-1','/gifter-badge-art.js?v=20261105-gifter-badge-3d-1','/assets/gifters-level-up.png','/app.js?v=20261105-live-layout-expand-1-live-fullscreen-organized-sidepanel-2-admin-badge-verification-1','/auth-login.js?v=20261105-admin-mfa-enrollment-1','/settings.js?v=20261105-admin-mfa-qr-fix-2','/admin-centre.css?v=20261105-admin-badge-verification-1-promotional-cash-reserve-1','/admin-centre.js?v=20261105-marketing-budget-1-promotional-cash-reserve-1-admin-badge-verification-1','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('minglora-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
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
  for(const key of ['callId','liveSessionId','actorId','notificationId'])if(data[key])params.set(key,String(data[key]));
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
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){
      if('navigate' in existing)await existing.navigate(target);
      await existing.focus();
    }else{
      await self.clients.openWindow(target);
    }
  })());
});
