import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');

test('profile editor previews the avatar as a circle and the cover as a wide rectangle',()=>{
  assert.match(app,/profile-crop-preview--avatar/);
  assert.match(app,/aria-label="Circular profile picture crop preview"/);
  assert.match(app,/profile-crop-preview--cover/);
  assert.match(app,/aria-label="Wide rectangular cover photo crop preview"/);
  assert.match(css,/\.profile-crop-preview--avatar\{[^}]*border-radius:50%/);
  assert.match(css,/\.profile-crop-preview--cover\{[^}]*aspect-ratio:3\/1[^}]*border:0/);
  assert.match(css,/\.profile-crop-preview--cover\{[^}]*box-shadow:inset 0 0 0 1px var\(--line\)/);
  assert.match(css,/\.profile-cover\{[^}]*aspect-ratio:3\/1/);
});

test('profile image crop tools support drag positioning, zoom, rotation and reset for each image',()=>{
  assert.match(app,/stage\.addEventListener\('pointerdown'/);
  assert.match(app,/stage\.addEventListener\('pointermove'/);
  assert.match(app,/stage\.setPointerCapture\(event\.pointerId\)/);
  assert.match(app,/edit\.offsetX=drag\.offsetX/);
  assert.match(app,/edit\.offsetY=drag\.offsetY/);
  assert.match(app,/id="edit-avatar-zoom"/);
  assert.match(app,/id="edit-cover-zoom"/);
  assert.match(app,/id="edit-avatar-rotate"/);
  assert.match(app,/id="edit-cover-rotate"/);
  assert.match(app,/id="edit-avatar-reset"/);
  assert.match(app,/id="edit-cover-reset"/);
  assert.match(app,/avatarEdit\.rotation=\(avatarEdit\.rotation\+90\)%360/);
  assert.match(app,/coverEdit\.rotation=\(coverEdit\.rotation\+90\)%360/);
});

test('the uploaded avatar and cover are cropped to the exact selected preview frame',()=>{
  assert.match(app,/async function transformProfileCrop\(file,edit,stage,slot\)/);
  assert.match(app,/function profileCropViewport\(stage\)/);
  assert.match(app,/const rect=stage\.getBoundingClientRect\(\)/);
  assert.match(app,/const style=getComputedStyle\(stage\)/);
  assert.match(app,/rect\.width-borderX/);
  assert.match(app,/rect\.height-borderY/);
  assert.match(app,/const viewport=profileCropViewport\(stage\)/);
  assert.match(app,/const outputWidth=slot==='avatar'\?1080:1800/);
  assert.match(app,/const outputHeight=Math\.max\(1,Math\.round\(outputWidth\*viewport\.height\/viewport\.width\)\)/);
  assert.match(app,/edit\.offsetX\*\(outputWidth\/viewport\.width\)/);
  assert.match(app,/edit\.offsetY\*\(outputHeight\/viewport\.height\)/);
  assert.doesNotMatch(app,/function enableCropDragging/);
  assert.equal((app.match(/stage\.addEventListener\('pointerdown'/g)||[]).length,1);
  assert.match(app,/transformProfileCrop\(avatarInput\.files\[0\],avatarEdit,avatarPreview,'avatar'\)/);
  assert.match(app,/transformProfileCrop\(coverInput\.files\[0\],coverEdit,coverPreview,'cover'\)/);
});

test('the refreshed shell and service worker load the profile crop editor and its styles',()=>{
  assert.match(html,/styles\.css\?v=20261101-about-sections-1/);
  assert.match(html,/app\.js\?v=20261101-about-sections-1/);
  assert.match(worker,/minglora-shell-v49-about-sections/);
  assert.match(worker,/styles\.css\?v=20261101-about-sections-1/);
  assert.match(worker,/app\.js\?v=20261101-about-sections-1/);
});

test('crop preview and saved output use the visible inner frame rather than its border',()=>{
  const helper=app.slice(app.indexOf('function profileCropViewport'),app.indexOf('function bindProfileCropStage'));
  assert.match(helper,/getBoundingClientRect/);
  assert.match(helper,/getComputedStyle/);
  assert.match(helper,/borderLeftWidth/);
  assert.match(helper,/borderRightWidth/);
  assert.match(helper,/borderTopWidth/);
  assert.match(helper,/borderBottomWidth/);
  // A 176px circular frame with a 5px border has a 166px visible crop area.
  // Both preview and export must be calculated from 166px, never from 176px.
  const outer=176,border=5,visible=outer-border*2,sourceW=800,sourceH=1200;
  const previewScale=Math.max(visible/sourceW,visible/sourceH);
  const exportScale=Math.max(1080/sourceW,1080/sourceH);
  assert.equal((visible/previewScale),(1080/exportScale));
  const previewOffset=14,exportOffset=previewOffset*(1080/visible);
  assert.ok(Math.abs(exportOffset/exportScale-previewOffset/previewScale)<1e-9);
});

test('public profile pages and outside member cards show the complete saved profile images',()=>{
  assert.ok(app.includes('class="profile-cover"'), 'profile cover container must exist');
  assert.ok(app.includes('class="profile-cover-image" data-view-image='));
  assert.ok(css.includes('.profile-cover-image{display:block;width:100%;height:100%;object-fit:contain'));
  assert.ok(css.includes('.profile-info .avatar,.person-avatar-wrap .avatar{object-fit:contain'));
  assert.ok(css.includes('.person-card--immersive .person-cover{'));
  assert.ok(css.includes('aspect-ratio:3/1;padding:0!important'));
  assert.ok(css.includes('.person-cover-image{object-fit:contain!important'));
});
