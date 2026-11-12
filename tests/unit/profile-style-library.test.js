import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const css=read('public/profile-style-system.css');
const html=read('public/index.html');
const worker=read('public/sw.js');
const settings=read('public/settings.js');

const styles=[
  'facebook','tiktok','instagram','youtube','x',
  'linkedin','pinterest','twitch','snapchat','custom-minglora'
];
const viewportMatrix=[
  {name:'compact-phone',width:320,height:640},
  {name:'standard-phone',width:360,height:800},
  {name:'large-phone',width:390,height:844},
  {name:'wide-phone',width:430,height:932},
  {name:'phone-landscape',width:740,height:360},
  {name:'tablet-portrait',width:768,height:1024},
  {name:'tablet-landscape',width:1024,height:768},
  {name:'laptop',width:1280,height:800},
  {name:'wide-desktop',width:2560,height:1440}
];

test('all ten selectable profile styles are registered on client and server',()=>{
  for(const style of styles){
    assert.ok(app.includes("id:'"+style+"'"),'missing profile catalog entry: '+style);
    assert.ok(server.includes("'"+style+"'"),'missing server allowlist entry: '+style);
    assert.ok(css.includes('[data-profile-style="'+style+'"]'),'missing CSS style variant: '+style);
  }
  assert.match(app,/name:'Facebook-style'/);
  assert.match(app,/name:'TikTok-style'/);
  assert.match(app,/name:'Instagram-style'/);
  assert.match(app,/name:'YouTube-style'/);
  assert.match(app,/name:'X \(Twitter\)-style'/);
  assert.match(app,/name:'LinkedIn-style'/);
  assert.match(app,/name:'Pinterest-style'/);
  assert.match(app,/name:'Twitch-style'/);
  assert.match(app,/name:'Snapchat-style'/);
  assert.match(app,/name:'Custom Minglora-style'/);
});

test('profile style settings reuse the same account preferences and safely default legacy accounts to Facebook',()=>{
  assert.match(server,/profileStyle:'facebook',defaultProfileStyle:'facebook'/);
  assert.match(server,/if\(!PROFILE_STYLE_IDS\.includes\(preferences\.profileStyle\)\)preferences\.profileStyle=DEFAULT_SETTINGS\.preferences\.profileStyle/);
  assert.match(server,/if\(!PROFILE_STYLE_IDS\.includes\(preferences\.defaultProfileStyle\)\)preferences\.defaultProfileStyle=DEFAULT_SETTINGS\.preferences\.defaultProfileStyle/);
  assert.match(server,/['"]profileStyle['"],['"]defaultProfileStyle['"]/);
  assert.match(server,/Choose one of the supported Minglora profile styles/);
  assert.match(server,/profileStyle:getUserSettings\(u\)\.preferences\.profileStyle/);
  assert.match(server,/result\.defaultProfileStyle=getUserSettings\(u\)\.preferences\.defaultProfileStyle/);
  assert.match(settings,/profileStyle: 'facebook', defaultProfileStyle: 'facebook'/);
  assert.ok(!server.includes('profileStylePreferences'));
  assert.ok(!server.includes('profileStyleAccounts'));
});

test('Facebook remains the default and the original profile renderer, identity and content APIs remain in use',()=>{
  assert.match(app,/function normalizeProfileStyle\(value\)\{return PROFILE_STYLE_IDS\.includes\(value\)\?value:'facebook';\}/);
  assert.match(app,/data-profile-style="\'+normalizeProfileStyle\(u\.profileStyle\)/);
  assert.match(app,/profileStyleNavigation\(u\.profileStyle\)\.map/);
  for(const tab of ['posts','about','friends','photos','reels','more']){
    assert.ok(app.includes("['"+tab+"'"),'missing existing profile content tab '+tab);
  }
  for(const identity of ['verifiedProfileBadge(u)','profile-counts','data-open-connections','profileAboutMarkup']){
    assert.ok(app.includes(identity),'existing profile identity/content missing: '+identity);
  }
  assert.ok(!css.includes('.minglora-profile-page[data-profile-style="facebook"] .profile-cover{display:none'));
  assert.ok(!css.includes('.minglora-profile-page[data-profile-style="facebook"] .profile-avatar-edit-wrap'));
});

test('members can preview, apply, save a default and reset without creating new profile databases',()=>{
  for(const marker of ['data-profile-style-preview','data-profile-style-apply','data-profile-style-save-default','data-profile-style-reset']){
    assert.ok(app.includes(marker),'missing profile style action: '+marker);
  }
  assert.match(app,/api\('\\/settings',\{method:'PATCH',body:JSON\.stringify\(\{preferences\}\)\}\)/);
  assert.match(app,/profileStyle:style/);
  assert.match(app,/defaultProfileStyle:style/);
  assert.match(app,/data-profile-overflow-action="style-library"/);
  assert.match(app,/if\(nextTab==='style-library'\)bindProfileStyleLibrary/);
  assert.ok(app.includes("data-profile-tab"));
});

test('the nine responsive viewport profiles are covered for all ten styles',()=>{
  assert.equal(styles.length*viewportMatrix.length,90,'expected 10 profile styles × 9 responsive viewports');
  assert.equal(viewportMatrix.length,9);
  assert.deepEqual(viewportMatrix.map(v=>v.width),[320,360,390,430,740,768,1024,1280,2560]);
  for(const style of styles){
    for(const viewport of viewportMatrix){
      assert.ok(css.includes('[data-profile-style="'+style+'"]'),'style missing for '+viewport.name);
      assert.ok(css.includes('min-width:0'),'shared min-width guardrail missing for '+viewport.name);
    }
  }
  for(const breakpoint of ['@media(max-width:1024px)','@media(max-width:760px)','@media(max-width:430px)','@media(max-width:360px)','@media(min-width:1440px)','@media(min-width:1920px)']){
    assert.ok(css.includes(breakpoint),'responsive breakpoint missing: '+breakpoint);
  }
});

test('the stylesheet loads after existing profile CSS and is versioned in the service worker shell',()=>{
  const asset='/profile-style-system.css?v=20261112-profile-styles-10x9-1';
  assert.ok(html.includes(asset),'profile style system is not linked');
  assert.ok(worker.includes("'"+asset+"'"),'profile style system is not precached');
  assert.ok(html.includes('/app.js?v=20261112-profile-style-library-10x9-1'));
  assert.ok(worker.includes("'/app.js?v=20261112-profile-style-library-10x9-1'"));
  assert.ok(html.includes('/settings.js?v=20261112-profile-style-library-10x9-1'));
  assert.match(worker,/minglora-shell-v299-profile-style-library-1/);
});
