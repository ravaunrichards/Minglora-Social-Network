import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../../public/mobile-layout.css', import.meta.url), 'utf8');

test('profile exposes separate edit controls for the cover and profile picture', () => {
  assert.match(app, /id="profile-edit-cover"/);
  assert.match(app, /id="profile-edit-avatar"/);
  assert.match(app, /\$\('#profile-edit-cover'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'cover'\)\)/);
  assert.match(app, /\$\('#profile-edit-avatar'\)\?\.addEventListener\('click',\(\)=>openEditProfile\(u,'avatar'\)\)/);
});

test('phone cover edit button is pinned to the cover corner, away from the overlapping avatar', () => {
  assert.match(mobile, /\.profile-media-action-row\s*\{[^}]*position:absolute;top:10px;right:10px;z-index:14/s);
  assert.match(mobile, /\.profile-media-action-row \.profile-inline-media-edit\s*\{[^}]*min-height:44px/s);
  assert.match(mobile, /\.profile-avatar-edit-wrap\s*\{[^}]*z-index:15/s);
  assert.match(mobile, /\.profile-avatar-inline-edit\s*\{[^}]*min-height:44px/s);
});
