import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const css=read('public/profile-action-row.css');
const html=read('public/index.html');
const worker=read('public/sw.js');

test('owner profile keeps Edit picture, Edit profile and Add story on one horizontal action line',()=>{
  assert.match(app,/class="profile-actions profile-owner-actions"/);
  assert.match(app,/class="profile-inline-media-edit profile-avatar-inline-edit" id="profile-edit-avatar"/);
  assert.match(app,/id="edit-profile" type="button" aria-label="Edit profile"/);
  assert.match(app,/id="profile-add-story" type="button" aria-label="Add story"/);
  assert.match(css,/\.profile-header-card--owner \.profile-avatar-edit-wrap\{[\s\S]*?grid-row:1 \/ span 2!important/);
  assert.match(css,/\.profile-header-card--owner \.profile-owner-actions\{[\s\S]*?grid-column:2!important;[\s\S]*?grid-row:2!important/);
  assert.match(css,/flex-flow:row nowrap!important/);
  assert.match(css,/justify-content:flex-end!important/);
  assert.match(css,/gap:clamp\(8px,1\.5vw,14px\)!important/);
});

test('phone profile moves owner actions beside Edit picture without moving the avatar',()=>{
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.profile-header-card--owner \.profile-avatar-edit-wrap\{[\s\S]*?grid-column:1!important;[\s\S]*?grid-row:1 \/ span 2!important/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.profile-header-card--owner \.profile-owner-actions\{[\s\S]*?grid-column:2!important;[\s\S]*?grid-row:2!important/);
  assert.match(css,/@media\(max-width:390px\)[\s\S]*?\.profile-header-card--owner \.profile-owner-actions/);
  assert.match(css,/\.profile-header-card--owner \.profile-info--with-thought \.profile-owner-actions\{\s*grid-row:3!important/);
});

test('profile cover, picture and admin actions share blue and active-red states',()=>{
  assert.ok(css.includes('.profile-header-card .profile-inline-media-edit,'));
  assert.ok(css.includes('.profile-header-card .profile-admin-tools-grid .profile-admin-tool'));
  assert.ok(css.includes('background:var(--blue)!important;'));
  assert.ok(css.includes('.profile-header-card .profile-inline-media-edit:active:not(:disabled)'));
  assert.ok(css.includes('.profile-admin-tools-grid .profile-admin-tool:is([aria-pressed="true"]'));
  assert.ok(css.includes('background:var(--danger,#c43d4b)!important;'));
  assert.ok(css.includes('.profile-header-card .profile-actions .profile-edit:focus-visible'));
});

test('the profile action stylesheet is loaded and precached with a new shell cache key',()=>{
  const asset=html.match(/href="(\/profile-action-row\.css\?v=[^"]+)"/)?.[1]||'';
  assert.ok(asset&&worker.includes("'"+asset+"'"),'active profile action stylesheet is cached');
  assert.match(worker,/CACHE_NAME='minglora-shell-v\d+-/);
});
