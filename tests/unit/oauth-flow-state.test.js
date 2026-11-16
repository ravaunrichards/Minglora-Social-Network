import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOAuthFlowCookie,
  readOAuthFlowCookie,
  clearOAuthFlowCookie
} from '../../src/oauth-flow-state.js';

const SECRET = 'minglora-oauth-flow-unit-test-secret-2026';
const STATE = 'state_' + 's'.repeat(26);
const VERIFIER = 'v'.repeat(43);
const NOW = 1_800_000_000_000;

test('OAuth flow cookie round-trips its state and PKCE verifier', () => {
  const cookie = createOAuthFlowCookie(STATE, VERIFIER, SECRET, true, NOW);
  assert.match(cookie, /^minglora_oauth=/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\/auth\/oauth\/callback/);
  assert.match(cookie, /; Max-Age=600/);
  assert.match(cookie, /; Secure$/);
  assert.deepEqual(readOAuthFlowCookie('sid=member-session; ' + cookie, SECRET, NOW + 1000), {
    state: STATE,
    verifier: VERIFIER,
    createdAt: NOW
  });
});

test('OAuth flow cookie is HttpOnly and does not set Secure in local development mode', () => {
  const cookie = createOAuthFlowCookie(STATE, VERIFIER, SECRET, false, NOW);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /; Secure/);
});

test('OAuth flow cookie rejects a tampered payload or signature', () => {
  const cookie = createOAuthFlowCookie(STATE, VERIFIER, SECRET, true, NOW);
  const [name, raw] = cookie.split(';', 2)[0].split('=');
  const decoded = decodeURIComponent(raw);
  const separator = decoded.lastIndexOf('.');
  const changedPayload = decoded.slice(0, separator) + 'A' + decoded.slice(separator + 1);
  const changedSignature = decoded.slice(0, separator + 1) + '0'.repeat(64);
  assert.equal(readOAuthFlowCookie(name + '=' + encodeURIComponent(changedPayload), SECRET, NOW), null);
  assert.equal(readOAuthFlowCookie(name + '=' + encodeURIComponent(changedSignature), SECRET, NOW), null);
});

test('OAuth flow cookie rejects expired, future-dated and malformed payloads', () => {
  const expired = createOAuthFlowCookie(STATE, VERIFIER, SECRET, false, NOW - 600_001);
  const future = createOAuthFlowCookie(STATE, VERIFIER, SECRET, false, NOW + 1);
  assert.equal(readOAuthFlowCookie(expired, SECRET, NOW), null);
  assert.equal(readOAuthFlowCookie(future, SECRET, NOW), null);
  assert.equal(readOAuthFlowCookie('minglora_oauth=%E0%A4%A', SECRET, NOW), null);
  assert.equal(readOAuthFlowCookie('sid=abc', SECRET, NOW), null);
});

test('OAuth flow cookie rejects weak signing secrets and invalid state or PKCE verifiers', () => {
  assert.throws(() => createOAuthFlowCookie(STATE, VERIFIER, 'too-short', false, NOW), TypeError);
  assert.throws(() => createOAuthFlowCookie('short', VERIFIER, SECRET, false, NOW), TypeError);
  assert.throws(() => createOAuthFlowCookie(STATE, 'short', SECRET, false, NOW), TypeError);
  assert.equal(readOAuthFlowCookie('minglora_oauth=bad', 'too-short', NOW), null);
});

test('OAuth flow cleanup expires only the scoped HttpOnly callback cookie', () => {
  const cookie = clearOAuthFlowCookie(true);
  assert.match(cookie, /^minglora_oauth=;/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\/auth\/oauth\/callback/);
  assert.match(cookie, /; Max-Age=0/);
  assert.match(cookie, /; Secure$/);
});
