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
const html=read('public/index.html');
const worker=read('public/sw.js');

test('owner profile keeps Edit profile and Add to story without separate photo edit buttons',()=>{
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add to story"/);
  assert.match(app,/<span>Add to story<\/span>/);
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
});

test('profile cover and portrait match Facebook lower-edge placement',()=>{
  assert.ok(finalHeaderCss.includes('.minglora-profile-page .profile-header-card .profile-cover {'));
  assert.ok(finalHeaderCss.includes('display: block !important'));
  assert.ok(finalHeaderCss.includes('grid-template-columns: 168px minmax(0, 1fr) auto !important'));
  assert.ok(finalHeaderCss.includes('margin: -84px 0 0 !important'));
  assert.ok(finalHeaderCss.includes('width: 168px !important')&&finalHeaderCss.includes('height: 168px !important'));
  assert.ok(finalHeaderCss.includes('border-radius: 50% !important'));
  assert.ok(app.includes('class="profile-avatar-edit-wrap"><img class="avatar"'));
  assert.ok(app.includes("src=\"'+avatar(u)+'\" alt=\"\""));
  assert.ok(app.includes('const profileBioMarkup='));
  assert.ok(app.includes("profileBioMarkup+(data.profileStatus?"));
  assert.ok(app.includes("[['posts','Posts'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']]"));
});
test('phone profile uses a real two-column grid with the avatar overlapping the cover edge',()=>{
  const mobile=avatarAnchorCss.slice(avatarAnchorCss.indexOf('@media (max-width:760px)'),avatarAnchorCss.indexOf('@media (max-width:390px)'));
  assert.ok(mobile.includes('grid-template-columns:var(--minglora-profile-avatar-size) minmax(0,1fr)!important'));
  assert.ok(mobile.includes('grid-column:1!important')&&mobile.includes('grid-row:1!important'));
  assert.ok(mobile.includes('margin:calc(var(--minglora-profile-avatar-size) / -2) 0 0!important'));
  assert.ok(mobile.includes('grid-column:2!important')&&mobile.includes('grid-row:1!important'));
  assert.doesNotMatch(mobile,/position:absolute!important/);
  assert.doesNotMatch(mobile,/padding:\s*0 0 0 109px/);
});

test('Facebook profile picture stays left of the name across desktop, tablet and phones',()=>{
  assert.ok(avatarAnchorCss.includes('grid-template-columns:168px minmax(0,1fr) auto!important'));
  assert.ok(avatarAnchorCss.includes('margin:-84px 0 0!important'));
  assert.ok(avatarAnchorCss.includes('grid-column:1!important')&&avatarAnchorCss.includes('grid-row:1!important'));
  assert.ok(avatarAnchorCss.includes('grid-column:2!important')&&avatarAnchorCss.includes('grid-row:1!important'));
  assert.ok(avatarAnchorCss.includes('@media (min-width:761px) and (max-width:1024px)'));
  assert.ok(avatarAnchorCss.includes('grid-template-columns:132px minmax(0,1fr)!important'));
  assert.ok(avatarAnchorCss.includes('@media (max-width:760px)'));
  assert.ok(avatarAnchorCss.includes('grid-template-columns:var(--minglora-profile-avatar-size) minmax(0,1fr)!important'));
  assert.ok(avatarAnchorCss.includes('@media (max-width:390px)'));
  assert.ok(avatarAnchorCss.includes('--minglora-profile-avatar-size:clamp(76px,22.5vw,88px)!important'));
  assert.doesNotMatch(avatarAnchorCss,/\.profile-avatar-edit-wrap\{[^}]*position:absolute!important/);
  assert.ok(html.indexOf('profile-layout-guardrails.css')<html.indexOf('profile-facebook-avatar-anchor.css'),
    'the Facebook avatar grid must load after older profile guardrails');
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
