import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuthConfigured, supabaseSignUp, supabaseSignIn } from '../../src/supabase-auth.js';

test('Supabase Auth refuses placeholder credentials', () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    anon: process.env.SUPABASE_ANON_KEY
  };
  try {
    process.env.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_REPLACE_ME';
    delete process.env.SUPABASE_ANON_KEY;
    assert.equal(supabaseAuthConfigured(), false);
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    if (saved.anon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = saved.anon;
  }
});

test('Supabase signup sends metadata and uses only the publishable key', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    redirect: process.env.SUPABASE_AUTH_REDIRECT_URL,
    fetch: globalThis.fetch
  };
  let observed;
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    process.env.SUPABASE_AUTH_REDIRECT_URL = 'https://minglora.example/auth/callback';
    globalThis.fetch = async (url, options) => {
      observed = { url: String(url), options };
      return new Response(JSON.stringify({ user: { id: 'auth-user-id', email: 'member@example.test' }, session: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    const result = await supabaseSignUp({
      email: 'member@example.test',
      password: 'StrongPass123!',
      name: 'Test Member',
      username: 'test_member',
      phoneNumber: '+18765550123'
    });
    assert.equal(result.user.id, 'auth-user-id');
    assert.equal(observed.url, 'https://minglora-unit-test.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fminglora.example%2Fauth%2Fcallback');
    assert.equal(observed.options.headers.apikey, 'sb_publishable_test-key');
    assert.equal(observed.options.headers.Authorization, 'Bearer sb_publishable_test-key');
    assert.deepEqual(JSON.parse(observed.options.body).data, { name: 'Test Member', username: 'test_member', contact_phone: '+18765550123', phone_number: '+18765550123' });
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    if (saved.redirect === undefined) delete process.env.SUPABASE_AUTH_REDIRECT_URL; else process.env.SUPABASE_AUTH_REDIRECT_URL = saved.redirect;
    globalThis.fetch = saved.fetch;
  }
});

test('Supabase password sign-in uses the Auth password grant endpoint', async () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    fetch: globalThis.fetch
  };
  try {
    process.env.SUPABASE_URL = 'https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
    let requestUrl = '';
    globalThis.fetch = async url => {
      requestUrl = String(url);
      return new Response(JSON.stringify({ user: { id: 'auth-user-id' }, access_token: 'test-only' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    const result = await supabaseSignIn({ email: 'member@example.test', password: 'StrongPass123!' });
    assert.equal(result.user.id, 'auth-user-id');
    assert.equal(requestUrl, 'https://minglora-unit-test.supabase.co/auth/v1/token?grant_type=password');
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});
