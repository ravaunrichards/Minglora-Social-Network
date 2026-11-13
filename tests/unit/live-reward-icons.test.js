import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sprite=read('public/assets/icons/live-reward-icons.svg');
const app=read('public/app.js');
const worker=read('public/sw.js');
const html=read('public/index.html');

test('LIVE Goody Bag and Treasure Box use distinct original vector artwork',()=>{
  const actual=[...sprite.matchAll(/<symbol id="([^"]+)" viewBox="0 0 64 64">/g)].map(match=>match[1]);
  assert.deepEqual(actual,['goody-bag','treasure-box']);
  for(const id of actual){
    const start=sprite.indexOf('<symbol id="'+id+'"');
    const end=sprite.indexOf('</symbol>',start);
    assert.ok(start>=0&&end>start,'missing symbol '+id);
    assert.match(sprite.slice(start,end),/<(?:path|rect|circle|ellipse)/,'missing vector geometry '+id);
  }
  assert.match(sprite,/<linearGradient id="reward-bag-front"/);
  assert.match(sprite,/<linearGradient id="reward-chest-front"/);
  assert.doesNotMatch(sprite,/href=["']https?:\/\//i);
});

test('the actual LIVE reward list renders its original SVG icons without emoji artwork',()=>{
  assert.ok(app.includes("live-reward-icons.svg#goody-bag"));
  assert.ok(app.includes("live-reward-icons.svg#"+(goody?'goody-bag':'treasure-box')"));
  assert.ok(app.includes("live-reward-empty-icon"));
  assert.doesNotMatch(app,/<div class='live-reward-art'[^\n]*>[^<]*<span>/);
});

test('the reward sprite is cached with the versioned LIVE app renderer',()=>{
  assert.ok(worker.includes("SHELL.push('/assets/icons/live-reward-icons.svg')"));
  assert.ok(worker.includes("minglora-shell-v308-self-updating-1"));
  assert.ok(worker.includes("20261113-live-reward-art-icons-1"));
  assert.ok(html.includes("20261113-live-reward-art-icons-1"));
});
