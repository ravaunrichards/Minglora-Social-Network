import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isAccountBanned, isAccountHiddenFromPublic } from '../../backend/modules/moderation/account-visibility.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

test('banned and suspended accounts stay hidden until status is explicitly restored', () => {
  for (const status of ['banned', 'suspended', 'permanently_banned', 'permanently-banned', 'suspended_permanently']) {
    assert.equal(isAccountBanned({ id: 'member', status }), true, status);
    assert.equal(isAccountHiddenFromPublic({ id: 'member', status }), true, status);
  }
  assert.equal(isAccountBanned({ id: 'member', status: 'active' }), false);
  assert.equal(isAccountHiddenFromPublic({ id: 'member', status: 'active' }), false);
});

test('deactivated and deleted accounts are excluded from public profile visibility', () => {
  for (const status of ['deactivated', 'pending_deletion', 'deleted']) {
    assert.equal(isAccountHiddenFromPublic({ id: 'member', status }), true, status);
  }
  assert.equal(isAccountHiddenFromPublic(null), true);
});

test('public profile, discovery, feed, search, story and LIVE paths enforce account visibility', async () => {
  const server = await read('src/server.js');
  assert.match(server, /if\(!u\|\|isAccountHiddenFromPublic\(u\)\)return null/);
  assert.match(server, /function canViewProfile\(viewerId,target\)\{if\(!target\|\|isAccountHiddenFromPublic\(target\)\)return false/);
  assert.match(server, /isAccountHiddenFromPublic\(db\.users\.find\(member=>member\.id===session\.hostId\)\)/);
  assert.match(server, /canViewProfile\(user\.id,db\.users\.find\(member=>member\.id===post\.userId\)\)/);
  assert.match(server, /isAccountHiddenFromPublic\(db\.users\.find\(member=>member\.id===story\.userId\)\)/);
  assert.match(server, /isAccountHiddenFromPublic\(db\.users\.find\(member=>member\.id===ownerId\)\)/);
  assert.match(server, /isAccountBanned\(account\)/);
});

test('moderators have a private banned-account list and explicit unban route', async () => {
  const server = await read('src/server.js');
  const admin = await read('public/admin-centre.js');
  assert.match(server, /\/api\/moderation\/banned-users/);
  assert.match(server, /moderationUnbanMatch=p\.match/);
  assert.match(server, /target\.status='active';target\.unbannedAt=now\(\)/);
  assert.match(server, /'ban_account','unban_account'/);
  assert.match(admin, /Banned accounts/);
  assert.match(admin, /data-admin-unban-account/);
  assert.match(admin, /moderation\/banned-users/);
});
