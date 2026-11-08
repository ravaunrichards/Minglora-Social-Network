import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora Video Centre discovers only real video attachments from the authenticated feed', async () => {
  const [app, html, styles] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/index.html'),
    read('../../public/styles.css')
  ]);

  assert.match(app, /videoFeed:\[\]/);
  assert.match(app, /state\.videoFeed=\(result\.posts\|\|\[\]\)\.filter\(post=>\(post\.media\|\|\[\]\)\.some\(media=>media\.mediaType==='video'\)\)/);
  assert.match(app, /api\('\/feed\?scope='/);
  assert.match(app, /view:'videos'/);
  assert.match(app, /state\.view==='videos'/);
  assert.match(app, /function renderVideoCentre\(\)/);
  assert.match(app, /function findVisiblePost\(id\)[\s\S]*state\.videoFeed/);
  assert.match(app, /video-create-button/);
  assert.match(app, /data-video-search|video-search/);
  assert.match(html, /video-centre-foundation-1/);
  assert.match(styles, /\.video-centre-feed/);
  assert.doesNotMatch(app, /seeded video|sample video|fake video/i);
});
