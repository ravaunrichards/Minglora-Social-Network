import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformAdminBadge } from '../../src/platform-badges.js';

test('the Admin badge is hidden for Larry’s designated account', () => {
  const account = {
    email: 'Larryjones2019ersky@gmail.com',
    role: 'admin'
  };

  assert.equal(getPlatformAdminBadge(account), null);
  assert.equal(account.role, 'admin', 'hiding a profile badge must not revoke admin permissions');
});

test('the Admin badge remains available to other platform administrators', () => {
  assert.equal(getPlatformAdminBadge({
    email: 'another-admin@example.test',
    role: 'admin'
  }), 'admin');

  assert.equal(getPlatformAdminBadge({
    email: 'owner@example.test',
    role: 'platform_owner'
  }), 'admin');
});

test('badge exclusion is case-insensitive and does not affect verification badges', () => {
  assert.equal(getPlatformAdminBadge({
    email: '  LARRYJONES2019ERSKY@GMAIL.COM ',
    role: 'platform_owner',
    verificationBadge: 'blue'
  }), null);
});
