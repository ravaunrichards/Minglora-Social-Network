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
const profileCss=read('public/profile-established.css');
const profileStart=app.indexOf('function renderProfile(data){');
const profileEnd=app.indexOf('async function loadProfileGiftGallery',profileStart);
assert.ok(profileStart>=0&&profileEnd>profileStart,'profile renderer exists');
const profile=app.slice(profileStart,profileEnd);

test('profile owner edit, media and story buttons invoke their real actions',()=>{
  for(const action of [
    "$('#edit-profile')?.addEventListener('click',()=>openEditProfile(u))",
    "$('#profile-add-story')?.addEventListener('click',()=>openStoryComposer())",
    "$('#profile-edit-avatar')?.addEventListener('click',()=>openEditProfile(u,'avatar'))",
    "$('#profile-edit-cover')?.addEventListener('click',()=>openEditProfile(u,'cover'))",
    "$('#profile-edit-admin-cover')?.addEventListener('click',()=>openEditProfile(u,'cover'))",
    "openProfileStoryEditor(u.id)"
  ])assert.ok(profile.includes(action),'Missing profile action: '+action);
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
  for(const tab of ["['posts','All']","['about','About']","['friends','Friends']","['photos','Photos']","['reels','Reels']","['badges','Badges']","['gift-gallery','Gift Gallery']","['more','More']"]){
    assert.ok(profile.includes(tab),'Missing profile tab '+tab);
  }
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
  assert.ok(profile.includes("data-profile-admin-action"));
  assert.ok(profile.includes("openProfilePrivacySettings()"));
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

test('visitor profile actions stay readable and tappable on narrow screens',()=>{
  assert.ok(profileCss.includes('grid-template-columns:repeat(auto-fit,minmax(min(100%,132px),1fr))'));
  assert.ok(profileCss.includes('min-height:44px'));
  assert.ok(profileCss.includes('white-space:normal'));
  assert.ok(profile.includes('id="profile-message" aria-label="Start a chat with \'+esc(u.name)+\'">Message</button>'));
  assert.ok(profile.includes('id="profile-report" aria-label="Report \'+esc(u.name)+\'">Report</button>'));
  assert.ok(profile.includes('id="profile-block" aria-label="Block \'+esc(u.name)+\'">Block</button>'));
});

test('visitor profile actions stay in one horizontal row and preserve subscription checkout',()=>{
  assert.ok(profileCss.includes('background:var(--blue)!important'),'inactive profile actions use Minglora blue');
  assert.ok(profileCss.includes('background:var(--danger,#c43d4b)!important'),'active profile actions use red');
  assert.ok(profileCss.includes('[data-following="true"]'),'follow state is represented in the button');
  assert.ok(profileCss.includes('[data-subscription-active="true"]'),'active subscription state is represented in the button');
  assert.ok(profile.includes("data-friendship=")&&profile.includes("esc(data.friendship||'')"),'accepted friendship is represented as active');
  assert.ok(profile.includes("data-subscription-active=")&&profile.includes("subscriptionStatus==='active'"),'subscription state is wired to the active color');
  assert.ok(profileCss.includes('display:flex!important'),'visitor actions use a horizontal flex row');
  assert.ok(profileCss.includes('flex-flow:row nowrap!important'),'visitor actions never wrap into vertical rows');
  assert.ok(profileCss.includes('overflow-x:auto!important'),'narrow screens scroll horizontally to reach every action');
  assert.ok(profileCss.includes('white-space:nowrap!important'),'action labels remain on one line');
  assert.ok(profile.includes("profileSubscribeButton.disabled=subscriptionAlreadyExists"),'Subscribe remains available unless a subscription already exists');
  assert.ok(!profile.includes('profileSubscribeButton.remove()'),'Subscribe is not removed from the profile');
  assert.ok(profile.includes("api('/subscriptions/checkout'"),'Subscribe keeps its checkout route');
  assert.ok(profile.includes('id="profile-follow"')&&profile.includes("?'Friends · Following':'Following'")&&profile.includes(":'Follow'))"),'Follow button and follow-state labels remain connected');
  for(const label of ['Message','Voice call','Video call','Report','Block'])assert.ok(profile.includes('>'+label+'</button>'),'Missing visitor action '+label);
  assert.ok(profile.includes('id="profile-subscribe"'),'Subscribe button remains in the visitor actions');
});

test('HTML and service worker load the current profile-action script and cache generation',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset.length>0,'HTML requests the functional profile bundle');
  assert.ok(worker.includes('/'+appAsset),'service worker caches the exact HTML app bundle');
  assert.match(cacheName,/^minglora-shell-v\d+-/,'service-worker cache generation is versioned');
});
