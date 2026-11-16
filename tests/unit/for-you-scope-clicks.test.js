import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../../public/app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const signature = 'function ' + name + '(';
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, name + ' must exist in the app bundle');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail('Could not find the end of ' + name);
}

class TestButton {
  constructor(scope) {
    this.dataset = { fypScope: scope };
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }
  async click() {
    const handlers = this.listeners.get('click') || [];
    for (const handler of handlers) await handler();
  }
}

test('real For You tab click handlers switch all four feeds and update navigation', async () => {
  const state = { forYouScope: 'for-you' };
  const buttons = ['for-you', 'friends', 'subscribers', 'following'].map(scope => new TestButton(scope));
  const persisted = [];
  const routes = [];
  const rendered = [];
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-fyp-scope]');
      return buttons;
    }
  };
  const context = {
    root,
    state,
    FOR_YOU_SCOPE_VALUES: new Set(['for-you', 'friends', 'subscribers', 'following']),
    normalizeForYouScope: value => ['for-you', 'friends', 'subscribers', 'following'].includes(value) ? value : 'for-you',
    persistCurrentView: () => persisted.push(state.forYouScope),
    recordBrowserNavigation: () => routes.push('/for-you/' + (state.forYouScope === 'for-you' ? 'home' : state.forYouScope)),
    renderForYouFeed: async () => rendered.push(state.forYouScope)
  };
  const handlerSource = extractFunction(appSource, 'bindForYouScopeControls');
  vm.runInNewContext(handlerSource + '\nbindForYouScopeControls(root);', context);

  for (const [index, scope] of ['friends', 'subscribers', 'following', 'for-you'].entries()) {
    await buttons.find(button => button.dataset.fypScope === scope).click();
    assert.equal(state.forYouScope, scope, 'click should switch the active scope to ' + scope);
    assert.equal(rendered[index], scope, 'click should render the selected feed');
    assert.equal(routes[index], '/for-you/' + (scope === 'for-you' ? 'home' : scope));
    assert.equal(persisted[index], scope, 'click should persist the selected scope');
  }

  assert.deepEqual(rendered, ['friends', 'subscribers', 'following', 'for-you']);
  assert.deepEqual(routes, ['/for-you/friends', '/for-you/subscribers', '/for-you/following', '/for-you/home']);
  assert.deepEqual(persisted, ['friends', 'subscribers', 'following', 'for-you']);
});

test('For You tab clicks ignore an invalid scope and repeated setup does not double-bind buttons', async () => {
  const state = { forYouScope: 'for-you' };
  const button = new TestButton('friends');
  const calls = [];
  const root = { querySelectorAll: () => [button] };
  const context = {
    root,
    state,
    FOR_YOU_SCOPE_VALUES: new Set(['for-you', 'friends', 'subscribers', 'following']),
    normalizeForYouScope: value => value,
    persistCurrentView: () => calls.push('persist'),
    recordBrowserNavigation: () => calls.push('history'),
    renderForYouFeed: async () => calls.push('render')
  };
  const invalid = new TestButton('not-a-feed');
  root.querySelectorAll = () => [button, invalid];
  const handlerSource = extractFunction(appSource, 'bindForYouScopeControls');
  vm.runInNewContext(handlerSource + '\nbindForYouScopeControls(root); bindForYouScopeControls(root);', context);

  assert.equal(button.listeners.get('click')?.length, 1, 'reinitialization must not add a second click handler');
  assert.equal(invalid.listeners.get('click')?.length, 1, 'the invalid item has a handler but cannot navigate');
  await invalid.click();
  assert.deepEqual(calls, [], 'invalid destinations must not trigger persistence, history or rendering');
  await button.click();
  assert.equal(state.forYouScope, 'friends');
  assert.deepEqual(calls, ['persist', 'history', 'render']);
});
