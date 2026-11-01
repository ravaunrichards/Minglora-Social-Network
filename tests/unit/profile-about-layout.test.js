import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const renderProfileStart = appSource.indexOf('function profileAboutMarkup(u,isMe){');

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
  const rowsStart = appSource.indexOf('const rows=[', renderProfileStart);
  const rowsEnd = appSource.indexOf('.filter(([,value])=>', rowsStart);
  assert.notEqual(rowsStart, -1, 'About details collection must exist');
  assert.notEqual(rowsEnd, -1, 'About details collection must close');
  const rows = appSource.slice(rowsStart, rowsEnd);
  assert.match(rows, /\['Bio',u\.bio\]/);
  assert.match(rows, /\['Location',u\.location\]/);
  assert.match(appSource.slice(rowsEnd), /\['Joined',new Date\(u\.createdAt\)/);
});

test('all other personal profile details stay in the About details collection', () => {
  const rowsStart = appSource.indexOf('const rows=[', renderProfileStart);
  const rowsEnd = appSource.indexOf('.filter(([,value])=>', rowsStart);
  const rows = appSource.slice(rowsStart, rowsEnd);
  for (const field of ['country', 'county', 'parish', 'city', 'gender', 'relationshipStatus', 'contactPhone']) {
    assert.ok(rows.includes('u.' + field), field + ' must be in About');
  }
});


test('browser reloads the corrected profile script and replaces the old service-worker cache', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(indexHtml, /src="\/app\.js\?v=20261101-profile-more-3"/);
  assert.match(serviceWorker, /minglora-shell-v45-profile-more-sections/);
  assert.match(serviceWorker, /\/app\.js\?v=20261101-profile-more-3/);
  assert.match(serverSource, /'Cache-Control':'no-store'/);
  assert.match(serverSource, /'Cache-Control':'no-cache, max-age=0, must-revalidate'/);
});
