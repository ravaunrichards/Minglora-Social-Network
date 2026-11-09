import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('public/app.js');
const html=read('public/index.html');
const worker=read('public/sw.js');
const layout=read('public/profile-admin-layout-parity.css');
const actions=read('public/profile-action-toolbar.css');
const parity=read('public/profile-admin-layout-parity.css');

test('owner and visitor profiles retain their separate real action sets',()=>{
  const start=app.indexOf('function renderProfile(data){');
  const end=app.indexOf('async function loadProfileGiftGallery',start);
  assert.ok(start>=0&&end>start);
  const profile=app.slice(start,end);
  for(const marker of ['id="profile-add-story"','id="edit-profile"','id="profile-people-toggle"'])assert.ok(profile.includes(marker));
  for(const marker of ['id="profile-follow"','id="profile-subscribe"','id="profile-message"','data-profile-call="audio"','data-profile-call="video"','id="profile-more-actions"','id="profile-report"','id="profile-block"'])assert.ok(profile.includes(marker));
  assert.ok(profile.includes('verifiedProfileBadge(u)+liveProProfileBadge(u)'));
  assert.ok(profile.includes('profile-admin-identity'));
});

test('admin uses the same owner layout without an admin-specific grid modifier',()=>{
  const start=app.indexOf('function renderProfile(data){');
  const end=app.indexOf('async function loadProfileGiftGallery',start);
  const profile=app.slice(start,end);
  assert.ok(profile.includes("const isAdminProfile=Boolean(isMe&&"));
  assert.ok(profile.includes('profile-admin-identity'));
  assert.ok(!profile.includes("profile-header-card--admin"));
  assert.ok(!profile.includes("profile-info--admin"));
  assert.ok(profile.includes('const profileActionMarkup=relationshipActions'));
});

test('desktop visitor action shell occupies the separate third column',()=>{
  assert.match(layout,/profile-header-card--viewer \.profile-info > \.profile-actions-shell\s*\{[\s\S]*?grid-column:\s*3 !important;[\s\S]*?grid-row:\s*1 !important;/);
  assert.match(layout,/profile-info--with-thought > \.profile-actions-shell\s*\{[\s\S]*?grid-column:\s*3 !important;[\s\S]*?grid-row:\s*2 !important;/);
});

test('tablet and phone visitor action shells reserve full rows, including thought profiles',()=>{
  assert.match(layout,/@media \(min-width: 761px\) and \(max-width: 1024px\)[\s\S]*?profile-header-card--viewer \.profile-info > \.profile-actions-shell\s*\{[\s\S]*?grid-column:\s*1 \/ -1 !important;[\s\S]*?grid-row:\s*2 !important;/);
  assert.match(layout,/profile-header-card--viewer \.profile-info--with-thought > \.profile-actions-shell\s*\{[\s\S]*?grid-row:\s*3 !important;/);
  assert.match(layout,/@media \(max-width: 760px\)[\s\S]*?profile-header-card--viewer \.profile-info > \.profile-actions-shell\s*\{[\s\S]*?grid-column:\s*1 \/ -1 !important;[\s\S]*?grid-row:\s*2 !important;/);
  assert.ok(parity.includes('overflow-x: auto !important'));
  assert.ok(actions.includes('overflow-x: auto !important')||parity.includes('overflow-x: auto !important'));
});

test('both three-dot menus expand in normal flow and cannot cover profile content',()=>{
  assert.match(layout,/profile-overflow-menu:not\(\[hidden\]\)\s*\{[\s\S]*?position:\s*static !important;/);
  assert.match(layout,/profile-action-menu:not\(\[hidden\]\)\s*\{[\s\S]*?position:\s*static !important;/);
  assert.match(layout,/profile-overflow-menu\[hidden\]\s*\{[\s\S]*?display:\s*none !important;/);
});

test('all six real profile metrics fit an even responsive grid',()=>{
  assert.match(layout,/profile-counts\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\) !important;/);
  assert.match(layout,/@media \(min-width: 761px\) and \(max-width: 1024px\)[\s\S]*?profile-counts\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(layout,/@media \(max-width: 760px\)[\s\S]*?profile-counts\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
});

test('active profile assets match the service-worker shell cache',()=>{
  const appAsset=html.match(/app\.js\?v=[^"']+/)?.[0]||'';
  const cssAsset=html.match(/profile-admin-layout-parity\.css\?v=[^"']+/)?.[0]||'';
  const cache=worker.match(/CACHE_NAME='([^']+)'/)?.[1]||'';
  assert.ok(appAsset&&worker.includes('/'+appAsset));
  assert.ok(cssAsset&&worker.includes('/'+cssAsset));
  assert.match(cache,/^minglora-shell-v\d+-/);
});
