import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const settings=read('public/settings.js');
const server=read('src/server.js');
const html=read('public/index.html');
const worker=read('public/sw.js');
const registry=read('public/profile-style-system.js');
const css=read('public/profile-style-system.css');
const styles=['facebook','tiktok','instagram','youtube','x','linkedin','pinterest','twitch','snapchat','minglora'];
const layouts=['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight','roundtable-1','roundtable-2'];

test('ten profile styles and nine screen layouts expose all 90 combinations',()=>{
  for(const style of styles)assert.match(registry,new RegExp("id: '"+style+"'"));
  for(const layout of layouts)assert.match(registry,new RegExp("id: '"+layout+"'"));
  assert.match(registry,/const matrix = styles\.flatMap/);
  assert.match(registry,/const supports =/);
  assert.equal(styles.length*layouts.length,90);
});

test('profile styles are separate from the existing standard/advanced/creator content layout',()=>{
  assert.match(server,/profileLayout:'advanced',profileStyle:'facebook',profileScreenLayout:'fluid-panel'/);
  assert.match(server,/!\['standard','advanced','creator'\]\.includes\(preferences\.profileLayout\)/);
  assert.match(server,/key==='profileStyle'&&!PROFILE_STYLES\.includes\(value\)/);
  assert.match(server,/key==='profileScreenLayout'&&!LIVE_SCREEN_LAYOUTS\.includes\(value\)/);
  assert.match(server,/profileStyle:getUserSettings\(u\)\.preferences\.profileStyle/);
});

test('one profile data record powers style-specific navigation and keeps real existing actions',()=>{
  const start=app.indexOf('function renderProfile(data){');
  const end=app.indexOf('async function loadProfileGiftGallery',start);
  assert.ok(start>=0&&end>start);
  const profile=app.slice(start,end);
  assert.match(profile,/data-profile-style=/);
  assert.match(profile,/data-profile-screen-layout=/);
  for(const marker of ['data-profile-count="followers"','data-profile-count="following"','data-profile-count="friends"','data-profile-count="subscribers"','data-profile-count="posts"','data-profile-count="likes"'])assert.ok(profile.includes(marker),marker);
  assert.match(profile,/profileStyleDefinition\.tabs/);
  for(const marker of ['id="profile-follow"','id="profile-subscribe"','id="profile-message"','data-profile-call="audio"','data-profile-call="video"','id="profile-add-story"','id="edit-profile"','id="profile-overflow-trigger"'])assert.ok(profile.includes(marker),marker);
  assert.match(server,/profileStyle:getUserSettings\(u\)\.preferences\.profileStyle/);
});

test('account settings provides actual preview, save, and reset controls',()=>{
  for(const marker of ['Profile Style Library','profile-style-preview','profile-style-save','profile-style-reset','profile-style-screen-layout'])assert.ok(settings.includes(marker),marker);
  assert.match(settings,/api\('\/settings',\{method:'PATCH',body:JSON\.stringify\(\{preferences:\{profileStyle:style,profileScreenLayout:layout\}\}\)\}\)/);
  assert.match(settings,/minglora:preview-profile-style/);
  assert.match(settings,/minglora:profile-style-saved/);
});

test('profile style assets load before app.js and are explicitly cached',()=>{
  assert.ok(html.indexOf('profile-style-system.js')<html.indexOf('/app.js?'));
  assert.ok(html.includes('profile-style-system.css'));
  assert.ok(worker.includes('profile-style-system.js'));
  assert.ok(worker.includes('profile-style-system.css'));
  assert.match(worker,/minglora-shell-v299-self-updating-1/);
});

test('each non-default style has isolated visual treatment and all layout breakpoints reflow safely',()=>{
  for(const style of styles.slice(1))assert.ok(css.includes('data-profile-style="'+style+'"'),style);
  for(const layout of layouts)assert.ok(css.includes('data-profile-screen-layout="'+layout+'"'),layout);
  assert.match(css,/@media\(max-width:640px\)/);
  for(const marker of ['data-profile-count="friends"','data-profile-count="subscribers"','.profile-body--established','.profile-reel-tile video'])assert.ok(css.includes(marker),marker);
  assert.match(css,/minmax\(0,1fr\)/);
  assert.ok(!css.includes('data-profile-style="facebook" .profile-cover{display:none'));
});
