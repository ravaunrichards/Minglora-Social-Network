import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const html=read('public/index.html');
const worker=read('public/sw.js');
const profileCss=[read('public/profile-action-row.css'),read('public/profile-facebook-panel.css'),read('public/profile-layout-guardrails.css'),read('public/profile-facebook-avatar-anchor.css'),read('public/profile-independent-avatar-header.css'),read('public/profile-owner-action-placement.css'),read('public/profile-facebook-account-menu.css'),read('public/social-facebook-layout.css'),read('public/profile-action-toolbar.css'),read('public/profile-admin-layout-parity.css')].join('\n');
const profileStart=app.indexOf('function renderProfile(data){');
const profileEnd=app.indexOf('async function loadProfileGiftGallery',profileStart);
assert.ok(profileStart>=0&&profileEnd>profileStart,'profile renderer exists');
const profile=app.slice(profileStart,profileEnd);

test('profile owner edit, media and story buttons invoke their real actions',()=>{
  for(const action of [
    "$('#edit-profile')?.addEventListener('click',()=>{\n    showTab('about');\n    const aboutPanel=$('#profile-tab-panel');\n    aboutPanel?.scrollIntoView({behavior:'smooth',block:'start'});\n    aboutPanel?.querySelector('[data-edit-about-section]')?.focus({preventScroll:true});\n  })",
    "$('#profile-add-story')?.addEventListener('click',()=>openStoryComposer())",
  ])assert.ok(profile.includes(action),'Missing profile action: '+action);
  assert.doesNotMatch(profile,/profile-edit-avatar|profile-edit-cover|profile-edit-admin-cover/);
  assert.match(app,/data-profile-media-section="avatar"/);
  assert.match(app,/data-profile-media-section="cover"/);
});

test('owner Add to story, Edit profile and V controls follow the correct Facebook order and responsive placement',()=>{
  const story=profile.indexOf('id="profile-add-story"');
  const edit=profile.indexOf('id="edit-profile"');
  const chevron=profile.indexOf('id="profile-people-toggle"');
  assert.ok(story>=0&&edit>story&&chevron>edit);
  assert.ok(profileCss.includes('@media(min-width:1025px)'));
  assert.ok(profileCss.includes('grid-column:3!important'));
  assert.ok(profileCss.includes('grid-row:2!important'));
  assert.ok(profileCss.includes('justify-content:flex-end!important'));
  assert.ok(profileCss.includes('@media(max-width:760px)'));
  assert.ok(profileCss.includes('grid-column:1/-1!important'));
  assert.ok(profileCss.includes('grid-row:3!important'));
  assert.ok(profileCss.includes('#profile-add-story'));
  assert.ok(profileCss.includes('#edit-profile'));
  assert.ok(profileCss.includes('#profile-people-toggle'));
  assert.ok(html.indexOf('profile-owner-action-placement.css')>html.indexOf('profile-independent-avatar-header.css'));
  assert.ok(worker.includes('/profile-owner-action-placement.css?v=20261108-facebook-action-control-order-1'));
});

test('visitor Follow, Subscribe, Message, call, Report and Block controls are connected',()=>{
  for(const action of [
    "api('/users/'+encodeURIComponent(u.id)+'/follow'",
    "api('/subscriptions/checkout'",
    "window.location.assign(approvalUrl.href)",
    "openMessageWindow(u)",
    "startMingloraCall(u,button.dataset.profileCall)",
    "openReportComposer('user',u.id)",
    "api('/users/'+encodeURIComponent(u.id)+'/block'"
  ])assert.ok(profile.includes(action),'Missing visitor action: '+action);
  assert.ok(server.includes("p === '/api/subscriptions/checkout'"),'PayPal checkout API route is present');
  assert.ok(profile.includes("const paypalHost=approvalUrl.hostname.toLowerCase()"));
  assert.doesNotMatch(profile,/Creator subscription checkout is not connected yet/);
});

test('profile counts, section tabs and profile links navigate to live views',()=>{
  assert.ok(profile.includes("document.querySelectorAll('[data-open-connections]')"));
  assert.ok(profile.includes("renderConnections(u.id,button.dataset.openConnections)"));
  assert.ok(profile.includes("document.querySelectorAll('.profile-tabs [data-profile-tab]')"));
  assert.ok(profile.includes("showTab(button.dataset.profileTab)"));
  for(const tab of ["['posts','Posts']","['about','About']","['friends','Friends']","['photos','Photos']","['reels','Reels']","['more','More']"]){
    assert.ok(profile.includes(tab),'Missing profile tab '+tab);
  }
  assert.doesNotMatch(profile,/\['badges','Badges'\]|\['gift-gallery','Gift Gallery'\]/);
  const moreStart=app.indexOf("if(tab==='more')return",app.indexOf('function profileTabMarkup'));
  const moreEnd=app.indexOf("const previewPhotos=",moreStart);
  const more=app.slice(moreStart,moreEnd);
  assert.match(more,/data-profile-tab="badges"/);
  assert.match(more,/data-profile-tab="gift-gallery"/);
  assert.match(profile,/\['checkins','events','highlights','groups','videos','badges','gift-gallery','manage'\]\.includes\(nextTab\)/);
});

test('profile overflow and administrator controls are wired to their feature handlers',()=>{
  const start=app.indexOf('async function handleProfileOverflowAction(');
  const end=app.indexOf('\nfunction renderProfile(data)',start);
  assert.ok(start>=0&&end>start,'profile overflow handler exists');
  const handler=app.slice(start,end);
  for(const [action,handlerName] of [
    ['view-as','openProfileViewAsPreview'],
    ['search','renderSearch'],
    ['highlights','openProfileHighlightsManager'],
    ['status','openProfileStatusEditor'],
    ['archive','openProfileArchiveManager'],
    ['story-archive','openStoryArchiveManager'],
    ['activity','openProfileActivityLog'],
    ['privacy','openProfilePrivacySettings'],
    ['lock-toggle','toggleProfilePrivacyLock'],
    ['verified','openProfileVerificationManager'],
    ['verification-review','openProfileVerificationReviewDesk']
  ]){
    assert.ok(handler.includes("action==='"+action+"'"),'Missing overflow action '+action);
    assert.ok(handler.includes(handlerName),'Missing handler '+handlerName);
  }
  assert.ok(profile.includes('profile-admin-identity'),'administrator identity remains in the shared owner profile header');
  assert.ok(profile.includes('data-profile-overflow-action="verification-review"'),'administrator-only verification review remains in the profile overflow menu');
  assert.ok(handler.includes("action==='verification-review'")&&handler.includes('openProfileVerificationReviewDesk()'));
});

test('profile post cards reuse the working feed action bindings inside profile tabs',()=>{
  const profileStart=app.indexOf('function renderProfile(data){');
  const tabStart=app.indexOf('const showTab=nextTab=>{',profileStart);
  const tabEnd=app.indexOf("const overflowTrigger=$('#profile-overflow-trigger')",tabStart);
  assert.ok(tabStart>=0&&tabEnd>tabStart);
  const tabRender=app.slice(tabStart,tabEnd);
  assert.ok(tabRender.includes('panel.innerHTML=profileTabMarkup(data,nextTab,aboutHtml,isMe)'));
  assert.ok(tabRender.includes('bindFeed(panel)'),'profile tabs must receive the same real post-action bindings as the feed');
  const binderStart=app.indexOf('function bindFeed(root=document)');
  const binderEnd=app.indexOf('\nfunction ',binderStart+10);
  const binder=app.slice(binderStart,binderEnd);
  for(const handler of [
    "root.querySelectorAll('[data-react]')",
    "root.querySelectorAll('[data-comment-form]')",
    "root.querySelectorAll('[data-toggle-save]')",
    "root.querySelectorAll('[data-share]')",
    "root.querySelectorAll('[data-post-menu]')"
  ])assert.ok(binder.includes(handler),'Missing feed interaction binding '+handler);
  assert.ok(binder.includes('bindProfileLinks(root)'),'profile links in post cards must remain navigable');
});

test('visitor profile controls retain accessible labels and icons in a compact action row',()=>{
  assert.ok(profileCss.includes('min-height:40px!important')||profileCss.includes('min-height:38px!important')||profileCss.includes('min-height:36px!important'));
  assert.ok(profileCss.includes('white-space:nowrap!important'));
  assert.ok(profileCss.includes('flex-flow:row nowrap!important'));
  assert.ok(profileCss.includes('overflow-x:auto!important'));
  assert.ok(profile.includes('id="profile-message"')&&profile.includes('</svg><span class="profile-action-label">Message</span></button>'));
  assert.ok(profile.includes('id="profile-more-actions"'),'More control remains visible');
  assert.ok(profile.includes('id="profile-report"')&&profile.includes('</svg><span>Report</span></button>'));
  assert.ok(profile.includes('id="profile-block"')&&profile.includes('</svg><span>Block</span></button>'));
});

test('visitor profile actions remain one scrollable row and preserve existing interactions',()=>{
  assert.ok(profileCss.includes('display:flex!important'),'visitor action bar uses flex layout');
  assert.ok(profileCss.includes('flex-flow:row nowrap!important'),'primary profile actions remain on one line');
  assert.ok(profileCss.includes('grid-column:1/-1!important'),'visitor action bar spans full profile width');
  assert.ok(profileCss.includes('grid-row:2!important'),'visitor action bar sits directly above profile counts');
  assert.ok(profileCss.includes('overflow-x:auto!important'),'narrow screens can scroll the action bar horizontally');
  assert.ok(profileCss.includes('white-space:nowrap!important'),'action labels never wrap');
  assert.ok(profile.includes("profileSubscribeButton.disabled=subscriptionAlreadyExists"),'Subscribe remains available unless a subscription already exists');
  assert.ok(!profile.includes('profileSubscribeButton.remove()'),'Subscribe is not removed from the profile');
  assert.ok(profile.includes("api('/subscriptions/checkout'"),'Subscribe keeps its checkout route');
  assert.ok(profile.includes('id="profile-follow"')&&profile.includes("?'Friends · Following':'Following'")&&profile.includes(":'Follow'))"),'Follow button and follow-state labels remain connected');
  for(const label of ['Message','Voice Calls','Video Calls'])assert.ok(profile.includes('</svg><span class="profile-action-label">'+label+'</span></button>'),'Missing visitor action label '+label);
  for(const label of ['Report','Block'])assert.ok(profile.includes('</svg><span>'+label+'</span></button>'),'Missing More-menu action '+label);
  assert.ok(profile.includes('id="profile-more-actions"'),'Report and Block are grouped under the More control');
  assert.ok(profile.includes('id="profile-subscribe"'),'Subscribe remains in the visitor actions');
});

test('HTML and service worker load the current profile-action script and cache generation',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset.length>0,'HTML requests the functional profile bundle');
  assert.ok(worker.includes('/'+appAsset),'service worker caches the exact HTML app bundle');
  assert.match(cacheName,/^minglora-shell-v\d+-/,'service-worker cache generation is versioned');
});

test('core profile loading is independent of optional subscription persistence',()=>{
  const routeStart=server.indexOf("m=p.match(/^\\/api\\/users\\/([^/]+)$/);");
  const routeEnd=server.indexOf("if(method==='PATCH'&&p==='/api/users/me')",routeStart);
  assert.ok(routeStart>=0&&routeEnd>routeStart,'primary profile API route exists');
  const route=server.slice(routeStart,routeEnd);
  assert.doesNotMatch(route,/subscription_subscribers_list/,'unsupported subscription action must not run inside the primary profile request');
  assert.ok(route.includes('subscribersCount'),'the base profile still returns a safe subscriber-count fallback');
});

test('profile renders core data before optional profile panels settle',()=>{
  const loadStart=app.indexOf('let profileLoadGeneration=0;');
  const loadEnd=app.indexOf("window.addEventListener('minglora:open-profile-editor'",loadStart);
  assert.ok(loadStart>=0&&loadEnd>loadStart,'profile loader exists');
  const loader=app.slice(loadStart,loadEnd);
  assert.ok(loader.indexOf('renderProfile(data)')>=0,'core profile renders');
  assert.ok(loader.indexOf('renderProfile(data)')<loader.indexOf('void Promise.allSettled(['),'supplemental requests start only after the profile is rendered');
  assert.ok(loader.includes('retry-profile-load'),'failed core requests show a working retry action');
  assert.ok(loader.includes('profileLoadGeneration'),'late profile responses are prevented from replacing a newer profile');
});

test('visitor actions appear in order with Report and Block inside the More menu',()=>{
  const ordered=['id="profile-follow"','id="profile-subscribe"','id="profile-message"','data-profile-call="audio"','data-profile-call="video"','id="profile-more-actions"','id="profile-report"','id="profile-block"'];
  let previous=-1;
  for(const marker of ordered){
    const index=profile.indexOf(marker);
    assert.ok(index>previous,'Visitor action order is Follow, Subscribe, Message, Voice Calls, Video Calls, Report, Block');
    previous=index;
  }
  assert.ok(profile.includes('class="profile-action-menu"'),'Report and Block are kept in the More menu');
  assert.ok(profile.indexOf('class="profile-actions profile-actions--primary"')<profile.indexOf('class="profile-counts"'),'The actions appear above the profile statistics');
  for(const label of ['Message','Voice Calls','Video Calls'])assert.ok(profile.includes('</svg><span class="profile-action-label">'+label+'</span></button>'),'Every primary action keeps its accessible label');
  for(const label of ['Report','Block'])assert.ok(profile.includes('</svg><span>'+label+'</span></button>'),'Every More-menu action keeps its label');
  assert.ok(profileCss.includes('flex-flow:row nowrap!important'));
  assert.ok(profileCss.includes('grid-column:1/-1!important'));
  assert.ok(profileCss.includes('grid-row:2!important'));
  assert.ok(profileCss.includes('overflow-x:auto!important'));
  assert.ok(profileCss.includes('position:static !important')||profileCss.includes('position:static!important'));
  assert.ok(profileCss.includes('position:static!important'),'The action row remains in normal document flow');
});
