import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const alignment=read('public/profile-alignment.css');
const css=read('public/profile-action-row.css');
const facebookCss=read('public/profile-facebook-panel.css');
const html=read('public/index.html');
const worker=read('public/sw.js');

test('owner profile has Edit profile and Add to story without separate photo edit buttons',()=>{
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add to story"/);
  assert.match(app,/<span>Add to story<\/span>/);
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
  assert.doesNotMatch(app,/profile-media-action-row|profile-avatar-inline-edit|profile-inline-media-edit/);
});

test('desktop profile uses a Facebook-scale portrait, wide cover and lower-left overlap',()=>{
  assert.match(alignment,/--minglora-profile-avatar-size:168px/);
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-cover\{[^}]*aspect-ratio:2\.7 \/ 1/);
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-cover-image\{[^}]*object-fit:cover/);
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap\{[^}]*grid-row:2/);
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap\{[^}]*margin-top:calc\(var\(--minglora-profile-avatar-size\) \/ -2\)/);
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap>\.avatar\{[^}]*object-fit:cover/);
});

test('phone profile retains its larger visible portrait and action row below identity',()=>{
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?:root\{--minglora-profile-avatar-size:112px\}/);
  assert.match(css,/@media\(max-width:390px\)[\s\S]*?:root\{--minglora-profile-avatar-size:100px\}/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.minglora-profile-page \.profile-header-card--owner \.profile-owner-actions\{[^}]*grid-row:3/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.minglora-profile-page \.profile-header-card--owner \.profile-counts\{grid-row:4!important\}/);
  assert.doesNotMatch(css,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap\{[^}]*display:none!important/);
});

test('picture and cover remain editable in the normal Edit profile dialog only',()=>{
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

test('updated profile assets are loaded and precached by a refreshed shell cache',()=>{
  const assetFrom=(attribute,prefix)=>{
    const marker=attribute+'="'+prefix;
    const start=html.indexOf(marker);
    if(start<0)return '';
    const valueStart=start+attribute.length+2;
    const valueEnd=html.indexOf('"',valueStart);
    return valueEnd>valueStart?html.slice(valueStart,valueEnd):'';
  };
  const assets=[
    assetFrom('href','/profile-alignment.css?'),
    assetFrom('href','/profile-action-row.css?'),
    assetFrom('href','/profile-facebook-panel.css?'),
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
  assert.ok(app.includes('<path d="m7 10 5 5 5-5"></path>'),'closed People You May Know chevron points down');
  assert.ok(facebookCss.includes('.minglora-profile-page .profile-header-card--owner .profile-info{grid-template-columns:clamp(112px,15vw,176px) minmax(0,1fr) auto!important;}'),'owner header has explicit portrait, identity and action columns');
  assert.ok(facebookCss.includes('.profile-people-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}'),'the dropdown chevron flips when opened');


});
