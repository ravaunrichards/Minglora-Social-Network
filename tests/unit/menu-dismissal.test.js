import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const helperSource = await readFile(new URL('../../public/menu-dismissal.js', import.meta.url), 'utf8');

function createDocumentStub() {
  const listeners = new Map();
  return {
    addEventListener(type, handler, capture) {
      const entries = listeners.get(type) || [];
      entries.push({ handler, capture });
      listeners.set(type, entries);
    },
    removeEventListener(type, handler, capture) {
      listeners.set(type, (listeners.get(type) || []).filter(entry =>
        entry.handler !== handler || entry.capture !== capture
      ));
    },
    dispatch(type, event) {
      for (const entry of [...(listeners.get(type) || [])]) entry.handler({ ...event, type });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    }
  };
}

function makeRoot(...children) {
  const members = new Set(children);
  const root = { contains: target => target === root || members.has(target) };
  return root;
}

function setupController() {
  const document = createDocumentStub();
  const window = {};
  vm.runInNewContext(helperSource, { document, window });
  let open = true;
  const dismissals = [];
  const panelChild = {};
  const panel = makeRoot(panelChild);
  const trigger = makeRoot();
  const outside = {};
  const cleanup = window.MingloraMenuDismissal.bindOutsideDismissal({
    roots: () => [trigger, panel],
    isOpen: () => open,
    onDismiss: reason => {
      dismissals.push(reason);
      open = false;
    }
  });
  return { document, dismissals, panel, panelChild, trigger, outside, cleanup, setOpen: value => { open = value; } };
}

test('scrolling from inside a menu never dismisses it', () => {
  const state = setupController();
  state.document.dispatch('pointerdown', { pointerId: 1, clientX: 40, clientY: 100, target: state.panelChild });
  state.document.dispatch('pointerup', { pointerId: 1, clientX: 40, clientY: 35, target: state.panelChild });
  assert.deepEqual(state.dismissals, []);
});

test('outside drag gestures and cancelled pointers do not dismiss a menu', () => {
  const state = setupController();
  state.document.dispatch('pointerdown', { pointerId: 2, clientX: 10, clientY: 10, target: state.outside });
  state.document.dispatch('pointerup', { pointerId: 2, clientX: 10, clientY: 48, target: state.outside });
  state.document.dispatch('pointerdown', { pointerId: 3, clientX: 10, clientY: 10, target: state.outside });
  state.document.dispatch('pointercancel', { pointerId: 3 });
  state.document.dispatch('pointerup', { pointerId: 3, clientX: 10, clientY: 10, target: state.outside });
  assert.deepEqual(state.dismissals, []);
});

test('a real outside tap dismisses, but a gesture ending inside does not', () => {
  const state = setupController();
  state.document.dispatch('pointerdown', { pointerId: 4, clientX: 10, clientY: 10, target: state.outside });
  state.document.dispatch('pointerup', { pointerId: 4, clientX: 12, clientY: 11, target: state.panelChild });
  assert.deepEqual(state.dismissals, []);

  state.document.dispatch('pointerdown', { pointerId: 5, clientX: 10, clientY: 10, target: state.outside });
  state.document.dispatch('pointerup', { pointerId: 5, clientX: 14, clientY: 12, target: state.outside });
  assert.deepEqual(state.dismissals, ['outside-pointer']);
});

test('keyboard-generated outside activation dismisses, while pointer clicks are not double handled', () => {
  const state = setupController();
  state.document.dispatch('click', { detail: 1, target: state.outside });
  assert.deepEqual(state.dismissals, []);
  state.document.dispatch('click', { detail: 0, target: state.panelChild });
  assert.deepEqual(state.dismissals, []);
  state.document.dispatch('click', { detail: 0, target: state.outside });
  assert.deepEqual(state.dismissals, ['outside-keyboard']);
});

test('cleanup removes all shared dismissal listeners', () => {
  const state = setupController();
  assert.equal(state.document.listenerCount('pointerdown'), 1);
  assert.equal(state.document.listenerCount('pointerup'), 1);
  assert.equal(state.document.listenerCount('pointercancel'), 1);
  assert.equal(state.document.listenerCount('click'), 1);
  state.cleanup();
  assert.equal(state.document.listenerCount('pointerdown'), 0);
  assert.equal(state.document.listenerCount('pointerup'), 0);
  assert.equal(state.document.listenerCount('pointercancel'), 0);
  assert.equal(state.document.listenerCount('click'), 0);
});
