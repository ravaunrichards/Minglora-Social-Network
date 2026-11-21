import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAIBot,
  updateAIBotDetails,
  deleteAIBot,
  getAICommandCenter
} from '../../backend/modules/ai-network/service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ownerId = 'owner-phase9-test';

function createBot(db, name = 'Phase Nine Assistant') {
  return createAIBot(db, ownerId, {
    name,
    purpose: 'Help the owner prepare clear, reviewed creator support materials.',
    tone: 'friendly',
    expertise: 'Creator support',
    traits: ['helpful', 'curious'],
    languages: ['en', 'ht'],
    primaryLanguage: 'en',
    capabilities: ['draft_content', 'suggest_replies']
  });
}

test('Phase 9 bot edit persists validated configuration and records an audit event', () => {
  const db = {};
  const bot = createBot(db);
  const updated = updateAIBotDetails(db, ownerId, bot.id, {
    name: 'Creator Review Assistant',
    purpose: 'Help the owner prepare reviewed educational creator materials.',
    tone: 'professional',
    expertise: 'Creator education',
    traits: ['analytical', 'precise'],
    languages: ['en', 'es'],
    primaryLanguage: 'es',
    capabilities: ['draft_content', 'summarize_public_content']
  });

  assert.equal(updated.name, 'Creator Review Assistant');
  assert.equal(updated.tone, 'professional');
  assert.deepEqual(updated.traits, ['analytical', 'precise']);
  assert.deepEqual(updated.languages, ['en', 'es']);
  assert.equal(updated.primaryLanguage, 'es');
  assert.deepEqual(updated.capabilities, ['draft_content', 'summarize_public_content']);
  assert.ok(db.aiBotAudit.some(event => event.action === 'bot_updated' && event.targetId === bot.id));
});

test('Phase 9 bot edit rejects invalid traits, unsupported capabilities and duplicate names', () => {
  const db = {};
  const first = createBot(db, 'First Assistant');
  createBot(db, 'Second Assistant');

  assert.throws(
    () => updateAIBotDetails(db, ownerId, first.id, { traits: ['helpful'] }),
    /two to five/
  );
  assert.throws(
    () => updateAIBotDetails(db, ownerId, first.id, { capabilities: ['delete_accounts'] }),
    /capabilities are not allowed/
  );
  assert.throws(
    () => updateAIBotDetails(db, ownerId, first.id, { name: 'Second Assistant' }),
    /already have an AI bot/
  );
  assert.throws(
    () => updateAIBotDetails(db, 'another-owner', first.id, { name: 'Stolen Bot' }),
    /not found/
  );
});

test('Phase 9 bot removal is an audited soft delete and preserves linked identity history', () => {
  const db = {};
  const bot = createBot(db);
  bot.identityId = '8cdd1340-452c-4a89-8c4a-0e8c6535a8a4';

  const result = deleteAIBot(db, ownerId, bot.id, { reason: 'Owner requested removal.' });
  assert.equal(result.deleted, true);
  assert.equal(result.softDeleted, true);
  assert.equal(result.bot.status, 'archived');
  assert.equal(result.bot.identityId, '8cdd1340-452c-4a89-8c4a-0e8c6535a8a4');
  assert.ok(result.bot.deletedAt);
  assert.ok(db.aiBotAudit.some(event => event.action === 'bot_soft_deleted' && event.targetId === bot.id));

  const repeated = deleteAIBot(db, ownerId, bot.id);
  assert.equal(repeated.reused, true);
  const snapshot = getAICommandCenter(db, ownerId);
  assert.equal(snapshot.bots.some(item => item.id === bot.id), false);
});

test('Phase 9 administrative dashboard exposes real audit logs and marks unsupported operations unavailable', () => {
  const ui = read('public/ai-network.js');
  const server = read('src/server.js');
  const service = read('backend/modules/ai-network/service.js');

  assert.ok(server.includes("method === 'PATCH' && parts[0] === 'bots' && parts.length === 2"));
  assert.ok(server.includes("method === 'DELETE' && parts[0] === 'bots' && parts.length === 2"));
  assert.ok(ui.includes('data-ai-form="bot-edit"'));
  assert.ok(ui.includes("kind === 'bot-edit'"));
  assert.ok(ui.includes("action === 'bot-edit-open'"));
  assert.ok(ui.includes("action === 'bot-delete'"));
  assert.ok(ui.includes('View Bot Lab operational logs'));
  assert.ok(ui.includes('Process restart is not supported'));
  assert.ok(ui.includes('Start, stop-running and retry are unavailable'));
  assert.ok(ui.includes('no push-based real-time event feed'));
  assert.ok(service.includes('auditLog: ownerRows(db.aiBotAudit, ownerId)'));
});
