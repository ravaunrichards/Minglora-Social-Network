import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('the final phone experience stylesheet loads after feature skins and is shell-cached', async () => {
  const [html, worker] = await Promise.all([read('public/index.html'), read('public/sw.js')]);
  const finalPhone = html.indexOf('phone-experience.css?v=20261107-phone-experience-1');
  const appLock = html.indexOf('app-lock.css?v=20261107-app-lock-1');
  assert.ok(finalPhone > appLock && appLock >= 0, 'phone overrides must load after the feature and app-lock styles');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.ok(worker.includes("'/phone-experience.css?v=20261107-phone-experience-1'"), 'the phone stylesheet is pre-cached');
  assert.match(worker, /CACHE_NAME='minglora-shell-v\\d+-self-updating-1'/);
});

test('phone navigation remains reachable and reserves safe-area space instead of covering content', async () => {
  const css = await read('public/phone-experience.css');
  assert.match(css, /\.mobile-nav\{[\s\S]*?position:fixed!important/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css, /height:calc\(var\(--minglora-phone-nav-height\) \+ env\(safe-area-inset-bottom\)\)!important/);
  assert.match(css, /padding-bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)!important/);
  assert.match(css, /body:not\(:has\(#live-player-shell\)\)/, 'immersive LIVE has its own viewport layout');
  assert.match(css, /min-height:50px!important/);
});

test('phone content reflows with readable type, non-clipping controls and narrow-screen fallbacks', async () => {
  const css = await read('public/phone-experience.css');
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /min-height:48px!important/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@media\(max-width:350px\)/);
});

test('medium windows use a two-pane layout and short landscape phones compact navigation', async () => {
  const css = await read('public/phone-experience.css');
  assert.match(css, /@media\(min-width:761px\) and \(max-width:1100px\)/);
  assert.match(css, /grid-template-columns:minmax\(175px,210px\) minmax\(0,1fr\)!important/);
  assert.match(css, /@media\(max-width:760px\) and \(orientation:landscape\) and \(max-height:520px\)/);
});

test('incoming and outgoing call surfaces keep their full-screen answer and hang-up UI', async () => {
  const css = await read('public/phone-experience.css');
  assert.match(css, /\.call-overlay\{[\s\S]*?position:fixed!important/);
  assert.match(css, /\.call-overlay\.call-ringing-overlay\{/);
  assert.match(css, /\.call-overlay \.call-controls button\{[\s\S]*?min-height:48px!important/);
  assert.match(css, /padding:10px 10px calc\(10px \+ env\(safe-area-inset-bottom\)\)!important/);
});

test('reduced-motion preferences are respected', async () => {
  const css = await read('public/phone-experience.css');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
