import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

const [app, css, html, worker] = await Promise.all([
  read('public/app.js'),
  read('public/styles.css'),
  read('public/index.html'),
  read('public/sw.js')
]);

test('global navigation and Creator Studio tabs remain anchored while the page scrolls', () => {
  assert.match(css, /\.topbar\{position:sticky!important;top:0!important;z-index:100!important/);
  assert.match(css, /\.left-rail,\.right-rail\{position:sticky/);
  assert.match(css, /\.mobile-nav\{position:fixed!important/);
  assert.match(css, /\.profile-tabs\{\s*position:sticky/);
  assert.match(css, /\.settings-nav\{position:sticky/);
  assert.ok(css.includes('.creator-studio-nav-slot>.creator-studio-nav.live-format-picker{'));
  assert.ok(css.includes('position:fixed!important;'));
  assert.ok(css.includes('top:var(--creator-studio-nav-top,66px)!important;'));
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.creator-studio-nav\.live-format-picker\{\s*top:66px;z-index:70;display:flex!important/);
  assert.match(css, /overflow-x:auto;overflow-y:hidden;scrollbar-width:thin/);
});

test('Creator Studio dock stays fixed below the app header from initial render', () => {
  const chromeStart = app.indexOf('function creatorStudioChrome(section,content)');
  const chromeEnd = app.indexOf('function creatorStageSvgMarkup()', chromeStart);
  const chrome = app.slice(chromeStart, chromeEnd);
  assert.ok(chrome.indexOf("creator-studio-nav-slot") < chrome.indexOf("creator-studio-heading"), 'the dock renders before the page heading');
  assert.match(app, /function syncCreatorStudioNavigationLayout\(\)/);
  assert.match(app, /slot\.style\.height=\(height\+14\)\+"px"/);
  assert.match(app, /setProperty\("--creator-studio-nav-top"/);
  assert.match(app, /setProperty\("--creator-studio-nav-left"/);
  assert.match(app, /setProperty\("--creator-studio-nav-width"/);
  assert.match(app, /addEventListener\("resize",syncCreatorStudioNavigationLayout/);
});
 
test('Creator Studio keeps a 3D workstation visible without WebGL and after context loss', () => {
  assert.match(app, /function creatorStageSvgMarkup\(\)/);
  assert.match(app, /<svg id="creator-stage-svg-fallback"/);
  assert.match(app, /id="creator-stage-svg-world"/);
  assert.match(app, /canvas\.getContext\("webgl"/);
  assert.match(app, /if\(!gl\)\{showCompatibilityScene/);
  assert.match(app, /showCompatibilityScene\(error\.message/);
  assert.match(app, /webglcontextlost/);
  assert.match(app, /The WebGL renderer stopped unexpectedly/);
  assert.doesNotMatch(app, /WebGL is unavailable in this browser/);
  assert.match(css, /\.creator-stage-svg-fallback\[hidden\]\{display:none!important\}/);
  assert.match(css, /#creator-stage-canvas\[hidden\]/);
});

test('every Creator Studio section and action has a navigation or event binding', () => {
  const sections = ['overview','content','publish','audience','analytics','pages','monetization','settings'];
  const chromeStart = app.indexOf('function creatorStudioChrome(section,content)');
  const chromeEnd = app.indexOf('function creatorOverviewMarkup()', chromeStart);
  const chrome = app.slice(chromeStart, chromeEnd);
  for (const section of sections) assert.ok(chrome.includes('["' + section + '"'), 'missing Studio section ' + section);
  assert.match(app, /querySelectorAll\("\[data-creator-section\]"\)/);
  for (const action of [
    'data-creator-open-live','data-creator-start-live','data-creator-edit-profile',
    'data-creator-content-tab','data-creator-edit-post','data-creator-delete-post',
    'data-creator-view-profile','data-creator-page-form','data-creator-delete-page-post',
    'data-creator-delete-page'
  ]) assert.ok(app.includes('[' + action + ']'), 'missing handler for ' + action);
  assert.match(app, /data-creator-start-live='video_audio'/);
  assert.match(app, /data-creator-start-live='audio_only'/);
});

test('global navigation destinations all resolve to an application view and Home remains reachable', () => {
  const views = [...new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]))];
  const renderStart = app.indexOf('async function renderView()');
  const renderEnd = app.indexOf('function bindNavigation()', renderStart);
  const renderView = app.slice(renderStart, renderEnd);
  for (const view of views) assert.ok(renderView.includes("state.view==='" + view + "'"), 'no route for ' + view);
  assert.match(app, /document\.querySelectorAll\('\[data-view\]'\)/);
  assert.match(app, /\$\('#home-brand'\)\.onclick=\(\)=>activateNav\('feed'\)/);
  assert.match(app, /\$\('#retry-view'\)\.onclick=renderView/);
});

test('the app shell and service worker cache the same final navigation and stage build', () => {
  assert.match(html, /styles\.css\?v=20261101-profile-tools-1/);
  assert.match(html, /app\.js\?v=20261101-call-recovery-1/);
  assert.match(worker, /minglora-shell-v59-call-recovery-1/);
  assert.match(worker, /styles\.css\?v=20261101-profile-tools-1/);
  assert.match(worker, /app\.js\?v=20261101-call-recovery-1/);
});
