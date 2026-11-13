import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const finalHeaderCss=read('public/profile-layout-guardrails.css');
const avatarAnchorCss=read('public/profile-facebook-avatar-anchor.css');
const facebookCss=read('public/profile-facebook-panel.css');
const socialFacebookCss=read('public/social-facebook-layout.css');
const independentCss=read('public/profile-independent-avatar-header.css');
const actionPlacementCss=read('public/profile-owner-action-placement.css');
const html=read('public/index.html');
const worker=read('public/sw.js');

test('owner profile keeps Edit profile and Add to story without separate photo edit buttons',()=>{
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile(?: details in About)?"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add to story"/);
  assert.match(app,/<span>Add to story<\/span>/);
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
});

test('profile cover and portrait are separate blocks with a clear gap and independent image sources',()=>{
  assert.ok(independentCss.includes('margin:0 0 18px!important'));
  assert.ok(independentCss.includes('margin:0!important'));
  assert.ok(independentCss.includes('border-radius:50%!important'));
  assert.ok(independentCss.includes('object-fit:cover!important'));
  assert.ok(!/margin(?:-top)?\s*:\s*-\d|top\s*:\s*-\d/.test(independentCss));
  assert.ok(app.includes('class="profile-cover-image"'));
  assert.ok(app.includes('esc(u.cover)'));
  assert.ok(app.includes('avatar(u)'));
  assert.ok(app.includes('class="profile-avatar-edit-wrap"><img class="avatar"'));
  assert.ok(app.includes("const profileThoughtMarkup=data.profileStatus?.text"));
  assert.ok(app.includes("[['posts','All'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']]"));
});

test('profile thought cloud sits in its own row above the portrait while name and username align beside it',()=>{
  assert.ok(app.includes("(profileThoughtMarkup?'<div class=\"profile-thought-slot\">'"),'thought markup is attached to the profile header');
  assert.ok(independentCss.includes('.profile-thought-slot{'));
  assert.ok(independentCss.includes('grid-column:1!important'));
  assert.ok(independentCss.includes('grid-row:1!important'));
  assert.ok(independentCss.includes('.profile-thought-slot+.profile-avatar-edit-wrap'));
  assert.ok(independentCss.includes('.profile-thought-slot~.profile-info-main'));
  assert.ok(independentCss.includes('grid-column:2!important'));
  assert.ok(independentCss.includes('grid-row:2!important'));
  assert.ok(independentCss.includes('max-height:none!important'));
  assert.ok(independentCss.includes('overflow:visible!important'));
});

test('web, tablet and phone have separate avatar sizing while preserving avatar-left identity layout',()=>{
  assert.ok(independentCss.includes('--minglora-profile-avatar-size:144px'));
  assert.ok(independentCss.includes('@media (min-width:761px) and (max-width:1024px)'));
  assert.ok(independentCss.includes('--minglora-profile-avatar-size:120px!important'));
  assert.ok(independentCss.includes('@media (max-width:760px)'));
  assert.ok(independentCss.includes('grid-template-columns:var(--minglora-profile-avatar-size) minmax(0,1fr)!important'));
  assert.ok(independentCss.includes('aspect-ratio:2.4 / 1!important'));
  assert.ok(independentCss.includes('@media(max-width:390px)'));
  assert.ok(!socialFacebookCss.includes('.profile-header-card .profile-cover'),'social card styles must not override the approved profile cover/avatar geometry');
  assert.ok(!socialFacebookCss.includes('.profile-avatar-edit-wrap'),'social card styles must not override the approved avatar positioning');
  assert.ok(independentCss.includes('--minglora-profile-avatar-size:clamp(74px,23vw,84px)!important'));
  assert.ok(html.indexOf('profile-independent-avatar-header.css')>html.indexOf('profile-facebook-avatar-anchor.css'));
  assert.ok(html.indexOf('profile-layout-guardrails.css')<html.indexOf('profile-independent-avatar-header.css'));
});

test('Add to story, Edit profile and the V control appear in Facebook order and the correct responsive position',()=>{
  const story=app.indexOf('id="profile-add-story"');
  const edit=app.indexOf('id="edit-profile"');
  const chevron=app.indexOf('id="profile-people-toggle"');
  assert.ok(story>=0&&edit>story&&chevron>edit,'action order is Add to story, Edit profile, then V');
  assert.ok(actionPlacementCss.includes('grid-column:3!important'));
  assert.ok(actionPlacementCss.includes('grid-row:2!important'));
  assert.ok(actionPlacementCss.includes('justify-content:flex-end!important'));
  assert.ok(actionPlacementCss.includes('#profile-add-story'));
  assert.ok(actionPlacementCss.includes('#edit-profile'));
  assert.ok(actionPlacementCss.includes('#profile-people-toggle'));
  assert.ok(actionPlacementCss.includes('order:1!important'));
  assert.ok(actionPlacementCss.includes('order:2!important'));
  assert.ok(actionPlacementCss.includes('order:3!important'));
  assert.ok(actionPlacementCss.includes('@media(min-width:1025px)'));
  assert.ok(actionPlacementCss.includes('@media(min-width:761px) and (max-width:1024px)'));
  assert.ok(actionPlacementCss.includes('@media(max-width:760px)'));
  assert.ok(actionPlacementCss.includes('grid-column:1/-1!important'));
  assert.ok(actionPlacementCss.includes('grid-row:3!important'));
  assert.ok(html.indexOf('profile-owner-action-placement.css')>html.indexOf('profile-independent-avatar-header.css'));
  assert.ok(worker.includes('/profile-owner-action-placement.css?v=20261108-facebook-action-control-order-1'));
});

test('picture and cover remain editable in the normal Edit profile dialog',()=>{
  assert.match(app,/function openEditProfile\(u,mediaOnly=null\)/);
  assert.match(app,/data-profile-media-section="avatar"/);
  assert.match(app,/data-profile-media-section="cover"/);
  assert.match(app,/id="edit-avatar-file"/);
  assert.match(app,/id="edit-cover-file"/);
  assert.match(app,/id="edit-avatar-camera-button"/);
  assert.match(app,/id="edit-cover-camera-button"/);
  assert.match(app,/uploadProfileImage\('avatar',edited/);
  assert.match(app,/uploadProfileImage\('cover',edited/);
  assert.ok(app.includes("$('#edit-profile')?.addEventListener('click',()=>{\n    showTab('about');"));
  assert.ok(app.includes("aboutPanel?.scrollIntoView({behavior:'smooth',block:'start'})"));
  assert.match(app,/function openEditProfile\(u,mediaOnly=null\)/);
});

test('profile Posts retains the Facebook-style Intro sidebar, composer and timeline',()=>{
  assert.doesNotMatch(app,/profilePostTileMarkup|profilePostsGridMarkup|openProfilePostViewer|data-profile-post-open/);
  assert.ok(app.includes('profile-body profile-body--established'));
  assert.ok(app.includes('profile-side-column'));
  assert.ok(app.includes('profile-intro-card'));
  assert.ok(app.includes('profile-status-composer'));
  assert.ok(app.includes('profile-post-column'));
  assert.ok(app.includes('posts.map(postCard).join'));
});
test('new profile assets are loaded and precached by the active service-worker cache',()=>{
  const assetFrom=(attribute,prefix)=>{
    const marker=attribute+'="'+prefix;
    const start=html.indexOf(marker);
    if(start<0)return '';
    const valueStart=start+attribute.length+2;
    const valueEnd=html.indexOf('"',valueStart);
    return valueEnd>valueStart?html.slice(valueStart,valueEnd):'';
  };
  const assets=[
    assetFrom('href','/profile-layout-guardrails.css?'),
    assetFrom('href','/profile-facebook-avatar-anchor.css?'),
    assetFrom('href','/profile-independent-avatar-header.css?'),
    assetFrom('href','/profile-owner-action-placement.css?'),
    assetFrom('src','/app.js?')
  ];
  for(const asset of assets){
    assert.ok(asset,'index.html includes the current profile asset');
    assert.ok(worker.includes("'"+asset+"'"),'service worker precaches '+asset);
  }
  assert.match(worker,/CACHE_NAME='minglora-shell-v\d+-[a-z0-9-]+'/);
  assert.ok(!html.includes('profile-tiktok-layout.css'));
  assert.ok(!worker.includes('profile-tiktok-layout.css'));
  assert.match(app,/id="profile-people-toggle"/);
  assert.match(app,/id="profile-people-panel"/);
  assert.match(app,/data-profile-people-scroll="1"/);
  assert.match(app,/data-profile-people-more/);
  assert.ok(facebookCss.includes('.profile-people-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}'));
});
