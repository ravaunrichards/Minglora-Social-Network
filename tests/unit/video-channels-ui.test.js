import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const store=fs.readFileSync(path.join(root,'src/store.js'),'utf8');

test('Video Centre provides a dedicated Channels mode separate from profile follows and paid creator subscriptions',()=>{
  assert.match(app,/data-video-mode="channels"/);
  assert.match(app,/renderVideoChannelLibrary\(feed\)/);
  assert.match(app,/Manage my channel/);
  assert.match(app,/My subscriptions/);
  assert.match(app,/data-channel-subscribe/);
  assert.match(server,/db\.videoChannelSubscriptions/);
  assert.match(store,/'videoChannelSubscriptions'/);
  assert.match(store,/'creatorSubscriptions'/);
  assert.match(app,/api\('\/video-channels\/subscriptions'\)/);
});

test('channel editor supports server-validated name, description and visibility controls',()=>{
  assert.match(app,/function openVideoChannelEditor\(/);
  assert.match(app,/name="title" required maxlength="80"/);
  assert.match(app,/name="description" rows="4" maxlength="1000"/);
  assert.match(app,/name="visibility"/);
  assert.match(app,/api\('\/video-channels\/me'/);
  assert.match(server,/validateVideoChannelInput\(input,\{partial:true\}\)/);
});

test('channel pages and discovery use server-checked profile, block and post audiences',()=>{
  assert.match(server,/if\(blockedBetween\(user\.id,owner\.id\)\|\|!canViewProfile\(user\.id,owner\)\)return false/);
  assert.match(server,/post=>post\.userId===owner\.id&&isVisibleVideoPost\(user\.id,post\)/);
  assert.match(server,/canViewVideoChannel\(channel,user\.id/);
  assert.match(server,/return json\(res,404,\{error:'Video channel not found\.'\}\)/);
  assert.match(server,/channel\.visibility!=='public'/);
});

test('channel styles are loaded by the app shell and precached by the service worker',()=>{
  assert.match(index,/\/video-channels\.css\?v=20261111-channels-1/);
  assert.match(worker,/\/video-channels\.css\?v=20261111-channels-1/);
  assert.match(app,/video-channel-grid/);
  assert.match(app,/video-channel-detail-head/);
});
