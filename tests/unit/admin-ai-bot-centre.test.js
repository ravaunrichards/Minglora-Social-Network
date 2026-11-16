import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const adminCentre = read('public/admin-centre.js');
const app = read('public/app.js');
const server = read('src/server.js');

test('Admin Centre exposes a dedicated AI Bot Centre page only in the unlocked owner workspace', () => {
  assert.ok(adminCentre.includes("key:'ai-bot-centre',title:'AI Bot Centre',group:'AI Operations'"));
  assert.ok(adminCentre.includes("selector:'#admin-ai-bot-centre'"));
  assert.ok(adminCentre.includes('id="admin-ai-bot-centre"'));
  assert.ok(adminCentre.includes('href="/?mingloraView=ai-network"'));
  assert.ok(adminCentre.includes("'Dashboard','AI Operations'"));
  assert.ok(adminCentre.includes("if (!unlocked && definition.key !== 'security') return false"));
});

test('AI Bot Centre launch opens the existing protected AI Network view without weakening its API gate', () => {
  assert.ok(app.includes("params.get('mingloraView')==='ai-network'"));
  assert.ok(app.includes("activateNav('ai-network')"));
  assert.ok(server.includes("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))"));
  assert.ok(server.includes('!isDesignatedCreatorHubAdmin(user) || !isModerator(user, req) || !hasActiveReviewerSession(user)'));
});
