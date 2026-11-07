import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, js] = await Promise.all([
  readFile(new URL('../../public/meetwave.css', import.meta.url), 'utf8'),
  readFile(new URL('../../public/meetwave.js', import.meta.url), 'utf8')
]);

test('Minglora MeetWave keeps the standalone room starting geometry', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 300px!important/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /aspect-ratio:16\/10!important/);
  assert.match(css, /min-height:160px!important/);
});

test('Minglora retains People and Chat as one compact companion column', () => {
  assert.match(js, /class="mw-support-column"/);
  assert.match(css, /\.mw-support-column\{[\s\S]*?grid-template-rows:auto minmax\(390px,1fr\)/);
});

test('phone layout preserves two landscape video tiles and side-by-side People and Chat', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.mw-support-column\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /@media\(max-width:430px\)[\s\S]*?\.mw-video-grid\s*\{[^}]*grid-template-columns:1fr/);
});
