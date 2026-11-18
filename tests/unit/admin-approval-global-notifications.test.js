import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const adminCentrePage = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const notifier = fs.readFileSync(new URL('../../public/admin-approval-notifications.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../public/admin-approval-notifications.css', import.meta.url), 'utf8');

test('main app and standalone Admin Centre both load the site-wide approval alert assets', () => {
  for (const page of [index, adminCentrePage]) {
    assert.match(page, /admin-approval-notifications\.css\?v=20261118-admin-global-approvals-357/);
    assert.match(page, /admin-approval-notifications\.js\?v=20261118-admin-global-approvals-357/);
  }
  assert.match(adminCentrePage, /admin-centre\.js\?v=20261118-admin-global-approval-alerts-1/);
});

test('global notifier reads only the existing owner and MFA protected approval sources', () => {
  assert.match(notifier, /fetchJson\('\/ai-network'\)/);
  assert.match(notifier, /fetchJson\('\/ai-network\/tasks'\)/);
  assert.match(notifier, /credentials: 'same-origin'/);
  assert.match(notifier, /pending_human_review/);
  assert.match(notifier, /pending_approval/);
  assert.match(notifier, /error\?\.status === 403/);
});

test('new approval requests display a pop-up and a persistent review link', () => {
  assert.match(notifier, /Administrator approval required/);
  assert.match(notifier, /Review and approve/);
  assert.match(notifier, /pending admin approvals/);
  assert.match(notifier, /admin-centre\.html\?page=approvals/);
  assert.match(notifier, /newlyPending/);
  assert.match(notifier, /window\.setInterval\(refresh, INTERVAL_MS\)/);
  assert.match(notifier, /visibilitychange/);
});

test('global approval notifier does not make approval decisions or bypass server permissions', () => {
  assert.doesNotMatch(notifier, /method:\s*['"]PATCH['"]/);
  assert.doesNotMatch(notifier, /Notification\.requestPermission|new Notification\(/);
  assert.match(notifier, /existing server-side 401\/403 response/);
});

test('site-wide notification assets are included in the new offline shell cache', () => {
  assert.match(worker, /^const CACHE_NAME='minglora-shell-v357-self-updating-1';$/m);
  assert.match(worker, /admin-approval-notifications\.css\?v=20261118-admin-global-approvals-357/);
  assert.match(worker, /admin-approval-notifications\.js\?v=20261118-admin-global-approvals-357/);
  assert.match(styles, /#minglora-admin-approval-alerts/);
  assert.match(styles, /@media\(max-width:560px\)/);
});
