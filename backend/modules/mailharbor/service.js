const INTERNAL_MAIL_DOMAIN = String(process.env.MAILHARBOR_MAIL_DOMAIN || 'members.minglora.invalid')
  .trim().toLowerCase().replace(/^@/, '');
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MESSAGE_FOLDERS = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
const MAX_RECIPIENTS = 50;
const MAX_BODY_LENGTH = 100000;
const MAX_SUBJECT_LENGTH = 998;
const DEFAULT_MAILBOX_SETTINGS = Object.freeze({ signature: '', checkForNewMailSeconds: 20, markReadOnOpen: true, showMessagePreview: true, compactView: false });
import { getMailHarborProviderStatus, retrieveResendReceivedEmail, sendMailHarborExternal, verifyResendWebhook } from './provider.js';

function ensureCollections(db) {
  if (!Array.isArray(db.mailboxes)) db.mailboxes = [];
  if (!Array.isArray(db.mailMessages)) db.mailMessages = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.blocks)) db.blocks = [];
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseAddressList(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[;,\n]/);
  return source.map(item => String(item ?? '').trim().toLowerCase()).filter(Boolean);
}

function parseRecipientAddressList(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[;,\n]/);
  return source.map(item => {
    const address = String(item ?? '').trim().toLowerCase();
    if (!address) return '';
    const username = address.startsWith('@') ? address.slice(1) : address;
    return USERNAME_RE.test(username) ? mailboxEmail(username) : address;
  }).filter(Boolean);
}

function currentMailboxDomain() {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(INTERNAL_MAIL_DOMAIN)) {
    throw new Error('MailHarbor internal mailbox domain is invalid.');
  }
  return INTERNAL_MAIL_DOMAIN;
}

function mailboxEmail(username) {
  return username + '@' + currentMailboxDomain();
}

function ensureMailbox(db, member) {
  const memberId = String(member?.id ?? '');
  const username = String(member?.username ?? '').trim().toLowerCase();
  if (!memberId || !USERNAME_RE.test(username)) {
    const error = new Error('Your Minglora account needs a valid username before its mailbox can be opened.');
    error.status = 400;
    throw error;
  }
  const displayName = cleanText(member.name || member.displayName || username, 120) || username;
  let mailbox = db.mailboxes.find(item => String(item.memberId) === memberId);
  if (!mailbox) {
    mailbox = {
      id: memberId, memberId, username, email: mailboxEmail(username), displayName,
      mailSettings: { ...DEFAULT_MAILBOX_SETTINGS },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    db.mailboxes.push(mailbox);
    return { mailbox, changed: true };
  }
  let changed = false;
  if (!mailbox.mailSettings || typeof mailbox.mailSettings !== 'object' || Array.isArray(mailbox.mailSettings)) {
    mailbox.mailSettings = { ...DEFAULT_MAILBOX_SETTINGS };
    changed = true;
  } else {
    for (const [key, value] of Object.entries(DEFAULT_MAILBOX_SETTINGS)) {
      if (!Object.hasOwn(mailbox.mailSettings, key)) {
        mailbox.mailSettings[key] = value;
        changed = true;
      }
    }
  }
  const desiredEmail = mailboxEmail(username);
  if (mailbox.username !== username) { mailbox.username = username; changed = true; }
  if (String(mailbox.email || '').toLowerCase() !== desiredEmail) { mailbox.email = desiredEmail; changed = true; }
  if (mailbox.displayName !== displayName) { mailbox.displayName = displayName; changed = true; }
  return { mailbox, changed };
}

function memberIsBlocked(db, firstId, secondId) {
  return db.blocks.some(block => {
    const blocker = String(block.blockerId ?? block.blocker_id ?? block.from ?? '');
    const blocked = String(block.blockedId ?? block.blocked_id ?? block.to ?? '');
    return (blocker === firstId && blocked === secondId) ||
      (blocker === secondId && blocked === firstId);
  });
}

function makeMessageId(db) {
  const currentMax = db.mailMessages.reduce((max, message) => {
    const id = Number(message.id);
    return Number.isSafeInteger(id) && id > max ? id : max;
  }, 0);
  return Math.max(currentMax + 1, Date.now() * 1000);
}

function mailboxForAddress(db, email) {
  const existing = db.mailboxes.find(item => String(item.email).toLowerCase() === email);
  if (existing) return existing;
  const [username, domain] = email.split('@');
  if (domain !== currentMailboxDomain()) return null;
  const member = db.users.find(item => String(item.username || '').toLowerCase() === username);
  if (!member) return null;
  return ensureMailbox(db, member).mailbox;
}


function validateDraftRecipients(input, existing = {}) {
  const recipients = {
    to: parseRecipientAddressList(input.to === undefined ? existing.to || [] : input.to),
    cc: parseRecipientAddressList(input.cc === undefined ? existing.cc || [] : input.cc),
    bcc: parseRecipientAddressList(input.bcc === undefined ? existing.bcc || [] : input.bcc)
  };
  const all = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  const unique = [...new Set(all)];
  if (unique.length > MAX_RECIPIENTS) return { error: 'A draft can have up to 50 recipients.' };
  if (all.some(email => !EMAIL_RE.test(email))) return { error: 'One or more draft email addresses are invalid.' };
  recipients.to = [...new Set(recipients.to)];
  recipients.cc = [...new Set(recipients.cc)].filter(email => !recipients.to.includes(email));
  recipients.bcc = [...new Set(recipients.bcc)].filter(email => !recipients.to.includes(email) && !recipients.cc.includes(email));
  return { recipients };
}

function validateRecipients(input) {
  const recipients = {
    to: parseRecipientAddressList(input.to),
    cc: parseRecipientAddressList(input.cc),
    bcc: parseRecipientAddressList(input.bcc)
  };
  const all = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  const unique = [...new Set(all)];
  if (!recipients.to.length) return { error: 'Add at least one recipient in To.' };
  if (unique.length > MAX_RECIPIENTS) return { error: 'A message can have up to 50 recipients.' };
  if (all.some(email => !EMAIL_RE.test(email))) return { error: 'One or more recipient email addresses are invalid.' };
  recipients.to = [...new Set(recipients.to)];
  recipients.cc = [...new Set(recipients.cc)].filter(email => !recipients.to.includes(email));
  recipients.bcc = [...new Set(recipients.bcc)].filter(email => !recipients.to.includes(email) && !recipients.cc.includes(email));
  return { recipients, unique };
}

async function persist(db, saveStore, before) {
  try {
    await saveStore();
  } catch (error) {
    db.mailboxes.splice(0, db.mailboxes.length, ...before.mailboxes);
    db.mailMessages.splice(0, db.mailMessages.length, ...before.mailMessages);
    throw error;
  }
}

export async function handleMailHarborApi({ method, pathname, search = '', input = {}, user, db, saveStore }) {
  ensureCollections(db);
  const beforeProvision = {
    mailboxes: structuredClone(db.mailboxes),
    mailMessages: structuredClone(db.mailMessages)
  };
  let mailbox;
  try {
    const provisioned = ensureMailbox(db, user);
    mailbox = provisioned.mailbox;
    if (provisioned.changed) await persist(db, saveStore, beforeProvision);
  } catch (error) {
    return { status: error.status || 503, body: { error: error.status ? error.message : 'MailHarbor could not save your Minglora mailbox.' } };
  }

  const verb = String(method || 'GET').toUpperCase();
  const route = String(pathname || '/');
  const query = new URLSearchParams(search);
  const providerStatus = getMailHarborProviderStatus();
  const internalStatus = {
    service: 'mailharbor', status: 'ready', mailboxMode: 'minglora-internal',
    mailDomain: currentMailboxDomain(), mailboxSettingsEnabled: true,
    internalMessagingEnabled: true, internalOutboundEnabled: true, internalInboundEnabled: true,
    outboundEmailConfigured: providerStatus.outboundEmailConfigured,
    inboundEmailConfigured: providerStatus.inboundEmailConfigured,
    externalOutboundConfigured: providerStatus.outboundEmailConfigured,
    externalInboundConfigured: providerStatus.inboundEmailConfigured,
    mailboxRefreshMode: 'authenticated-polling',
    externalProviders: {
      resend: providerStatus.resend, gmail: providerStatus.gmail, yahoo: providerStatus.yahoo,
      outlook: providerStatus.outlook, icloud: providerStatus.icloud
    },
    externalMailDomainVerified: providerStatus.domainVerified,
    provider: 'resend', realtimeUrl: null,
    deliveryNote: providerStatus.outboundEmailConfigured
      ? 'External email is queued through Resend. Signed provider delivery receipts update final delivery status.'
      : 'Internal Minglora send and receive are active. External sending requires a Resend API key and a verified public sender domain. Inbound also requires a signed webhook and receiving-domain routing.'
  };

  if (verb === 'GET' && route === '/status') return { status: 200, body: internalStatus };
  if (verb === 'GET' && route === '/me') {
    return {
      status: 200,
      body: { user: { id: mailbox.memberId, username: mailbox.username, name: mailbox.displayName, email: mailbox.email } }
    };
  }
  if (verb === 'GET' && route === '/settings') {
    return { status: 200, body: { settings: { ...DEFAULT_MAILBOX_SETTINGS, ...(mailbox.mailSettings || {}), displayName: mailbox.displayName } } };
  }
  if (verb === 'PATCH' && route === '/settings') {
    const next = { ...(mailbox.mailSettings || {}) };
    let displayName = mailbox.displayName;
    if (input.displayName !== undefined) {
      displayName = cleanText(input.displayName, 120);
      if (!displayName) return { status: 400, body: { error: 'Display name cannot be empty.' } };
    }
    if (input.signature !== undefined) {
      if (typeof input.signature !== 'string' || input.signature.length > 5000) return { status: 400, body: { error: 'Signature must be text and 5,000 characters or fewer.' } };
      next.signature = input.signature;
    }
    for (const key of ['markReadOnOpen', 'showMessagePreview', 'compactView']) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== 'boolean') return { status: 400, body: { error: key + ' must be true or false.' } };
        next[key] = input[key];
      }
    }
    if (input.checkForNewMailSeconds !== undefined) {
      const seconds = Number(input.checkForNewMailSeconds);
      if (![15, 20, 30, 60].includes(seconds)) return { status: 400, body: { error: 'Mailbox refresh must be 15, 30 or 60 seconds.' } };
      next.checkForNewMailSeconds = seconds;
    }
    const before = structuredClone(mailbox);
    mailbox.displayName = displayName;
    mailbox.mailSettings = { ...DEFAULT_MAILBOX_SETTINGS, ...next };
    mailbox.updatedAt = new Date().toISOString();
    try { await saveStore(); }
    catch (_error) {
      Object.assign(mailbox, before);
      return { status: 503, body: { error: 'Minglora could not save your MailHarbor settings. Try again.' } };
    }
    return { status: 200, body: { settings: { ...mailbox.mailSettings, displayName: mailbox.displayName } } };
  }

  if (verb === 'GET' && route === '/messages') {
    const folder = String(query.get('folder') || 'inbox').toLowerCase();
    const searchTerm = String(query.get('search') || '').trim().toLowerCase().slice(0, 200);
    const limit = Math.min(Math.max(Number(query.get('limit')) || 50, 1), 100);
    const offset = Math.max(Number(query.get('offset')) || 0, 0);
    if (folder !== 'starred' && !MESSAGE_FOLDERS.has(folder)) {
      return { status: 400, body: { error: 'Unsupported mailbox folder.' } };
    }
    let messages = db.mailMessages.filter(message => String(message.owner_id) === String(mailbox.memberId));
    if (folder === 'starred') messages = messages.filter(message => message.is_starred === true);
    else messages = messages.filter(message => message.folder === folder);
    if (searchTerm) messages = messages.filter(message =>
      [message.sender_email, message.subject, message.body_text,
        ...(message.recipients?.to || []), ...(message.recipients?.cc || [])]
        .some(value => String(value || '').toLowerCase().includes(searchTerm))
    );
    messages.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id));
    return {
      status: 200,
      body: { messages: messages.slice(offset, offset + limit), count: messages.length, limit, offset }
    };
  }

  const messageMatch = route.match(/^\/messages\/(\d+)$/);
  if (messageMatch && verb === 'GET') {
    const message = db.mailMessages.find(item =>
      Number(item.id) === Number(messageMatch[1]) && String(item.owner_id) === String(mailbox.memberId)
    );
    return message
      ? { status: 200, body: { message } }
      : { status: 404, body: { error: 'Message not found.' } };
  }


  if (route === '/drafts' && verb === 'POST') {
    const parsed = validateDraftRecipients(input);
    if (parsed.error) return { status: 400, body: { error: parsed.error } };
    const subject = String(input.subject ?? '').trim();
    const bodyText = String(input.body ?? '');
    if (subject.length > MAX_SUBJECT_LENGTH) return { status: 400, body: { error: 'Subject must be 998 characters or fewer.' } };
    if (bodyText.length > MAX_BODY_LENGTH) return { status: 400, body: { error: 'Draft is too long.' } };
    const before = structuredClone(db.mailMessages);
    const createdAt = new Date().toISOString();
    const id = makeMessageId(db);
    db.mailMessages.push({
      id, owner_id: mailbox.memberId, sender_email: mailbox.email, reply_to: mailbox.email,
      recipients: parsed.recipients, subject, body_text: bodyText, folder: 'drafts',
      is_read: true, is_starred: false, delivery_status: 'draft', delivery_channel: 'drafts',
      last_error: null, created_at: createdAt, updated_at: createdAt
    });
    try { await saveStore(); }
    catch (_error) {
      db.mailMessages.splice(0, db.mailMessages.length, ...before);
      return { status: 503, body: { error: 'Minglora could not save your draft. Try again.' } };
    }
    return { status: 201, body: { message: { id, folder: 'drafts', delivery_status: 'draft', created_at: createdAt } } };
  }

  if (route === '/messages' && verb === 'POST') {
    const parsed = validateRecipients(input);
    if (parsed.error) return { status: 400, body: { error: parsed.error } };

    const draftId = input.draftId === undefined || input.draftId === null || input.draftId === '' ? null : Number(input.draftId);
    const draft = draftId === null ? null : db.mailMessages.find(item =>
      Number(item.id) === draftId && String(item.owner_id) === String(mailbox.memberId) && item.folder === 'drafts'
    );
    if (draftId !== null && (!Number.isSafeInteger(draftId) || !draft)) {
      return { status: 404, body: { error: 'Draft not found in your mailbox.' } };
    }
    const subject = String(input.subject ?? '').trim();
    const bodyText = String(input.body ?? '');
    if (subject.length > MAX_SUBJECT_LENGTH) return { status: 400, body: { error: 'Subject must be 998 characters or fewer.' } };
    if (!bodyText.trim()) return { status: 400, body: { error: 'Write a message before sending.' } };
    if (bodyText.length > MAX_BODY_LENGTH) return { status: 400, body: { error: 'Message is too long.' } };

    const providerStatus = getMailHarborProviderStatus();
    const internalAddresses = parsed.unique.filter(email => email.split('@')[1] === currentMailboxDomain());
    const externalAddresses = parsed.unique.filter(email => email.split('@')[1] !== currentMailboxDomain());
    if (externalAddresses.length && !providerStatus.outboundEmailConfigured) {
      return { status: 503, body: { error: 'External email delivery is not active. Configure a Resend API key and verify a public MailHarbor sender domain first. No external message was queued.' } };
    }
    const before = { mailboxes: structuredClone(db.mailboxes), mailMessages: structuredClone(db.mailMessages) };
    const internalResolved = internalAddresses.map(email => ({ email, recipient: mailboxForAddress(db, email) }));
    const blocked = internalResolved.find(({ recipient }) =>
      !recipient || memberIsBlocked(db, String(mailbox.memberId), String(recipient.memberId))
    );
    if (blocked) {
      db.mailboxes.splice(0, db.mailboxes.length, ...before.mailboxes);
      db.mailMessages.splice(0, db.mailMessages.length, ...before.mailMessages);
      return { status: 404, body: { error: 'One or more Minglora member mailboxes could not be found.' } };
    }
    if (draft) {
      const draftIndex = db.mailMessages.findIndex(item => Number(item.id) === draftId && String(item.owner_id) === String(mailbox.memberId));
      if (draftIndex >= 0) db.mailMessages.splice(draftIndex, 1);
    }
    const createdAt = new Date().toISOString();
    const recipients = parsed.recipients;
    const messageId = makeMessageId(db);
    const externalDelivery = externalAddresses.length ? {
      status: 'queued', attempts: 0, nextAttemptAt: createdAt,
      to: recipients.to.filter(email => externalAddresses.includes(email)),
      cc: recipients.cc.filter(email => externalAddresses.includes(email)),
      bcc: recipients.bcc.filter(email => externalAddresses.includes(email))
    } : null;
    const hasExternal = Boolean(externalDelivery);
    db.mailMessages.push({
      id: messageId, owner_id: mailbox.memberId, sender_email: mailbox.email,
      sender_name: mailbox.displayName, reply_to: mailbox.email, recipients,
      subject, body_text: bodyText, folder: 'sent', is_read: true, is_starred: false,
      delivery_status: hasExternal ? 'queued' : 'delivered',
      delivery_channel: hasExternal ? (internalResolved.length ? 'mixed' : 'resend') : 'minglora_internal',
      externalDelivery, last_error: null, created_at: createdAt,
      sent_at: hasExternal ? null : createdAt, delivered_at: hasExternal ? null : createdAt
    });
    for (const { recipient } of internalResolved) {
      db.mailMessages.push({
        id: makeMessageId(db), owner_id: recipient.memberId, sender_email: mailbox.email,
        sender_name: mailbox.displayName, reply_to: mailbox.email,
        recipients: { to: recipients.to, cc: recipients.cc, bcc: [] },
        subject, body_text: bodyText, folder: 'inbox', is_read: false, is_starred: false,
        delivery_status: 'received', delivery_channel: 'minglora_internal',
        last_error: null, created_at: createdAt, sent_at: null, received_at: createdAt
      });
    }
    try { await saveStore(); }
    catch (_error) {
      db.mailboxes.splice(0, db.mailboxes.length, ...before.mailboxes);
      db.mailMessages.splice(0, db.mailMessages.length, ...before.mailMessages);
      return { status: 503, body: { error: 'Minglora could not save the message. No delivery was confirmed and nothing was queued for external delivery; refresh before retrying.' } };
    }
    return { status: 202, body: { message: {
      id: messageId, delivery_status: hasExternal ? 'queued' : 'delivered',
      delivery_channel: hasExternal ? (internalResolved.length ? 'mixed' : 'resend') : 'minglora_internal',
      externalRecipientsQueued: externalAddresses.length, internalRecipientsDelivered: internalResolved.length,
      created_at: createdAt
    } } };
  }

  if (messageMatch && verb === 'PATCH') {
    const message = db.mailMessages.find(item =>
      Number(item.id) === Number(messageMatch[1]) && String(item.owner_id) === String(mailbox.memberId)
    );
    if (!message) return { status: 404, body: { error: 'Message not found.' } };
    const patch = {};
    if (input.isRead !== undefined) {
      if (typeof input.isRead !== 'boolean') return { status: 400, body: { error: 'isRead must be true or false.' } };
      patch.is_read = input.isRead;
    }
    if (input.isStarred !== undefined) {
      if (typeof input.isStarred !== 'boolean') return { status: 400, body: { error: 'isStarred must be true or false.' } };
      patch.is_starred = input.isStarred;
    }
    if (input.folder !== undefined) {
      if (!MESSAGE_FOLDERS.has(String(input.folder))) return { status: 400, body: { error: 'Unsupported mailbox folder.' } };
      patch.folder = String(input.folder);
    }

    if (message.folder === 'drafts') {
      if (input.subject !== undefined) {
        const subject = String(input.subject ?? '').trim();
        if (subject.length > MAX_SUBJECT_LENGTH) return { status: 400, body: { error: 'Subject must be 998 characters or fewer.' } };
        patch.subject = subject;
      }
      if (input.body !== undefined) {
        const bodyText = String(input.body ?? '');
        if (bodyText.length > MAX_BODY_LENGTH) return { status: 400, body: { error: 'Draft is too long.' } };
        patch.body_text = bodyText;
      }
      if (input.to !== undefined || input.cc !== undefined || input.bcc !== undefined) {
        const parsed = validateDraftRecipients(input, message.recipients || {});
        if (parsed.error) return { status: 400, body: { error: parsed.error } };
        patch.recipients = parsed.recipients;
      }
    }
    if (!Object.keys(patch).length) return { status: 400, body: { error: 'No supported message changes were provided.' } };
    const before = {
      mailboxes: structuredClone(beforeProvision.mailboxes),
      mailMessages: structuredClone(db.mailMessages)
    };
    Object.assign(message, patch, { updated_at: new Date().toISOString() });
    try { await saveStore(); }
    catch (_error) {
      db.mailMessages.splice(0, db.mailMessages.length, ...before.mailMessages);
      return { status: 503, body: { error: 'Minglora could not save your mailbox changes. Try again.' } };
    }
    return { status: 200, body: { message: { id: message.id, folder: message.folder, is_read: message.is_read, is_starred: message.is_starred } } };
  }

  if (messageMatch && verb === 'DELETE') {
    const message = db.mailMessages.find(item =>
      Number(item.id) === Number(messageMatch[1]) && String(item.owner_id) === String(mailbox.memberId)
    );
    if (!message) return { status: 404, body: { error: 'Message not found.' } };
    const before = structuredClone(db.mailMessages);
    message.folder = 'trash';
    message.updated_at = new Date().toISOString();
    try { await saveStore(); }
    catch (_error) {
      db.mailMessages.splice(0, db.mailMessages.length, ...before);
      return { status: 503, body: { error: 'Minglora could not save your mailbox changes. Try again.' } };
    }
    return { status: 204, body: null };
  }

  if (route === '/account/address' && verb === 'PATCH') {
    const username = String(input.username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return { status: 400, body: { error: 'Mailbox names must use 3–30 letters, numbers or underscores.' } };
    if (db.mailboxes.some(item => String(item.memberId) !== String(mailbox.memberId) && String(item.username).toLowerCase() === username)) {
      return { status: 409, body: { error: 'That MailHarbor address is already in use.' } };
    }
    const before = {
      mailboxes: structuredClone(db.mailboxes),
      mailMessages: structuredClone(db.mailMessages)
    };
    mailbox.username = username;
    mailbox.email = mailboxEmail(username);
    mailbox.updatedAt = new Date().toISOString();
    try { await saveStore(); }
    catch (_error) {
      db.mailboxes.splice(0, db.mailboxes.length, ...before.mailboxes);
      return { status: 503, body: { error: 'Minglora could not save your new mailbox address. Try again.' } };
    }
    return { status: 200, body: { user: { email: mailbox.email, username: mailbox.username } } };
  }

  return { status: 404, body: { error: 'MailHarbor route not found.' } };
}

export { INTERNAL_MAIL_DOMAIN, ensureMailbox, parseAddressList, validateRecipients };

let mailHarborWorkerBusy = false;
export async function processMailHarborOutbox({ db, saveStore, sendEmail = sendMailHarborExternal, now = Date.now } = {}) {
  ensureCollections(db);
  if (mailHarborWorkerBusy) return { processed: false, reason: 'busy' };
  if (!getMailHarborProviderStatus().outboundEmailConfigured) return { processed: false, reason: 'provider-not-configured' };
  const current = now();
  const message = db.mailMessages.find(item => item.folder === 'sent' && item.externalDelivery &&
    ['queued', 'processing'].includes(item.externalDelivery.status) &&
    (Date.parse(item.externalDelivery.nextAttemptAt || 0) <= current ||
      (item.externalDelivery.status === 'processing' && current - Date.parse(item.externalDelivery.processingAt || 0) > 300000)));
  if (!message) return { processed: false, reason: 'empty' };
  mailHarborWorkerBusy = true;
  const before = structuredClone(message);
  try {
    message.externalDelivery.status = 'processing';
    message.externalDelivery.attempts = Number(message.externalDelivery.attempts || 0) + 1;
    message.externalDelivery.processingAt = new Date(current).toISOString();
    await saveStore();
  } catch (error) {
    Object.assign(message, before);
    mailHarborWorkerBusy = false;
    return { processed: false, reason: 'persistence-failed', error: error.message };
  }
  try {
    const result = await sendEmail(message, 'minglora-mailharbor-' + String(message.id));
    message.externalDelivery.status = 'sent';
    message.externalDelivery.providerMessageId = String(result.id || result.messageId || '');
    message.externalDelivery.acceptedAt = new Date(now()).toISOString();
    message.provider_message_id = message.externalDelivery.providerMessageId;
    message.delivery_status = 'sent';
    message.delivery_channel = 'resend';
    message.sent_at = message.externalDelivery.acceptedAt;
    message.last_error = null;
    await saveStore();
    return { processed: true, messageId: message.id, providerMessageId: message.provider_message_id, status: 'sent' };
  } catch (error) {
    const attempts = Number(message.externalDelivery.attempts || 1);
    const permanent = attempts >= 5 || (Number(error.status) >= 400 && Number(error.status) < 500 && Number(error.status) !== 429);
    message.externalDelivery.status = permanent ? 'failed' : 'queued';
    message.externalDelivery.nextAttemptAt = new Date(now() + Math.min(3600000, 2000 * (2 ** Math.min(attempts, 10)))).toISOString();
    message.externalDelivery.lastError = String(error.message || 'External mail send failed').slice(0, 700);
    message.delivery_status = permanent ? 'failed' : 'queued';
    message.last_error = message.externalDelivery.lastError;
    await saveStore();
    return { processed: true, messageId: message.id, status: message.delivery_status, error: message.last_error };
  } finally { mailHarborWorkerBusy = false; }
}

function stripHtmlToText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;/g, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim();
}

export async function handleMailHarborWebhook({ headers = {}, rawBody, db, saveStore, retrieveEmail = retrieveResendReceivedEmail } = {}) {
  ensureCollections(db);
  if (!getMailHarborProviderStatus().inboundEmailConfigured) return { status: 503, body: { error: 'Inbound MailHarbor needs a verified domain, Resend key and signed webhook.' } };
  if (!verifyResendWebhook({ rawBody, headers, secret: String(process.env.MAILHARBOR_RESEND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET || '') })) {
    return { status: 401, body: { error: 'Invalid MailHarbor provider webhook signature.' } };
  }
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400, body: { error: 'Invalid provider webhook JSON.' } }; }
  const type = String(event.type || '');
  const data = event.data || {};
  if (type === 'email.received') {
    const emailId = String(data.email_id || data.id || '');
    if (!emailId) return { status: 400, body: { error: 'Inbound event is missing its provider email ID.' } };
    let received;
    try { received = await retrieveEmail(emailId); }
    catch (error) { return { status: 502, body: { error: 'Could not retrieve inbound email: ' + String(error.message || 'provider error').slice(0, 250) } }; }
    const recipients = {
      to: parseAddressList(received.received_for || received.to || data.to || []),
      cc: parseAddressList(received.cc || data.cc || []),
      bcc: parseAddressList(received.bcc || data.bcc || [])
    };
    const all = [...new Set([...recipients.to, ...recipients.cc, ...recipients.bcc])];
    const sender = String(received.from || data.from || '').trim().toLowerCase();
    const subject = cleanText(received.subject || data.subject || '', MAX_SUBJECT_LENGTH);
    const bodyText = String(received.text || stripHtmlToText(received.html) || '').slice(0, MAX_BODY_LENGTH);
    const stamp = String(received.created_at || event.created_at || new Date().toISOString());
    const targets = [];
    for (const address of all) {
      if (address.split('@')[1] !== currentMailboxDomain()) continue;
      let recipient = db.mailboxes.find(item => String(item.email).toLowerCase() === address);
      if (!recipient) {
        const member = db.users.find(item => String(item.username || '').toLowerCase() === address.split('@')[0]);
        if (member) recipient = ensureMailbox(db, member).mailbox;
      }
      if (recipient && !db.mailMessages.some(item => String(item.provider_email_id || '') === emailId && String(item.owner_id) === String(recipient.memberId))) targets.push(recipient);
    }
    if (!targets.length) return { status: 200, body: { received: true, stored: 0, duplicateOrUnrouted: true } };
    const before = structuredClone(db.mailMessages);
    for (const recipient of targets) {
      db.mailMessages.push({
        id: makeMessageId(db), owner_id: recipient.memberId, sender_email: sender,
        sender_name: String(received.from || data.from || '').slice(0, 160), reply_to: sender,
        recipients, subject, body_text: bodyText, folder: 'inbox', is_read: false, is_starred: false,
        delivery_status: 'received', delivery_channel: 'resend', provider_email_id: emailId,
        attachments: Array.isArray(received.attachments) ? received.attachments.map(item => ({
          id: String(item.id || ''), filename: String(item.filename || '').slice(0, 200),
          contentType: String(item.content_type || ''), size: Number(item.size || 0)
        })) : [],
        last_error: null, created_at: stamp, received_at: stamp
      });
    }
    try { await saveStore(); }
    catch (_error) { db.mailMessages.splice(0, db.mailMessages.length, ...before); return { status: 503, body: { error: 'Minglora could not persist the inbound message.' } }; }
    return { status: 200, body: { received: true, stored: targets.length } };
  }
  const providerId = String(data.email_id || data.id || '');
  const sent = providerId ? db.mailMessages.find(item => String(item.provider_message_id || '') === providerId) : null;
  if (sent && ['email.delivered', 'email.bounced', 'email.complained'].includes(type)) {
    const before = structuredClone(sent);
    if (type === 'email.delivered') {
      sent.delivery_status = 'delivered'; sent.delivered_at = event.created_at || new Date().toISOString();
      sent.externalDelivery.status = 'delivered';
    } else {
      sent.delivery_status = type === 'email.bounced' ? 'bounced' : 'failed';
      sent.externalDelivery.status = sent.delivery_status;
      sent.last_error = cleanText(data.reason || data.message || 'Provider reported a delivery problem.', 700);
      sent.externalDelivery.lastError = sent.last_error;
    }
    try { await saveStore(); }
    catch (_error) { Object.assign(sent, before); return { status: 503, body: { error: 'Could not persist the MailHarbor delivery receipt.' } }; }
  }
  return { status: 200, body: { received: true, processed: Boolean(sent), event: type } };
}
