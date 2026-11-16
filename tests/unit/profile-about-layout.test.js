import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');

test('profile identity stays compact and About information is shown in its own section cards',()=>{
  const renderAt=app.indexOf('function renderProfile(data)');
  const headerStart=app.indexOf('<div class="profile-info-main">',renderAt);
  const headerEnd=app.indexOf("</div>'+profileActionMarkup",headerStart);
  assert.notEqual(renderAt,-1);
  assert.notEqual(headerStart,-1);
  assert.notEqual(headerEnd,-1);
  const identity=app.slice(headerStart,headerEnd);
  assert.match(app.slice(renderAt,app.indexOf('const showTab=',renderAt)),/profileMetricsMarkup\(data,u\.profileStyle\)/);
  assert.match(app,/function profileMetricsMarkup\(data,style\)[\s\S]*?class="profile-counts"/);
  assert.match(identity,/u\.name/);
  assert.match(identity,/u\.username/);
  assert.doesNotMatch(identity,/u\.(bio|location)/);
  assert.doesNotMatch(identity,/profileBioMarkup|profile-bio/,'the name and username block never displays a bio');
  assert.match(app,/function profileAboutMarkup\(u,isMe\)/);
  assert.match(app,/data-about-section=/);
  assert.match(app,/profile-about-sections/);
  assert.match(app,/about-section-card/);
  const renderProfileStart=app.indexOf('function renderProfile(data){');
  const renderProfileEnd=app.indexOf('const showTab=nextTab=>{',renderProfileStart);
  const profileHeader=app.slice(renderProfileStart,renderProfileEnd);
  assert.ok(!profileHeader.includes('profileBioMarkup')&&!profileHeader.includes('class="profile-bio"'),'profile header has no introduction beneath the username');
  const viewAsStart=app.indexOf('function openProfileViewAsPreview(u,data){');
  const viewAsEnd=app.indexOf('async function openProfilePrivacySettings',viewAsStart);
  const viewAs=app.slice(viewAsStart,viewAsEnd);
  assert.ok(!viewAs.includes('profile-view-as-bio')&&!viewAs.includes('bioVisible'),'View as keeps the profile identity area free of introductions');
  assert.ok(app.includes('profile-intro-card'),'the separate Intro card remains available outside the username block');
});

test('About includes the requested independent categories, with Personal details distinct from Intro',()=>{
  const categories=['personalDetails','intro','work','education','hobbies','interests','travel','links','contactInfo','names','details','aboutYou'];
  for(const key of categories)assert.ok(app.includes("['"+key+"'"),'Missing profile About category '+key);
  assert.match(app,/\['personalDetails','Personal details'/);
  assert.match(app,/\['intro','Intro'/);
  assert.match(app,/\['aboutYou','About you'/);
  assert.match(app,/\['details','Details'/);
});

test('every About category has its own pencil edit action and section-specific save',()=>{
  assert.match(app,/data-edit-about-section=/);
  assert.match(app,/about-section-edit/);
  assert.match(app,/aria-label="Edit '\+esc\(label\)/);
  assert.match(app,/panel\.querySelectorAll\('\[data-edit-about-section\]'\)/);
  assert.match(app,/function openAboutSectionEditor\(sectionKey,u\)/);
  assert.match(app,/aboutSections:\{\[sectionKey\]:section\}/);
  assert.match(app,/aboutSectionVisibility:\{\[sectionKey\]:form\.elements\.audience\.value\}/);
});

test('Work and Education support multiple entries; lists, travel and links support multiple values',()=>{
  assert.match(app,/data-about-repeater="work"/);
  assert.match(app,/data-about-repeater="education"/);
  assert.match(app,/data-add-about-entry="work"/);
  assert.match(app,/data-add-about-entry="education"/);
  assert.match(app,/data-about-link-list/);
  assert.match(app,/about-add-social-link/);
  assert.match(app,/section\.items=fieldLines\('items'\)/);
  assert.match(app,/section\.visited=fieldLines\('visited'\)/);
});

test('social profile links are rendered as safe external links with target protection',()=>{
  assert.match(app,/function aboutSafeExternalUrl/);
  assert.match(app,/rel="noopener noreferrer"/);
  assert.match(app,/target="_blank"/);
  for(const platform of ['Instagram','Facebook','TikTok','YouTube','X','Threads','LinkedIn','Snapchat','Pinterest','Twitch','Discord','WhatsApp','Telegram','Reddit','Bluesky','Mastodon']){
    assert.ok(app.includes("'"+platform+"'"),'Missing social link platform '+platform);
  }
});

test('Names is always public while every other About section retains independent visibility',()=>{
  assert.match(app,/Who can see this section\?/);
  assert.match(app,/Names visibility/);
  assert.match(app,/Public — names and usernames always appear on accessible profiles/);
  assert.match(app,/<option value="public"/);
  assert.match(app,/<option value="friends"/);
  assert.match(app,/<option value="private"/);
  assert.match(server,/function canViewAboutSection\(viewerId,target,visibility\)/);
  assert.match(server,/names:'public'/);
  assert.match(server,/if\(key!=='names'&&!canViewAboutSection\(viewerId,u,sectionVisibility\[key\]\)\)continue/);
  assert.match(server,/aboutSections\[key\]=\{\.\.\.\(u\.aboutSections\?\.\[key\]\|\|\{\}\)\}/);
  assert.match(server,/about_sections:next\.aboutSections/);
  assert.match(server,/about_section_visibility:next\.aboutSectionVisibility/);
});

test('the Names editor changes the public display name and unique username and renders every saved name',()=>{
  for(const field of ['profileName','username','firstName','middleName','lastName','preferredName','otherName','nickname','pronunciation','formerName']){
    assert.ok(app.includes('data-about-field="'+field+'"')||app.includes("aboutEditorField('"+field+"'"),'Missing Names editor field '+field);
  }
  assert.match(app,/patch\.name=fieldValue\('profileName'\)/);
  assert.match(app,/patch\.username=fieldValue\('username'\)/);
  assert.match(app,/patch\.aboutSectionVisibility\.names='public'/);
  for(const label of ['Display name','Username','First name','Middle name','Last name','Preferred name','Other name','Nickname','Name pronunciation','Former name']){
    assert.ok(app.includes("aboutRowMarkup('"+label+"'"),'Missing visible profile name row '+label);
  }
});

test('long display names and usernames wrap instead of clipping on profile headers',()=>{
  assert.match(css,/\.profile-name-with-badges\{[^}]*flex-wrap:wrap/);
  assert.match(css,/\.profile-username-line\{[^}]*overflow-wrap:anywhere/);
  assert.match(css,/overflow-wrap:anywhere/);
});

test('private contact information is only supplied to its owner or viewers allowed by the section audience',()=>{
  const start=server.indexOf('function safeUser(u,viewerId=null)');
  const end=server.indexOf('const APP_COLOR_THEMES',start);
  const safeUser=server.slice(start,end);
  assert.match(safeUser,/if\(own\)\{/);
  assert.match(safeUser,/result\.email=u\.email\|\|''/);
  assert.match(safeUser,/canViewAboutSection\(viewerId,u,sectionVisibility\[key\]\)/);
  assert.match(safeUser,/result\.aboutSectionVisibility=sectionVisibility/);
});

test('profile shell and service worker load the organised About UI without stale cached assets',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const styleAsset=html.match(/styles\.css\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset&&worker.includes('/'+appAsset),'HTML app script is present in the service-worker shell');
  assert.ok(styleAsset&&worker.includes('/'+styleAsset),'HTML stylesheet is present in the service-worker shell');
  assert.match(cacheName,/^minglora-shell-v\d+-/,'service-worker shell is versioned');
});
