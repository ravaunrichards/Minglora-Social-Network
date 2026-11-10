import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {SOUND_STUDIO_THEMES,SOUND_STUDIO_CATEGORIES,defaultSoundStudioPreferences,buildSoundThemePreset,validateSoundStudioPatch,normalizeSoundStudioPreferences} from "../../backend/modules/sounds/notification-studio.js";
test("defaults identify Minglora Signature and Vision and configure 22 categories",()=>{
 const d=defaultSoundStudioPreferences();assert.equal(d.voiceCall.soundId,"voice-01");assert.equal(d.videoCall.soundId,"video-01");assert.equal(SOUND_STUDIO_CATEGORIES.length,22);assert.equal(Object.keys(d.notifications).length,22);assert.equal(d.notifications.private_messages.soundId,"notification-01");assert.equal(d.notifications.system_notifications.soundId,"notification-02");assert.equal(SOUND_STUDIO_THEMES.map(x=>x.label).join(","),"Classic,Modern,Premium,Minimal,Digital,Cinematic");
});
test("theme presets assign matching sounds across both call libraries and all notification groups",()=>{
 const r=buildSoundThemePreset("cinematic",defaultSoundStudioPreferences());assert.equal(r.valid,true);assert.equal(r.settings.voiceCall.soundId,"voice-26");assert.equal(r.settings.videoCall.soundId,"video-26");assert.equal(r.settings.notifications.private_messages.soundId,"notification-51");assert.equal(r.settings.notifications.system_notifications.soundId,"notification-52");assert.equal(buildSoundThemePreset("unknown").valid,false);
});
test("validation blocks wrong sound types, unknown categories and unowned uploads",()=>{
 const d=defaultSoundStudioPreferences(),ok=validateSoundStudioPatch(d,{voiceCall:{soundId:"voice-03"},videoCall:{enabled:false},notifications:{private_messages:{soundId:"notification-60",enabled:false}},favorites:["voice-03","notification-60"]});
 assert.equal(ok.valid,true);assert.equal(ok.settings.notifications.private_messages.enabled,false);assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"video-01"}}).valid,false);assert.equal(validateSoundStudioPatch(d,{notifications:{unknown:{soundId:"notification-01"}}}).valid,false);assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"custom:foreign"}}).valid,false);assert.equal(validateSoundStudioPatch(d,{voiceCall:{soundId:"custom:mine"}},["custom:mine"]).valid,true);
});
test("the earlier custom ringtone migrates to the private selectable library without deleting audio",()=>{
 const user={id:"member-1",callRingtoneAssetId:"asset-1"},asset={id:"asset-1",ownerId:"member-1",slot:"ringtone",bucket:"minglora-ringtones",status:"attached",attachedTo:"account:call-ringtone",originalName:"My ringtone",mimeType:"audio/mpeg"};
 const r=normalizeSoundStudioPreferences(user,[asset]);assert.equal(r.settings.voiceCall.soundId,"custom:asset-1");assert.equal(r.settings.customSounds[0].title,"My ringtone");assert.equal(asset.status,"attached");
});
test("generated pack has 120 distinct actual WAV files with valid headers and verified hashes",()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL("../../public/assets/sound-studio/manifest.json",import.meta.url),"utf8"));assert.deepEqual(manifest.counts,{voiceRingtones:30,videoRingtones:30,notifications:60,total:120});
 const all=[...manifest.voiceRingtones,...manifest.videoRingtones,...manifest.notifications];assert.equal(new Set(all.map(x=>x.id)).size,120);assert.equal(new Set(all.map(x=>x.sha256)).size,120);
 for(const item of all){const b=fs.readFileSync(new URL("../../public/assets/sound-studio/"+item.filename,import.meta.url));assert.equal(b.toString("ascii",0,4),"RIFF");assert.equal(b.toString("ascii",8,12),"WAVE");assert.equal(b.toString("ascii",36,40),"data");assert.equal(crypto.createHash("sha256").update(b).digest("hex"),item.sha256);assert.ok(item.durationMs>=500);assert.equal(item.license,"Minglora original procedural composition");}
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
