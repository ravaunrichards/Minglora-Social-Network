import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [server, runtime, adminHtml, adminJs, adminCss, store, progression] = await Promise.all([
  read('src/server.js'),
  read('supabase/functions/minglora-runtime-state/index.ts'),
  read('public/admin-centre.html'),
  read('public/admin-centre.js'),
  read('public/admin-centre.css'),
  read('src/store.js'),
  read('backend/modules/gifter-progression/service.js')
]);

test('admin gifter grant and reset APIs require the designated MFA-verified Creator Hub owner', () => {
  assert.match(server, /function hasCreatorHubAdminToolsAccess\(user,req\)/);
  assert.match(server, /isDesignatedCreatorHubAdmin\(user\)&&isModerator\(user,req\)&&hasActiveReviewerSession\(user\)/);
  assert.match(server, /p==='\/api\/admin\/gifter-badges\/grant'/);
  assert.match(server, /p==='\/api\/admin\/gifter-badges\/reset'/);
  assert.match(server, /p==='\/api\/admin\/profiles\/verification'/);
  assert.match(server, /p==='\/api\/admin\/profiles\/search'/);
});

test('profile verification service actions independently verify the Creator Hub owner and permissions', () => {
  assert.match(runtime, /profile_verification_admin_search/);
  assert.match(runtime, /profile_verification_admin_set/);
  assert.match(runtime, /canUseProfileVerificationAdmin/);
  assert.match(runtime, /permissions\.includes\("platform:admin"\) && permissions\.includes\("verification:review"\)/);
  assert.match(runtime, /auth\.admin\.updateUserById\(targetUserId, \{ app_metadata: nextAppMetadata \}\)/);
  assert.match(runtime, /profile_verification_admin_set/);
});

test('admin badge grants live in separate runtime collections and do not create gift transactions', () => {
  assert.match(store, /'gifterBadgeAdminGrants', 'gifterBadgeAdminAudit'/);
  assert.match(progression, /export function grantGifterBadgeLevel/);
  assert.match(progression, /export function resetGifterBadgeAdminGrant/);
  assert.match(progression, /adminGrantsDoNotChangeCoinsOrGiftHistory: true/);
  assert.match(progression, /function getDeduplicatedSenderTotals/);
  assert.match(progression, /gifterProgressionLedger/);
});

test('Admin Centre includes member search, all-level unlock, individual grant, reset and profile verification', () => {
  for (const id of [
    'admin-identity-search-form',
    'admin-gifter-grant-level',
    'admin-gifter-grant-selected',
    'admin-gifter-unlock-all',
    'admin-gifter-reset',
    'admin-profile-verification-status',
    'admin-profile-verification-save'
  ]) assert.ok(adminJs.includes(id), 'Missing Admin Centre control: ' + id);
  assert.ok(adminJs.includes('Unlock all 50 gifter badge levels'));
  assert.ok(adminJs.includes('confirmed gift history and Coin balances were not changed'));
  assert.ok(adminHtml.includes('20261105-admin-gifter-badge-controls-1'));
  assert.ok(adminCss.includes('.admin-identity-actions-grid'));
});

test('profile verification badge visibility follows persisted status instead of a hard-coded owner email', async () => {
  const badges = await read('src/platform-badges.js');
  assert.match(badges, /status === 'verified' && badge === 'blue'/);
  assert.doesNotMatch(badges, /VERIFIED_PROFILE_EMAILS/);
});
