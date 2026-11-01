import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [hostHtml, hostApp, mailHtml, mailApp, mailCss, sprite, server] = await Promise.all([
  read('public/index.html'),
  read('public/app.js'),
  read('public/mailharbor/index.html'),
  read('public/mailharbor/app.js'),
  read('public/mailharbor/styles.css'),
  read('public/assets/icons/navigation-3d.svg'),
  read('src/server.js')
]);

test('MailHarbor is rendered as a routed, session-backed Minglora module', () => {
  assert.match(hostHtml, /data-view="mailharbor"/);
  assert.match(hostApp, /state.view==='mailharbor'/);
  assert.match(hostApp, /src='\/mailharbor\/index.html\?embedded=1'/);
  assert.match(mailApp, /credentials: 'same-origin'/);
  assert.match(mailApp, /const API_BASE = '\/api\/mailharbor'/);
});


test('MailHarbor frame is allowed only from the same Minglora origin', () => {
  assert.match(server, /rel === 'mailharbor\/index\.html'/);
  assert.match(server, /'X-Frame-Options': 'SAMEORIGIN'/);
  assert.match(server, /'X-Frame-Options': 'DENY'/);
  assert.match(hostApp, /src='\/mailharbor\/index\.html\?embedded=1'/);
});

test('all mailbox destinations are real tabs with matching dimensional SVG symbols', () => {
  const folders = ['inbox', 'starred', 'sent', 'drafts', 'spam', 'trash', 'archive', 'accounts', 'settings'];
  for (const folder of folders) {
    assert.match(mailHtml, new RegExp('data-folder="' + folder + '"'));
  }
  for (const symbol of ['mailharbor', 'inbox', 'star', 'sent', 'drafts', 'spam', 'trash', 'archive', 'compose', 'refresh', 'search']) {
    assert.match(sprite, new RegExp('<symbol id="' + symbol + '" viewBox="0 0 64 64">'));
  }
  assert.match(mailApp, /function mailIcon\(/);
  assert.match(mailCss, /\.mail-3d-icon/);
});

test('mail actions are wired to real backend operations', () => {
  for (const id of ['compose', 'save-draft', 'send', 'markread', 'spam', 'archive', 'restore', 'delete', 'refresh']) {
    assert.match(mailHtml, new RegExp('id="' + id + '"'));
  }
  assert.match(mailApp, /request\('\/drafts'/);
  assert.match(mailApp, /mutateSelected\('spam'\)/);
  assert.match(mailApp, /mutateSelected\('restore'\)/);
  assert.match(mailApp, /payload\.draftId = currentDraftId/);
});

test('Gmail and Outlook have real owner-scoped OAuth connect, sync and disconnect flows', () => {
  for (const provider of ['gmail', 'yahoo', 'outlook', 'icloud']) {
    assert.match(mailApp, new RegExp("key: '" + provider + "'"));
  }
  assert.match(mailApp, /state\.configured === true/);
  assert.match(mailApp, /data-oauth-connect/);
  assert.match(mailApp, /data-oauth-sync/);
  assert.match(mailApp, /data-oauth-disconnect/);
  assert.match(mailApp, /encrypted server-side OAuth tokens/);
  assert.match(mailHtml, /Connected accounts/);
  assert.match(mailHtml, /id="from-account"/);
  assert.match(mailHtml, /id="attachments"/);
  assert.match(mailHtml, /id="reply-message"/);
  assert.match(mailHtml, /id="forward-message"/);
  assert.match(mailApp, /async function selectedFileAttachments/);
  assert.match(mailApp, /function composeFromMessage/);
  assert.match(server, /result\.redirectTo/);
});


test('MailHarbor has per-mailbox settings and authenticated automatic refresh', () => {
  assert.match(mailHtml, /data-folder="settings"/);
  assert.match(mailApp, /request\('\/settings'/);
  assert.match(mailApp, /function startMailPolling\(/);
  assert.match(mailApp, /mailPollingTimer = window\.setInterval/);
  assert.match(mailApp, /checkForNewMailSeconds/);
  assert.match(mailApp, /\[15, 20, 30, 60\]/);
  assert.match(mailApp, /markReadOnOpen/);
  assert.match(mailApp, /showMessagePreview/);
  assert.match(mailApp, /compactView/);
  assert.match(mailCss, /\.mail-settings-card/);
});


test('MailHarbor signed provider webhook and external outbox worker are mounted in Minglora', () => {
  assert.ok(server.includes('handleMailHarborWebhook'));
  assert.ok(server.includes("p === '/api/mailharbor/webhooks/resend'"));
  assert.ok(server.includes('processMailHarborOutbox'));
  assert.ok(server.includes('req.rawBody = Buffer.concat(chunks)'));
  assert.ok(mailApp.includes('Delivered externally'));
  assert.ok(mailApp.includes('Resend delivery'));
});

test('free MailHarbor member addressing uses @username and labels internal-only mailbox handles', () => {
  assert.match(mailHtml, /placeholder="@username or name@example\.com"/);
  assert.match(mailHtml, /using @username/);
  assert.match(mailApp, /function mailboxDisplayAddress\(/);
  assert.match(mailApp, /Minglora only/);
});

test('MailHarbor uses the app-wide durable state for encrypted external mailbox accounts', async () => {
  const store = await read('src/store.js');
  assert.match(store, /'mailOAuthStates', 'mailExternalAccounts'/);
  const oauth = await read('backend/modules/mailharbor/oauth.js');
  assert.match(oauth, /createCipheriv\('aes-256-gcm'/);
  assert.match(oauth, /code_challenge_method: 'S256'/);
  assert.match(oauth, /memberId: String\(memberId\)/);
  assert.match(oauth, /function safeAccount\(/);
});
