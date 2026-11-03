import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuthConfigured, supabaseRequestPasswordReset } from '../src/supabase-auth.js';

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


test('password recovery reports a temporary provider/network outage instead of a false success', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    fetch: globalThis.fetch
  };
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
    await assert.rejects(
      supabaseRequestPasswordReset('member@example.test', 'https://minglora.example/?password-recovery=1'),
      error => error.status === 503 && /could not reach minglora password recovery/i.test(error.message)
    );
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});

test('password recovery preserves Supabase rate-limit interval and error code', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    fetch: globalThis.fetch
  };
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    globalThis.fetch = async () => new Response(JSON.stringify({
      msg: 'For security purposes, you can only request this after 52 seconds.',
      code: 'over_email_send_rate_limit'
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' }
    });
    await assert.rejects(
      supabaseRequestPasswordReset('member@example.test'),
      error => error.status === 429
        && error.retryAfterSeconds === 52
        && error.code === 'over_email_send_rate_limit'
        && /52 seconds/i.test(error.message)
    );
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});

test('password recovery prefers the Retry-After response header', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    fetch: globalThis.fetch
  };
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    globalThis.fetch = async () => new Response(JSON.stringify({ msg: 'email rate limit exceeded' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '3600' }
    });
    await assert.rejects(
      supabaseRequestPasswordReset('member@example.test'),
      error => error.status === 429 && error.retryAfterSeconds === 3600
    );
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});


test('password recovery sends the explicit HTTPS Minglora redirect to Supabase', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    fetch: globalThis.fetch
  };
  let observed;
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    globalThis.fetch = async (url, options) => {
      observed = { url: new URL(String(url)), options };
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await supabaseRequestPasswordReset(
      'member@example.test',
      'https://minglora-social-network.onrender.com/?password-recovery=1'
    );
    assert.equal(observed.url.origin, 'https://minglora-unit-test.supabase.co');
    assert.equal(observed.url.pathname, '/auth/v1/recover');
    assert.equal(
      observed.url.searchParams.get('redirect_to'),
      'https://minglora-social-network.onrender.com/?password-recovery=1'
    );
    assert.equal(JSON.parse(observed.options.body).email, 'member@example.test');
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});
