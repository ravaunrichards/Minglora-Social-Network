import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminCentre = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const adminCss = fs.readFileSync(new URL('../../public/admin-centre.css', import.meta.url), 'utf8');

test('Admin Centre exposes a protected Approval Center page and persistent pending-count banner', () => {
  assert.match(adminCentre, /key:'approvals',title:'Approval Center'/);
  assert.match(adminCentre, /id="admin-approval-notification"/);
  assert.match(adminCentre, /data-admin-route="approvals"/);
  assert.match(adminCentre, /initializeAdminApprovalCenter\(panel\)/);
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
  assert.match(adminCentre, /this will not execute the action/);
});

test('Approval notifications are refreshed in-app and remain accessible on mobile', () => {
  assert.match(adminCentre, /window\.setInterval\([\s\S]{0,160}30000/);
  assert.match(adminCentre, /visibilitychange/);
  assert.match(adminCss, /\.admin-approval-toast/);
  assert.match(adminCss, /@media\(max-width:620px\)[\s\S]*\.admin-approval-toast/);
});
