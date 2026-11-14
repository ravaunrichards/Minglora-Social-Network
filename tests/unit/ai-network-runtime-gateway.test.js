import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const taskMigration = read('supabase/migrations/20261114022051_minglora_ai_durable_task_queue_and_approvals.sql');
const server = read('src/server.js');

test('AI identity, organization, HR, provider and task RPC commands are reachable through the runtime action allowlist', () => {
  const start = runtime.indexOf('const supportedActions = [');
  const end = runtime.indexOf('];', start);
  assert.ok(start >= 0 && end > start, 'runtime action allowlist exists');
  const allowlist = runtime.slice(start, end);
  for (const action of [
    'ai_identity_command',
    'ai_memory_command',
    'ai_organization_command',
    'ai_hr_command',
    'ai_provider_command',
    'ai_task_command'
  ]) {
    assert.ok(allowlist.includes('"' + action + '"'), action + ' is accepted by the global action allowlist');
    assert.ok(runtime.includes('if (action === "' + action + '")'), action + ' has a runtime handler');
  }
});

test('AI memory command is available only through the allowlisted authenticated runtime', () => {
  const start = runtime.indexOf('const supportedActions = [');
  const end = runtime.indexOf('];', start);
  const allowlist = runtime.slice(start, end);
  assert.ok(allowlist.includes('"ai_memory_command"'));
  assert.match(runtime, /supportedMemoryCommands = \["get_settings", "configure", "list", "create", "update", "delete"\]/);
  assert.match(runtime, /validUuid\(actorUserId\)/);
  assert.match(runtime, /admin\.rpc\("minglora_ai_memory_command"/);
  assert.match(server, /runAIMemoryCommand\('create'/);
  assert.match(server, /runAIMemoryCommand\('update'/);
  assert.match(server, /runAIMemoryCommand\('delete'/);
});

test('durable AI task processing remains paused and non-executing by default', () => {
  assert.match(taskMigration, /global_paused boolean not null default true/);
  assert.match(taskMigration, /execution_enabled boolean not null default false/);
  assert.match(taskMigration, /max_concurrent_workers integer not null default 0/);
  assert.match(taskMigration, /current_user <> 'service_role'/);
  assert.match(taskMigration, /revoke all on function public\.minglora_ai_task_command[\s\S]*from public, anon, authenticated/);
  assert.match(taskMigration, /grant execute on function public\.minglora_ai_task_command[\s\S]*to service_role/);
});

test('task API calls the private runtime only after the moderator authorization check', () => {
  const start = server.indexOf("if (p === '/api/ai-network'");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  assert.ok(start >= 0 && end > start, 'AI Network API route block exists');
  const api = server.slice(start, end);
  const helper = api.indexOf('const runAITaskCommand = async');
  const auth = api.indexOf('if (!isModerator(user, req))', helper);
  const rpc = api.indexOf("requestSupabaseState('ai_task_command'", helper);
  assert.ok(helper >= 0 && auth > helper && rpc > auth, 'task RPC is behind a signed-in moderator guard');
});
