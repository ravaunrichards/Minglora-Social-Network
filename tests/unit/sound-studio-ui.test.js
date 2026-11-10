import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("Sound Studio exposes separate voice/video selectors and independent notification assignments",async()=>{
 const source=await read("../../public/settings.js");
 for(const token of ["id=\"settings-sound-studio\"","name=\"voiceRingtoneId\"","name=\"videoRingtoneId\"","notificationSound_privateMessages","notificationSound_groupMessages","soundRingtoneVolume","soundNotificationVolume","soundVibrationPattern","soundDndEnabled","sound-studio-custom-file","data-sound-preview"])assert.ok(source.includes(token),token);
});
test("Sound Studio sends all per-category assignments and account preferences to the settings API",async()=>{
 const source=await read("../../public/settings.js");
 assert.match(source,/soundStudio:\s*collectSoundStudioPayload\(formData\)/);
 assert.match(source,/notifications:Object\.fromEntries\(SOUND_STUDIO_CATEGORIES/);
 assert.match(source,/favorites:\[\.\.\.document\.querySelectorAll/);
});
test("custom sound upload requires an explicit rights declaration and private upload slot",async()=>{
 const source=await read("../../public/settings.js");
 assert.match(source,/sound-studio-rights/);
 assert.match(source,/window\.uploadMediaFile\('sound'/);
 assert.match(source,/api\('\/sound-studio\/custom'/);
});
