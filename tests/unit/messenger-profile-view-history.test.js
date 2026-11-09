import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('public/app.js');
const html=read('public/index.html');
const css=read('public/styles.css');
const profileCss=read('public/profile-alignment.css')+'\n'+read('public/profile-action-row.css');
const server=read('src/server.js');
const settings=read('public/settings.js');

test('Messenger is available beside notifications and displays actual unread conversation totals',()=>{
  const messenger=html.indexOf('id="messenger-btn"');
  const notifications=html.indexOf('id="notifications-btn"');
  assert.ok(messenger>=0&&notifications>messenger,'Messenger must be immediately before Notifications in the header');
  assert.match(html,/id="messenger-unread-count"/);
  assert.ok(app.includes("const messengerButton=$('#messenger-btn')"));
  assert.ok(app.includes('messengerButton.onclick=()=>{void toggleMessengerPanel()'));
  assert.ok(app.includes("const notificationsButton=$('#notifications-btn')"));
  assert.match(app,/function paintMessengerBadge\(conversations=\[\]\)/);
  assert.match(app,/Number\(item\.unreadCount\)\|\|0/);
  assert.match(app,/api\('\/messages'\)/);
  assert.match(app,/setInterval\(refreshMessageConversations,5000\)/);
  assert.match(app,/<h1>Messenger<\/h1>/);
});

test('profile picture remains in the avatar column and upload is controlled from Edit profile',()=>{
  const wrapper=app.indexOf('profile-avatar-edit-wrap');
  const avatar=app.indexOf('class="avatar"',wrapper);
  const imageEnd=app.indexOf('alt="">',avatar);
  const details=app.indexOf('profile-info-main',imageEnd);
  assert.ok(wrapper>=0&&avatar>wrapper&&imageEnd>avatar&&details>imageEnd);
  assert.doesNotMatch(app,/profile-avatar-inline-edit|profile-inline-media-edit|profile-media-action-row/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile(?: details in About)?"/);
  assert.match(app,/\$\(\x27#edit-profile\x27\)\?\.addEventListener\(\x27click\x27,\(\)=>\{[\s\S]*?showTab\(\x27about\x27\)/);
  assert.match(app,/data-profile-media-section="avatar"/);
  assert.match(app,/id="edit-avatar-file"/);
  assert.match(profileCss,/\.profile-avatar-edit-wrap/);
  assert.match(profileCss,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap>\.avatar\{[^}]*object-fit:cover/);
});
test('profile count row shows six real aligned profile metrics',()=>{
  for(const kind of ['followers','following','friends'])assert.match(app,new RegExp('data-open-connections="'+kind+'"'));
  assert.match(app,/profile-count-item/);
  assert.ok(app.includes('Number(data.likesCount||0).toLocaleString()'));
  const countStart=app.indexOf('class="profile-counts"');
  const countEnd=app.indexOf("</div>'+'</div><nav",countStart);
  const countMarkup=app.slice(countStart,countEnd);
  assert.ok(countMarkup.indexOf('<span>Posts</span>')<countMarkup.indexOf('<span>Likes</span>'),'Likes follows Posts in the profile metric row');
  assert.match(read('public/profile-admin-layout-parity.css'),/grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) !important/);
  assert.doesNotMatch(app,/profile-live-insights|Profile views · 30 days|Viewing now/);
});

test('profile viewer history requires reciprocal opt-in and uses real viewer records',()=>{
  assert.match(server,/profileViews:false/);
  assert.match(server,/getUserSettings\(user\)\.notifications\.profileViews===true&&getUserSettings\(target\)\.notifications\.profileViews===true/);
  assert.match(server,/recordedView\.historyEligible=true/);
  assert.match(server,/p==='\/api\/profile-views'/);
  assert.match(server,/windowDays:30/);
  assert.match(server,/getUserSettings\(viewer\)\.notifications\.profileViews!==true/);
  assert.match(settings,/name="notificationProfileViews"/);
  assert.match(settings,/api\('\/profile-views'\)/);
  assert.match(settings,/data-profile-viewer/);
  assert.match(settings,/Last viewed/);
  assert.match(css,/\.settings-profile-viewer-list/);
  assert.match(app,/data-profile-view-actor/);
});

test('profile views are not shown as profile-header or Creator Studio totals',()=>{
  assert.doesNotMatch(app,/Profile views · 30 days|Active profile viewers|profile-live-insights/);
  assert.doesNotMatch(app,/creatorMetric\(["']Profile views|creatorMetric\(["']Active profile viewers/);
});
