'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('project contains server, browser app, and readme', () => {
  for (const f of ['server.js', 'public/index.html', 'public/styles.css', 'public/app.js', 'README.md']) assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
});
test('server defines health endpoint and room validation', () => {
  const s = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(s, /api\/health/); assert.match(s, /A-Z0-9-/); assert.match(s, /peer-joined/); assert.match(s, /maxPayload/);
});
