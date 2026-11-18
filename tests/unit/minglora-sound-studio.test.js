import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {SOUND_STUDIO_THEMES,SOUND_STUDIO_CATEGORIES,defaultSoundStudioPreferences,buildSoundThemePreset,validateSoundStudioPatch,normalizeSoundStudioPreferences} from "../../backend/modules/sounds/notification-studio.js";
test("Sound Studio uses silent defaults until authentic recordings are approved",()=>{
 const d=defaultSoundStudioPreferences();assert.equal(d.voiceCall.soundId,null);assert.equal(d.videoCall.soundId,null);assert.equal(SOUND_STUDIO_CATEGORIES.length,22);assert.equal(Object.keys(d.notifications).length,22);assert.equal(d.notifications.private_messages.soundId,null);assert.equal(d.notifications.system_notifications.soundId,null);assert.equal(SOUND_STUDIO_THEMES.map(x=>x.label).join(","),"Classic,Modern,Premium,Minimal,Digital,Cinematic");
});
test("theme presets do not invent or restore generated tones when no authentic recordings are approved",()=>{
 const r=buildSoundThemePreset("cinematic",defaultSoundStudioPreferences());assert.equal(r.valid,false);assert.match(r.error,/authentic recordings/i);assert.equal(buildSoundThemePreset("unknown").valid,false);
});
test("validation rejects retired synthetic IDs while allowing silent defaults and private custom uploads",()=>{
 const d=defaultSoundStudioPreferences(),silent=validateSoundStudioPatch(d,{voiceCall:{soundId:null},videoCall:{soundId:null,enabled:false},notifications:{private_messages:{soundId:null,enabled:false}},favorites:[]});
 assert.equal(silent.valid,true);assert.equal(silent.settings.voiceCall.soundId,null);assert.equal(silent.settings.notifications.private_messages.enabled,false);
 assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"voice-01"}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"video-01"}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{videoCall:{soundId:"video-99"}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{notifications:{private_messages:{soundId:"notification-01"}}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{notifications:{unknown:{soundId:null}}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"custom:foreign"}}).valid,false);
 assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"custom:mine"}},["custom:mine"]).valid,true);
});
test("the earlier custom ringtone migrates to the private selectable library without deleting audio",()=>{
 const user={id:"member-1",callRingtoneAssetId:"asset-1"},asset={id:"asset-1",ownerId:"member-1",slot:"ringtone",bucket:"minglora-ringtones",status:"attached",attachedTo:"account:call-ringtone",originalName:"My ringtone",mimeType:"audio/mpeg"};
 const r=normalizeSoundStudioPreferences(user,[asset]);assert.equal(r.settings.voiceCall.soundId,"custom:asset-1");assert.equal(r.settings.customSounds[0].title,"My ringtone");assert.equal(asset.status,"attached");
});
test("retired procedural WAV entries are not accepted as authentic built-in recordings",()=>{
 const manifestPath=new URL("../../public/assets/sound-studio/manifest.json",import.meta.url);
 if(fs.existsSync(manifestPath)){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  const all=[...(manifest.voiceRingtones||[]),...(manifest.videoRingtones||[]),...(manifest.notifications||[])];
  assert.ok(all.every(item=>item.acceptanceStatus==="approved"&&item.authenticRecording===true&&item.commercialUseAllowed===true&&item.redistributionAllowed===true));
 }
});

test("messenger and incoming call events share the category-aware Sound Studio path without duplicate generic playback",()=>{
 const app=fs.readFileSync(new URL("../../public/app.js",import.meta.url),"utf8");
 assert.match(app,/playMessengerMessageSound\(category\)/);
 assert.match(app,/playNotification\(category\)/);
 assert.match(app,/alreadyHandledByMessengerOrCall/);
 assert.match(app,/\['message','group_message','voice_message','call'\]/);
});
test("custom audio upload requires an explicit ownership or license confirmation",()=>{
 const client=fs.readFileSync(new URL("../../public/sound-studio-settings.js",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../../src/server.js",import.meta.url),"utf8");
 assert.match(client,/data-rights-confirmed/);
 assert.match(client,/rightsConfirmed:true/);
 assert.match(server,/input\.rightsConfirmed!==true/);
});
