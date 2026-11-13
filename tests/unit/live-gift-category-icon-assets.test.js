import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sprite=fs.readFileSync(path.join(root,'public/assets/icons/live-gift-category-icons.svg'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const studio=fs.readFileSync(path.join(root,'public/gifts.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/live-gift-access.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const expected=["all","flowers","hearts","animals","vehicles","music","sports","food_drink","fashion_beauty","luxury","celebrations","fantasy","nature","travel","games","community","symbols","everyday","reactions","seasonal","jamaican_culture","other"];

test('Minglora ships unique original vector artwork for every LIVE gift category',()=>{
 const actual=[...sprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">/g)].map(m=>m[1]);
 assert.deepEqual(actual,expected);
 for(const id of expected){
  const start=sprite.indexOf('<symbol id="'+id+'"');
  const end=sprite.indexOf('</symbol>',start);
  assert.ok(start>=0&&end>start,'missing icon geometry: '+id);
  assert.match(sprite.slice(start,end),/<(?:path|rect|circle|ellipse)/,'missing vector paths: '+id);
 }
 assert.match(sprite,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
 assert.doesNotMatch(sprite,/https?:\/\//);
});

test('the actual LIVE gift picker and Gift Studio use the same local category artwork',()=>{
 assert.ok(app.includes("const LIVE_GIFT_CATEGORY_ICON_KEYS = new Set("));
 assert.ok(app.includes('/assets/icons/live-gift-category-icons.svg#"+icon'));
 assert.ok(studio.includes("const LIVE_GIFT_CATEGORY_ICON_KEYS = new Set("));
 assert.ok(studio.includes('/assets/icons/live-gift-category-icons.svg#"+icon'));
 assert.match(css,/\.live-gift-category-row button \.gift-category-icon/);
 assert.match(css,/\.gift-category-chip \.gift-category-icon/);
});

test('the category artwork is precached and the updated scripts receive new cache versions',()=>{
 assert.ok(worker.includes("SHELL.push('/assets/icons/live-gift-category-icons.svg')"));
 assert.ok(worker.includes("minglora-shell-v307-live-category-icons-1"));
 assert.ok(worker.includes("/app.js?v=20261113-live-category-icons-1"));
});
