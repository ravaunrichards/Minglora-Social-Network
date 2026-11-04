import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

test('desktop and mobile primary navigation stay focused while secondary destinations remain accessible',()=>{
  const desktop=html.match(/<nav class="top-nav" aria-label="Main navigation">([\\s\\S]*?)<\\/nav>/)?.[1]||'';
  const expected=['feed','for-you','live','meetwave','leagues'];
  assert.deepEqual([...desktop.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expected);

  const mobileStart=html.indexOf('<div class="mobile-nav"');
  const moreButtonStart=html.indexOf('<button id="mobile-more-btn"',mobileStart);
  const mobilePrimary=html.slice(mobileStart,moreButtonStart);
  assert.deepEqual([...mobilePrimary.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expected);

  const moreStart=html.indexOf('<div id="mobile-more-menu"',moreButtonStart);
  const moreEnd=html.indexOf('</div>',moreStart);
  const moreMenu=html.slice(moreStart,moreEnd);
  const secondary=['friends','creator','messages','gifts','coins','groups','pages','saved'];
  assert.deepEqual([...moreMenu.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),secondary);
  assert.ok(html.indexOf('id="search-form"')<html.indexOf('class="top-nav"'),'Search remains before the compact navigation');
});
