import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../public/mobile-layout.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('mobile cover edit control sits above the avatar overlap on the cover itself', () => {
  assert.match(app, /id="profile-edit-cover"/);
  assert.match(app, /\$\('#profile-edit-cover'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'cover'\)\)/);
  assert.match(mobileCss, /\.profile-media-action-row\{[^}]*position:absolute;top:10px;right:10px;z-index:20/s);
  assert.match(mobileCss, /\.profile-media-action-row \.profile-inline-media-edit\{[^}]*pointer-events:auto;min-height:44px/s);
});

test('mobile profile picture edit control stays on top of the picture and is touch-sized', () => {
  assert.match(app, /id="profile-edit-avatar"/);
  assert.match(app, /\$\('#profile-edit-avatar'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'avatar'\)\)/);
  assert.match(mobileCss, /\.profile-avatar-edit-wrap\{[^}]*position:relative;z-index:15;overflow:visible;[^}]*height:82px/s);
  assert.match(mobileCss, /\.profile-avatar-inline-edit\{[^}]*position:absolute;right:-4px;bottom:0;z-index:8;[^}]*width:42px;height:42px;min-width:42px;min-height:42px/s);
});

test('mobile profile-media layout stylesheet is refreshed in the page and service worker', () => {
  assert.match(html, /mobile-layout\.css\?v=20261104-mobile-profile-media-1/);
  assert.match(serviceWorker, /mobile-layout\.css\?v=20261104-mobile-profile-media-1/);
});
