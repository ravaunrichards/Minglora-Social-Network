import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora group and Page uploads use their dedicated Storage buckets', async () => {
  const [app, server, edge] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts')
  ]);

  assert.match(app, /createMediaPicker\(\$\('#group-post-media-picker'\),\{slot:'group'/);
  assert.match(app, /createMediaPicker\(\$\('#page-post-media-picker'\),\{slot:'page'/);
  assert.match(server, /group:\['image\/jpeg','image\/png','image\/webp','video\/mp4'\]/);
  assert.match(server, /page:\['image\/jpeg','image\/png','image\/webp','video\/mp4'\]/);
  assert.match(edge, /slot==="group"\?"minglora-group-media"/);
  assert.match(edge, /slot==="page"\?"minglora-page-media"/);
  assert.match(edge, /\"minglora-group-media\":\[\"image\/jpeg\",\"image\/png\",\"image\/webp\",\"video\/mp4\"\]/);
  assert.match(edge, /\"minglora-page-media\":\[\"image\/jpeg\",\"image\/png\",\"image\/webp\",\"video\/mp4\"\]/);
});

test('Minglora voice-note and Stories MIME restrictions match all layers', async () => {
  const [app, server, edge, voiceMigration, storyMigration] = await Promise.all([
    read('../../public/app.js'),
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts'),
    read('../../database/migrations/026_minglora_message_voice_note_storage.sql'),
    read('../../database/migrations/027_minglora_story_avif_storage.sql')
  ]);

  assert.match(app, /audio\/webm/);
  assert.match(server, /'audio\/webm':'audio'/);
  assert.match(edge, /\"audio\/webm\":\"webm\"/);
  assert.match(edge, /\"minglora-message-attachments\"[^\n]*\"audio\/webm\"/);
  assert.match(voiceMigration, /ARRAY\['audio\/webm'\]/);
  assert.match(storyMigration, /ARRAY\['image\/avif'\]/);
  assert.match(edge, /\"minglora-stories\"[^\n]*\"image\/avif\"/);
});
