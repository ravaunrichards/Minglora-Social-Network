const INTERNAL_MAIL_DOMAIN = String(process.env.MAILHARBOR_MAIL_DOMAIN || 'members.minglora.invalid')
  .trim().toLowerCase().replace(/^@/, '');
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MESSAGE_FOLDERS = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
const MAX_RECIPIENTS = 50;
const MAX_BODY_LENGTH = 100000;
const MAX_SUBJECT_LENGTH = 998;

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
      id: memberId,
      memberId,
      username,
      email: mailboxEmail(username),
      displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.mailboxes.push(mailbox);
    return { mailbox, changed: true };
  }
  return { mailbox, changed: false };
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

function validateRecipients(input) {
  const recipients = {
    to: parseAddressList(input.to),
    cc: parseAddressList(input.cc),
    bcc: parseAddressList(input.bcc)
  };
  const all = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  const unique = [...new Set(all)];
  if (!recipients.to.length) return { error: 'Add at least one recipient in To.' };
  if (unique.length > MAX_RECIPIENTS) return { error: 'A message can have up to 50 recipients.' };
  if (all.some(email => !EMAIL_RE.test(email))) return { error: 'One or more recipient email addresses are invalid.' };
  if (unique.some(email => email.split('@')[1] !== currentMailboxDomain())) {
    return {
      error: 'External email is not connected yet. MailHarbor currently delivers messages to Minglora member mailboxes only. No message was saved or sent.'
    };
  }
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
  const internalStatus = {
    service: 'mailharbor',
    status: 'ready',
    mailboxMode: 'minglora-internal',
    mailDomain: currentMailboxDomain(),
    internalMessagingEnabled: true,
    outboundEmailConfigured: false,
    inboundEmailConfigured: false,
    realtimeUrl: null,
    deliveryNote: 'MailHarbor member-to-member delivery is active inside Minglora. External email sending and receiving are not enabled until a verified sender domain and provider are connected.'
  };

  if (verb === 'GET' && route === '/status') return { status: 200, body: internalStatus };
  if (verb === 'GET' && route === '/me') {
    return {
      status: 200,
      body: { user: { id: mailbox.memberId, username: mailbox.username, name: mailbox.displayName, email: mailbox.email } }
    };
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

  if (route === '/messages' && verb === 'POST') {
    const parsed = validateRecipients(input);
    if (parsed.error) return { status: 400, body: { error: parsed.error } };
    const subject = String(input.subject ?? '').trim();
    const bodyText = String(input.body ?? '');
    if (subject.length > MAX_SUBJECT_LENGTH) return { status: 400, body: { error: 'Subject must be 998 characters or fewer.' } };
    if (!bodyText.trim()) return { status: 400, body: { error: 'Write a message before sending.' } };
    if (bodyText.length > MAX_BODY_LENGTH) return { status: 400, body: { error: 'Message is too long.' } };

    const resolved = parsed.unique.map(email => ({ email, recipient: mailboxForAddress(db, email) }));
    const blocked = resolved.find(({ recipient }) =>
      !recipient || memberIsBlocked(db, String(mailbox.memberId), String(recipient.memberId))
    );
    if (blocked) {
      db.mailboxes.splice(0, db.mailboxes.length, ...beforeProvision.mailboxes);
      db.mailMessages.splice(0, db.mailMessages.length, ...beforeProvision.mailMessages);
      return { status: 404, body: { error: 'One or more Minglora member mailboxes could not be found.' } };
    }

    const before = {
      mailboxes: structuredClone(beforeProvision.mailboxes),
      mailMessages: structuredClone(beforeProvision.mailMessages)
    };
    const createdAt = new Date().toISOString();
    const recipients = parsed.recipients;
    const messageId = makeMessageId(db);
    db.mailMessages.push({
      id: messageId,
      owner_id: mailbox.memberId,
      sender_email: mailbox.email,
      reply_to: mailbox.email,
      recipients,
      subject,
      body_text: bodyText,
      folder: 'sent',
      is_read: true,
      is_starred: false,
      delivery_status: 'sent',
      delivery_channel: 'minglora_internal',
      last_error: null,
      created_at: createdAt,
      sent_at: createdAt
    });

    for (const { email, recipient } of resolved) {
      db.mailMessages.push({
        id: makeMessageId(db),
        owner_id: recipient.memberId,
        sender_email: mailbox.email,
        reply_to: mailbox.email,
        recipients: {
          to: recipients.to,
          cc: recipients.cc,
          bcc: []
        },
        subject,
        body_text: bodyText,
        folder: 'inbox',
        is_read: false,
        is_starred: false,
        delivery_status: 'received',
        delivery_channel: 'minglora_internal',
        last_error: null,
        created_at: createdAt,
        sent_at: null
      });
    }

    try {
      await saveStore();
    } catch (error) {
      db.mailboxes.splice(0, db.mailboxes.length, ...before.mailboxes);
      db.mailMessages.splice(0, db.mailMessages.length, ...before.mailMessages);
      return { status: 503, body: { error: 'Minglora could not confirm delivery. No delivery was confirmed; refresh your Sent folder before retrying.' } };
    }
    return {
      status: 202,
      body: {
        message: {
          id: messageId,
          delivery_status: 'sent',
          delivery_channel: 'minglora_internal',
          created_at: createdAt
        }
      }
    };
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
