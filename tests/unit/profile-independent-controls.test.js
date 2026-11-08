import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const css=read('public/profile-action-row.css');

test('profile header does not render separate profile-picture or cover-picture edit controls',()=>{
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
  assert.doesNotMatch(app,/profile-media-action-row|profile-avatar-inline-edit|profile-inline-media-edit/);
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add to story"/);
});

test('the regular profile editor retains photo upload, camera and crop workflows',()=>{
  assert.match(app,/data-profile-media-section="avatar"/);
  assert.match(app,/data-profile-media-section="cover"/);
  assert.match(app,/id="edit-avatar-file"/);
  assert.match(app,/id="edit-cover-file"/);
  assert.match(app,/id="edit-avatar-camera-button"/);
  assert.match(app,/id="edit-cover-camera-button"/);
  assert.match(app,/transformProfileCrop\(avatarInput\.files\[0\],avatarEdit,avatarPreview,'avatar'\)/);
  assert.match(app,/transformProfileCrop\(coverInput\.files\[0\],coverEdit,coverPreview,'cover'\)/);
  assert.match(app,/uploadProfileImage\('avatar',edited/);
  assert.match(app,/uploadProfileImage\('cover',edited/);
  assert.match(app,/function openEditProfile\(u,mediaOnly=null\)/);
});

test('admin profile keeps its standard tools without a separate Edit Cover action',()=>{
  const start=app.indexOf('const adminToolsMarkup');
  const end=app.indexOf('const profileActionMarkup',start);
  assert.ok(start>=0&&end>start);
  const admin=app.slice(start,end);
  assert.match(admin,/id="edit-profile"/);
  assert.match(admin,/id="profile-add-story"/);
  assert.match(admin,/data-profile-admin-action="privacy"/);
  assert.doesNotMatch(admin,/profile-edit-admin-cover|Edit Cover/);
});

test('profile media is visible on mobile with the Facebook-style cover crop',()=>{
  assert.match(css,/\.minglora-profile-page \.profile-header-card \.profile-cover-image\{[^}]*object-fit:cover/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?--minglora-profile-avatar-size:112px/);
  assert.match(css,/@media\(max-width:390px\)[\s\S]*?--minglora-profile-avatar-size:100px/);
  assert.doesNotMatch(css,/\.minglora-profile-page \.profile-header-card \.profile-avatar-edit-wrap\{[^}]*display:none!important/);
});

test('profile editing retains centered native dialogs and About section editing',()=>{
  assert.ok(app.includes("const modal=document.createElement('dialog');modal.className='profile-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes("const modal=document.createElement('dialog');modal.className='profile-inline-editor about-section-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes('modal.showModal()'));
  assert.ok(app.includes("modal.addEventListener('cancel'"));
  assert.ok(app.includes('function profileAboutMarkup(u,isMe)'));
  assert.ok(app.includes('function openAboutSectionEditor(sectionKey,u)'));
});
