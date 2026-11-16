import test from "node:test";
import assert from "node:assert/strict";
import {
  SOUND_AUDIO_MIME_TYPES, validateSoundInput, normalizeSoundtrackInput,
  canUseSound, soundUsageCounts, normalizeSoundCollections
} from "../../backend/modules/sounds/service.js";

test("Minglora Sounds accepts only creator-confirmed original recordings", () => {
  assert.ok(SOUND_AUDIO_MIME_TYPES.includes("audio/mpeg"));
  assert.ok(SOUND_AUDIO_MIME_TYPES.includes("audio/flac"));
  assert.equal(validateSoundInput({title:"",rightsConfirmed:true}).valid, false);
  assert.equal(validateSoundInput({title:"Island Morning",rightsConfirmed:false}).valid, false);
  const created = validateSoundInput({
    title:"Island Morning", attribution:"Recorded by me",
    rightsConfirmed:true, allowReuse:true, durationMs:120000
  });
  assert.equal(created.valid, true);
  assert.equal(created.value.allowReuse, true);
});

test("soundtracks validate trim, volume and fade settings", () => {
  assert.equal(normalizeSoundtrackInput(null).valid, true);
  const valid = normalizeSoundtrackInput({
    soundId:"sound-1",startMs:5000,endMs:35000,volume:0.7,fadeInMs:2000,fadeOutMs:3000
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.volume, 0.7);
  assert.equal(normalizeSoundtrackInput({soundId:"sound-1",startMs:4000,endMs:3000}).valid, false);
  assert.equal(normalizeSoundtrackInput({soundId:"sound-1",volume:1.1}).valid, false);
  assert.equal(normalizeSoundtrackInput({soundId:"sound-1",startMs:1000,endMs:3000,fadeInMs:2000,fadeOutMs:2000}).valid, false);
});

test("original sounds are reusable only when their creator permits it", () => {
  const privateSound = {id:"private",ownerId:"owner-1",allowReuse:false,status:"active"};
  const publicSound = {id:"public",ownerId:"owner-1",allowReuse:true,status:"active"};
  assert.equal(canUseSound(privateSound,"owner-1"), true);
  assert.equal(canUseSound(privateSound,"other"), false);
  assert.equal(canUseSound(publicSound,"other"), true);
  assert.equal(canUseSound({...publicSound,status:"archived"},"other"), false);
});

test("sound usage counts include post and story soundtrack references", () => {
  const counts = soundUsageCounts({
    posts:[{soundtrack:{soundId:"s1"}},{soundtrack:{soundId:"s1"}}],
    stories:[{soundtrack:{soundId:"s1"}},{soundtrack:{soundId:"s2"}}]
  });
  assert.equal(counts.get("s1"),3);
  assert.equal(counts.get("s2"),1);
});

test("sound and favorite state is normalized without creating sample sounds", () => {
  const db = {sounds:[
    {id:"s1",ownerId:"u1",assetId:"a1"},
    {id:"s1",ownerId:"u1",assetId:"a1"},
    {id:"invalid",ownerId:"u1"}
  ],soundFavorites:[
    {userId:"u1",soundId:"s1"},
    {userId:"u1",soundId:"s1"}
  ]};
  normalizeSoundCollections(db);
  assert.equal(db.sounds.length,1);
  assert.equal(db.soundFavorites.length,1);
  assert.equal(normalizeSoundCollections({}).sounds.length,0);
});
