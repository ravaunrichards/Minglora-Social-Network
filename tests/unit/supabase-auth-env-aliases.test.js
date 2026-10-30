import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuthConfigured } from '../../src/supabase-auth.js';

const names = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY'
];

function withCleanSupabaseEnv(callback) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('Minglora Supabase config accepts standard server variables', () => {
  withCleanSupabaseEnv(() => {
    process.env.SUPABASE_URL = 'https://minglora-project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(supabaseAuthConfigured(), true);
  });
});

test('Minglora Supabase config accepts Vite aliases used in hosted environments', () => {
  withCleanSupabaseEnv(() => {
    process.env.VITE_SUPABASE_URL = 'https://minglora-project.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(supabaseAuthConfigured(), true);
  });
});

test('Minglora Supabase config accepts Next public aliases used in hosted environments', () => {
  withCleanSupabaseEnv(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://minglora-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(supabaseAuthConfigured(), true);
  });
});

test('Minglora Supabase rejects a key without the matching project URL', () => {
  withCleanSupabaseEnv(() => {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(supabaseAuthConfigured(), false);
  });
});

test('Minglora Supabase rejects placeholder credentials', () => {
  withCleanSupabaseEnv(() => {
    process.env.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_REPLACE_ME';
    assert.equal(supabaseAuthConfigured(), false);
  });
});
