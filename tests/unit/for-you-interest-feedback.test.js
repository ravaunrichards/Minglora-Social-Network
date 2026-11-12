import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'public/for-you-tiktok.css'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');

test('For You video cards expose both positive and negative recommendation controls in one compact menu',()=>{
  assert.match(app,/data-fyp-feedback-menu=/);
  assert.match(app,/data-fyp-interested=/);
  assert.match(app,/Show me more like this/);
  assert.match(app,/data-fyp-not-interested=/);
  assert.match(app,/Not interested/);
});

test('For You preference menu stays accessible, exclusive and closes after saving',()=>{
  assert.match(app,/aria-controls="fyp-feedback-menu-/);
  assert.match(app,/aria-expanded="false"/);
  assert.match(app,/root\.querySelectorAll\('\.fyp-feedback-menu'\)/);
  assert.match(app,/aria-expanded','false'/);
  assert.match(app,/menu\.hidden=true/);
  assert.match(styles,/\.fyp-feedback-menu\[hidden\]\{display:none!important\}/);
});

test('For You preference menu remains touch-friendly on small phones',()=>{
  assert.match(styles,/@media\(max-width:420px\)/);
  assert.match(styles,/min-height:40px!important/);
  assert.match(styles,/max-height:min\(45vh,320px\)/);
  assert.match(styles,/overscroll-behavior:contain!important/);
});

test('For You feedback endpoint accepts both interest actions and persists them per member',()=>{
  assert.match(server,/\['not_interested','interested'\]/);
  assert.match(server,/existing\.action=action/);
  assert.match(server,/userId:user\.id,postId:post\.id,action,createdAt:now\(\)/);
});

test('Recommendation UI assets are versioned and cached by the service worker',()=>{
  assert.match(index,/for-you-tiktok\.css\?v=20261112-for-you-feedback-menu-1/);
  assert.match(index,/app\.js\?v=20261112-for-you-interest-feedback-1/);
  assert.match(worker,/for-you-tiktok\.css\?v=20261112-for-you-feedback-menu-1/);
  assert.match(worker,/app\.js\?v=20261112-for-you-interest-feedback-1/);
  assert.match(worker,/minglora-shell-v293-for-you-interest-feedback-1/);
});
