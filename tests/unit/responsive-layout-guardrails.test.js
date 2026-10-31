import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFile(resolve(root, path), 'utf8');

function lastRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g'))];
  return matches.at(-1)?.[1] || '';
}

test('shared content containers can shrink without pushing the page out of alignment', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /html\\s*\\{[^}]*overflow-x:\\s*clip/s);
  assert.match(css, /body\\s*\\{[^}]*overflow-x:\\s*clip/s);
  for (const selector of ['.layout', '.main-content', '.profile-body', '.settings-panels', '.message-layout']) {
    assert.match(lastRule(css, selector), /min-width:\\s*0/, selector + ' must be allowed to shrink inside its parent');
  }
  assert.match(lastRule(css, '.page-heading'), /flex-wrap:\\s*wrap/);
  assert.match(lastRule(css, '.profile-counts'), /flex-wrap:\\s*wrap/);
  assert.match(lastRule(css, '.profile-tabs'), /overflow-x:\\s*auto/);
});

test('phone overlays stay clear of the fixed bottom navigation and device safe areas', async () => {
  const css = await read('public/styles.css');
  assert.match(css, /body\\s*\\{padding-bottom:calc\\(72px \\+ env\\(safe-area-inset-bottom\\)\\)\\}/);
  assert.match(css, /#message-window-dock\\s*\\{[^}]*bottom:calc\\(60px \\+ env\\(safe-area-inset-bottom\\)\\)!important/s);
  assert.match(css, /\.toast\\s*\\{bottom:calc\\(72px \\+ env\\(safe-area-inset-bottom\\)\\)\\}/);
  assert.match(lastRule(css, '.mobile-nav'), /height:\\s*calc\\(60px \\+ env\\(safe-area-inset-bottom\\)\\)/);
});

test('dialogs can scroll on short screens instead of being cut off', async () => {
  const css = await read('public/styles.css');
  assert.match(lastRule(css, '.modal-backdrop'), /overflow-y:\\s*auto/);
  assert.match(lastRule(css, '.modal'), /100dvh/);
});

test('the responsive stylesheet and service-worker shell are versioned together', async () => {
  const html = await read('public/index.html');
  const worker = await read('public/sw.js');
  assert.match(html, /styles\\.css\\?v=20261031-responsive-layout-guardrails-1/);
  assert.match(worker, /minglora-shell-v12-responsive-layout-guardrails/);
  assert.match(worker, /styles\\.css\\?v=20261031-responsive-layout-guardrails-1/);
});
