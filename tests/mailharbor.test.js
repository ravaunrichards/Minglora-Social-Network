import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMailHarborApi, INTERNAL_MAIL_DOMAIN } from '../backend/modules/mailharbor/service.js';

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
  assert.equal(result.status, 400);
  assert.match(result.body.error, /External email is not connected/);
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
  assert.equal(result.status, 400);
  assert.match(result.body.error, /External email is not connected/);
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
