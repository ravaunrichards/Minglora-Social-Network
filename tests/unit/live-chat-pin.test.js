import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const styles = read('public/styles.css');

test('Only the host sees pin and unpin controls on LIVE comments', () => {
  assert.match(app, /activeLiveRole==="host"/);
  assert.match(app, /data-live-chat-pin=/);
  assert.match(app, /if\(!button\|\|role!=="host"\)return/);
});

test('Pinned comments are broadcast as reliable room data and accepted only from the host identity', () => {
  assert.match(app, /participant\.identity===session\.hostId/);
  assert.match(app, /topic==="minglora-live-pin"/);
  assert.match(app, /type:"minglora\.live\.pin"/);
  assert.match(app, /publishData\(new TextEncoder\(\)\.encode\(JSON\.stringify\(packet\)\),\{reliable:true,topic:"minglora-live-pin"\}\)/);
});

test('Pinned comment content is inserted as text, not interpreted as HTML, and can be unpinned', () => {
  assert.match(app, /body\.textContent=activeLivePinnedComment\.body/);
  assert.match(app, /author\.textContent=activeLivePinnedComment\.author/);
  assert.match(app, /packet\.action==="unpin"/);
  assert.match(app, /renderLivePinnedComment\(null\)/);
});

test('The pinned comment overlay and host pin buttons have responsive styling', () => {
  assert.match(styles, /\.live-pinned-comment/);
  assert.match(styles, /\.live-chat-pin/);
  assert.match(styles, /@media\(max-width:520px\)/);
});
