import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrResumeSupabaseAccount } from '../../src/domain/auth-registration.js';

const session = () => ({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  access_token: 'a'.repeat(40),
  refresh_token: 'r'.repeat(40)
});

test('new account creation signs in before returning a session', async () => {
  let registerCalls = 0;
  let signInCalls = 0;
  const result = await createOrResumeSupabaseAccount({
    register: async () => { registerCalls++; return { user: { id: 'new-user' }, emailConfirmed: true }; },
    signIn: async () => { signInCalls++; return session(); }
  });
  assert.equal(registerCalls, 1);
  assert.equal(signInCalls, 1);
  assert.equal(result.resumedExistingAccount, false);
  assert.equal(result.authenticated.user.id, session().user.id);
});

test('a retry after a partially completed signup resumes the existing account', async () => {
  let signInCalls = 0;
  const duplicate = Object.assign(new Error('An account with this email already exists. Log in instead.'), {
    status: 409,
    code: 'email_already_registered'
  });
  const result = await createOrResumeSupabaseAccount({
    register: async () => { throw duplicate; },
    signIn: async () => { signInCalls++; return session(); }
  });
  assert.equal(signInCalls, 1);
  assert.equal(result.resumedExistingAccount, true);
  assert.equal(result.authenticated.access_token, session().access_token);
});

test('a duplicate signup with a wrong password shows the safe recovery error', async () => {
  const duplicate = Object.assign(new Error('An account with this email already exists. Log in instead.'), {
    status: 409,
    code: 'email_already_registered'
  });
  const badPassword = Object.assign(new Error('Email or password is incorrect. Check the address and password, or use Forgot password to reset it.'), {
    status: 401,
    code: 'invalid_credentials'
  });
  await assert.rejects(
    createOrResumeSupabaseAccount({
      register: async () => { throw duplicate; },
      signIn: async () => { throw badPassword; }
    }),
    error => error === badPassword && error.status === 401 && /Forgot password/.test(error.message)
  );
});

test('a registration service outage does not trigger a fallback login', async () => {
  let signInCalls = 0;
  const unavailable = Object.assign(new Error('Minglora registration service is unavailable.'), {
    status: 503
  });
  await assert.rejects(
    createOrResumeSupabaseAccount({
      register: async () => { throw unavailable; },
      signIn: async () => { signInCalls++; return session(); }
    }),
    error => error === unavailable
  );
  assert.equal(signInCalls, 0);
});

test('a successful registration response without a valid Auth user is rejected', async () => {
  await assert.rejects(
    createOrResumeSupabaseAccount({
      register: async () => ({ user: null }),
      signIn: async () => session()
    }),
    error => error.status === 502 && error.code === 'registration_user_missing'
  );
});
