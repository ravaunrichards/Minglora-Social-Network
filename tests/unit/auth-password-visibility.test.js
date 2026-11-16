import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('password visibility stays in the selected state until the eye button is pressed again', () => {
  const source = read('public/auth-password-visibility.js');
  const input = { type: 'password' };
  const attributes = new Map([['aria-controls', 'login-password'], ['aria-pressed', 'false']]);
  const button = {
    innerHTML: '',
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value)
  };
  class MockElement {
    closest(selector) {
      return selector === '[data-password-toggle]' ? button : null;
    }
  }
  class MockInput {}
  Object.setPrototypeOf(input, MockInput.prototype);

  const listeners = new Map();
  const document = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    getElementById: id => id === 'login-password' ? input : null
  };
  const window = {};
  vm.runInNewContext(source, {
    document,
    window,
    Element: MockElement,
    HTMLInputElement: MockInput
  });

  const clickEye = () => listeners.get('click')({
    target: new MockElement(),
    preventDefault() {},
    stopPropagation() {}
  });

  clickEye();
  assert.equal(input.type, 'text');
  assert.equal(attributes.get('aria-pressed'), 'true');
  assert.equal(attributes.get('aria-label'), 'Hide password');

  // Android's keyboard/visibility changes and typing must not reset the choice.
  assert.deepEqual([...listeners.keys()], ['click']);
  assert.equal(input.type, 'text');

  clickEye();
  assert.equal(input.type, 'password');
  assert.equal(attributes.get('aria-pressed'), 'false');
  assert.equal(attributes.get('aria-label'), 'Show password');
});

test('sign-in and registration password fields both have their own reveal controls', () => {
  const html = read('public/index.html');
  for (const id of ['login-password', 'register-password']) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes(`aria-controls="${id}"`));
  }
  assert.ok(html.includes('auth-password-visibility.js?v=20261108-password-toggle-sticky-2'));
});
