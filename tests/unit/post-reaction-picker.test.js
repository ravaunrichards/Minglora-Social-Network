import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('post composer renders all seven accessible social reactions', async () => {
  const app = await read('../../public/app.js');
  for (const reaction of ['like','love','care','haha','wow','sad','angry']) {
    assert.ok(app.includes('data-reaction-choice="'+reaction+'"'), 'missing '+reaction+' choice');
  }
  assert.match(app, /data-reaction-picker=/);
  assert.match(app, /aria-expanded="false"/);
  assert.match(app, /data-current-reaction=/);
});

test('reaction picker submits the selected reaction to the existing persisted API', async () => {
  const app = await read('../../public/app.js');
  const server = await read('../../src/server.js');
  assert.match(app, /data-reaction-choice/);
  assert.match(app, /JSON\.stringify\(\{reaction\}\)/);
  assert.match(app, /currentReaction\|\|'like'/);
  assert.match(server, /\['like','love','care','haha','wow','sad','angry'\]/);
  assert.match(server, /const previousReaction=post\.reactions\[user\.id\]\|\|null/);
  assert.match(server, /if\(previousReaction===reaction\)delete post\.reactions\[user\.id\];else post\.reactions\[user\.id\]=reaction/);
});

test('reaction picker has mobile-sized controls and visible keyboard focus', async () => {
  const styles = await read('../../public/styles.css');
  assert.match(styles, /\.post-reaction-picker/);
  assert.match(styles, /\.post-reaction-picker button:focus-visible/);
  assert.match(styles, /@media\(max-width:520px\)/);
});
