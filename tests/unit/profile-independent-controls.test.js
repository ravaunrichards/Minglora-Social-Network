import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const css=read('public/profile-layout-guardrails.css');
const avatarCss=read('public/profile-facebook-avatar-anchor.css');
const independentCss=read('public/profile-independent-avatar-header.css');

test('profile header does not render separate profile-picture or cover-picture edit controls',()=>{
  assert.doesNotMatch(app,/id="profile-edit-avatar"|id="profile-edit-cover"|id="profile-edit-admin-cover"/);
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile(?: details in About)?"/);
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

test('admin profile keeps the regular owner layout and administrator recognition',()=>{
  const relationshipStart=app.indexOf('const relationshipActions=isMe');
  const profileAction=app.indexOf('const profileActionMarkup=relationshipActions',relationshipStart);
  assert.ok(relationshipStart>=0&&profileAction>relationshipStart);
  const ownerActions=app.slice(relationshipStart,profileAction);
  assert.match(ownerActions,/id="edit-profile"/);
  assert.match(ownerActions,/id="profile-add-story"/);
  assert.match(ownerActions,/id="profile-people-toggle"/);
  assert.ok(app.includes('profile-admin-identity'),'the three administrator recognition markers remain on the admin owner profile');
  assert.ok(app.includes('data-profile-overflow-action="verification-review"'),'administrator-only tools remain reachable through the regular profile menu');
  assert.doesNotMatch(ownerActions,/profile-edit-admin-cover|Edit Cover/);
  assert.doesNotMatch(app,/profile-header-card--admin|profile-info--admin/);
});

test('profile cover and portrait remain independent and the portrait stays left of the identity',()=>{
  assert.ok(independentCss.includes('margin:0 0 18px!important'));
  assert.ok(independentCss.includes('margin:0!important'));
  assert.ok(independentCss.includes('border-radius:50%!important'));
  assert.ok(independentCss.includes('grid-template-columns:var(--minglora-profile-avatar-size) minmax(0,1fr)!important'));
  assert.ok(independentCss.includes('.profile-thought-slot+.profile-avatar-edit-wrap'));
  assert.ok(independentCss.includes('.profile-thought-slot~.profile-info-main'));
  assert.ok(independentCss.includes('grid-column:2!important'));
  assert.ok(independentCss.includes('grid-row:2!important'));
  assert.ok(!/margin(?:-top)?\s*:\s*-\d|top\s*:\s*-\d/.test(independentCss));
  assert.ok(app.includes('esc(u.cover)'));
  assert.ok(app.includes('avatar(u)'));
  assert.ok(avatarCss.includes('@media (max-width:760px)'));
  assert.ok(css.includes('position: relative !important'));
});
test('profile editing retains centered native dialogs and About section editing',()=>{
  assert.ok(app.includes("modal.id='minglora-profile-editor'"));
  assert.ok(app.includes("modal.className='profile-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes("const modal=document.createElement('dialog');modal.className='profile-inline-editor about-section-inline-editor profile-editor-dialog'"));
  assert.ok(app.includes('modal.showModal()'));
  assert.ok(app.includes("modal.addEventListener('cancel'"));
  assert.ok(app.includes('function profileAboutMarkup(u,isMe)'));
  assert.ok(app.includes('function openAboutSectionEditor(sectionKey,u)'));
});
