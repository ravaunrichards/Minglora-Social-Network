import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const setup = fs.readFileSync(path.join(root, 'docs/SUPABASE_SETUP.md'), 'utf8');
const render = fs.readFileSync(path.join(root, 'infrastructure/render/README.md'), 'utf8');

test('Minglora production persistence docs describe the deployed Supabase HTTPS gateway consistently', () => {
  assert.match(setup, /PERSISTENCE_DRIVER=supabase/);
  assert.match(setup, /minglora-runtime-state/);
  assert.match(setup, /public\.minglora_runtime_state/);
  assert.match(setup, /Do not configure `DATABASE_URL`, `PGSSLMODE`, `PG_POOL_MAX`/);
  assert.match(setup, /not yet the active repository adapter for every application route/);
  assert.match(render, /Supabase itself runs managed PostgreSQL/);
  assert.match(render, /Do not set `DATABASE_URL`, `PGSSLMODE`, or `PG_POOL_MAX`/);
  assert.doesNotMatch(setup, /PERSISTENCE_DRIVER=postgres/);
});
