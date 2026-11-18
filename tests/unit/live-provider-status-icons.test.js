import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const iconRoot=path.join(root,'public/assets/icons/live-provider-status');
const manifest=JSON.parse(fs.readFileSync(path.join(iconRoot,'manifest.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const expected=[
  {id:'provider-ready',status:'ready'},
  {id:'provider-not-configured',status:'not-configured'},
  {id:'provider-unavailable',status:'unavailable'}
];

test('provider status manifest has one original SVG for each real LIVE provider result',()=>{
  assert.deepEqual(manifest.icons.map(icon=>({id:icon.id,status:icon.status})),expected);
  assert.equal(manifest.view_box,'0 0 24 24');
  for(const item of manifest.icons){
    const file=path.join(iconRoot,item.id+'.svg');
    assert.equal(item.file,'/assets/icons/live-provider-status/'+item.id+'.svg');
    assert.ok(fs.existsSync(file),item.id+' SVG exists');
    const svg=fs.readFileSync(file,'utf8');
    assert.match(svg,/<svg[^>]*viewBox="0 0 24 24"/);
    assert.match(svg,/<symbol id="icon" viewBox="0 0 24 24"/);
    assert.match(svg,/stroke="currentColor"/);
    assert.match(svg,/<(?:path|circle|rect)\b/);
    assert.equal(/\p{Extended_Pictographic}/u.test(svg),false);
    assert.equal(item.review_status,'design-review-pending');
  }
});

test('LIVE setup status icon follows only the provider status response and keeps readable text',()=>{
  assert.ok(app.includes('const LIVE_PROVIDER_STATUS_ICON_NAMES=Object.freeze('));
  assert.ok(app.includes('function liveProviderStatusIcon(status)'));
  assert.ok(app.includes('const liveProviderStatusState=!status.configured?"not-configured":liveReady?"ready":"unavailable"'));
  assert.ok(app.includes('liveProviderStatusIcon(liveProviderStatusState)'));
  assert.ok(app.includes('data-provider-status='));
  assert.ok(app.includes('Live provider not configured'));
  assert.ok(app.includes('LiveKit ready'));
  assert.ok(app.includes('Live provider connection failed'));
  assert.ok(app.includes("aria-hidden='true' focusable='false'"));
});

test('provider status marks fit the existing compact pill and are included in offline app assets',()=>{
  assert.ok(css.includes('.live-provider-status-icon'));
  assert.ok(css.includes('display:inline-flex;align-items:center;gap:6px'));
  assert.ok(worker.includes("'"+'/assets/icons/live-provider-status/manifest.json'+"'"));
  for(const item of manifest.icons)assert.ok(worker.includes("'"+item.file+"'"),item.id+' SVG is pre-cached');
  assert.ok(worker.includes("minglora-shell-v359-self-updating-1"));
  assert.ok(html.includes('/styles.css?v=20261118-tiktok-ranking-frames-1'));
  assert.ok(html.includes('/app.js?v=20261118-tiktok-ranking-frames-1'));
});
