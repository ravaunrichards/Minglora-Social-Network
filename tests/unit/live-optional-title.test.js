import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

const createStart = server.indexOf("if (method === 'POST' && p === '/api/live/sessions')");
const createEnd = server.indexOf('const liveRoomSettingsMatch', createStart);
const createRoute = server.slice(createStart, createEnd);

test('LIVE start form allows an empty title', () => {
  assert.match(app, /<span>LIVE title \(optional\)<\/span><input name='title' maxlength='120' placeholder='Add a title, or leave blank to go LIVE'>/);
  assert.doesNotMatch(app, /<input name='title' maxlength='120' required placeholder='What are you going LIVE about\?'>/);
  assert.match(app, /title:String\(values\.get\("title"\)\|\|""\)\.trim\(\)/);
});

test('Server generates a host-based fallback title and preserves the stored-title length limit', () => {
  assert.ok(createStart >= 0 && createEnd > createStart, 'LIVE creation route must remain present');
  assert.match(createRoute, /const providedTitle = String\(input\.title \|\| ''\)\.trim\(\)/);
  assert.match(createRoute, /const title = providedTitle \|\| hostDisplayName \+ "'s LIVE"/);
  assert.match(createRoute, /providedTitle\.length > 120/);
  assert.doesNotMatch(createRoute, /if \(!title\s*\|\|/);
  assert.match(createRoute, /title, visibility, broadcastType/);
});

test('Untitled public broadcasts notify followers without a blank title', () => {
  assert.match(createRoute, /const liveNotice = providedTitle \? hostDisplayName\+' is LIVE: '\+title : hostDisplayName\+' is LIVE now'/);
  assert.match(createRoute, /notify\(followerId,user\.id,'live',liveNotice/);
});
