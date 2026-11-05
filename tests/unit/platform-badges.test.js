import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformAdminBadge, getProfileVerificationBadge } from '../../src/platform-badges.js';

const CREATOR_HUB_ADMIN_ID = '5b998c21-86b5-4621-ab37-e0808a2657b1';
const LARRY_TEST_ACCOUNT_ID = '28e1df97-3fe1-488e-bb84-bdc353c58653';

test('the designated Creator Hub owner sees the Admin badge only on their own profile', () => {
  const account = {
    id: CREATOR_HUB_ADMIN_ID,
    email: 'CreatorHubCreatorNetwork@Gmail.Com',
    role: 'platform_owner'
  };

  assert.equal(getPlatformAdminBadge(account, CREATOR_HUB_ADMIN_ID), 'admin');
  assert.equal(getPlatformAdminBadge(account, 'another-viewer-id'), null);
  assert.equal(getPlatformAdminBadge(account), null, 'an unidentified viewer must not receive the private badge');
});

test('the separate Larry testing account never receives the Admin badge', () => {
  const account = {
    id: LARRY_TEST_ACCOUNT_ID,
    email: 'Larryjones2019ersky@gmail.com',
    role: 'platform_owner'
  };

  assert.equal(getPlatformAdminBadge(account, LARRY_TEST_ACCOUNT_ID), null);
  assert.equal(account.role, 'platform_owner', 'hiding a profile badge must not grant or revoke permissions');
});

test('other platform administrators keep their existing badge behavior', () => {
  assert.equal(getPlatformAdminBadge({
    email: 'another-admin@example.test',
    role: 'admin'
  }), 'admin');

  assert.equal(getPlatformAdminBadge({
    email: 'owner@example.test',
    role: 'platform_owner'
  }), 'admin');
});

test('the designated owner badge requires the exact owner identity and trusted role', () => {
  assert.equal(getPlatformAdminBadge({
    id: CREATOR_HUB_ADMIN_ID,
    email: 'different-email@example.test',
    role: 'platform_owner'
  }, CREATOR_HUB_ADMIN_ID), null);

  assert.equal(getPlatformAdminBadge({
    id: CREATOR_HUB_ADMIN_ID,
    email: 'CreatorHubCreatorNetwork@Gmail.Com',
    role: 'admin'
  }, CREATOR_HUB_ADMIN_ID), null);
});

test('badge exclusion is case-insensitive and does not affect verification badges', () => {
  assert.equal(getPlatformAdminBadge({
    id: LARRY_TEST_ACCOUNT_ID,
    email: '  LARRYJONES2019ERSKY@GMAIL.COM ',
    role: 'platform_owner',
    verificationBadge: 'blue'
  }, LARRY_TEST_ACCOUNT_ID), null);
});

test('the designated Creator Hub account receives a blue profile verification sticker independently', () => {
  const creator = {
    id: CREATOR_HUB_ADMIN_ID,
    email: 'CreatorHubCreatorNetwork@Gmail.Com',
    role: 'platform_owner',
    verificationBadge: null
  };

  assert.equal(getProfileVerificationBadge(creator), 'blue');
  assert.equal(getPlatformAdminBadge(creator, CREATOR_HUB_ADMIN_ID), 'admin');
  assert.equal(getPlatformAdminBadge(creator, 'another-viewer-id'), null);
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
