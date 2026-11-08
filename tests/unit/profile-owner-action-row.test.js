import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const tiktokCss=read('public/profile-tiktok-layout.css');
const facebookCss=read('public/profile-facebook-panel.css');
const html=read('public/index.html');
const worker=read('public/sw.js');

test('owner profile keeps Edit profile and Add to story without separate photo edit buttons',()=>{
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add to story"/);
  assert.match(app,/<span>Add to story<\/span>/);
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
});

test('profile uses a TikTok-style creator header with no cover overlap',()=>{
  assert.match(tiktokCss,/\.profile-header-card \.profile-cover\s*\{\s*display:\s*none/);
  assert.match(tiktokCss,/\.profile-avatar-edit-wrap\s*\{[\s\S]*?margin:\s*0/);
  assert.match(tiktokCss,/\.profile-avatar-edit-wrap > \.avatar\s*\{[\s\S]*?width:\s*128px/);
  assert.match(tiktokCss,/\.profile-header-card \.profile-counts\s*\{[\s\S]*?grid-column:\s*2/);
  assert.ok(app.includes('const profileBioMarkup='));
  assert.ok(app.includes("profileBioMarkup+(data.profileStatus?"));
  assert.ok(app.includes("[['posts','Posts'],['reels','Reels'],['photos','Photos']"));
});

test('phone profile stacks identity, stats and actions without hiding the portrait',()=>{
  assert.match(tiktokCss,/@media \(max-width: 760px\)[\s\S]*?flex-basis: 84px/);
  assert.match(tiktokCss,/@media \(max-width: 760px\)[\s\S]*?grid-row: 2/);
  assert.match(tiktokCss,/@media \(max-width: 760px\)[\s\S]*?grid-row: 3/);
  assert.doesNotMatch(tiktokCss,/profile-avatar-edit-wrap\s*\{[^}]*display:\s*none/);
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
  assert.match(app,/\$\('#edit-profile'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u\)\)/);
});

test('TikTok-style post tiles open real posts with the existing feed actions',()=>{
  assert.ok(app.includes('function profilePostTileMarkup(post)'));
  assert.ok(app.includes('function profilePostsGridMarkup(data,isMe)'));
  assert.ok(app.includes('function openProfilePostViewer(post)'));
  assert.ok(app.includes("if(tab==='posts')return profilePostsGridMarkup(data,isMe)"));
  assert.ok(app.includes("panel.querySelectorAll('[data-profile-post-open]')"));
  assert.ok(app.includes('bindFeed(modal)'));
  assert.ok(tiktokCss.includes('.profile-post-grid'));
  assert.ok(tiktokCss.includes('aspect-ratio: 3 / 4'));
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
    assetFrom('href','/profile-tiktok-layout.css?'),
    assetFrom('src','/app.js?')
  ];
  for(const asset of assets){
    assert.ok(asset,'index.html includes the current profile asset');
    assert.ok(worker.includes("'"+asset+"'"),'service worker precaches '+asset);
  }
  assert.match(worker,/CACHE_NAME='minglora-shell-v\d+-[a-z0-9-]+'/);
  assert.match(app,/id="profile-people-toggle"/);
  assert.match(app,/id="profile-people-panel"/);
  assert.match(app,/data-profile-people-scroll="1"/);
  assert.match(app,/data-profile-people-more/);
  assert.ok(facebookCss.includes('.profile-people-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}'));
});
