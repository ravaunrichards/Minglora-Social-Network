import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const settings=read('public/settings.js');
const server=read('src/server.js');
const styles=read('public/styles.css');

const categories={
  activity:['settings-notifications'],
  account:['settings-account','settings-data'],
  visibility:['settings-privacy'],
  interactions:['settings-blocking','settings-calls'],
  'content-display':['settings-preferences'],
  'cache-cellular':['settings-cache'],
  'support-about':['settings-help'],
  logon:['settings-security','settings-signout']
};

test('Settings & privacy provides each requested category exactly once',()=>{
  assert.match(settings,/Settings &amp; privacy categories/);
  for(const category of Object.keys(categories)){
    const marker='data-settings-category-button="'+category+'"';
    assert.equal(settings.split(marker).length-1,1,'category '+category+' must appear once');
  }
  assert.equal((settings.match(/data-settings-category-button=/g)||[]).length,8);
});

test('Existing settings sections are retained and assigned to one category without duplicate IDs',()=>{
  for(const [category,ids] of Object.entries(categories)){
    for(const id of ids){
      assert.equal((settings.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'preserve exactly one '+id);
      assert.ok(settings.includes('id="'+id+'" data-settings-category="'+category+'"'),'assign '+id+' to '+category);
    }
  }
  for(const control of ['profileVisibility','messageAudience','notificationInApp','notificationFriendRequests','notificationMessages','notificationInteractions','theme','colorTheme','liveRoomTheme','download-account-data','security-email-form','support-ticket-form','settings-logout-btn']){
    assert.ok(settings.includes('name="'+control+'"')||settings.includes('id="'+control+'"'),'preserve existing '+control);
  }
  assert.match(settings,/settings-category-intro/);
  assert.match(settings,/section\.hidden=section\.dataset\.settingsCategory!==category/);
  assert.match(settings,/FormData\(settingsForm\)/);
});

test('Cache & Cellular safely clears temporary image cache and preserves device downloads',()=>{
  assert.match(settings,/id="settings-clear-image-cache"/);
  assert.match(settings,/request\.destination==='image'/);
  assert.match(settings,/cacheName\.startsWith\('minglora-shell-'\)/);
  assert.match(settings,/device downloads were not changed/);
  assert.match(settings,/Downloaded files saved by your phone or computer are managed by that device/);
  assert.match(styles,/\.settings-storage-summary/);
});

test('Lite mode is stored as an account preference and applied to the interface',()=>{
  assert.match(settings,/liteMode: false/);
  assert.match(settings,/name="liteMode"/);
  assert.match(settings,/liteMode: formData\.has\('liteMode'\)/);
  assert.match(settings,/classList\.toggle\('lite-mode', preferences\.liteMode === true\)/);
  assert.match(server,/liteMode:false/);
  assert.match(server,/\['theme','colorTheme','liveRoomTheme','feedSort','reducedMotion','liteMode'/);
  assert.match(server,/\['reducedMotion','liteMode','messengerIncomingCallSounds'/);
  assert.match(styles,/body\.lite-mode/);
});
