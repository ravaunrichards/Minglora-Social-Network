import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminCentre = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const adminCss = fs.readFileSync(new URL('../../public/admin-centre.css', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');
const globalNotifications = fs.readFileSync(new URL('../../public/admin-approval-notifications.js', import.meta.url), 'utf8');
const globalNotificationCss = fs.readFileSync(new URL('../../public/admin-approval-notifications.css', import.meta.url), 'utf8');

test('Admin Centre exposes the protected Approval Center route without duplicate route-bound alerts', () => {
  assert.match(adminCentre, /key:'approvals',title:'Approval Center'/);
  assert.match(adminCentre, /link\.dataset\.adminRoute = definition\.key/);
  assert.match(adminCentre, /initializeAdminApprovalCenter\(panel\)/);
  assert.doesNotMatch(adminCentre, /id="admin-approval-notification"/);
  assert.doesNotMatch(adminCentre, /id="admin-approval-toast"/);
});

test('Approval Center loads real owner-protected approval and task queues without seed/demo requests', () => {
  assert.match(adminCentre, /adminCentreApi\('\/ai-network'\)/);
  assert.match(adminCentre, /adminCentreApi\('\/ai-network\/tasks'\)/);
  assert.match(adminCentre, /pending_human_review/);
  assert.match(adminCentre, /status === 'pending_approval'/);
  assert.match(adminCentre, /No pending approvals/);
  assert.doesNotMatch(adminCentre, /seedApproval|demoApproval|fakeApproval/);
});

test('Approval decisions use existing audited AI endpoints and retain execution safeguards', () => {
  assert.match(adminCentre, /\/ai-network\/approvals\//);
  assert.match(adminCentre, /\/ai-network\/tasks\//);
  assert.match(adminCentre, /method:'PATCH'/);
  assert.match(adminCentre, /status: decision === 'approve' \? 'approved' : 'rejected'/);
  assert.match(adminCentre, /does not start workers or execute the task/);
  assert.match(adminCentre, /will not execute the action/);
});

test('Approval queue refreshes continuously while shared fixed notifications remain mobile-accessible', () => {
  assert.match(adminCentre, /window\.setInterval\([\s\S]{0,160}30000/);
  assert.match(adminCentre, /visibilitychange/);
  assert.match(globalNotifications, /window\.setInterval\(refresh, INTERVAL_MS\)/);
  assert.match(globalNotifications, /document\.addEventListener\('visibilitychange'/);
  assert.match(globalNotificationCss, /#minglora-admin-approval-alerts\{position:fixed/);
  assert.match(globalNotificationCss, /@media\(max-width:560px\)/);
});

test('Admin Centre cache keys force browsers to load the new approval UI assets', () => {
  assert.match(adminHtml, /admin-centre\.css\?v=20261117-approval-center-1/);
  assert.match(adminHtml, /admin-centre\.js\?v=20261118-admin-global-approval-alerts-1/);
});
