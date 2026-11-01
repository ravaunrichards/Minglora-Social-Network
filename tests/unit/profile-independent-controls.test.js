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

test('profile owner has individual profile-picture and cover-picture edit controls',()=>{
  assert.match(app,/id="profile-edit-avatar"/);
  assert.match(app,/id="profile-edit-cover"/);
  assert.match(app,/\$\('#profile-edit-avatar'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'avatar'\)\)/);
  assert.match(app,/\$\('#profile-edit-cover'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'cover'\)\)/);
  const avatarButton=app.slice(app.indexOf('id="profile-edit-avatar"'),app.indexOf('</button>',app.indexOf('id="profile-edit-avatar"')));
  const coverButton=app.slice(app.indexOf('id="profile-edit-cover"'),app.indexOf('</button>',app.indexOf('id="profile-edit-cover"')));
  assert.match(avatarButton,/<svg class="profile-control-icon"/);
  assert.match(coverButton,/<svg class="profile-control-icon"/);
  assert.match(avatarButton,/aria-label="Edit profile picture"/);
  assert.match(coverButton,/aria-label="Edit cover picture"/);
});

test('single-image edit mode hides the unrelated picture editor and uploads only its selected target',()=>{
  assert.match(app,/function openEditProfile\(u,mediaOnly=null\)/);
  assert.match(app,/data-profile-media-section="avatar"/);
  assert.match(app,/data-profile-media-section="cover"/);
  assert.match(app,/section\.hidden=section\.dataset\.profileMediaSection!==mediaOnly/);
  assert.match(app,/if\(\(!mediaOnly\|\|mediaOnly==='avatar'\)&&avatarInput\.files\?\.\[0\]\)/);
  assert.match(app,/if\(\(!mediaOnly\|\|mediaOnly==='cover'\)&&coverInput\.files\?\.\[0\]\)/);
  assert.match(app,/if\(!mediaOnly\)\{\s*status\.textContent='Saving profile details…'/);
  assert.match(app,/Choose a '\+label\+' before saving/);
});

test('profile owner has a dedicated Add story action with its own icon and real story composer',()=>{
  assert.match(app,/id="profile-add-story"/);
  assert.match(app,/aria-label="Add story"/);
  assert.match(app,/\$\('#profile-add-story'\)\?\.addEventListener\('click',\(\)=>openStoryComposer\(\)\)/);
  const storyButton=app.slice(app.indexOf('id="profile-add-story"'),app.indexOf('</button>',app.indexOf('id="profile-add-story"')));
  assert.match(storyButton,/<svg class="profile-control-icon"/);
  assert.match(app,/id="create-story"><svg class="profile-control-icon"/);
});

test('profile media and story controls remain responsive and visible in refreshed app assets',()=>{
  assert.match(css,/\.profile-cover-edit-button\{[^}]*position:absolute/);
  assert.match(css,/\.profile-avatar-edit-wrap\{[^}]*position:relative/);
  assert.match(css,/\.profile-owner-actions\{[^}]*display:flex/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(html,/styles\.css\?v=20261101-profile-media-controls-1/);
  assert.match(html,/app\.js\?v=20261101-profile-media-controls-1/);
  assert.match(worker,/minglora-shell-v48-profile-media-controls/);
  assert.match(worker,/styles\.css\?v=20261101-profile-media-controls-1/);
  assert.match(worker,/app\.js\?v=20261101-profile-media-controls-1/);
});
