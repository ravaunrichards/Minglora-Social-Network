import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Quick Currency is an independent, restorable Minglora feature', () => {
  const app = read('public/app.js');
  const html = read('public/index.html');
  assert.ok(app.includes("'quick-currency'"), 'Quick Currency must be included in restorable views');
  assert.ok(app.includes("state.view==='quick-currency'"));
  assert.ok(app.includes('MingloraQuickCurrency?.render()'));
  assert.ok(app.includes("view:'quick-currency'"));
  assert.ok(html.includes('data-view="quick-currency"'));
  assert.ok(html.includes('Quick Currency'));
});

test('Quick Currency provides two editable amount fields and reversible currency selection', () => {
  const client = read('public/quick-currency.js');
  assert.ok(client.includes('data-qcc-amount="from"'));
  assert.ok(client.includes('data-qcc-amount="to"'));
  assert.ok(client.includes('data-qcc-swap'));
  assert.ok(client.includes('calculateFromSource'));
  assert.ok(client.includes('calculateFromTarget'));
  assert.ok(client.includes("api('/currency/currencies')"));
  assert.ok(client.includes("api('/currency/rate?base='"));
  assert.ok(client.includes('state.lastEdited'));
  assert.ok(client.includes('saveState();\n      render();\n      void loadRate();'), 'currency selection must refresh symbols, labels and currency codes');
});

test('Quick Currency stylesheet, script, icon and offline shell are wired', () => {
  const html = read('public/index.html');
  const worker = read('public/sw.js');
  const icon = read('public/assets/icons/navigation-3d.svg');
  assert.ok(html.includes('quick-currency.css?v='));
  assert.ok(html.includes('quick-currency.js?v='));
  assert.ok(worker.includes('quick-currency.css?v='));
  assert.ok(worker.includes('quick-currency.js?v='));
  assert.ok(worker.includes('quick-currency-3d'));
  assert.ok(icon.includes('<symbol id="currency-quick"'));
});