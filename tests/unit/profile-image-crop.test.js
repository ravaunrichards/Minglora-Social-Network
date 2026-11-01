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
  assert.match(css,/\.profile-crop-preview--cover\{[^}]*aspect-ratio:3\/1/);
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
  assert.match(app,/edit\.rotation=\(edit\.rotation\+90\)%360/);
});

test('the uploaded avatar and cover are cropped to the exact selected preview frame',()=>{
  assert.match(app,/async function transformProfileCrop\(file,edit,stage,slot\)/);
  assert.match(app,/const outputWidth=slot==='avatar'\?1080:1800/);
  assert.match(app,/const outputHeight=Math\.max\(1,Math\.round\(outputWidth\*rect\.height\/rect\.width\)\)/);
  assert.match(app,/edit\.offsetX\*\(outputWidth\/rect\.width\)/);
  assert.match(app,/edit\.offsetY\*\(outputHeight\/rect\.height\)/);
  assert.match(app,/transformProfileCrop\(avatarInput\.files\[0\],avatarEdit,avatarPreview,'avatar'\)/);
  assert.match(app,/transformProfileCrop\(coverInput\.files\[0\],coverEdit,coverPreview,'cover'\)/);
});

test('the refreshed shell and service worker load the profile crop editor and its styles',()=>{
  assert.match(html,/styles\.css\?v=20261101-profile-crop-1/);
  assert.match(html,/app\.js\?v=20261101-profile-crop-1/);
  assert.match(worker,/minglora-shell-v38-profile-image-crop/);
  assert.match(worker,/styles\.css\?v=20261101-profile-crop-1/);
  assert.match(worker,/app\.js\?v=20261101-profile-crop-1/);
});
