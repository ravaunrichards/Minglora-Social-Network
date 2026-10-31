import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const renderProfileStart = appSource.indexOf('function renderProfile(data){');
const renderProfileEnd = appSource.indexOf('\nasync function renderConnections', renderProfileStart);
const renderProfile = appSource.slice(renderProfileStart, renderProfileEnd);

test('profile bio and location are displayed in About, not beside the profile photo', () => {
  assert.notEqual(renderProfileStart, -1, 'renderProfile must exist');
  assert.notEqual(renderProfileEnd, -1, 'renderProfile must have a clear end');
  const headerStart = renderProfile.indexOf('<div class="profile-info-main">');
  const headerEnd = renderProfile.indexOf('</div>${relationshipActions}', headerStart);
  assert.notEqual(headerStart, -1, 'profile identity header must exist');
  assert.notEqual(headerEnd, -1, 'profile identity header must close');
  const identityHeader = renderProfile.slice(headerStart, headerEnd);
  assert.match(identityHeader, /u\.name/);
  assert.match(identityHeader, /u\.username/);
  assert.doesNotMatch(identityHeader, /u\.(bio|location)/);
  assert.match(renderProfile, /\['Bio',u\.bio\]/);
  assert.match(renderProfile, /\['Location',u\.location\]/);
  assert.match(renderProfile, /\['Joined',new Date\(u\.createdAt\)/);
});

test('all other personal profile details stay in the About details collection', () => {
  const rowsStart = renderProfile.indexOf('const aboutRows=[');
  const rowsEnd = renderProfile.indexOf('].filter(([,value])=>', rowsStart);
  assert.notEqual(rowsStart, -1, 'About details collection must exist');
  const rows = renderProfile.slice(rowsStart, rowsEnd);
  for (const field of ['country', 'county', 'parish', 'city', 'gender', 'relationshipStatus', 'contactPhone']) {
    assert.ok(rows.includes('u.' + field), field + ' must be in About');
  }
});
