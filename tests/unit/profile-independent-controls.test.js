import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const css=read('public/profile-tiktok-layout.css');

test('profile header does not render separate profile-picture or cover-picture edit controls',()=>{
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
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

test('admin profile keeps shared owner actions and its standard administrator tools',()=>{
  const relationshipStart=app.indexOf('const relationshipActions=isMe');
  const adminStart=app.indexOf('const adminToolsMarkup');
  const adminEnd=app.indexOf('const profileActionMarkup',adminStart);
  assert.ok(relationshipStart>=0&&adminStart>relationshipStart&&adminEnd>adminStart);
  const ownerActions=app.slice(relationshipStart,adminStart);
  const admin=app.slice(adminStart,adminEnd);
  assert.match(ownerActions,/id="edit-profile"/);
  assert.match(ownerActions,/id="profile-add-story"/);
  assert.match(admin,/data-profile-admin-action="privacy"/);
  assert.match(admin,/data-profile-admin-action="edit-story"/);
  assert.doesNotMatch(admin,/profile-edit-admin-cover|Edit Cover/);
});

test('profile uses TikTok-style mobile sizing without hiding the profile portrait',()=>{
  assert.match(css,/\.profile-header-card \.profile-cover\s*\{\s*display:\s*none/);
  assert.match(css,/@media \(max-width: 760px\)[\s\S]*?flex-basis: 84px/);
  assert.match(css,/@media \(max-width: 760px\)[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css,/profile-avatar-edit-wrap\s*\{[^}]*display:\s*none/);
});

test('profile editing retains centered native dialogs and About section editing',()=>{
  assert.ok(app.includes("const modal=document.createElement('dialog');modal.className='profile-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes("const modal=document.createElement('dialog');modal.className='profile-inline-editor about-section-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes('modal.showModal()'));
  assert.ok(app.includes("modal.addEventListener('cancel'"));
  assert.ok(app.includes('function profileAboutMarkup(u,isMe)'));
  assert.ok(app.includes('function openAboutSectionEditor(sectionKey,u)'));
});
