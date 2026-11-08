import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Minglora exposes a searchable Facebook-style Menu beside Messenger', () => {
  const html = read('public/index.html');
  const script = read('public/minglora-menu.js');
  const css = read('public/minglora-menu.css');
  assert.ok(html.includes('id="messenger-btn"'));
  assert.ok(html.includes('id="minglora-menu-toggle"'));
  assert.ok(html.includes('id="minglora-menu-panel"'));
  assert.ok(html.includes('minglora-menu.css?v=20261108-facebook-menu-1'));
  assert.ok(html.includes('minglora-menu.js?v=20261108-facebook-menu-1'));
  for (const label of ['Social','Entertainment','Shopping','Personal','Professional','More from Meta','Search Menu','Create']) {
    assert.ok(script.includes(label), 'Menu contains ' + label);
  }
  for (const label of ['Events','Friends','Groups','News Feed','Feeds','Pages','Reels','Gaming Video','Play Games','Order and Payments','Marketplace','Your Ad Activity','Memories','Saved','Ads Manager','Creator Dashboard','Post','Story','Reel','Life Update','Note','Ad','Group','Event']) {
    assert.ok(script.includes(label), 'Menu includes ' + label);
  }
  assert.ok(script.includes("window.MingloraActivateView"));
  assert.ok(script.includes("window.MingloraSettings"));
});

test('Menu uses an independent scroll column, a stationary Create panel and responsive mobile sizing', () => {
  const css = read('public/minglora-menu.css');
  assert.match(css, /\.minglora-menu-main-scroll\s*\{[^}]*overflow-y:auto/s);
  assert.match(css, /\.minglora-menu-create-card\s*\{[^}]*position:sticky/s);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /writing-mode:horizontal-tb!important/);
  assert.match(css, /word-break:normal!important/);
  assert.match(css, /\.account-switcher-actions/);
});
