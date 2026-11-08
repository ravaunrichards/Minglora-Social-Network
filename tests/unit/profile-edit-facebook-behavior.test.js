import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const css=read('public/styles.css');
const html=read('public/index.html');
const worker=read('public/sw.js');

const editStart=app.indexOf('function openEditProfile(u,mediaOnly=null)');
const editEnd=app.indexOf('async function openProfileStoryEditor',editStart);
assert.ok(editStart>=0&&editEnd>editStart,'profile edit dialog function exists');
const editor=app.slice(editStart,editEnd);
const profileStart=app.indexOf('function renderProfile(data){');
const profileEnd=app.indexOf('async function loadProfileGiftGallery',profileStart);
assert.ok(profileStart>=0&&profileEnd>profileStart,'profile renderer exists');
const profile=app.slice(profileStart,profileEnd);

test('profile Edit profile control opens the authenticated owner editor as a dialog',()=>{
  assert.ok(profile.includes('id="edit-profile"'));
  assert.ok(profile.includes('aria-haspopup="dialog"'));
  assert.ok(profile.includes('aria-controls="minglora-profile-editor"'));
  assert.ok(profile.includes("$('#edit-profile')?.addEventListener('click',()=>openEditProfile(u))"));
  assert.ok(editor.includes("modal.id='minglora-profile-editor'"));
  assert.ok(editor.includes("modal.showModal()"));
  assert.ok(editor.includes("dialog#minglora-profile-editor[open]"));
});

test('the editor has direct navigation for Intro, About details, profile picture and cover photo',()=>{
  for(const key of ['intro','details','avatar','cover']){
    assert.ok(editor.includes('data-profile-editor-jump="'+key+'"'),'Missing editor navigation '+key);
    assert.ok(editor.includes('data-profile-editor-target="'+key+'"'),'Missing editor target '+key);
  }
  assert.ok(editor.includes("editorNav?.querySelectorAll('[data-profile-editor-jump]')"));
  assert.ok(css.includes('dialog#minglora-profile-editor .profile-editor-nav'));
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
});

test('profile details and selected images save through the existing API and refresh the profile',()=>{
  assert.ok(editor.includes('type="submit" class="primary" id="save-profile-button"'));
  assert.ok(editor.includes("api('/users/me',{method:'PATCH'"));
  assert.ok(editor.includes("await openProfile(state.user.id)"));
  assert.ok(editor.includes("uploadProfileImage('avatar'"));
  assert.ok(editor.includes("uploadProfileImage('cover'"));
});

test('the updated profile editor JavaScript bypasses stale service-worker assets',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const workerAsset=worker.match(/app\.js\?v=[^"' ]+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset.length>0);
  assert.equal('/'+appAsset,workerAsset);
  assert.match(appAsset,/facebook-edit-profile/);
  assert.match(cacheName,/^minglora-shell-v\d+-facebook-edit-profile/);
});
