'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

function issueAccessToken(user, secret) {
  return jwt.sign(
    { email: user.email, displayName: user.display_name },
    secret,
    { subject: String(user.id), issuer: 'mailharbor', audience: 'mailharbor-web', expiresIn: '12h' }
  );
}

function verifyMingloraRequest(req, secret, now = Date.now()) {
  if (!secret) return false;
  const userId = String(req.get('x-minglora-user-id') || '');
  const timestamp = String(req.get('x-minglora-timestamp') || '');
  const supplied = String(req.get('x-minglora-signature') || '');
  if (!userId || !/^[a-f0-9-]{16,64}$/i.test(userId) || !/^\\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const age = Math.abs(now - Number(timestamp));
  if (!Number.isFinite(age) || age > 120000) return false;
  const requestPath = String(req.originalUrl || req.url || '/');
  const bodyHash = crypto.createHash('sha256').update(req.rawBody || Buffer.alloc(0)).digest('hex');
  const signed = [timestamp, String(req.method || 'GET').toUpperCase(), requestPath, userId, bodyHash].join('\\n');
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const actual = Buffer.from(supplied, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function requireAuth(secret, options = {}) {
  const database = options.db;
  const mingloraSsoSecret = options.mingloraSsoSecret || '';
  return async (req, res, next) => {
    const hasSsoHeaders = Boolean(req.get('x-minglora-user-id') || req.get('x-minglora-timestamp') || req.get('x-minglora-signature'));
    if (hasSsoHeaders) {
      if (!verifyMingloraRequest(req, mingloraSsoSecret) || !database) return res.status(401).json({ error: 'Minglora session signature is invalid or expired.' });
      try {
        const result = await database.query('SELECT id, email, display_name, minglora_user_id FROM mail_users WHERE minglora_user_id = $1 AND email_verified_at IS NOT NULL', [String(req.get('x-minglora-user-id'))]);
        if (!result.rowCount) return res.status(401).json({ error: 'MailHarbor account is not provisioned for this Minglora member.' });
        const member = result.rows[0];
        req.user = { id: Number(member.id), email: member.email, displayName: member.display_name, mingloraUserId: member.minglora_user_id };
        return next();
      } catch (error) { return next(error); }
    }
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Sign in to continue.' });
    try {
      const claims = jwt.verify(match[1], secret, { issuer: 'mailharbor', audience: 'mailharbor-web' });
      req.user = { id: Number(claims.sub), email: claims.email, displayName: claims.displayName };
      if (!Number.isSafeInteger(req.user.id) || req.user.id <= 0) throw new Error('Invalid subject.');
      return next();
    } catch (_error) {
      return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
    }
  };
}

module.exports = { issueAccessToken, requireAuth, verifyMingloraRequest };