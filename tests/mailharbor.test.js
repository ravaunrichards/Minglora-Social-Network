import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMailHarborApi, INTERNAL_MAIL_DOMAIN, processMailHarborOutbox } from '../backend/modules/mailharbor/service.js';

function setup() {
  const db = {
    users: [
      { id: 'member-alice', username: 'alice', name: 'Alice Example' },
      { id: 'member-bob', username: 'bob', name: 'Bob Example' }
    ],
    blocks: [],
    mailboxes: [],
    mailMessages: []
  };
  let saves = 0;
  const saveStore = async () => { saves += 1; };
  return { db, saveStore, get saves() { return saves; } };
}

async function call(state, member, method, pathname, input = {}, search = '') {
  return handleMailHarborApi({
    method,
    pathname,
    search,
    input,
    user: member,
    db: state.db,
    saveStore: state.saveStore
  });
}

test('MailHarbor opens a durable Minglora member mailbox without a separate database', async () => {
  const state = setup();
  const result = await call(state, state.db.users[0], 'GET', '/status');
  assert.equal(result.status, 200);
  assert.equal(result.body.internalMessagingEnabled, true);
  assert.equal(result.body.internalOutboundEnabled, true);
  assert.equal(result.body.internalInboundEnabled, true);
  assert.equal(result.body.mailboxSettingsEnabled, true);
  assert.equal(result.body.mailboxRefreshMode, 'authenticated-polling');
  assert.equal(result.body.outboundEmailConfigured, false);
  assert.equal(result.body.mailboxMode, 'minglora-internal');
  assert.equal(result.body.externalProviders.gmail.connected, false);
  assert.equal(result.body.externalProviders.yahoo.connected, false);
  assert.equal(state.db.mailboxes.length, 1);
  assert.equal(state.db.mailboxes[0].email, 'alice@' + INTERNAL_MAIL_DOMAIN);
  assert.equal(state.saves, 1);
});

test('MailHarbor delivers member-to-member messages into the recipient inbox', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const sent = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'bob@' + INTERNAL_MAIL_DOMAIN,
    subject: 'Hello from Minglora',
    body: 'This message stays inside Minglora.'
  });
  assert.equal(sent.status, 202);
  assert.equal(sent.body.message.delivery_status, 'delivered');
  assert.equal(sent.body.message.delivery_channel, 'minglora_internal');

  const aliceSent = await call(state, state.db.users[0], 'GET', '/messages', {}, '?folder=sent');
  const bobInbox = await call(state, state.db.users[1], 'GET', '/messages', {}, '?folder=inbox');
  assert.equal(aliceSent.body.messages.length, 1);
  assert.equal(aliceSent.body.messages[0].delivery_status, 'delivered');
  assert.equal(aliceSent.body.messages[0].sender_name, 'Alice Example');
  assert.equal(bobInbox.body.messages.length, 1);
  assert.equal(bobInbox.body.messages[0].sender_email, 'alice@' + INTERNAL_MAIL_DOMAIN);
  assert.equal(bobInbox.body.messages[0].body_text, 'This message stays inside Minglora.');
  assert.equal(bobInbox.body.messages[0].is_read, false);
});

test('MailHarbor never reports external email as delivered', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const result = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'someone@example.com',
    subject: 'External',
    body: 'This must not be queued.'
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /Resend API key and verify a public MailHarbor sender domain/);
  assert.equal(state.db.mailMessages.length, 0);
});

test('MailHarbor cannot deliver to an unknown member mailbox', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const result = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'missing@' + INTERNAL_MAIL_DOMAIN,
    subject: 'Unknown',
    body: 'No recipient exists.'
  });
  assert.equal(result.status, 404);
  assert.equal(state.db.mailMessages.length, 0);
  assert.equal(state.db.mailboxes.length, 1);
});

test('Mailbox updates are owner-scoped and persist read, star, archive and trash changes', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const sent = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'bob@' + INTERNAL_MAIL_DOMAIN,
    subject: 'State changes',
    body: 'Test message.'
  });
  const id = sent.body.message.id;
  const starred = await call(state, state.db.users[0], 'PATCH', '/messages/' + id, {
    isStarred: true,
    isRead: true,
    folder: 'archive'
  });
  assert.equal(starred.status, 200);
  assert.equal(starred.body.message.is_starred, true);
  assert.equal(starred.body.message.is_read, true);
  assert.equal(starred.body.message.folder, 'archive');

  const otherMember = await call(state, state.db.users[1], 'PATCH', '/messages/' + id, { isStarred: false });
  assert.equal(otherMember.status, 404);
  const removed = await call(state, state.db.users[0], 'DELETE', '/messages/' + id);
  assert.equal(removed.status, 204);
  assert.equal(state.db.mailMessages.find(message => message.id === id).folder, 'trash');
});


test('MailHarbor saves, edits and sends owner-scoped drafts', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const saved = await call(state, state.db.users[0], 'POST', '/drafts', {
    to: 'bob@' + INTERNAL_MAIL_DOMAIN,
    subject: 'First draft',
    body: 'Draft body.'
  });
  assert.equal(saved.status, 201);
  const draftId = saved.body.message.id;
  assert.equal(state.db.mailMessages.find(message => message.id === draftId).folder, 'drafts');

  const edited = await call(state, state.db.users[0], 'PATCH', '/messages/' + draftId, {
    subject: 'Updated draft',
    body: 'Updated draft body.',
    to: 'bob@' + INTERNAL_MAIL_DOMAIN
  });
  assert.equal(edited.status, 200);
  assert.equal(state.db.mailMessages.find(message => message.id === draftId).subject, 'Updated draft');

  const sent = await call(state, state.db.users[0], 'POST', '/messages', {
    draftId,
    to: 'bob@' + INTERNAL_MAIL_DOMAIN,
    subject: 'Updated draft',
    body: 'Updated draft body.'
  });
  assert.equal(sent.status, 202);
  assert.equal(state.db.mailMessages.some(message => message.id === draftId && message.folder === 'drafts'), false);
  assert.equal(state.db.mailMessages.some(message => message.owner_id === 'member-bob' && message.body_text === 'Updated draft body.'), true);
});

test('MailHarbor lets an external address remain in a draft but never sends it', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const saved = await call(state, state.db.users[0], 'POST', '/drafts', {
    to: 'person@example.com',
    subject: 'External draft',
    body: 'Not delivered.'
  });
  assert.equal(saved.status, 201);
  const result = await call(state, state.db.users[0], 'POST', '/messages', {
    draftId: saved.body.message.id,
    to: 'person@example.com',
    subject: 'External draft',
    body: 'Not delivered.'
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /External email delivery is not active/);
  assert.equal(state.db.mailMessages.find(message => message.id === saved.body.message.id).folder, 'drafts');
});

test('MailHarbor restores its in-memory state when Supabase persistence fails', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  state.saveStore = async () => { throw new Error('gateway unavailable'); };
  const result = await handleMailHarborApi({
    method: 'POST',
    pathname: '/messages',
    input: { to: 'bob@' + INTERNAL_MAIL_DOMAIN, subject: 'No false success', body: 'Persist me.' },
    user: state.db.users[0],
    db: state.db,
    saveStore: state.saveStore
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /No delivery was confirmed/);
  assert.equal(state.db.mailMessages.length, 0);
  assert.equal(state.db.mailboxes.length, 1);
});


test('MailHarbor settings are saved per member and control mailbox preferences', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const initial = await call(state, state.db.users[0], 'GET', '/settings');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.settings.displayName, 'Alice Example');
  assert.equal(initial.body.settings.checkForNewMailSeconds, 20);
  assert.equal(initial.body.settings.markReadOnOpen, true);
  const updated = await call(state, state.db.users[0], 'PATCH', '/settings', {
    displayName: 'Alice on Minglora', signature: 'Sent with MailHarbor', checkForNewMailSeconds: 30,
    markReadOnOpen: false, showMessagePreview: false, compactView: true
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.settings.displayName, 'Alice on Minglora');
  assert.equal(updated.body.settings.signature, 'Sent with MailHarbor');
  assert.equal(updated.body.settings.checkForNewMailSeconds, 30);
  assert.equal(updated.body.settings.markReadOnOpen, false);
  assert.equal(updated.body.settings.showMessagePreview, false);
  assert.equal(updated.body.settings.compactView, true);
  const bob = await call(state, state.db.users[1], 'GET', '/settings');
  assert.equal(bob.body.settings.displayName, 'Bob Example');
  assert.equal(bob.body.settings.signature, '');
});

test('MailHarbor rejects invalid settings without changing stored preferences', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const bad = await call(state, state.db.users[0], 'PATCH', '/settings', { displayName: '  ', checkForNewMailSeconds: 5 });
  assert.equal(bad.status, 400);
  const saved = await call(state, state.db.users[0], 'GET', '/settings');
  assert.equal(saved.body.settings.displayName, 'Alice Example');
  assert.equal(saved.body.settings.checkForNewMailSeconds, 20);
});


test('MailHarbor queues and dispatches external messages through the provider outbox', async () => {
  const savedEnv = {};
  const keys = ['MAILHARBOR_RESEND_API_KEY', 'MAILHARBOR_MAIL_DOMAIN', 'MAILHARBOR_DOMAIN_VERIFIED', 'MAILHARBOR_FROM_EMAIL'];
  for (const key of keys) savedEnv[key] = process.env[key];
  process.env.MAILHARBOR_RESEND_API_KEY = 're_test_mailharbor';
  process.env.MAILHARBOR_MAIL_DOMAIN = 'mail.example.com';
  process.env.MAILHARBOR_DOMAIN_VERIFIED = 'true';
  process.env.MAILHARBOR_FROM_EMAIL = 'no-reply@mail.example.com';
  try {
    const state = setup();
    const queued = await call(state, state.db.users[0], 'POST', '/messages', {
      to: 'person@example.net',
      subject: 'External test',
      body: 'Queued for provider delivery.'
    });
    assert.equal(queued.status, 202);
    assert.equal(queued.body.message.delivery_status, 'queued');
    const delivered = await processMailHarborOutbox({
      db: state.db,
      saveStore: state.saveStore,
      sendEmail: async (message, idempotencyKey) => {
        assert.equal(message.externalDelivery.to[0], 'person@example.net');
        assert.match(idempotencyKey, /^minglora-mailharbor-/);
        return { id: 'provider-message-12345678' };
      }
    });
    assert.equal(delivered.processed, true);
    assert.equal(delivered.status, 'sent');
    const sentMessage = state.db.mailMessages.find(message => message.id === queued.body.message.id);
    assert.equal(sentMessage.delivery_status, 'sent');
    assert.equal(sentMessage.provider_message_id, 'provider-message-12345678');
    assert.equal(sentMessage.externalDelivery.status, 'sent');
  } finally {
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }
});

test('MailHarbor accepts @username and bare usernames for free internal member delivery', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');

  const sentToHandle = await call(state, state.db.users[0], 'POST', '/messages', {
    to: '@bob',
    subject: 'Handle delivery',
    body: 'This uses the Minglora member handle.'
  });
  assert.equal(sentToHandle.status, 202);
  assert.equal(sentToHandle.body.message.delivery_status, 'delivered');
  const bobInbox = await call(state, state.db.users[1], 'GET', '/messages', {}, '?folder=inbox');
  assert.equal(bobInbox.body.messages.length, 1);
  assert.equal(bobInbox.body.messages[0].sender_email, 'alice@' + INTERNAL_MAIL_DOMAIN);

  const sentToBareUsername = await call(state, state.db.users[1], 'POST', '/messages', {
    to: 'alice',
    subject: 'Reply by username',
    body: 'A bare Minglora username also resolves internally.'
  });
  assert.equal(sentToBareUsername.status, 202);
  const aliceInbox = await call(state, state.db.users[0], 'GET', '/messages', {}, '?folder=inbox');
  assert.equal(aliceInbox.body.messages.length, 1);
  assert.equal(aliceInbox.body.messages[0].sender_email, 'bob@' + INTERNAL_MAIL_DOMAIN);
});

test('MailHarbor normalizes @username recipients when saving drafts', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const saved = await call(state, state.db.users[0], 'POST', '/drafts', {
    to: '@bob', subject: 'Handle draft', body: 'Draft for a Minglora member.'
  });
  assert.equal(saved.status, 201);
  const draft = state.db.mailMessages.find(message => message.id === saved.body.message.id);
  assert.deepEqual(draft.recipients.to, ['bob@' + INTERNAL_MAIL_DOMAIN]);
});

test('MailHarbor address aliases persist across requests without changing the Minglora username', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const changed = await call(state, state.db.users[0], 'PATCH', '/account/address', { username: 'alice_mail' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.email, 'alice_mail@' + INTERNAL_MAIL_DOMAIN);

  const reopened = await call(state, state.db.users[0], 'GET', '/me');
  assert.equal(reopened.body.user.username, 'alice');
  assert.equal(reopened.body.user.email, 'alice_mail@' + INTERNAL_MAIL_DOMAIN);
  assert.equal(state.db.mailboxes[0].username, 'alice');
  assert.equal(state.db.mailboxes[0].addressUsername, 'alice_mail');

  const reply = await call(state, state.db.users[1], 'POST', '/messages', {
    to: 'alice_mail', subject: 'Alias works', body: 'Deliver to the saved alias.'
  });
  assert.equal(reply.status, 202);
  const inbox = await call(state, state.db.users[0], 'GET', '/messages', {}, '?folder=inbox');
  assert.equal(inbox.body.messages.length, 1);
});

test('MailHarbor address aliases cannot claim another member username', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  const conflict = await call(state, state.db.users[0], 'PATCH', '/account/address', { username: 'bob' });
  assert.equal(conflict.status, 409);
  const saved = await call(state, state.db.users[0], 'GET', '/me');
  assert.equal(saved.body.user.email, 'alice@' + INTERNAL_MAIL_DOMAIN);
});


test('MailHarbor sends an external message through the member-selected connected Gmail account', async () => {
  const state = setup();
  await call(state, state.db.users[0], 'GET', '/me');
  state.db.mailExternalAccounts = [{
    id: 'account-gmail-alice',
    memberId: 'member-alice',
    provider: 'gmail',
    email: 'alice@gmail.com',
    displayName: 'Alice',
    status: 'connected',
    isDefault: true
  }];
  const queued = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'person@example.net',
    subject: 'External through Gmail',
    body: 'A real Gmail delivery is queued after account authorization.'
  });
  assert.equal(queued.status, 202);
  const saved = state.db.mailMessages.find(item => item.id === queued.body.message.id);
  assert.equal(saved.delivery_channel, 'gmail');
  assert.equal(saved.externalDelivery.provider, 'gmail');
  assert.equal(saved.externalDelivery.accountId, 'account-gmail-alice');
  let sentThrough = '';
  const processed = await processMailHarborOutbox({
    db: state.db,
    saveStore: state.saveStore,
    sendOAuthEmail: async input => {
      sentThrough = input.accountId;
      assert.equal(input.memberId, 'member-alice');
      assert.equal(input.message.externalDelivery.to[0], 'person@example.net');
      return { id: 'gmail-provider-message' };
    }
  });
  assert.equal(sentThrough, 'account-gmail-alice');
  assert.equal(processed.status, 'sent');
  assert.equal(state.db.mailMessages.find(item => item.id === queued.body.message.id).delivery_channel, 'gmail');
  assert.equal(state.db.mailMessages.find(item => item.id === queued.body.message.id).provider_message_id, 'gmail-provider-message');
});

test('MailHarbor validates, persists, displays and delivers attachment files to internal recipients', async () => {
  const state = setup();
  const file = Buffer.from('MailHarbor attachment payload', 'utf8').toString('base64');
  const sent = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'bob',
    subject: 'Attachment test',
    body: 'Please see the file.',
    attachments: [{
      filename: 'support-notes.txt',
      contentType: 'text/plain',
      size: Buffer.from(file, 'base64').length,
      contentBase64: file
    }]
  });
  assert.equal(sent.status, 202);
  const delivered = state.db.mailMessages.find(item => item.owner_id === 'member-bob');
  assert.equal(delivered.attachments.length, 1);
  assert.equal(delivered.attachments[0].filename, 'support-notes.txt');
  assert.equal(Buffer.from(delivered.attachments[0].contentBase64, 'base64').toString('utf8'), 'MailHarbor attachment payload');

  const list = await call(state, state.db.users[1], 'GET', '/messages', {}, '?folder=inbox');
  assert.equal(list.body.messages[0].attachments[0].available, true);
  assert.equal('contentBase64' in list.body.messages[0].attachments[0], false);

  const detail = await call(state, state.db.users[1], 'GET', '/messages/' + delivered.id);
  assert.equal(detail.body.message.attachments[0].contentBase64, file);
});

test('MailHarbor rejects unsafe or oversized attachment payloads before storing messages', async () => {
  const state = setup();
  const invalid = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'bob',
    subject: 'Bad attachment',
    body: 'Do not store this.',
    attachments: [{ filename: 'bad.bin', contentType: 'application/octet-stream', contentBase64: 'not base64!' }]
  });
  assert.equal(invalid.status, 400);
  assert.equal(state.db.mailMessages.length, 0);

  const tooLarge = await call(state, state.db.users[0], 'POST', '/messages', {
    to: 'bob',
    subject: 'Large attachment',
    body: 'Do not store this.',
    attachments: [{
      filename: 'large.bin',
      contentType: 'application/octet-stream',
      contentBase64: Buffer.alloc(1500001, 1).toString('base64')
    }]
  });
  assert.equal(tooLarge.status, 400);
  assert.equal(state.db.mailMessages.length, 0);
});

test('MailHarbor keeps attachments in drafts and sends the saved files with the draft', async () => {
  const state = setup();
  const file = Buffer.from('draft attachment', 'utf8').toString('base64');
  const draft = await call(state, state.db.users[0], 'POST', '/drafts', {
    to: '@bob',
    subject: 'Draft with attachment',
    body: 'Ready to send.',
    attachments: [{
      filename: 'draft.txt', contentType: 'text/plain',
      size: Buffer.from(file, 'base64').length, contentBase64: file
    }]
  });
  assert.equal(draft.status, 201);
  const draftId = draft.body.message.id;
  const sent = await call(state, state.db.users[0], 'POST', '/messages', {
    draftId,
    to: '@bob',
    subject: 'Draft with attachment',
    body: 'Ready to send.'
  });
  assert.equal(sent.status, 202);
  const delivered = state.db.mailMessages.find(item => item.owner_id === 'member-bob');
  assert.equal(delivered.attachments[0].filename, 'draft.txt');
  assert.equal(delivered.attachments[0].contentBase64, file);
});
