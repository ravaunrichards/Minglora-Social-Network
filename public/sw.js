/* Minglora service worker: stable shell caching and background Web Push. */
// Coin funding-source wallet and secure marketing-budget controls.
const CACHE_NAME='minglora-shell-v253-facebook-people-responsive-1';
const SHELL=['/','/assets/default-profile-cover.svg?v=20261106-profile-defaults-1','/assets/default-profile-avatar-3d.svg?v=20261106-profile-defaults-2','/manifest.webmanifest','/marketplace.css?v=20261031-marketplace-commerce-3','/assets/match-powerups/minglora_momentum_boost.gltf','/assets/match-powerups/minglora_shield.gltf','/assets/match-powerups/minglora_time_boost.gltf','/assets/match-powerups/minglora_score_multiplier.gltf','/assets/gifters-level-up.png','/styles.css?v=20261108-facebook-stories-2','/minglora-menu.css?v=20261108-menu-search-removed-1','/app-lock.css?v=20261107-app-lock-1','/phone-experience.css?v=20261108-phone-overlay-panels-1','/page-route-layout.css?v=20261108-home-only-feature-sidebar-1','/app.js?v=20261109-profile-layout-restored-2-people-verification-identity-1','/share-thoughts.js?v=20261108-facebook-share-thoughts-1','/share-thoughts.css?v=20261108-facebook-thought-cloud-1','/for-you-fullscreen.css?v=20261108-for-you-general-posts-2','/for-you-controls.css?v=20261108-home-live-mixed-feed-2','/admin-centre.css?v=20261108-admin-workspace-2','/meetwave.css?v=20261108-meetwave-dialog-overlays-1','/leagues.css?v=20261106-match-powerups-3d-preview-1','/gifter-progression.css?v=20261107-auto-sync-no-refresh-1','/gifter-badge-3d.css?v=20261105-gifter-badge-3d-1','/mobile-layout.css?v=20261108-mobile-overlay-panels-1','/layout-safety.css?v=20261108-single-document-scroll-1','/friends-advanced.css?v=20261106-advanced-friends-1','/live-gift-access.css?v=20261106-live-gift-access-1','/currency-converter.css?v=20261107-no-manual-refresh-buttons-1','/quick-currency.css?v=20261107-no-manual-refresh-buttons-1','/calculator.css?v=20261107-wallet-calculator-1','/calendar.css?v=20261107-calendar-1','/menstrual-health.css?v=20261107-menstrual-health-1','/mobile-fit.css?v=20261106-mobile-fit-2','/profile-alignment.css?v=20261108-facebook-profile-five-metrics-1','/profile-established.css?v=20261107-profile-action-row-3','/profile-badges.css?v=20261107-live-pro-profile-badge-1','/admin-profile-layout.css?v=20261108-admin-profile-centre-only-1','/mobile-profile-navigation.css?v=20261108-five-profile-metrics-1','/profile-action-row.css?v=20261108-facebook-cover-avatar-unified-3','/profile-facebook-panel.css?v=20261108-facebook-inline-profile-shell-6','/profile-layout-guardrails.css?v=20261108-facebook-avatar-position-fix-1','/profile-facebook-avatar-anchor.css?v=20261108-facebook-responsive-grid-4','/profile-independent-avatar-header.css?v=20261108-profile-separated-avatar-1','/profile-owner-action-placement.css?v=20261108-facebook-action-control-order-1','/profile-facebook-account-menu.css?v=20261108-horizontal-five-profile-actions-1','/social-facebook-layout.css?v=20261109-profile-layout-restored-2','/people-facebook-responsive.css?v=20261108-profile-shell-alignment-1-people-verification-identity-1','/subscriptions.css?v=20261107-subscriptions-blue-red-2','/call-ui.css?v=20261107-call-top-layer-1','/live-room-compact.css?v=20261107-live-layout-1','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#search','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#home','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#explore','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#live','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#meetwave','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#messages','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#activity','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#palette','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#settings','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#profile','/assets/icons/navigation-3d.svg?v=20261104-recharge-wallet-3d-3#recharge','/assets/icons/navigation-3d.svg?v=20261107-calendar-3d-1#calendar','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#creator','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#friends','/assets/icons/navigation-3d.svg?v=20261108-mobile-navigation-icons-1#video','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#groups','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#pages','/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#saved','/auth-screen.js?v=20261031-community-photo-auth-1','/auth-password-visibility.js?v=20261108-password-toggle-sticky-2','/auth-login.js?v=20261105-admin-mfa-enrollment-1','/gift-effects.js?v=20261106-live-gift-preview-1','/gifts.js?v=20261105-gift-preview-visible-1','/leagues.js?v=20261106-auto-sync-no-refresh-1','/gifter-badge-art.js?v=20261105-gifter-badge-3d-1','/gifter-progression.js?v=20261106-auto-sync-no-refresh-1','/currency-converter.js?v=20261107-no-manual-refresh-buttons-1','/quick-currency.js?v=20261107-no-manual-refresh-buttons-1','/calculator.js?v=20261107-wallet-calculator-1','/calendar.js?v=20261107-calendar-1','/menstrual-health.js?v=20261107-menstrual-health-2','/minglora-menu.js?v=20261108-menu-search-removed-1','/app-lock.js?v=20261107-app-lock-1','/top-gifters.js?v=20261107-live-top-gifters-1','/friends-advanced.js?v=20261108-facebook-friends-1','/creator-rings.js?v=20261106-creator-rings-1','/settings.js?v=20261106-refresh-controls-removed-1','/admin-centre.js?v=20261108-admin-workspace-2','/meetwave.js?v=20261107-meetwave-all-layouts-fit-13'];
async function cacheCurrentShellAssets(cache){
  try{
    const page=await fetch('/',{cache:'no-store'});
    if(!page.ok)return;
    await cache.put('/',page.clone());
    const html=await page.text();
    const assets=new Set();
    for(const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
      try{
        const asset=new URL(match[1],self.location.origin);
        if(asset.origin!==self.location.origin||!asset.pathname.startsWith('/')||asset.pathname.startsWith('/api/')||asset.pathname==='/sw.js')continue;
        asset.hash='';
        assets.add(asset.href);
      }catch{}
    }
    await Promise.all(Array.from(assets).map(async url=>{
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(response.ok)await cache.put(url,response);
      }catch{}
    }));
  }catch(error){console.warn('Minglora current app shell could not be pre-cached:',error?.message||error);}
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async url=>{
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(response.ok)await cache.put(url,response);
      }catch{}
    }));
    await cacheCurrentShellAssets(cache);
  })());
});
// No skipWaiting message handler: updated workers follow the browser's normal lifecycle.
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('minglora-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key))));
    await self.clients.claim();
  })());
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
    const isCall=data.type==='call'&&Boolean(data.callId);
    if(isCall){
      const existing=windows.find(client=>client.visibilityState==='visible')||windows[0];
      if(existing){
        try{
          await existing.navigate(target);
          await existing.focus();
          return;
        }catch(error){
          console.warn('[Minglora push] Could not bring the incoming call to the existing app window.',error);
        }
      }
    }
    const exactTarget=windows.find(client=>client.url===target);
    if(exactTarget){await exactTarget.focus();return;}
    await self.clients.openWindow(target);
  })());
});
