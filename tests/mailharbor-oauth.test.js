import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeMailHarborOAuth,
  disconnectMailHarborOAuthAccount,
  getMailHarborOAuthStatus,
  listMailHarborOAuthAccounts,
  sendMailHarborOAuthMessage,
  startMailHarborOAuth,
  syncMailHarborOAuthAccount
} from '../backend/modules/mailharbor/oauth.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

function withEnvironment(values, operation) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return Promise.resolve().then(operation).finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('MailHarbor provider setup reports Gmail send-only and Outlook inbox-plus-send capabilities', () => {
  const status = getMailHarborOAuthStatus({
    APP_ORIGIN: 'https://minglora-social-network.onrender.com',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret'
  });
  assert.equal(status.gmail.configured, true);
  assert.equal(status.gmail.canSend, true);
  assert.equal(status.gmail.canSync, false);
  assert.equal(status.outlook.configured, true);
  assert.equal(status.outlook.canSend, true);
  assert.equal(status.outlook.canSync, true);
  assert.equal(status.gmail.callbackUrl, 'https://minglora-social-network.onrender.com/api/mailharbor/oauth/gmail/callback');
  assert.equal(status.outlook.callbackUrl, 'https://minglora-social-network.onrender.com/api/mailharbor/oauth/outlook/callback');
});

test('Gmail OAuth is PKCE-protected, encrypts tokens, supports sending and avoids restricted inbox scopes', async () => {
  await withEnvironment({
    APP_ORIGIN: 'https://minglora-social-network.onrender.com',
    SESSION_SECRET: 'minglora-oauth-test-session-secret-000000000000',
    MAILHARBOR_OAUTH_ENCRYPTION_KEY: 'mailharbor-test-encryption-secret-000000000000',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret'
  }, async () => {
    const originalFetch = globalThis.fetch;
    const db = { mailOAuthStates: [], mailExternalAccounts: [], mailMessages: [] };
    const saveStore = async () => {};
    try {
      const started = await startMailHarborOAuth({ provider: 'gmail', memberId: 'member-alice', db, saveStore });
      const authorization = new URL(started.authorizationUrl);
      assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
      assert.match(authorization.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{40,}$/);
      const scopes = authorization.searchParams.get('scope').split(' ');
      assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.send'));
      assert.ok(!scopes.includes('https://www.googleapis.com/auth/gmail.modify'));
      assert.ok(!scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
      const state = authorization.searchParams.get('state');

      globalThis.fetch = async (url, options = {}) => {
        if (String(url) === 'https://oauth2.googleapis.com/token') {
          const body = new URLSearchParams(options.body);
          assert.equal(body.get('grant_type'), 'authorization_code');
          assert.ok(body.get('code_verifier'));
          return json({
            access_token: 'fake-google-access-token-1234567890',
            refresh_token: 'fake-google-refresh-token-1234567890',
            expires_in: 3600,
            scope: scopes.join(' ')
          });
        }
        if (String(url) === 'https://openidconnect.googleapis.com/v1/userinfo') {
          return json({ email: 'alice@gmail.com', name: 'Alice Example' });
        }
        if (String(url) === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
          const body = JSON.parse(options.body);
          const raw = Buffer.from(body.raw, 'base64url').toString('utf8');
          assert.match(raw, /To: receiver@example\.net/);
          assert.match(raw, /Bcc: hidden@example\.net/);
          assert.match(raw, /Subject: Test from Gmail/);
          assert.match(raw, /Hello from MailHarbor/);
          return json({ id: 'gmail-sent-message-001' });
        }
        throw new Error('Unexpected mocked Google request: ' + String(url));
      };

      const account = await completeMailHarborOAuth({
        provider: 'gmail', memberId: 'member-alice', code: 'authorization-code',
        state, db, saveStore
      });
      assert.equal(account.email, 'alice@gmail.com');
      assert.equal(account.canSend, true);
      assert.equal(account.canSync, false);
      assert.equal('tokensSealed' in account, false);
      const stored = db.mailExternalAccounts[0];
      assert.ok(stored.tokensSealed);
      assert.ok(!stored.tokensSealed.includes('fake-google-access-token'));
      assert.equal(listMailHarborOAuthAccounts(db, 'member-alice').length, 1);
      assert.equal(listMailHarborOAuthAccounts(db, 'member-bob').length, 0);

      const sent = await sendMailHarborOAuthMessage({
        db, memberId: 'member-alice', accountId: stored.id, saveStore,
        message: {
          subject: 'Test from Gmail',
          body_text: 'Hello from MailHarbor',
          externalDelivery: {
            to: ['receiver@example.net'], cc: [], bcc: ['hidden@example.net']
          }
        }
      });
      assert.equal(sent.id, 'gmail-sent-message-001');
      assert.equal(sent.provider, 'gmail');

      await assert.rejects(
        syncMailHarborOAuthAccount({ db, memberId: 'member-alice', accountId: stored.id, saveStore, makeMessageId: () => 1 }),
        error => error.status === 403 && /restricted/i.test(error.message)
      );
      await assert.rejects(
        completeMailHarborOAuth({ provider: 'gmail', memberId: 'member-alice', code: 'replay', state, db, saveStore }),
        error => error.status === 403
      );
      const disconnected = await disconnectMailHarborOAuthAccount({
        db, memberId: 'member-alice', accountId: stored.id, saveStore
      });
      assert.equal(disconnected.disconnected, true);
      assert.equal(listMailHarborOAuthAccounts(db, 'member-alice').length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Outlook delegated OAuth imports inbox messages and sends through Microsoft Graph', async () => {
  await withEnvironment({
    APP_ORIGIN: 'https://minglora-social-network.onrender.com',
    SESSION_SECRET: 'minglora-oauth-test-session-secret-000000000000',
    MAILHARBOR_OAUTH_ENCRYPTION_KEY: 'mailharbor-test-encryption-secret-000000000000',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
    MICROSOFT_TENANT_ID: 'common'
  }, async () => {
    const originalFetch = globalThis.fetch;
    const db = { mailOAuthStates: [], mailExternalAccounts: [], mailMessages: [] };
    const saveStore = async () => {};
    try {
      const started = await startMailHarborOAuth({ provider: 'outlook', memberId: 'member-bob', db, saveStore });
      const authorization = new URL(started.authorizationUrl);
      const scopes = authorization.searchParams.get('scope').split(' ');
      assert.ok(scopes.includes('Mail.Read'));
      assert.ok(scopes.includes('Mail.Send'));
      assert.ok(!scopes.includes('Mail.ReadWrite'));
      const state = authorization.searchParams.get('state');
      const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

      globalThis.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target === tokenEndpoint) {
          return json({
            access_token: 'fake-microsoft-access-token-1234567890',
            refresh_token: 'fake-microsoft-refresh-token-1234567890',
            expires_in: 3600,
            scope: scopes.join(' ')
          });
        }
        if (target.startsWith('https://graph.microsoft.com/v1.0/me?')) {
          return json({ id: 'microsoft-user-id', displayName: 'Bob Example', mail: 'bob@outlook.com' });
        }
        if (target.startsWith('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?')) {
          return json({
            value: [{
              id: 'outlook-message-001',
              internetMessageId: '<outlook-message-001@example.com>',
              subject: 'Incoming Outlook mail',
              from: { emailAddress: { address: 'sender@example.net', name: 'Sender Example' } },
              toRecipients: [{ emailAddress: { address: 'bob@outlook.com' } }],
              ccRecipients: [],
              body: { contentType: 'Text', content: 'Received through Microsoft Graph.' },
              receivedDateTime: '2026-10-31T12:00:00.000Z',
              isRead: false
            }]
          });
        }
        if (target === 'https://graph.microsoft.com/v1.0/me/sendMail') {
          const body = JSON.parse(options.body);
          assert.equal(body.message.toRecipients[0].emailAddress.address, 'reader@example.net');
          assert.equal(body.message.subject, 'Outgoing Outlook mail');
          return new Response(null, { status: 202 });
        }
        throw new Error('Unexpected mocked Microsoft request: ' + target);
      };

      const account = await completeMailHarborOAuth({
        provider: 'outlook', memberId: 'member-bob', code: 'authorization-code',
        state, db, saveStore
      });
      assert.equal(account.email, 'bob@outlook.com');
      assert.equal(account.canSync, true);
      const stored = db.mailExternalAccounts[0];
      const synced = await syncMailHarborOAuthAccount({
        db, memberId: 'member-bob', accountId: stored.id, saveStore,
        makeMessageId: (() => { let id = 1; return () => id++; })()
      });
      assert.equal(synced.imported, 1);
      assert.equal(db.mailMessages[0].sender_email, 'sender@example.net');
      assert.equal(db.mailMessages[0].subject, 'Incoming Outlook mail');
      assert.equal(db.mailMessages[0].body_text, 'Received through Microsoft Graph.');

      const sent = await sendMailHarborOAuthMessage({
        db, memberId: 'member-bob', accountId: stored.id, saveStore,
        message: {
          subject: 'Outgoing Outlook mail', body_text: 'Hello from Minglora',
          externalDelivery: { to: ['reader@example.net'], cc: [], bcc: [] }
        }
      });
      assert.equal(sent.provider, 'outlook');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
