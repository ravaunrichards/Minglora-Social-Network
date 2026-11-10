import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_SOUND_STUDIO_SETTINGS, SOUND_STUDIO_CATEGORIES, SOUND_STUDIO_THEMES,
  normalizeSoundStudioSettings, validateSoundStudioSettings
} from "../../backend/modules/sounds/studio.js";

test("catalogue has 30 voice, 30 video and 60 notification sounds",async()=>{
  const catalog=JSON.parse(await readFile(new URL("../../public/sounds/catalog.json",import.meta.url),"utf8"));
  assert.equal(catalog.sounds.filter(item=>item.type==="voice").length,30);
  assert.equal(catalog.sounds.filter(item=>item.type==="video").length,30);
  assert.equal(catalog.sounds.filter(item=>item.type==="notification").length,60);
  assert.equal(new Set(catalog.sounds.map(item=>item.id)).size,120);
  assert.equal(catalog.categories.length,22);
  assert.equal(catalog.sounds[0].name,"Minglora Signature");
  assert.equal(catalog.sounds.find(item=>item.id==="video-01").name,"Minglora Vision");
  assert.ok(catalog.sounds.every(item=>SOUND_STUDIO_THEMES.includes(item.style)));
  const audio=await readFile(new URL("../../public/sounds/minglora-sound-studio.ogg",import.meta.url));
  assert.equal(audio.subarray(0,4).toString("ascii"),"OggS");
  assert.ok(audio.length>20000);
});

test("default calls and 22 notification categories use separate sound IDs",()=>{
  assert.equal(DEFAULT_SOUND_STUDIO_SETTINGS.voiceRingtoneId,"voice-01");
  assert.equal(DEFAULT_SOUND_STUDIO_SETTINGS.videoRingtoneId,"video-01");
  assert.notEqual(DEFAULT_SOUND_STUDIO_SETTINGS.voiceRingtoneId,DEFAULT_SOUND_STUDIO_SETTINGS.videoRingtoneId);
  assert.equal(SOUND_STUDIO_CATEGORIES.length,22);
  assert.equal(Object.keys(DEFAULT_SOUND_STUDIO_SETTINGS.notifications).length,22);
});

test("sound settings validate sound groups, volume, vibration and schedule",()=>{
  assert.equal(validateSoundStudioSettings(DEFAULT_SOUND_STUDIO_SETTINGS).valid,true);
  assert.equal(validateSoundStudioSettings({...DEFAULT_SOUND_STUDIO_SETTINGS,voiceRingtoneId:"video-01"}).valid,false);
  assert.equal(validateSoundStudioSettings({...DEFAULT_SOUND_STUDIO_SETTINGS,notificationVolume:101}).valid,false);
  assert.equal(validateSoundStudioSettings({...DEFAULT_SOUND_STUDIO_SETTINGS,theme:"not-a-theme"}).valid,false);
  assert.equal(validateSoundStudioSettings({...DEFAULT_SOUND_STUDIO_SETTINGS,doNotDisturb:{enabled:true,start:"29:10",end:"08:00",days:[1]}}).valid,false);
});

test("custom sounds are accepted only when owned by the current account",()=>{
  const owned=new Set(["custom:asset-a"]);
  const assigned={...DEFAULT_SOUND_STUDIO_SETTINGS,voiceRingtoneId:"custom:asset-a",videoRingtoneId:"custom:asset-a"};
  assert.equal(validateSoundStudioSettings(assigned,DEFAULT_SOUND_STUDIO_SETTINGS,owned).valid,true);
  assert.equal(validateSoundStudioSettings({...assigned,voiceRingtoneId:"custom:asset-b"},DEFAULT_SOUND_STUDIO_SETTINGS,owned).valid,false);
});

test("normalization repairs invalid values without inventing catalogue IDs",()=>{
  const value=normalizeSoundStudioSettings({theme:"broken",voiceRingtoneId:"unknown",notifications:{privateMessages:"unknown"}});
  assert.equal(value.theme,"Classic");
  assert.equal(value.voiceRingtoneId,"voice-01");
  assert.equal(value.notifications.privateMessages,"notification-01");
});
