import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {SOUND_STUDIO_THEMES,SOUND_NOTIFICATION_CATEGORIES,DEFAULT_SOUND_STUDIO_PREFERENCES,validateSoundStudioPreferences,normalizeSoundStudioPreferences,isWithinDoNotDisturb,countSoundCatalogue} from "../../backend/modules/sound-studio/service.js";
const manifest=JSON.parse(await readFile(new URL("../../public/sound-studio-catalog.json",import.meta.url),"utf8"));
test("the built-in catalogue has 30 voice, 30 video and 60 notification sounds",()=>{
 assert.deepEqual(countSoundCatalogue(manifest.sounds),{voice:30,video:30,notification:60,total:120});
 assert.equal(new Set(manifest.sounds.map(x=>x.id)).size,120);
 assert.equal(new Set(manifest.sounds.map(x=>x.title)).size,120);
 assert.ok(manifest.sounds.every(x=>x.durationMs>0&&x.audioBank.endsWith(".wav")));
});
test("the six sound themes and requested call defaults are present",()=>{
 assert.deepEqual([...SOUND_STUDIO_THEMES],["Classic","Modern","Premium","Minimal","Digital","Cinematic"]);
 assert.equal(manifest.sounds.find(x=>x.id==="voice-01").title,"Minglora Signature");
 assert.equal(manifest.sounds.find(x=>x.id==="video-01").title,"Minglora Vision");
 assert.equal(DEFAULT_SOUND_STUDIO_PREFERENCES.voiceRingtoneId,"voice-01");
 assert.equal(DEFAULT_SOUND_STUDIO_PREFERENCES.videoRingtoneId,"video-01");
});
test("22 notification categories receive independent unique default sound assignments",()=>{
 assert.equal(SOUND_NOTIFICATION_CATEGORIES.length,22);
 const ids=SOUND_NOTIFICATION_CATEGORIES.map(x=>DEFAULT_SOUND_STUDIO_PREFERENCES.notificationSounds[x.id]);
 assert.equal(new Set(ids).size,22);
 assert.ok(ids.every(id=>manifest.sounds.some(x=>x.id===id&&x.type==="notification")));
});
test("preferences validate IDs, switches, independent volumes and custom ownership",()=>{
 const normalized=normalizeSoundStudioPreferences({ringtoneVolume:35,notificationVolume:55},{});
 assert.equal(normalized.ringtoneVolume,35);assert.equal(normalized.notificationVolume,55);
 assert.equal(normalized.voiceRingtoneId,"voice-01");assert.equal(normalized.notificationEnabled.new_followers,true);
 assert.equal(validateSoundStudioPreferences({voiceRingtoneId:"video-01"},{}).valid,true);
 assert.equal(validateSoundStudioPreferences({voiceRingtoneId:"not-real"},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({notificationSounds:{private_messages:"voice-01"}},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({notificationEnabled:{private_messages:"yes"}},{}).valid,false);
 const previous={customSounds:[{id:"custom:asset-1",assetId:"asset-1"}]};
 assert.equal(validateSoundStudioPreferences({voiceRingtoneId:"custom:asset-1"},previous).valid,true);
 assert.equal(validateSoundStudioPreferences({voiceRingtoneId:"custom:other"},previous).valid,false);
});
test("volume, vibration, favourites and DND reject invalid values",()=>{
 assert.equal(validateSoundStudioPreferences({ringtoneVolume:101},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({notificationVolume:-1},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({vibrationPattern:"jackhammer"},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({doNotDisturb:{startTime:"25:00"}},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({doNotDisturb:{days:["funday"]}},{}).valid,false);
 assert.equal(validateSoundStudioPreferences({favoriteIds:["unknown"]},{}).valid,false);
});
test("Do Not Disturb handles same-day and overnight schedules",()=>{
 const day={enabled:true,startTime:"09:00",endTime:"17:00",days:["tue"]};
 assert.equal(isWithinDoNotDisturb(day,new Date("2026-11-10T10:00:00")),true);
 assert.equal(isWithinDoNotDisturb(day,new Date("2026-11-10T18:00:00")),false);
 const night={enabled:true,startTime:"22:00",endTime:"07:00",days:["tue"]};
 assert.equal(isWithinDoNotDisturb(night,new Date("2026-11-10T23:00:00")),true);
 assert.equal(isWithinDoNotDisturb(night,new Date("2026-11-10T06:30:00")),true);
 assert.equal(isWithinDoNotDisturb({...night,days:["wed"]},new Date("2026-11-10T23:00:00")),false);
});
