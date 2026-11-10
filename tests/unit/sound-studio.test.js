import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(path.join(root,'public/sound-studio.js'),'utf8');

function loadStudio(){
  const window={
    addEventListener(){},
    MingloraExperience:{getSettings(){return {};},shouldSilenceNotifications(){return false;}}
  };
  const document={querySelector(){return null;}};
  vm.runInNewContext(source,{window,document,Map,Math,Date,Promise,Set,Number,String,Object,Array,Boolean,RegExp,Error,URL,console});
  return window.MingloraSoundStudio;
}

test('Minglora Sound Studio ships separate voice, video and event-specific notification libraries',()=>{
  const studio=loadStudio();
  const catalog=studio.getCatalog();
  assert.equal(catalog.voice.length,30);
  assert.equal(catalog.video.length,30);
  assert.equal(catalog.notifications.length,70);
  assert.equal(catalog.events.length,70);
  assert.equal(new Set(catalog.voice.map(item=>item.id)).size,30);
  assert.equal(new Set(catalog.video.map(item=>item.id)).size,30);
  assert.equal(new Set(catalog.notifications.map(item=>item.id)).size,70);
  assert.equal(new Set(catalog.events.map(item=>item.defaultSoundId)).size,70);
  assert.equal(new Set([...catalog.voice,...catalog.video,...catalog.notifications].map(item=>item.id)).size,130);
});

test('Minglora notification event catalog covers the existing live message and social event types',()=>{
  const catalog=loadStudio().getCatalog();
  const keys=new Set(catalog.events.map(item=>item.key));
  for(const key of ['message','friendRequest','newFollower','like','comment','creatorLive','giftReceived','meetingInvitation','paymentConfirmed','newDeviceLogin','securityWarning','profileViewed','uploadCompleted']){
    assert.ok(keys.has(key),'missing event-specific sound: '+key);
  }
  assert.ok(catalog.events.every(item=>item.defaultSoundId==='notice-'+item.key));
});

test('Minglora Sound Studio is mounted in account settings and connected to active playback flows',()=>{
  const settings=fs.readFileSync(path.join(root,'public/settings.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
  assert.match(settings,/data-settings-category-button="sound-studio"/);
  assert.match(settings,/minglora-sound-studio-root/);
  assert.match(settings,/MingloraSoundStudio\?\.mount/);
  assert.match(app,/MingloraSoundStudio\?\.playCall/);
  assert.match(app,/MingloraSoundStudio\?\.playNotification/);
  assert.match(app,/voiceCallRingtoneId/);
  assert.match(app,/videoCallRingtoneId/);
  assert.match(html,/sound-studio\.js\?v=20261110-sound-studio-1/);
  assert.match(html,/sound-studio\.css\?v=20261110-sound-studio-1/);
  assert.match(worker,/minglora-shell-v261-self-updating-1/);
  assert.match(worker,/sound-studio\.js\?v=20261110-sound-studio-1/);
  assert.match(worker,/sound-studio\.css\?v=20261110-sound-studio-1/);
});
