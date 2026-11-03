import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const login = fs.readFileSync(path.join(root, 'public/auth-login.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'docs/SUPABASE_SETUP.md'), 'utf8');

test('email verification links wait for a person before opening Supabase one-time URLs', () => {
  assert.match(login, /auth_confirmation/);
  assert.match(login, /gzycobgbasnqqhnympkr\.supabase\.co/);
  assert.match(login, /confirmation\.searchParams\.get\('token'\)/);
  assert.match(login, /window\.location\.assign\(confirmation\.href\)/);
  assert.match(login, /validRedirect/);
  assert.match(setup, /\.ConfirmationURL \| urlquery/);
  assert.match(setup, /#auth_confirmation=/);
  assert.match(serviceWorker, /email-link handoff refresh/);
});
