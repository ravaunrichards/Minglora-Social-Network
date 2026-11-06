import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const server=read('src/server.js');
const settings=read('public/settings.js');
const html=read('public/index.html');
const styles=read('public/styles.css');
const worker=read('public/sw.js');

test('Notification inbox provides category filters, counts, and search',()=>{
  for(const category of ['all','unread','social','messages','calls','live','gifts','meetWave','leagues','other']){
    assert.ok(app.includes("['"+category+"'"),'notification filter '+category+' is present');
  }
  assert.match(app,/notificationCategoryFor/);
  assert.match(app,/notificationMatchesFilter/);
  assert.match(app,/categoryCounts/);
  assert.match(app,/id="notification-search"/);
  assert.match(app,/Search notifications/);
});

test('Notification inbox supports per-item read/delete and separate bulk cleanup',()=>{
  assert.match(app,/\/notifications\/.*\/read/);
  assert.match(app,/data-notice-read/);
  assert.match(app,/data-notice-delete/);
  assert.match(app,/\/notifications\/clear/);
  assert.match(app,/readOnly:true/);
  assert.match(app,/readOnly:false/);
  assert.match(app,/Mark all read/);
  assert.match(app,/Clear read/);
  assert.match(app,/Clear all/);
  assert.match(server,/notificationReadMatch/);
  assert.match(server,/item\.userId===user\.id/);
  assert.match(server,/notification\.read=true/);
});

test('Notification category preferences remain account-backed and include all current event families',()=>{
  for(const key of ['calls','live','gifts','meetWave','leagues','account']){
    assert.ok(server.includes("'"+key+"'"),'server accepts '+key+' preference');
    assert.ok(settings.includes('name="notification'+key.charAt(0).toUpperCase()+key.slice(1)+'"'),'settings expose '+key);
  }
  assert.match(server,/function notificationPreferenceKey/);
  assert.match(server,/notificationTypeEnabled/);
  assert.match(settings,/Changes apply to in-app and device push delivery/);
});

test('Unread count is displayed accessibly and foreground inbox refresh is bounded',()=>{
  assert.match(html,/id="notification-unread-count"/);
  assert.match(app,/function paintNotificationBadge/);
  assert.match(app,/Notifications, '\+unread\+' unread/);
  assert.match(app,/setInterval\(pollBrowserNotifications,6000\)/);
  assert.match(app,/state\.view==='notifications'/);
  assert.match(styles,/\.notification-unread-count/);
});

test('Notification UI is responsive and uses content-flow layout rather than fixed notification overlays',()=>{
  assert.match(styles,/\.notification-center/);
  assert.match(styles,/@media\(max-width:600px\)[\s\S]*\.notification-card/);
  assert.doesNotMatch(app,/notification-center[^\n]*position:\s*fixed/i);
});

test('Web Push cache and delivery assets reference the advanced notification build',()=>{
  assert.match(worker,/v99-advanced-notifications-1/);
  assert.match(worker,/notificationclick/);
  assert.match(worker,/notificationId/);
  assert.match(worker,/\/styles\.css\?v=[^'\"]*-advanced-notifications-1/);
  assert.match(worker,/\/app\.js\?v=[^'\"]*-advanced-notifications-1/);
  assert.match(worker,/\/settings\.js\?v=[^'\"]*-advanced-notifications-1/);
});

test('Notification changes are broadcast only to the authenticated recipient account realtime sockets',()=>{
  assert.match(server,/function publishNotificationEvent\(userId,type,notificationId=null\)/);
  assert.match(server,/messengerRealtime\?\.publish\(\[userId\],\{type,notificationId:notificationId\|\|null\}\)/);
  assert.match(server,/publishNotificationEvent\(userId,'notification:new',notification\.id\)/);
  assert.match(server,/publishNotificationEvent\(user\.id,'notification:changed'/);
  assert.match(app,/message\.type==='notification:new'[\s\S]*pollBrowserNotifications\(\)/);
  assert.match(app,/message\.type==='notification:changed'[\s\S]*updateNotificationDot\(\)/);
});
