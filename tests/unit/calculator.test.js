import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/calculator.js';

const calculator = globalThis.MingloraCalculator;

test('calculator evaluates common arithmetic with standard precedence', () => {
  assert.equal(calculator.evaluate('2+3*4'), 14);
  assert.equal(calculator.evaluate('(2+3)*4'), 20);
  assert.equal(calculator.evaluate('2^3^2'), 512);
});

test('calculator supports percentages, factorials, constants and implicit multiplication', () => {
  assert.equal(calculator.evaluate('200*10%'), 20);
  assert.equal(calculator.evaluate('(1+2)!'), 6);
  assert.ok(Math.abs(calculator.evaluate('2pi') - 2 * Math.PI) < 1e-12);
  assert.equal(calculator.evaluate('sqrt(81)'), 9);
});

test('scientific trigonometry supports degree and radian modes', () => {
  assert.ok(Math.abs(calculator.evaluate('sin(30)', 'DEG') - 0.5) < 1e-12);
  assert.ok(Math.abs(calculator.evaluate('sin(pi/2)', 'RAD') - 1) < 1e-12);
  assert.equal(calculator.evaluate('log(100)'), 2);
});

test('calculator rejects invalid expressions and division by zero', () => {
  assert.throws(() => calculator.evaluate('4/0'), /zero/i);
  assert.throws(() => calculator.evaluate('sqrt(-1)'), /finite/i);
  assert.throws(() => calculator.evaluate('(2+3'), /parenthesis/i);
});

test('wallet includes Calculator immediately after Currency Converter and loads its module', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const tabsStart = app.indexOf("const tabs=\"<nav class='recharge-tabs'");
  const tabsEnd = app.indexOf('const bindTabs=', tabsStart);
  assert.ok(tabsStart >= 0 && tabsEnd > tabsStart);
  const tabs = app.slice(tabsStart, tabsEnd);
  assert.ok(tabs.indexOf('>Currency Converter</button>') < tabs.indexOf('>Calculator</button>'));
  assert.match(app, /if\(activeTab==="calculator"\)/);
  assert.match(app, /window\.MingloraCalculator\?\.render/);
  for (const asset of ['calculator.css?v=20261107-wallet-calculator-1','calculator.js?v=20261107-wallet-calculator-1']) {
    assert.ok(html.includes(asset));
    assert.ok(worker.includes(asset));
  }
});
