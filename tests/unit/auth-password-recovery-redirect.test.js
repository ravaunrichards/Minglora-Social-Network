import test from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin } from '../../src/app-origin.js';
import { supabaseRequestPasswordReset } from '../../src/supabase-auth.js';

test('production recovery redirects always use the canonical Minglora origin, never forwarded localhost headers', () => {
  const request = {
    headers: {
      host: 'localhost:3000',
      'x-forwarded-host': 'localhost:3000',
      'x-forwarded-proto': 'http'
    }
  };
  assert.equal(
    appOrigin(request, { NODE_ENV: 'production' }),
    'https://minglora-social-network.onrender.com'
  );
});

test('password recovery links are sent to the supplied live Minglora origin', async () => {
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
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
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
    assert.deepEqual(JSON.parse(observed.options.body), { email: 'member@example.test' });
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
});
