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
const screenLayouts=[
  'full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel',
  'side-by-side','spotlight'
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
  for(const name of ['Facebook-style','TikTok-style','Instagram-style','YouTube-style','X (Twitter)-style','LinkedIn-style','Pinterest-style','Twitch-style','Snapchat-style','Custom Minglora-style']){
    assert.ok(app.includes("name:'"+name+"'"),'missing profile label: '+name);
  }
});

test('Profile screen layout allowlists contain exactly seven modes and exclude guest-box layouts',()=>{
  const start=app.indexOf('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze([');
  const end=app.indexOf('const PROFILE_SCREEN_LAYOUT_IDS',start);
  assert.ok(start>=0&&end>start,'profile layout registry exists');
  const profileRegistry=app.slice(start,end);
  assert.doesNotMatch(profileRegistry,/roundtable-1|roundtable-2/);
  assert.match(server,/PROFILE_SCREEN_LAYOUT_IDS=\['full-screen','fluid-panel','fluid-grid','fixed-grid','fixed-panel','side-by-side','spotlight'\]/);
  assert.match(server,/LIVE_GUEST_LAYOUTS=\['roundtable-1','roundtable-2'\]/);
});

test('seven screen layout modes remain supported independently of the Profile Style Library',()=>{
  assert.equal(styles.length*screenLayouts.length,70,'the app retains the existing style/layout rendering matrix');
  assert.ok(app.includes('const PROFILE_SCREEN_LAYOUT_OPTIONS = Object.freeze(['));
  assert.ok(app.includes("function normalizeProfileScreenLayout(value){return PROFILE_SCREEN_LAYOUT_IDS.includes(value)?value:'fluid-panel';}"));
  for(const layout of screenLayouts){
    assert.ok(app.includes("id:'"+layout+"'"),'missing supported screen layout: '+layout);
    assert.ok(server.includes("'"+layout+"'"),'missing server screen layout validation: '+layout);
    if(layout!=='fluid-panel')assert.ok(css.includes('.minglora-profile-page[data-profile-screen-layout="'+layout+'"]'),'missing existing profile rendering selector: '+layout);
  }
  assert.ok(app.includes("data-profile-screen-layout=\"'+normalizeProfileScreenLayout(u.profileScreenLayout)+'\""),'the current profile layout remains intact outside the Style Library');
  assert.ok(!app.includes('profile-screen-layout-choice'),'screen layout control must not appear in the Style Library');
  assert.ok(!app.includes('data-selected-screen-layout='),'Style Library must not keep a screen-layout selection state');
});

test('profile style and screen layout preferences reuse the same account record and default safely for existing accounts',()=>{
  assert.ok(server.includes("profileStyle:'facebook',defaultProfileStyle:'facebook',profileScreenLayout:'fluid-panel',defaultProfileScreenLayout:'fluid-panel'"));
  assert.ok(server.includes("PROFILE_STYLE_IDS.includes(preferences.profileStyle)"));
  assert.ok(server.includes("PROFILE_STYLE_IDS.includes(preferences.defaultProfileStyle)"));
  assert.ok(server.includes("PROFILE_SCREEN_LAYOUT_IDS.includes(preferences.profileScreenLayout)"));
  assert.ok(server.includes("PROFILE_SCREEN_LAYOUT_IDS.includes(preferences.defaultProfileScreenLayout)"));
  assert.ok(server.includes("'profileStyle','defaultProfileStyle','profileScreenLayout','defaultProfileScreenLayout'"));
  assert.ok(server.includes('Choose one of the seven supported profile screen layouts'));
  assert.ok(server.includes('profileStyle:getUserSettings(u).preferences.profileStyle,profileScreenLayout:getUserSettings(u).preferences.profileScreenLayout'));
  assert.ok(server.includes('result.defaultProfileStyle=getUserSettings(u).preferences.defaultProfileStyle'));
  assert.ok(server.includes('result.defaultProfileScreenLayout=getUserSettings(u).preferences.defaultProfileScreenLayout'));
  assert.ok(settings.includes("profileStyle: 'facebook', defaultProfileStyle: 'facebook', profileScreenLayout: 'fluid-panel', defaultProfileScreenLayout: 'fluid-panel'"));
  assert.ok(!server.includes('profileStyleAccounts'));
});

test('Facebook remains the default and existing profile identity, sections and content actions remain connected',()=>{
  assert.ok(app.includes("function normalizeProfileStyle(value){return PROFILE_STYLE_IDS.includes(value)?value:'facebook';}"));
  assert.ok(app.includes("function normalizeProfileScreenLayout(value){return PROFILE_SCREEN_LAYOUT_IDS.includes(value)?value:'fluid-panel';}"));
  assert.ok(app.includes('profileStyleNavigation(u.profileStyle).map'));
  for(const tab of ['posts','about','friends','photos','reels','more']){
    assert.ok(app.includes("['"+tab+"'"),'missing existing content tab '+tab);
  }
  for(const identity of ['verifiedProfileBadge(u)','profile-counts','data-open-connections','profileAboutMarkup']){
    assert.ok(app.includes(identity),'existing profile identity/content missing: '+identity);
  }
  assert.ok(!css.includes('.minglora-profile-page[data-profile-style="facebook"] .profile-cover{display:none'));
  assert.ok(!css.includes('.minglora-profile-page[data-profile-style="facebook"] .profile-avatar-edit-wrap'));
});

test('Profile Style Library previews and saves profile styles only',()=>{
  for(const marker of ['data-profile-style-preview','data-profile-style-apply','data-profile-style-save-default','data-profile-style-reset']){
    assert.ok(app.includes(marker),'missing profile style action/control: '+marker);
  }
  assert.ok(app.includes("api('/settings'"));
  for(const key of ['profileStyle:style','defaultProfileStyle:style']){
    assert.ok(app.includes(key),'missing profile style preference update: '+key);
  }
  const libraryStart=app.indexOf('function profileStyleLibraryMarkup(data){');
  const bindStart=app.indexOf('function bindProfileStyleLibrary(panel,data){',libraryStart);
  const tabStart=app.indexOf('function profileTabMarkup(data,tab,aboutHtml,isMe){',bindStart);
  assert.ok(libraryStart>=0&&bindStart>libraryStart&&tabStart>bindStart);
  const libraryMarkup=app.slice(libraryStart,bindStart);
  const libraryBindings=app.slice(bindStart,tabStart);
  assert.doesNotMatch(libraryMarkup,/Profile screen layout|profile-screen-layout-choice|data-profile-screen-layout|profileScreenLayout|selected-screen-layout/);
  assert.doesNotMatch(libraryBindings,/profileScreenLayout|defaultProfileScreenLayout|normalizeProfileScreenLayout|screenLayout/);
  assert.ok(!app.includes('profile-screen-layout-choice'),'screen layout dropdown has been removed');
  assert.ok(app.includes('data-profile-overflow-action="style-library"'));
  assert.ok(app.includes("if(nextTab==='style-library')bindProfileStyleLibrary"));
});

test('all style and screen layout combinations include responsive viewport guardrails',()=>{
  assert.equal(styles.length*screenLayouts.length,70);
  assert.equal(viewportMatrix.length,9);
  assert.deepEqual(viewportMatrix.map(item=>item.width),[320,360,390,430,740,768,1024,1280,2560]);
  for(const style of styles){
    for(const layout of screenLayouts){
      assert.ok(css.includes('[data-profile-style="'+style+'"]'),'style selector missing: '+style);
      if(layout!=='fluid-panel')assert.ok(css.includes('[data-profile-screen-layout="'+layout+'"]'),'layout selector missing: '+layout);
    }
  }
  for(const breakpoint of ['@media(max-width:1024px)','@media(max-width:760px)','@media(max-width:430px)','@media(max-width:360px)','@media(min-width:1440px)','@media(min-width:1920px)']){
    assert.ok(css.includes(breakpoint),'responsive breakpoint missing: '+breakpoint);
  }
});

test('profile style system assets are versioned and cached by the service worker',()=>{
  const cssAsset='/profile-style-system.css?v=20261113-profile-style-library-layout-removal-1';
  assert.ok(html.includes(cssAsset),'profile style system is not linked');
  assert.ok(worker.includes("'"+cssAsset+"'"),'profile style system is not precached');
  assert.ok(html.includes('/app.js?v=20261113-profile-style-library-layout-removal-1'));
  assert.ok(worker.includes("'/app.js?v=20261113-profile-style-library-layout-removal-1'"));
  assert.ok(html.includes('/settings.js?v=20261112-profile-style-library-10x9-2'));
  assert.match(worker,/minglora-shell-v301-self-updating-1/);
});

test('profile styles route to distinct native content sections and order live metrics by style',()=>{
  assert.ok(app.includes("tiktok:[['videos','Videos'],['posts','Posts'],['friends','Friends'],['photos','Photos'],['about','About'],['more','More']]"));
  assert.ok(app.includes("instagram:[['posts','Posts'],['reels','Reels'],['photos','Photos']"));
  assert.ok(app.includes("youtube:[['posts','Home'],['videos','Videos'],['reels','Shorts']"));
  assert.ok(app.includes("linkedin:[['posts','Activity'],['about','About'],['friends','Connections']"));
  assert.ok(app.includes("pinterest:[['photos','Pins'],['posts','Created']"));
  assert.ok(app.includes("twitch:[['posts','Home'],['videos','Videos'],['reels','Clips']"));
  assert.ok(app.includes("snapchat:[['highlights','Stories'],['reels','Spotlight']"));
  assert.ok(app.includes('function profileMetricEntries(data,style)'));
  assert.ok(app.includes("tiktok:['following','followers','likes']"));
  assert.ok(app.includes("+profileActionMarkup+profileMetricsMarkup(data,u.profileStyle)"));
});

test('TikTok profile follows the supplied creator reference while retaining Minglora controls',()=>{
  assert.ok(app.includes("tiktok:['following','followers','likes']"),'TikTok shows its three real headline metrics');
  assert.ok(app.includes("if(state.profileTargetId!==profileId)state.profileTab=null;"),'new profiles select their own native start tab');
  assert.ok(app.includes("const requestedTab=state.profileTab||profileStyleNavigation(u.profileStyle)[0]?.[0]||'posts';"),'TikTok opens Videos by default');
  assert.ok(app.includes('data-profile-tiktok-highlight-open'),'real Highlights can be opened from the creator header');
  assert.ok(app.includes('data-profile-tiktok-highlight-add'),'the owner can manage Highlights from the creator header');
  assert.ok(app.includes('profile-tiktok-video-grid'),'TikTok Videos use a three-column gallery');
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) 116px'),'the TikTok avatar is positioned in the right column');
  assert.ok(css.includes('grid-column:2 !important'),'the TikTok avatar uses the right column');
  assert.ok(css.includes('.profile-tiktok-highlights'),'the reference Highlights strip has dedicated styles');
  assert.ok(fs.existsSync(path.join(root,'assets/reference/android/Screenshot_20261112_081840_TikTok.jpg')),'the supplied TikTok profile screenshot remains in the repository');
});

test('profile style preview renders the current account media and posts, not generic demo content',()=>{
  assert.ok(app.includes('function profileStylePreviewMarkup(data,style)'));
  assert.ok(app.includes('profile-style-preview-gallery'));
  assert.ok(app.includes('profile-style-preview-video'));
  assert.ok(app.includes('latest.createdAt'));
  assert.ok(app.includes('data-preview-metric'));
  assert.ok(!app.includes('Your real Minglora content'));
});