import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuthConfigured } from '../src/supabase-auth.js';

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_PUBLISHABLE_KEY'
];

function withSupabaseEnv(overrides, callback) {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);

  try {
    callback();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('accepts the primary Minglora Supabase URL and publishable-key pair', () => {
  withSupabaseEnv({
    SUPABASE_URL: 'https://minglora-project.supabase.co/',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key'
  }, () => assert.equal(supabaseAuthConfigured(), true));
});

test('accepts supported frontend aliases only as matching pairs', () => {
  const configurations = [
    {
      VITE_SUPABASE_URL: 'https://minglora-project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key'
    },
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://minglora-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key'
    },
    {
      PUBLIC_SUPABASE_URL: 'https://minglora-project.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key'
    }
  ];

  for (const configuration of configurations) {
    withSupabaseEnv(configuration, () => assert.equal(supabaseAuthConfigured(), true));
  }
});

test('rejects a URL and key supplied under different aliases', () => {
  withSupabaseEnv({
    SUPABASE_URL: 'https://minglora-project.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unmatched_key'
  }, () => assert.equal(supabaseAuthConfigured(), false));
});

test('rejects missing values and example placeholders', () => {
  withSupabaseEnv({}, () => assert.equal(supabaseAuthConfigured(), false));
  withSupabaseEnv({
    SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME'
  }, () => assert.equal(supabaseAuthConfigured(), false));
});

test('retains legacy anon-key compatibility only with SUPABASE_URL', () => {
  withSupabaseEnv({
    SUPABASE_URL: 'https://minglora-project.supabase.co',
    SUPABASE_ANON_KEY: 'legacy-anon-test-key'
  }, () => assert.equal(supabaseAuthConfigured(), true));
});
