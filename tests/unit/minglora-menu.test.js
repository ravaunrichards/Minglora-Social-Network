import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Minglora Menu beside Messenger has a clean single-row header', () => {
  const html = read('public/index.html');
  const script = read('public/minglora-menu.js');
  const css = read('public/minglora-menu.css');
  assert.ok(html.includes('id="messenger-btn"'));
  assert.ok(html.includes('id="minglora-menu-toggle"'));
  assert.ok(html.includes('id="minglora-menu-panel"'));
  assert.ok(html.includes('minglora-menu.css?v=20261110-facebook-menu-size-scroll-2'));
  assert.ok(html.includes('minglora-menu.js?v=20261110-facebook-menu-size-scroll-2'));
  for (const label of ['Social','Entertainment','Shopping','Personal','Professional','More from Meta','Create']) {
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

test('Menu permanently omits the Search Menu field, icon and filtering', () => {
  const html = read('public/index.html');
  const script = read('public/minglora-menu.js');
  const css = read('public/minglora-menu.css');
  const app = read('public/app.js');
  assert.ok(!html.includes('id="search-form"'), 'external top-bar Search stays removed');
  assert.ok(!html.includes('id="search-input"'), 'external top-bar Search input stays removed');
  assert.ok(script.includes('<h2>Menu</h2>'));
  assert.ok(!script.includes('minglora-menu-search'));
  assert.ok(!script.includes('Search menu'));
  assert.ok(!script.includes("sprite('search')"));
  assert.ok(!script.includes('filterMenu'));
  assert.ok(!css.includes('minglora-menu-search'));
  assert.ok(app.includes("$('#search-form')?.addEventListener"), 'Removed external form must not break app startup');
  assert.match(css, /\.minglora-menu-header\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 40px/s);
});


test('Create options have their own scroll area on desktop and remain in normal mobile page flow', () => {
  const css = read('public/minglora-menu.css');
  assert.match(css, /\.minglora-menu-create-list\s*\{[^}]*max-height:min\(520px,calc\(100dvh - 290px\)\)[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/s);
  assert.match(css, /\.minglora-menu-create-card\s*\{[^}]*position:sticky/s);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.minglora-menu-create-list\s*\{[^}]*max-height:none[^}]*overflow:visible/s);
});


test('Main Menu uses Facebook-sized viewport bounds on desktop, tablet and phones', () => {
  const css = read('public/minglora-menu.css');
  const safety = read('public/layout-safety.css');
  assert.match(css, /width:min\\(680px,calc\\(100vw - 32px\\)\\)/);
  assert.match(css, /height:min\\(720px,calc\\(100dvh - 84px\\)\\)/);
  assert.match(css, /@media\\(min-width:761px\\) and \\(max-width:1024px\\)/);
  assert.match(css, /width:min\\(640px,calc\\(100vw - 24px\\)\\)/);
  assert.match(css, /@media\\(max-width:760px\\)[\\s\\S]*width:100vw[\\s\\S]*height:100dvh/);
  assert.match(safety, /max-width:min\\(360px,calc\\(100vw - 24px\\)\\)!important/);
});

test('Scrolling does not dismiss the Menu; outside clicks and Escape still close it', () => {
  const script = read('public/minglora-menu.js');
  const safety = read('public/layout-safety.css');
  assert.match(script, /document\\.addEventListener\\('click'/);
  assert.doesNotMatch(script, /document\\.addEventListener\\('pointerdown'/);
  assert.match(script, /event\\.key === 'Escape'/);
  assert.match(script, /document\\.documentElement\\.classList\\.add\\('minglora-menu-open'\\)/);
  assert.match(safety, /html\\.minglora-menu-open,[\\s\\S]*body\\.minglora-menu-open/);
});
