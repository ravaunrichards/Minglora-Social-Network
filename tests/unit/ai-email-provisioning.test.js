import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeAIEmailAddress,
  normalizeAIEmailDomain,
  getAIEmailConfig,
  inspectResendDomain,
  sendResendEmail,
  retrieveResendInboundEmail,
  verifyResendWebhook,
  escapeAIEmailHtml
} from '../../backend/modules/ai-network/email-service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const env = {
  MINGLORA_AI_EMAIL_PROVIDER: 'resend',
  MINGLORA_AI_EMAIL_DOMAIN: 'ai.example.com',
  RESEND_API_KEY: 're_test_key_not_real',
  RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.from('fixture-signing-key').toString('base64'),
  MINGLORA_AI_EMAIL_WEBHOOK_URL: 'https://minglora.example.com/api/ai-network/email/webhook'
};

test('AI email address and domain validation normalizes safe values', () => {
  assert.equal(normalizeAIEmailAddress(' AI-Friend@AI.Example.com '), 'ai-friend@ai.example.com');
  assert.equal(normalizeAIEmailDomain('@AI.Example.com.'), 'ai.example.com');
  assert.throws(() => normalizeAIEmailAddress('not an address'), /valid email address/i);
  assert.throws(() => normalizeAIEmailAddress('name@invalid'), /valid email address/i);
  assert.throws(() => normalizeAIEmailDomain('example.com/attacker'), /valid verified email domain/i);
});

test('email provider configuration exposes readiness booleans but never secret values', () => {
  const configured = getAIEmailConfig(env);
  assert.equal(configured.provider, 'resend');
  assert.equal(configured.configured, true);
  assert.equal(configured.sendingConfigured, true);
  assert.equal(configured.receivingConfigured, true);
  assert.equal(configured.domain, 'ai.example.com');
  assert.equal(JSON.stringify(configured).includes('re_test_key_not_real'), false);
  assert.equal(JSON.stringify(configured).includes('fixture-signing-key'), false);
  const absent = getAIEmailConfig({});
  assert.equal(absent.configured, false);
  assert.equal(absent.sendingConfigured, false);
});

test('Resend domain inspection requires verified sending and receiving capabilities', async () => {
  const status = await inspectResendDomain({
    env,
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer re_test_key_not_real');
      if (url === 'https://api.resend.com/domains?limit=100') {
        return new Response(JSON.stringify({
          data: [{
            id: 'domain_1', name: 'ai.example.com', status: 'verified',
            capabilities: { sending: 'enabled', receiving: 'enabled' }
          }]
        }), { status: 200 });
      }
      assert.equal(url, 'https://api.resend.com/webhooks?limit=100');
      return new Response(JSON.stringify({
        data: [{
          id: 'webhook_1',
          endpoint: env.MINGLORA_AI_EMAIL_WEBHOOK_URL,
          events: ['email.received'],
          status: 'enabled'
        }],
        has_more: false
      }), { status: 200 });
    }
  });
  assert.equal(status.ready, true);
  assert.equal(status.sendingEnabled, true);
  assert.equal(status.receivingEnabled, true);
  assert.equal(status.webhookActive, true);
  assert.equal(status.webhookId, 'webhook_1');
  assert.equal(status.configured, true);
  const unavailable = await inspectResendDomain({
    env,
    fetchImpl: async () => new Response(JSON.stringify({ data: [{
      name: 'ai.example.com', status: 'pending',
      capabilities: { sending: 'enabled', receiving: 'disabled' }
    }] }), { status: 200 })
  });
  assert.equal(unavailable.ready, false);
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.webhookActive, false);
});

test('Resend outbound delivery validates sender domain and uses provider idempotency', async () => {
  let captured;
  const result = await sendResendEmail({
    from: 'ai-helper@ai.example.com',
    to: ['person@example.net'],
    subject: 'Hello',
    text: 'A safe test message',
    idempotencyKey: 'message-1234567890',
    env,
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ id: 'resend_email_123' }), { status: 200 });
    }
  });
  assert.deepEqual(result, { provider: 'resend', providerEmailId: 'resend_email_123', accepted: true });
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.headers['Idempotency-Key'], 'message-1234567890');
  assert.equal(captured.body.from, 'Minglora AI <ai-helper@ai.example.com>');
  assert.deepEqual(captured.body.to, ['person@example.net']);
  await assert.rejects(() => sendResendEmail({
    from: 'ai-helper@other.example.net', to: ['person@example.net'],
    subject: 'Hello', text: 'Test', idempotencyKey: 'message-1234567890',
    env, fetchImpl: async () => new Response('{}', { status: 200 })
  }), /configured Minglora email domain/i);
});

test('Resend inbound retrieval requests the received email record and bounds stored content', async () => {
  const result = await retrieveResendInboundEmail('123e4567-e89b-12d3-a456-426614174000', {
    env,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails/receiving/123e4567-e89b-12d3-a456-426614174000');
      assert.equal(options.headers.Authorization, 'Bearer re_test_key_not_real');
      return new Response(JSON.stringify({ data: {
        from: 'sender@example.net', to: ['friend@ai.example.com'], cc: [], bcc: [],
        subject: 'Hi', text: 'Body', html: '<p>Body</p>', message_id: '<msg@example.net>',
        created_at: '2026-11-17T12:00:00Z', attachments: [{ id: 'file_1', filename: 'notes.txt', content_type: 'text/plain', size: 10 }]
      } }), { status: 200 });
    }
  });
  assert.equal(result.provider, 'resend');
  assert.equal(result.from, 'sender@example.net');
  assert.deepEqual(result.to, ['friend@ai.example.com']);
  assert.equal(result.text, 'Body');
  assert.equal(result.attachments[0].filename, 'notes.txt');
});

test('Resend webhook verification checks signature and rejects replayed timestamps', () => {
  const secretValue = 'fixture-signing-key';
  const secret = 'whsec_' + Buffer.from(secretValue).toString('base64');
  const id = 'evt_123';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = '{"type":"email.received","data":{"email_id":"123"}}';
  const signature = createHmac('sha256', Buffer.from(secretValue))
    .update(id + '.' + timestamp + '.' + rawBody, 'utf8').digest('base64');
  const headers = {
    'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature
  };
  assert.equal(verifyResendWebhook({ rawBody, headers, secret }), true);
  assert.equal(verifyResendWebhook({ rawBody: rawBody + ' ', headers, secret }), false);
  assert.equal(verifyResendWebhook({
    rawBody, headers: { ...headers, 'svix-timestamp': String(Number(timestamp) - 1000) }, secret
  }), false);
  assert.equal(verifyResendWebhook({ rawBody, headers, secret: '' }), false);
});

test('email HTML escaping prevents markup injection in rendered plain text', () => {
  assert.equal(escapeAIEmailHtml('<script>alert("x")</script>\nhello'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>hello');
});

test('outbound email preparation uses conflict-safe idempotency for concurrent retries', () => {
  const migration = read('supabase/migrations/20261117130000_minglora_ai_email_provisioning.sql');
  assert.match(
    migration,
    /on conflict \\(email_id, client_idempotency_key\\)\\s+where client_idempotency_key is not null\\s+do nothing\\s+returning \\* into v_message/i
  );
  assert.match(migration, /The email request is being committed; retry with the same request ID/i);
  assert.match(migration, /This email request ID was already used with different recipients or message content/i);
});

test('AI email SQL and runtime gateway keep mailbox data private and webhook ingestion trusted', () => {
  const migration = read('supabase/migrations/20261117130000_minglora_ai_email_provisioning.sql');
  const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
  const server = read('src/server.js');
  const ui = read('public/ai-network.js');
  assert.match(migration, /create table if not exists ai_network\.ai_email_messages/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on ai_network\.ai_email_messages from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.minglora_ai_email_command[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_email_command[\s\S]*to service_role/i);
  assert.match(migration, /on conflict \(email_id, provider, provider_email_id\)/i);
  assert.match(runtime, /"ai_email_command"/);
  assert.match(runtime, /verifiedInboundWebhook = aiAction === "ingest" && input\.verifiedWebhook === true && !actorUserId/);
  assert.match(server, /verifyResendWebhook/);
  assert.match(server, /retrieveResendInboundEmail/);
  assert.match(server, /aiAction: 'ingest'[\s\S]*verifiedWebhook: true/);
  assert.match(ui, /Provision AI email address/);
  assert.match(ui, /data-ai-form="email-send"/);
  assert.doesNotMatch(migration, /auth\.admin\.createUser|insert\s+into\s+auth\.users/i);
});
