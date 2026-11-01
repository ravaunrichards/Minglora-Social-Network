import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const renderProfileStart = appSource.indexOf('function renderProfile(data){');

test('profile bio and location are displayed in About, not beside the profile photo', () => {
  assert.notEqual(renderProfileStart, -1, 'renderProfile must exist');
  const headerStart = appSource.indexOf('<div class="profile-info-main">', renderProfileStart);
  const headerEnd = appSource.indexOf('<p class="profile-counts">', headerStart);
  assert.notEqual(headerStart, -1, 'profile identity header must exist');
  assert.notEqual(headerEnd, -1, 'profile counts must end the identity text block');
  const identityHeader = appSource.slice(headerStart, headerEnd);
  assert.match(identityHeader, /u\.name/);
  assert.match(identityHeader, /u\.username/);
  assert.doesNotMatch(identityHeader, /u\.(bio|location)/);
  const rowsStart = appSource.indexOf('const aboutRows=[', renderProfileStart);
  const rowsEnd = appSource.indexOf('].filter(([,value])=>', rowsStart);
  assert.notEqual(rowsStart, -1, 'About details collection must exist');
  assert.notEqual(rowsEnd, -1, 'About details collection must close');
  const rows = appSource.slice(rowsStart, rowsEnd);
  assert.match(rows, /\['Bio',u\.bio\]/);
  assert.match(rows, /\['Location',u\.location\]/);
  assert.match(appSource.slice(rowsEnd), /\['Joined',new Date\(u\.createdAt\)/);
});

test('all other personal profile details stay in the About details collection', () => {
  const rowsStart = appSource.indexOf('const aboutRows=[', renderProfileStart);
  const rowsEnd = appSource.indexOf('].filter(([,value])=>', rowsStart);
  const rows = appSource.slice(rowsStart, rowsEnd);
  for (const field of ['country', 'county', 'parish', 'city', 'gender', 'relationshipStatus', 'contactPhone']) {
    assert.ok(rows.includes('u.' + field), field + ' must be in About');
  }
});


test('browser reloads the corrected profile script and replaces the old service-worker cache', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(indexHtml, /href="\/styles\.css\?v=20261031-profile-expansion-1"/);
  assert.match(indexHtml, /src="\/app\.js\?v=20261031-profile-expansion-1"/)
  assert.match(serviceWorker, /minglora-shell-v37-profile-expansion/);
  assert.match(serviceWorker, /\/app\.js\?v=20261031-profile-expansion-1/);
  assert.match(serverSource, /'Cache-Control':'no-store'/);
  assert.match(serverSource, /'Cache-Control':'no-cache, max-age=0, must-revalidate'/);
});

test('profile navigation has All, About, Friends, Photos, Reels, More and a three-dot menu',()=>{
 const start=appSource.indexOf('function renderProfile(data){'),end=appSource.indexOf('function mediaMaxBytes(',start),profile=appSource.slice(start,end);
 for(const label of ["'All'","'About'","'Friends'","'Photos'","'Reels'","'More'"])assert.ok(profile.includes(label),label+' tab must exist');
 assert.match(profile,/profile-overflow/);assert.match(profile,/profileSection==='photos'/);assert.match(profile,/profileSection==='reels'/);
});
test('profile overflow has View as, Search, Highlights, status, archives and activity log',()=>{
 for(const label of ['View as','Search','Add highlights','Profile status','Archive','Story archive','Activity log'])assert.ok(appSource.includes(label),label+' must exist');
});
test('profile additions call persisted feature APIs and publish Reels separately',()=>{
 for(const route of ['/profile-sections','/profile-status','/check-ins','/events','/highlights','/story-archive','/profile/archive','/activity'])assert.ok(appSource.includes(route),route+' must be wired');
 assert.match(appSource,/format:reel\?'reel':'post'/);
});
