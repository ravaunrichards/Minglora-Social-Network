import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../public/auth-register.js', import.meta.url), 'utf8');

function createHarness(fetchImplementation) {
  const listeners = {};
  const error = { textContent: '' };
  const button = {
    disabled: false,
    textContent: 'Create account',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  const fields = {
    name: 'Test Member',
    username: 'test_member_qa',
    email: 'member@example.test',
    phoneNumber: '',
    password: 'StrongTestPassword123!'
  };
  const form = {
    matches(selector) { return selector === '#register-form'; },
    querySelector(selector) { return selector === 'button[type="submit"]' ? button : null; }
  };
  const document = {
    addEventListener(type, callback, capture) {
      (listeners[type] ||= []).push({ callback, capture });
    },
    querySelector(selector) { return selector === '#register-error' ? error : null; }
  };
  class FormDataStub {
    constructor() { this.values = fields; }
    entries() { return Object.entries(this.values)[Symbol.iterator](); }
  }
  const location = { pathname: '/', search: '?welcome=1', replaced: '' };
  location.replace = value => { location.replaced = value; };
  const context = {
    document, window: { location }, FormData: FormDataStub,
    fetch: fetchImplementation, navigator: { onLine: true },
    console
  };
  vm.runInNewContext(source, context, { filename: 'auth-register.js' });
  const submit = listeners.submit?.find(item => item.capture)?.callback;
  assert.equal(typeof submit, 'function', 'independent capture-phase submit handler should be installed');
  return {
    error, button, location, fields,
    async submit() {
      const event = {
        target: form,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
      };
      await submit(event);
      return event;
    }
  };
}

test('independent registration handler creates an account and reloads into its session', async () => {
  let request;
  const harness = createHarness(async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201, json: async () => ({ user: { id: 'auth-user-id' } }) };
  });
  const event = await harness.submit();
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(request.url, '/api/auth/register');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(JSON.parse(request.options.body).email, 'member@example.test');
  assert.equal(harness.location.replaced, '/?welcome=1');
  assert.equal(harness.error.textContent, '');
});

test('independent registration handler displays provider errors and permits retry', async () => {
  const harness = createHarness(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'That email or username is already registered. Log in instead.' })
  }));
  await harness.submit();
  assert.match(harness.error.textContent, /already registered/i);
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.textContent, 'Create account');
  assert.equal(harness.location.replaced, '');
});

test('independent registration handler rejects an empty success payload', async () => {
  const harness = createHarness(async () => ({
    ok: true,
    status: 201,
    json: async () => ({})
  }));
  await harness.submit();
  assert.match(harness.error.textContent, /did not create an account session/i);
  assert.equal(harness.button.disabled, false);
});
