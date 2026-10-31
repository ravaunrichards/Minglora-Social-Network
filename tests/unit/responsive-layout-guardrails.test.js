import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

function ruleFor(css, selector) {
  const matches = [...css.matchAll(/([^{}]+)\\{([^{}]*)\\}/g)];
  return matches.reverse().find(([, names]) =>
    names.split(',').some(name => name.trim() === selector)
  )?.[2] || '';
}

test('shared content containers can shrink without pushing the page out of alignment', async () => {
  const css = await read('public/styles.css');
  assert.ok(ruleFor(css, 'html').includes('overflow-x:clip'));
  assert.ok(ruleFor(css, 'body').includes('overflow-x:clip'));
  for (const selector of ['.layout', '.main-content', '.profile-body', '.settings-panels', '.message-layout']) {
    assert.ok(ruleFor(css, selector).includes('min-width:0'), selector + ' must be allowed to shrink inside its parent');
  }
  assert.ok(ruleFor(css, '.page-heading').includes('flex-wrap:wrap'));
  assert.ok(ruleFor(css, '.profile-counts').includes('flex-wrap:wrap'));
  assert.ok(ruleFor(css, '.profile-tabs').includes('overflow-x:auto'));
});

test('phone overlays stay clear of the fixed bottom navigation and device safe areas', async () => {
  const css = await read('public/styles.css');
  assert.ok(css.includes('body{padding-bottom:calc(72px + env(safe-area-inset-bottom))}'));
  assert.ok(css.includes('#message-window-dock{bottom:calc(60px + env(safe-area-inset-bottom))!important'));
  assert.ok(css.includes('.toast{bottom:calc(72px + env(safe-area-inset-bottom))}'));
  assert.ok(ruleFor(css, '.mobile-nav').includes('height:calc(60px + env(safe-area-inset-bottom))'));
});

test('dialogs can scroll on short screens instead of being cut off', async () => {
  const css = await read('public/styles.css');
  assert.ok(ruleFor(css, '.modal-backdrop').includes('overflow-y:auto'));
  assert.ok(ruleFor(css, '.modal').includes('100dvh'));
});

test('the responsive stylesheet and service-worker shell are versioned together', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  assert.ok(html.includes('styles.css?v=20261031-responsive-layout-guardrails-1'));
  assert.ok(worker.includes('minglora-shell-v12-responsive-layout-guardrails'));
  assert.ok(worker.includes('styles.css?v=20261031-responsive-layout-guardrails-1'));
});
