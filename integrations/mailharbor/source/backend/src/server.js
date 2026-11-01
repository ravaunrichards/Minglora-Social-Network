'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadConfig } = require('./config');
const { pool } = require('./db');
const { migrate } = require('./migrate');
const { createRealtimeService } = require('./realtime');
const { startWorker } = require('./worker');
const { issueAccessToken, requireAuth, verifyMingloraRequest } = require('./security');
const {
  normalizeEmail,
  validateRegistration,
  validateLogin,
  validateCompose,
  validateInbound,
  validateMessagePatch
} = require('./validation');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createApp(options = {}) {
  const config = options.config || loadConfig();
  const db = options.db || pool;
  const app = express();

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by MailHarbor CORS policy.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-MailHarbor-Signature'],
    maxAge: 600
  }));
  app.use(express.json({
    limit: '256kb',
    verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); }
  }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' }
  });
  const auth = requireAuth(config.jwtSecret, { db, mingloraSsoSecret: config.mingloraSsoSecret });
  const sendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Mail send limit reached. Try again later.' } });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'mailharbor-api' });
  });

  app.get('/health/ready', asyncRoute(async (_req, res) => {
    await db.query('SELECT 1');
    res.status(200).json({
      status: 'ready',
      service: 'mailharbor-api',
      database: 'connected',
      outboundEmailConfigured: config.smtp.configured && (!config.mingloraSsoSecret || Boolean(config.mailDomain && config.mailDomainVerified)),
      inboundEmailConfigured: Boolean(config.inboundWebhookSecret && config.inboundMailEnabled),
      postgresNotifications: options.realtime ? options.realtime.isReady : false,
      deliveryLoop: 'running-in-process'
    });
  }));

  app.get('/api/status', (_req, res) => {
    const outboundEmailConfigured = config.smtp.configured &&
      (!config.mingloraSsoSecret || Boolean(config.mailDomain && config.mailDomainVerified));
    const inboundEmailConfigured = Boolean(config.inboundWebhookSecret && config.inboundMailEnabled);
    res.json({
      service: 'MailHarbor',
      outboundEmailConfigured,
      inboundEmailConfigured,
      mingloraSsoConfigured: Boolean(config.mingloraSsoSecret),
      mailDomainConfigured: Boolean(config.mailDomain),
      mailDomainVerified: Boolean(config.mailDomainVerified),
      mailDomain: config.mailDomain || null,
      realtimeConfigured: Boolean(config.realtimePublicUrl),
      realtimeUrl: config.realtimePublicUrl,
      registrationAvailable: !config.mingloraSsoSecret && config.smtp.configured,
      deliveryNote: outboundEmailConfigured
        ? 'Outbound messages are queued for the MailHarbor delivery loop running in this application service.'
        : 'Outbound delivery is disabled until SMTP and a verified MailHarbor sender domain are configured.'
    });
  });

  app.post('/api/sso/provision', asyncRoute(async (req, res) => {
    if (!config.mingloraSsoSecret || !config.mailDomain || !config.mailDomainVerified) return res.status(503).json({ error: 'Minglora SSO and a domain verified with the MailHarbor provider must be configured before creating a mailbox.' });
    if (!verifyMingloraRequest(req, config.mingloraSsoSecret)) return res.status(401).json({ error: 'Minglora service signature is invalid or expired.' });
    const mingloraUserId = String(req.get('x-minglora-user-id') || '');
    const username = String(req.body?.username || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim().slice(0, 120);
    if (!/^[a-f0-9-]{16,64}$/i.test(mingloraUserId) || !/^[a-z0-9_]{3,30}$/.test(username) || !displayName) return res.status(400).json({ error: 'A valid Minglora member ID, username and display name are required.' });
    const email = username + '@' + config.mailDomain;
    try {
      const result = await db.query(
        `INSERT INTO mail_users(email, display_name, password_hash, email_verified_at, minglora_user_id, minglora_username)
         VALUES ($1, $2, NULL, now(), $3, $4)
         ON CONFLICT (minglora_user_id) DO UPDATE SET display_name = EXCLUDED.display_name, minglora_username = EXCLUDED.minglora_username, updated_at = now()
         RETURNING id, email, display_name, minglora_user_id, minglora_username, email_verified_at, created_at`,
        [email, displayName, mingloraUserId, username]
      );
      const member = result.rows[0];
      return res.status(200).json({ user: { id: member.id, email: member.email, displayName: member.display_name, mingloraUserId: member.minglora_user_id, username: member.minglora_username, emailVerifiedAt: member.email_verified_at, createdAt: member.created_at } });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That MailHarbor email address is already assigned to another member.' });
      throw error;
    }
  }));

  app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
    if (config.mingloraSsoSecret) return res.status(403).json({ error: 'MailHarbor accounts are created through Minglora. Sign in to Minglora to continue.' });
    const validation = validateRegistration(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    if (!config.smtp.configured) {
      return res.status(503).json({ error: 'Account verification email is not configured. No account was created. Configure SMTP and MAIL_FROM first.' });
    }

    const { email, displayName, password } = validation.value;
    const passwordHash = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const verifyUrl = config.appBaseUrl + '/?verify=' + encodeURIComponent(token);
    const emailBody = [
      'Welcome to MailHarbor.',
      '',
      'Confirm your email address by opening this link:',
      verifyUrl,
      '',
      'This verification link expires in 30 minutes. If you did not create this account, you can ignore this email.'
    ].join('\n');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO mail_users(email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [email, displayName, passwordHash]
      );
      const userId = inserted.rows[0].id;
      await client.query(
        'INSERT INTO mail_email_verifications(user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'30 minutes\')',
        [userId, tokenHash]
      );
      await client.query(
        `INSERT INTO mail_outbox(owner_id, message_id, sender_email, recipients, subject, body_text)
         VALUES ($1, NULL, $2, $3::jsonb, $4, $5)`,
        [userId, config.smtp.from, JSON.stringify({ to: [email], cc: [], bcc: [] }), 'Confirm your MailHarbor email address', emailBody]
      );
      await client.query('COMMIT');
      return res.status(202).json({ message: 'Account created. A verification email has been queued; verify your address before signing in.' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email address already exists.' });
      throw error;
    } finally {
      client.release();
    }
  }));

  app.post('/api/auth/verify', authLimiter, asyncRoute(async (req, res) => {
    if (config.mingloraSsoSecret) return res.status(403).json({ error: 'Email verification is managed by Minglora for connected accounts.' });
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'Verification link is invalid or expired.' });
    const result = await db.query(
      `WITH consumed AS (
         UPDATE mail_email_verifications
         SET consumed_at = now()
         WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
         RETURNING user_id
       )
       UPDATE mail_users AS users
       SET email_verified_at = COALESCE(users.email_verified_at, now())
       FROM consumed
       WHERE users.id = consumed.user_id
       RETURNING users.id`,
      [sha256(token)]
    );
    if (!result.rowCount) return res.status(400).json({ error: 'Verification link is invalid, expired, or already used.' });
    return res.json({ message: 'Email address verified. You can now sign in.' });
  }));

  app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
    if (config.mingloraSsoSecret) return res.status(403).json({ error: 'MailHarbor uses your Minglora sign-in. Return to Minglora to authenticate.' });
    const validation = validateLogin(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const { email, password } = validation.value;
    const result = await db.query(
      'SELECT id, email, display_name, password_hash, email_verified_at FROM mail_users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (!user.email_verified_at) return res.status(403).json({ error: 'Verify your email address before signing in.' });
    const accessToken = issueAccessToken(user, config.jwtSecret);
    return res.json({
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.display_name }
    });
  }));

  app.get('/api/me', auth, asyncRoute(async (req, res) => {
    const result = await db.query(
      'SELECT id, email, display_name, email_verified_at, created_at, minglora_user_id, minglora_username FROM mail_users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Account is no longer available.' });
    const user = result.rows[0];
    return res.json({ user: { id: user.id, email: user.email, displayName: user.display_name, mingloraUserId: user.minglora_user_id || null, username: user.minglora_username || null, emailVerifiedAt: user.email_verified_at, createdAt: user.created_at } });
  }));

  app.patch('/api/account/address', auth, asyncRoute(async (req, res) => {
    if (!req.user.mingloraUserId) return res.status(403).json({ error: 'Address changes are available for Minglora-linked accounts only.' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const reserved = ['admin','administrator','abuse','billing','contact','help','hostmaster','mailer-daemon','no-reply','noreply','postmaster','root','security','support','webmaster'];
    if (!/^[a-z0-9_]{3,30}$/.test(username) || reserved.includes(username)) return res.status(400).json({ error: 'Choose a non-reserved address name with 3–30 letters, numbers or underscores.' });
    if (!config.mailDomain || !config.mailDomainVerified) return res.status(503).json({ error: 'The MailHarbor email domain has not been verified yet.' });
    try {
      const result = await db.query('UPDATE mail_users SET email = $1, minglora_username = $2, updated_at = now() WHERE id = $3 RETURNING id, email, minglora_username', [username + '@' + config.mailDomain, username, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'MailHarbor account not found.' });
      return res.json({ user: { id: result.rows[0].id, email: result.rows[0].email, username: result.rows[0].minglora_username } });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That MailHarbor email address is already in use.' });
      throw error;
    }
  }));

  app.post('/api/realtime/ticket', auth, asyncRoute(async (req, res) => {
    if (!config.realtimePublicUrl) {
      return res.status(503).json({ error: 'Realtime mailbox updates are not configured.' });
    }
    const ticket = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO mail_realtime_tickets(owner_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '60 seconds')`,
      [req.user.id, sha256(ticket)]
    );
    return res.status(201).json({ ticket, expiresInSeconds: 60 });
  }));

  app.get('/api/messages', auth, asyncRoute(async (req, res) => {
    const folder = String(req.query.folder || 'inbox').toLowerCase();
    const search = String(req.query.search || '').trim().slice(0, 200);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    if (!['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive', 'starred'].includes(folder)) {
      return res.status(400).json({ error: 'Unsupported mailbox folder.' });
    }
    const values = [req.user.id];
    const where = ['owner_id = $1'];
    if (folder === 'starred') {
      where.push('is_starred = true');
      where.push("folder <> 'trash'");
    } else {
      values.push(folder);
      where.push('folder = $' + values.length);
    }
    if (search) {
      values.push('%' + search + '%');
      where.push('(sender_email ILIKE $' + values.length + ' OR subject ILIKE $' + values.length + ' OR body_text ILIKE $' + values.length + ')');
    }
    values.push(limit, offset);
    const result = await db.query(
      'SELECT id, sender_email, reply_to, recipients, subject, body_text, folder, is_read, is_starred, delivery_status, last_error, created_at, sent_at ' +
      'FROM mail_messages WHERE ' + where.join(' AND ') +
      ' ORDER BY created_at DESC LIMIT $' + (values.length - 1) + ' OFFSET $' + values.length,
      values
    );
    return res.json({ messages: result.rows, count: result.rowCount, limit, offset });
  }));

  app.get('/api/messages/:id', auth, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid message identifier.' });
    const result = await db.query(
      'SELECT id, sender_email, reply_to, recipients, subject, body_text, folder, is_read, is_starred, delivery_status, last_error, created_at, sent_at FROM mail_messages WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ message: result.rows[0] });
  }));

  app.post('/api/messages', auth, sendLimiter, asyncRoute(async (req, res) => {
    const validation = validateCompose(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    if (!config.smtp.configured || (config.mingloraSsoSecret && (!config.mailDomain || !config.mailDomainVerified))) {
      return res.status(503).json({ error: 'Outbound email is not configured for a verified MailHarbor sender domain. No message was saved or sent.' });
    }
    const { to, cc, bcc, subject, body } = validation.value;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO mail_messages(owner_id, sender_email, reply_to, recipients, subject, body_text, folder, delivery_status)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'sent', 'queued')
         RETURNING id, delivery_status, created_at`,
        [req.user.id, req.user.mingloraUserId ? req.user.email : config.smtp.from, req.user.email, JSON.stringify({ to, cc, bcc }), subject, body]
      );
      const message = inserted.rows[0];
      await client.query(
        `INSERT INTO mail_outbox(owner_id, message_id, sender_email, reply_to, recipients, subject, body_text)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [req.user.id, message.id, config.smtp.from, req.user.email, JSON.stringify({ to, cc, bcc }), subject, body]
      );
      await client.query('COMMIT');
      return res.status(202).json({ message: { id: message.id, deliveryStatus: message.delivery_status, createdAt: message.created_at } });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  app.patch('/api/messages/:id', auth, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid message identifier.' });
    const validation = validateMessagePatch(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const entries = Object.entries(validation.value);
    const setSql = entries.map(([column], index) => column + ' = $' + (index + 3)).join(', ');
    const values = [id, req.user.id, ...entries.map(([, value]) => value)];
    const result = await db.query(
      'UPDATE mail_messages SET ' + setSql + ' WHERE id = $1 AND owner_id = $2 RETURNING id, folder, is_read, is_starred, delivery_status',
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ message: result.rows[0] });
  }));

  app.delete('/api/messages/:id', auth, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid message identifier.' });
    const result = await db.query(
      "UPDATE mail_messages SET folder = 'trash' WHERE id = $1 AND owner_id = $2 RETURNING id",
      [id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Message not found.' });
    return res.status(204).end();
  }));

  app.post('/api/webhooks/inbound', asyncRoute(async (req, res) => {
    if (!config.inboundWebhookSecret || !config.inboundMailEnabled) return res.status(503).json({ error: 'Inbound email is not configured or enabled. Verify the domain, MX records and provider webhook first.' });
    const signature = String(req.get('x-mailharbor-signature') || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', config.inboundWebhookSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }
    const validation = validateInbound(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const message = validation.value;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const event = await client.query(
        'INSERT INTO mail_inbound_events(event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [message.eventId]
      );
      if (!event.rowCount) {
        await client.query('COMMIT');
        return res.json({ accepted: true, duplicate: true, stored: 0 });
      }
      const owners = await client.query(
        'SELECT id FROM mail_users WHERE email = ANY($1::text[]) AND email_verified_at IS NOT NULL',
        [message.to]
      );
      for (const owner of owners.rows) {
        await client.query(
          `INSERT INTO mail_messages(owner_id, sender_email, recipients, subject, body_text, folder, delivery_status, provider_message_id, sent_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, 'inbox', 'received', $6, now())
           ON CONFLICT (owner_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING`,
          [owner.id, message.from, JSON.stringify({ to: message.to, cc: [], bcc: [] }), message.subject, message.text, message.messageId]
        );
      }
      await client.query('COMMIT');
      return res.status(202).json({ accepted: true, duplicate: false, stored: owners.rowCount });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (config.mingloraSsoSecret) {
    app.get('*', (_req, res) => res.status(404).json({ error: 'This MailHarbor service is accessed through the authenticated Minglora application.' }));
  } else {
    app.use(express.static(path.resolve(__dirname, '../../frontend'), { etag: true, maxAge: '1h', index: 'index.html' }));
    app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, '../../frontend/index.html')));
  }

  app.use((error, _req, res, _next) => {
    process.stderr.write('MailHarbor request error: ' + error.message + '\n');
    if (res.headersSent) return;
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' });
    }
    if (error.message && error.message.includes('CORS policy')) return res.status(403).json({ error: 'Request origin is not allowed.' });
    return res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}

async function start() {
  const config = loadConfig();
  await migrate(pool);

  const runtime = { realtime: null };
  const app = createApp({
    config,
    db: pool,
    get realtime() { return runtime.realtime; }
  });
  const server = http.createServer(app);
  const realtimeService = createRealtimeService({ config, db: pool, server });
  runtime.realtime = realtimeService;
  const worker = startWorker({ config, db: pool });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  process.stdout.write('MailHarbor unified platform listening on port ' + config.port + '\n');
  process.stdout.write('API, mailbox, realtime WebSocket, and delivery loop share one service.\n');
  process.stdout.write('Outbound SMTP configured: ' + String(config.smtp.configured) + '\n');
  void realtimeService.listenToDatabase();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write('MailHarbor shutting down gracefully.\n');
    await realtimeService.close();
    await worker.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await pool.end();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    process.stderr.write('MailHarbor startup failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = { createApp, start };