import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAuthConfigured, supabaseSignUp, supabaseSignIn, supabaseRequestPhoneChange, supabaseVerifyPhoneChange } from '../../src/supabase-auth.js';

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

test('Supabase authenticated phone change requests an SMS verification code', async () => {
  const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
  let observed;
  try{
    process.env.SUPABASE_URL='https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test-key';
    globalThis.fetch=async(url,options)=>{observed={url:String(url),options};return new Response(JSON.stringify({user:{phone:'+18765550123'}}),{status:200,headers:{'content-type':'application/json'}});};
    await supabaseRequestPhoneChange('x'.repeat(32),'+18765550123');
    assert.equal(observed.url,'https://minglora-unit-test.supabase.co/auth/v1/user');
    assert.equal(observed.options.method,'PUT');
    assert.deepEqual(JSON.parse(observed.options.body),{phone:'+18765550123'});
  }finally{
    if(saved.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=saved.url;
    if(saved.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=saved.key;
    globalThis.fetch=saved.fetch;
  }
});

test('Supabase verifies a phone change with the phone_change OTP type', async () => {
  const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
  let observed;
  try{
    process.env.SUPABASE_URL='https://minglora-unit-test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test-key';
    globalThis.fetch=async(url,options)=>{observed={url:String(url),options};return new Response(JSON.stringify({user:{phone:'+18765550123'},access_token:'verified-session-token',refresh_token:'verified-refresh-token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});};
    const result=await supabaseVerifyPhoneChange('x'.repeat(32),'+18765550123','123456');
    assert.equal(result.user.phone,'+18765550123');
    assert.equal(observed.url,'https://minglora-unit-test.supabase.co/auth/v1/verify');
    assert.deepEqual(JSON.parse(observed.options.body),{type:'phone_change',phone:'+18765550123',token:'123456'});
  }finally{
    if(saved.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=saved.url;
    if(saved.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=saved.key;
    globalThis.fetch=saved.fetch;
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


test('Minglora skips stale placeholder Supabase credentials when another valid pair exists', () => {
  const names = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_REPLACE_ME';
    process.env.VITE_SUPABASE_URL = 'https://minglora-project.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_valid_test';
    assert.equal(supabaseAuthConfigured(), true);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
