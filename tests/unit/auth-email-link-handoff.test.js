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


test('independent auth handler owns both sign-in and account registration', () => {
  assert.match(login, /REGISTER_FORM_SELECTOR\s*=\s*'#register-form'/);
  assert.match(login, /jsonRequest\('\/auth\/register'/);
  assert.match(login, /jsonRequest\('\/auth\/login'/);
  assert.match(login, /event\.stopImmediatePropagation\(\)/);
  assert.match(login, /showRegistrationError/);
});

test('account-auth script and service-worker shell caches use the refreshed version', () => {
  assert.match(login, /submitRegistration\(form\)/);
  assert.match(serviceWorker, /minglora-shell-v83-coin-funding-sources-1/);
  assert.match(serviceWorker, /auth-login\.js\?v=20261105-admin-mfa-enrollment-1/);
});


test('login and registration buttons have a direct click path independent of app.js', () => {
  assert.match(login, /addEventListener\('click'/);
  assert.match(login, /target\.closest\('button\[type="submit"\]'\)/);
  assert.match(login, /form\.reportValidity\(\)/);
  assert.match(login, /submitLogin\(form\)/);
  assert.match(login, /submitRegistration\(form\)/);
});

test('auth handler loads before the large application bundle', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.ok(html.indexOf('auth-login.js?v=20261105-admin-mfa-enrollment-1') < html.indexOf('/app.js?'));
  assert.match(serviceWorker, /minglora-shell-v83-coin-funding-sources-1/);
  assert.match(serviceWorker, /auth-login\.js\?v=20261105-admin-mfa-enrollment-1/);
});
