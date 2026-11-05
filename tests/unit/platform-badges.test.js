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

test('the designated Creator Hub account receives a blue profile verification sticker', () => {
  const creator = {
    email: 'CreatorHubCreatorNetwork@Gmail.Com',
    role: undefined,
    verificationBadge: null
  };

  assert.equal(getProfileVerificationBadge(creator), 'blue');
  assert.equal(getPlatformAdminBadge(creator), null, 'verification must not grant the Admin badge');
});

test('the creator verification sticker matches the account email case-insensitively', () => {
  assert.equal(getProfileVerificationBadge({
    email: '  CREATORHUBCREATORNETWORK@GMAIL.COM ',
    verificationBadge: null
  }), 'blue');
});

test('other accounts keep their existing verification state', () => {
  assert.equal(getProfileVerificationBadge({
    email: 'member@example.test',
    verificationBadge: null
  }), null);

  assert.equal(getProfileVerificationBadge({
    email: 'verified@example.test',
    verificationBadge: 'blue'
  }), 'blue');
});
