import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Minglora Sounds upload gateway accepts only supported audio in the private Sounds bucket", async () => {
  const [server, edge, migration] = await Promise.all([
    read("../../src/server.js"),
    read("../../supabase/functions/minglora-runtime-state/index.ts"),
    read("../../supabase/migrations/20261104210000_minglora_sounds_studio_storage.sql")
  ]);
  assert.match(server, /sound:SOUND_AUDIO_MIME_TYPES/);
  assert.match(server, /sound:50\*1024\*1024/);
  assert.match(edge, /slot==="sound"\?"minglora-sounds"/);
  assert.match(edge, /"minglora-sounds":\["audio\/mpeg","audio\/mp4","audio\/ogg","audio\/webm","audio\/wav","audio\/x-wav","audio\/flac","audio\/aac"\]/);
  assert.match(edge, /"sound"/);
  assert.match(migration, /'minglora-sounds','minglora-sounds',false,52428800/);
});

test("Minglora Sounds storage policies are owner-folder scoped", async () => {
  const migration = await read("../../supabase/migrations/20261104210500_minglora_sounds_storage_owner_policies.sql");
  for (const operation of ["INSERT","SELECT","UPDATE","DELETE"]) assert.ok(migration.includes("FOR "+operation));
  assert.equal((migration.match(/CREATE POLICY "minglora-sounds_/g)||[]).length,4);
  assert.match(migration, /storage\.foldername\(name\).*auth\.uid\(\)/s);
});

test("sound APIs enforce ownership, rights and reusable-sound access", async () => {
  const server = await read("../../src/server.js");
  assert.match(server, /if\(method==='GET'&&p==='\/api\/sounds'\)/);
  assert.match(server, /if\(method==='POST'&&p==='\/api\/sounds'\)/);
  assert.match(server, /validateSoundInput\(input\)/);
  assert.match(server, /item\.ownerId===user\.id&&item\.slot==='sound'/);
  assert.match(server, /soundFavorite=p\.match\(\/\^/);
  assert.match(server, /soundRoute=p\.match\(\/\^/);
  assert.match(server, /canUseSound\(sound,user\.id\)/);
});

test("photo and video posts plus Stories save and return editable soundtrack metadata", async () => {
  const [server, app] = await Promise.all([
    read("../../src/server.js"),
    read("../../public/app.js")
  ]);
  assert.match(server, /soundtrack:await publicSoundtrack\(p\.soundtrack,viewerId\)/);
  assert.match(server, /soundtrack:await publicSoundtrack\(story\.soundtrack,viewerId\)/);
  assert.match(server, /resolveSoundtrackForUser\(user\.id,input\.soundtrack\)/);
  assert.match(app, /function createSoundtrackEditor\(/);
  assert.match(app, /data-track-start/);
  assert.match(app, /data-track-end/);
  assert.match(app, /data-track-volume/);
  assert.match(app, /data-track-fade-in/);
  assert.match(app, /data-track-fade-out/);
  assert.match(app, /soundtrack:soundtrack\.value\(\)/);
  assert.match(app, /function bindSoundtrackPlayback\(/);
});

test("members can publish original sounds by file upload or microphone recording", async () => {
  const app = await read("../../public/app.js");
  assert.match(app, /function openOriginalSoundComposer\(/);
  assert.match(app, /function openDeviceAudioCapture\(/);
  assert.match(app, /getUserMedia\(\{audio:/);
  assert.match(app, /rightsConfirmed/);
  assert.match(app, /allowReuse/);
  assert.match(app, /function openSoundLibrary\(/);
  assert.match(app, /data-sound-sort="trending"/);
  assert.match(app, /data-sound-sort="saved"/);
});
