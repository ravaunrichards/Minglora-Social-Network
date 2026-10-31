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
  const headerEnd = appSource.indexOf('</div><div class="profile-tabs">', headerStart);
  assert.notEqual(headerStart, -1, 'profile identity header must exist');
  assert.notEqual(headerEnd, -1, 'profile counts must end the identity text block');
  const identityHeader = appSource.slice(headerStart, headerEnd);
  assert.match(identityHeader, /u\.name/);
  assert.match(identityHeader, /u\.username/);
  assert.doesNotMatch(identityHeader, /u\.(bio|location)/);\n  assert.doesNotMatch(identityHeader, /profile-counts/);
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


test('profile metrics are displayed in About, not beneath the username', () => {
  const aboutStart = appSource.indexOf('<div class="card profile-about">', renderProfileStart);
  const aboutEnd = appSource.indexOf('${aboutHtml', aboutStart);
  assert.notEqual(aboutStart, -1, 'About panel must exist');
  assert.notEqual(aboutEnd, -1, 'About details must follow profile metrics');
  const aboutMarkup = appSource.slice(aboutStart, aboutEnd);
  assert.match(aboutMarkup, /class="profile-counts profile-about-counts"/);
  for (const connection of ['followers', 'following', 'friends']) {
    assert.match(aboutMarkup, new RegExp('data-open-connections="' + connection + '"'));
  }
});
