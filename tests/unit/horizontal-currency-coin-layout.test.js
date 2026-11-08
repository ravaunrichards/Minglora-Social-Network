import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function latestRule(styles, selector) {
  const start = styles.lastIndexOf(selector);
  assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
  const end = styles.indexOf('}', start);
  assert.notEqual(end, -1, `Unclosed CSS rule: ${selector}`);
  return styles.slice(start, end + 1);
}

test('Minglora dollar amounts and coin counts stay horizontal on every viewport', async () => {
  const [styles, gifts, html, serviceWorker] = await Promise.all([
    read('../../public/styles.css'),
    read('../../public/gifts.js'),
    read('../../public/index.html'),
    read('../../public/sw.js')
  ]);

  for (const selector of [
    '.gift-balance-pill strong,',
    '.gift-currency-inline{',
    '.live-package-preview{',
    '.live-package-preview>span{',
    '.live-promo-actions>strong,'
  ]) {
    assert.match(latestRule(styles, selector), /writing-mode:horizontal-tb/);
  }

  assert.match(latestRule(styles, '.gift-currency-inline{'), /white-space:nowrap/);
  assert.match(latestRule(styles, '.live-package-preview{'), /flex-wrap:nowrap/);
  assert.match(latestRule(styles, '.live-package-preview>span{'), /white-space:nowrap/);
  assert.match(latestRule(styles, '.live-package-preview>span{'), /overflow-wrap:normal/);
  assert.match(latestRule(styles, '.gift-catalog-card small,'), /white-space:nowrap/);
  assert.match(latestRule(styles, '.live-gift-pick-button small,'), /white-space:nowrap/);
  assert.match(gifts, /gift-currency-inline'>USD /);
  assert.match(html, /styles\.css\?v=20261108-horizontal-money-coins-1/);
  assert.match(html, /gifts\.js\?v=20261108-horizontal-money-coins-1/);
  assert.match(serviceWorker, /styles\.css\?v=20261108-horizontal-money-coins-1/);
  assert.match(serviceWorker, /minglora-shell-v\\d+-horizontal-money-coins-1/);
});
