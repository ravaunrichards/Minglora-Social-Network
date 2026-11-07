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
  const avatarStart=app.indexOf('class="profile-inline-media-edit profile-avatar-inline-edit"');
  const avatarButton=app.slice(avatarStart,app.indexOf('</button>',avatarStart));
  const coverButton=app.slice(app.indexOf('id="profile-edit-cover"'),app.indexOf('</button>',app.indexOf('id="profile-edit-cover"')));
  assert.match(avatarButton,/<svg class="profile-control-icon"/);
  assert.match(coverButton,/<svg class="profile-control-icon"/);
  assert.match(avatarButton,/aria-label="Edit profile picture"/);
  assert.match(coverButton,/aria-label="Edit cover picture"/);
});



test('phone profile header hides the overlapping avatar and keeps Edit Profile actions visible on the right',()=>{
  assert.ok(css.includes('@media(max-width:760px){'));
  assert.ok(css.includes('.profile-avatar-edit-wrap{\n    display:none!important;'));
  assert.ok(css.includes('.profile-info-main{\n    flex:1 1 100%!important;'));
  assert.ok(css.includes('.profile-owner-actions{'));
  assert.ok(css.includes('justify-content:flex-end!important;'));
  assert.ok(css.includes('min-height:44px!important;'));
  assert.ok(app.includes('class="profile-actions profile-owner-actions"'));
  assert.ok(app.includes('id="edit-profile" type="button" aria-label="Edit profile"'));
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
  assert.match(css,/\.profile-media-action-row\{[^}]*display:flex/);
  assert.match(css,/\.profile-inline-media-edit\{[^}]*display:inline-flex/);
  assert.doesNotMatch(css,/\.profile-media-edit-button\{[^}]*position:absolute/);
  assert.doesNotMatch(css,/\.profile-avatar-edit-button\{[^}]*position:absolute/);
  assert.doesNotMatch(app,/profile-media-edit-button|profile-avatar-edit-button/);
  assert.match(app,/profile-media-action-row/);
  assert.match(app,/profile-avatar-inline-edit/);
  assert.match(css,/\.profile-avatar-edit-wrap\{[^}]*flex:0 0/);
  assert.match(css,/\.profile-owner-actions\{[^}]*display:flex/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(html,/styles\.css\?v=20261107-top-gifters-1/);
  const appAsset=html.match(/app\\.js\\?v=[^"']+/)?.[0]||'';
  const styleAsset=html.match(/styles\\.css\\?v=[^"']+/)?.[0]||'';
  const cacheName=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset&&worker.includes('/'+appAsset));
  assert.ok(styleAsset&&worker.includes('/'+styleAsset));
  assert.match(cacheName,/^minglora-shell-v\\d+-/);
});

test('routine profile and About editing uses inline page sections with no backdrop overlays',()=>{
  assert.match(app,/const modal=document\.createElement\('section'\);modal\.className='card profile-inline-editor'/);
  assert.match(app,/profileHeader\.insertAdjacentElement\('afterend',modal\)/);
  assert.match(app,/className='card profile-inline-editor about-section-inline-editor'/);
  assert.match(app,/profilePanel\.append\(modal\)/);
  assert.doesNotMatch(app,/modal-backdrop profile-editor-backdrop|modal-backdrop about-section-editor-backdrop/);
  assert.doesNotMatch(css,/\.profile-editor-backdrop|\.profile-editor-modal|\.about-section-editor-modal/);
  assert.match(css,/\.profile-inline-editor\{/);
  assert.match(css,/\.about-section-inline-editor\{/);
});

test('profile Likes total is supplied by the server from actual like reactions on visible profile posts',()=>{
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  assert.match(server,/likesCount:profilePosts\.reduce\(\(total,post\)=>total\+Object\.values\(post\.reactions\|\|\{\}\)\.filter\(reaction=>reaction==='like'\)\.length,0\)/);
  assert.match(app,/Number\(data\.likesCount\|\|0\)\.toLocaleString\(\)/);
  assert.match(app,/<span>Likes<\/span>/);
});

test('the Creator Hub verification sticker appears beside the profile username as well as the display name', () => {
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const badges=fs.readFileSync(path.join(root,'src/platform-badges.js'),'utf8');
  assert.match(badges,/creatorhubcreatornetwork@gmail\.com/);
  assert.match(server,/verificationBadge:getProfileVerificationBadge\(u\)/);
  assert.match(app,/profile-name-with-badges[^;]*verifiedProfileBadge\(u\)/);
  assert.match(app,/profile-username-line">@'\+esc\(u\.username\)\+' '\+verifiedProfileBadge\(u\)/);
  assert.match(css,/\.profile-username-line\{[^}]*display:flex/);
});

test('admin profile management includes its own Edit Cover action and uses the existing cover upload flow',()=>{
  const adminMarkup=app.slice(app.indexOf('const adminToolsMarkup'),app.indexOf('const profileActionMarkup'));
  assert.match(adminMarkup,/id="profile-edit-admin-cover"/);
  assert.match(adminMarkup,/<span>Edit Cover<\/span>/);
  assert.match(app,/\$\('#profile-edit-admin-cover'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'cover'\)\)/);
  assert.match(app,/\+\(isMe&&!isAdminProfile\?'<div class="profile-media-action-row">/);
  assert.match(app,/function openEditProfile\(u,mediaOnly=null\)/);
  assert.match(app,/uploadProfileImage\('cover',edited/);
  assert.match(fs.readFileSync(path.join(root,'public/admin-profile-layout.css'),'utf8'),/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
