import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

test('desktop and mobile main navigation contain only five purposeful destinations',()=>{
  const desktop=html.match(/<nav class="top-nav" aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1]||'';
  const mobile=html.match(/<div class="mobile-nav" aria-label="Mobile navigation">([\s\S]*?)<\/div>/)?.[1]||'';
  const expected=['feed','for-you','live','meetwave','leagues'];
  assert.deepEqual([...desktop.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expected);
  assert.deepEqual([...mobile.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expected);
});
