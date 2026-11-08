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

test('profile and cover crop previews support touch pinch zoom, dragging, rotation and reset without zoom sliders',()=>{
  assert.ok(app.includes("stage.addEventListener('pointerdown'"));
  assert.ok(app.includes("stage.addEventListener('pointermove'"));
  assert.ok(app.includes("stage.addEventListener('pointerup'"));
  assert.ok(app.includes("stage.setPointerCapture(event.pointerId)"));
  assert.ok(app.includes('const pointers=new Map()'));
  assert.ok(app.includes('const beginPinch=()=>'));
  assert.ok(app.includes('edit.zoom=clampZoom(pinch.zoom*(distance/pinch.distance))'));
  assert.ok(app.includes('(!event.ctrlKey&&!event.metaKey)'));
  assert.ok(!app.includes('id="edit-avatar-zoom"'));
  assert.ok(!app.includes('id="edit-cover-zoom"'));
  assert.ok(!app.includes('profile-crop-zoom'));
  assert.ok(app.includes('Pinch with two fingers to zoom on phones'));
  assert.ok(app.includes('id="edit-avatar-rotate"'));
  assert.ok(app.includes('id="edit-cover-rotate"'));
  assert.ok(app.includes('id="edit-avatar-reset"'));
  assert.ok(app.includes('id="edit-cover-reset"'));
  assert.ok(app.includes('avatarEdit.rotation=(avatarEdit.rotation+90)%360'));
  assert.ok(app.includes('coverEdit.rotation=(coverEdit.rotation+90)%360'));
  assert.ok(css.includes('.profile-crop-preview.has-selection{cursor:grab;touch-action:none}'));
  assert.ok(css.includes('.profile-crop-preview.is-zooming'));
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

test('the refreshed shell and service worker load the profile crop editor and styles',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const styleAsset=html.match(/styles\.css\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset&&worker.includes('/'+appAsset));
  assert.ok(styleAsset&&worker.includes('/'+styleAsset));
  assert.match(cacheName,/^minglora-shell-v\d+-/);
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

test('public profile page uses the Facebook-style wide cover and portrait crop presentation',()=>{
  const profileCss=fs.readFileSync(path.join(root,'public/profile-action-row.css'),'utf8');
  const facebookCss=fs.readFileSync(path.join(root,'public/profile-facebook-panel.css'),'utf8');
  const alignment=fs.readFileSync(path.join(root,'public/profile-alignment.css'),'utf8');
  assert.ok(app.includes('class="profile-cover"'), 'profile cover container must exist');
  assert.ok(app.includes('class="profile-cover-image" data-view-image='));
  assert.match(profileCss,/\.minglora-profile-page \.profile-header-card \.profile-cover\{[^}]*aspect-ratio:2\.7 \/ 1/);
  assert.match(profileCss,/\.minglora-profile-page \.profile-header-card \.profile-cover-image\{[^}]*object-fit:cover/);
  assert.match(profileCss,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap>\.avatar\{[^}]*object-fit:cover/);
  assert.match(facebookCss,/\.minglora-profile-page \.profile-header-card \.profile-cover\{[\s\S]*?aspect-ratio:851 \/ 315!important[\s\S]*?max-height:315px!important/);
  assert.match(facebookCss,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap\{[\s\S]*?margin-top:calc\(var\(--minglora-profile-avatar-size\) \/ -2\)!important/);
  assert.match(facebookCss,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap>\.avatar\{[\s\S]*?border-radius:50%!important/);
  assert.match(facebookCss,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap>\.avatar\{[\s\S]*?object-fit:cover!important/);
  assert.match(facebookCss,/@media\(max-width:760px\)[\s\S]*?--minglora-profile-avatar-size:clamp\(88px,25vw,112px\)/);
  assert.match(facebookCss,/@media\(max-width:760px\)[\s\S]*?aspect-ratio:851 \/ 315!important[\s\S]*?max-height:315px!important/);
  assert.doesNotMatch(facebookCss,/aspect-ratio:2\.5 \/ 1/);
  assert.match(profileCss,/\.profile-crop-preview--cover\{aspect-ratio:2\.7 \/ 1!important/);
  assert.match(facebookCss,/--minglora-profile-avatar-size:168px/);
  assert.match(facebookCss,/max-width:851px!important/);
  assert.match(facebookCss,/aspect-ratio:851 \/ 315!important/);
  assert.match(facebookCss,/\.profile-avatar-edit-wrap>\.avatar\{[\s\S]*?width:168px!important;[\s\S]*?height:168px!important/);
  assert.match(facebookCss,/@media\(max-width:760px\)[\s\S]*?width:96px!important;[\s\S]*?height:96px!important/);
  assert.match(facebookCss,/@media\(max-width:390px\)[\s\S]*?width:88px!important;[\s\S]*?height:88px!important/);
  assert.match(facebookCss,/\.profile-crop-preview--cover\{[\s\S]*?aspect-ratio:851 \/ 315!important/);
  assert.match(alignment,/--minglora-profile-avatar-size:168px/);
  assert.ok(css.includes('.person-card--immersive .person-cover{'));
  assert.ok(css.includes('aspect-ratio:3/1;padding:0!important'));
  assert.ok(css.includes('.person-cover-image{object-fit:contain!important'));
});
