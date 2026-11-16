import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const iconRoot=path.join(root,'public/assets/icons/live-ranking-discovery');
const manifest=JSON.parse(fs.readFileSync(path.join(iconRoot,'manifest.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const expected=[
  {id:'daily',destination:'daily',label:'Daily rankings'},
  {id:'popular',destination:'popular',label:'Popular LIVE rankings'},
  {id:'league',destination:'league',label:'League rankings'}
];

test('LIVE discovery ranking manifest maps the three existing destinations exactly once',()=>{
  assert.deepEqual(manifest.icons.map(({id,destination,label})=>({id,destination,label})),expected);
  assert.equal(manifest.view_box,'0 0 24 24');
  for(const item of manifest.icons){
    assert.equal(item.file,'/assets/icons/live-ranking-discovery/'+item.id+'.svg');
    const file=path.join(iconRoot,item.id+'.svg');
    assert.ok(fs.existsSync(file),item.id+' ranking SVG exists');
    const svg=fs.readFileSync(file,'utf8');
    assert.match(svg,/<svg[^>]*viewBox="0 0 24 24"/);
    assert.match(svg,/<symbol id="icon" viewBox="0 0 24 24"/);
    assert.match(svg,/stroke="currentColor"/);
    assert.match(svg,/<(?:path|circle|rect)\b/);
    assert.equal(/\p{Extended_Pictographic}/u.test(svg),false);
    assert.equal(item.review_status,'design-review-pending');
  }
});

test('Daily, Popular LIVE and League tabs render their own icon without changing navigation destinations',()=>{
  assert.ok(app.includes('const LIVE_DISCOVERY_ICON_NAMES=Object.freeze(["daily","popular","league"])'));
  assert.ok(app.includes('function liveDiscoveryIcon(name)'));
  assert.ok(app.includes("data-live-discovery='daily'>\"+liveDiscoveryIcon(\"daily\")+\"<span>Daily</span>"));
  assert.ok(app.includes("data-live-discovery='popular'>\"+liveDiscoveryIcon(\"popular\")+\"<span>Popular LIVE</span>"));
  assert.ok(app.includes("data-live-discovery='league'>\"+liveDiscoveryIcon(\"league\")+\"<span>League</span>"));
  assert.ok(app.includes("button.onclick=()=>void loadLiveDiscoveryBoard(button.dataset.liveDiscovery,sessions)"));
  assert.ok(app.includes("button.dataset.liveDiscovery===tab"));
  assert.ok(app.includes("classList.toggle('active'"));
  assert.ok(app.includes("aria-hidden='true' focusable='false'"));
});

test('ranking tab SVGs retain compact responsive layout and offline cache coverage',()=>{
  assert.ok(css.includes('.live-discovery-tab-icon'));
  assert.ok(css.includes('flex:0 0 16px;width:16px;height:16px'));
  assert.ok(css.includes('display:inline-flex;align-items:center;gap:7px'));
  assert.ok(worker.includes("'/assets/icons/live-ranking-discovery/manifest.json'"));
  for(const item of manifest.icons)assert.ok(worker.includes("'"+item.file+"'"),item.id+' is pre-cached');
  assert.ok(worker.includes("minglora-shell-v331-self-updating-1"));
  assert.ok(html.includes('/styles.css?v=20261116-live-ranking-tab-icons-01'));
  assert.ok(html.includes('/app.js?v=20261116-live-ranking-tab-icons-01'));
  assert.ok(worker.includes("'/styles.css?v=20261116-live-ranking-tab-icons-01'"));
  assert.ok(worker.includes("'/app.js?v=20261116-live-ranking-tab-icons-01'"));
});
