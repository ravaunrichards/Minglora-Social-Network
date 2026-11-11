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
  assert.ok(html.includes('minglora-menu.css?v=20261110-facebook-profile-dropdown-1'));
  assert.ok(html.includes('minglora-menu.js?v=20261110-facebook-profile-dropdown-1'));
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

test('Search Menu is in the left Menu column above all shortcut sections', () => {
  const script = read('public/minglora-menu.js');
  const css = read('public/minglora-menu.css');
  const html = read('public/index.html');
  const searchAt = script.indexOf('class="minglora-menu-search"');
  const resultsAt = script.indexOf('id="minglora-menu-results"');
  const socialAt = script.indexOf("sections.map(sectionMarkup).join('')");
  const createAt = script.indexOf('minglora-menu-create-column');
  assert.ok(searchAt >= 0 && resultsAt > searchAt && socialAt > resultsAt);
  assert.ok(createAt > socialAt, 'Search Menu is in the left column, not Create column');
  assert.ok(script.includes('placeholder="Search menu"'));
  assert.ok(script.includes('aria-label="Search menu"'));
  assert.ok(script.includes('aria-controls="minglora-menu-results"'));
  assert.ok(css.includes('.minglora-menu-search-field'));
  assert.ok(css.includes('.minglora-menu-search input'));
  assert.ok(html.includes('minglora-menu.js?v=20261110-facebook-profile-dropdown-1'));
  assert.ok(html.includes('minglora-menu.css?v=20261110-facebook-profile-dropdown-1'));
  assert.ok(!html.includes('id="search-form"'));
  assert.ok(!html.includes('id="search-input"'));
});

test('Search Menu filters shortcuts and headings, reports no matches, and resets on Escape or close', () => {
  const script = read('public/minglora-menu.js');
  assert.ok(script.includes("searchInput.addEventListener('input'"));
  assert.ok(script.includes('function filterMenuItems(value)'));
  assert.ok(script.includes('normalizeMenuSearch(item.textContent).includes(term)'));
  assert.ok(script.includes('heading.includes(term)'));
  assert.ok(script.includes('item.hidden = !matches'));
  assert.ok(script.includes('section.hidden = visibleInSection === 0'));
  assert.ok(script.includes('No menu results for'));
  assert.ok(script.includes('role="status" aria-live="polite" hidden'));
  assert.ok(script.includes("event.key === 'Escape' && searchInput.value"));
  assert.ok(script.includes("event.key === 'ArrowDown'"));
  assert.ok(script.includes("searchInput.value = '';"));
  assert.ok(script.includes("filterMenuItems('')"));
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
  assert.ok(css.includes('width:min(680px,calc(100vw - 32px))'));
  assert.ok(css.includes('height:min(720px,calc(100dvh - 84px))'));
  assert.ok(css.includes('@media(min-width:761px) and (max-width:1024px)'));
  assert.ok(css.includes('width:min(640px,calc(100vw - 24px))'));
  const mobileCss = css.slice(css.indexOf('@media(max-width:760px)'));
  assert.ok(mobileCss.includes('width:100vw;'));
  assert.ok(mobileCss.includes('height:100dvh;'));
  assert.ok(safety.includes('width:min(360px,calc(100vw - 24px))!important'));
  assert.ok(safety.includes('width:min(378px,calc(100vw - 24px))!important'));
  assert.ok(safety.includes('max-width:min(360px,calc(100vw - 24px))!important'));
});

test('Main Menu delegates scroll-safe outside dismissal to the shared menu controller', () => {
  const script = read('public/minglora-menu.js');
  const safety = read('public/layout-safety.css');
  assert.ok(script.includes('window.MingloraMenuDismissal.bindOutsideDismissal'));
  assert.ok(script.includes('roots: () => [panel, trigger]'));
  assert.ok(script.includes('isOpen: () => !panel.hidden'));
  assert.ok(script.includes("event.key === 'Escape'"));
  assert.ok(script.includes("document.documentElement.classList.add('minglora-menu-open')"));
  assert.ok(safety.includes('html.minglora-menu-open,'));
  assert.ok(safety.includes('body.minglora-menu-open'));
});

test('Palette and profile/account menus use the same scroll-safe outside dismissal controller', () => {
  const app = read('public/app.js');
  const helper = read('public/menu-dismissal.js');
  const html = read('public/index.html');
  const worker = read('public/sw.js');
  assert.ok(app.includes("roots:()=>[$('.palette-menu-anchor')]"));
  assert.ok(app.includes("roots:()=>[anchor,$('#profile-account-menu')]"));
  assert.ok(app.includes('window.MingloraMenuDismissal.bindOutsideDismissal'));
  assert.ok(helper.includes('const onPointerDown = event =>'));
  assert.ok(helper.includes('event.detail === 0'));
  assert.ok(html.indexOf('menu-dismissal.js') < html.indexOf('app.js'));
  assert.ok(html.includes('menu-dismissal.js?v=20261110-menu-dismissal-1'));
  assert.ok(html.includes('app.js?v=20261111-profile-verification-only-1'));
  assert.ok(html.includes('minglora-menu.js?v=20261110-facebook-profile-dropdown-1'));
  assert.ok(worker.includes('minglora-shell-v275-self-updating-1'));
  assert.ok(worker.includes('/menu-dismissal.js?v=20261110-menu-dismissal-1'));
});
