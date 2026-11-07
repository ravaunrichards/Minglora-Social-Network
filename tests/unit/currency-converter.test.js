import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertCurrencyAmount,
  normalizeCurrencyCode,
  parseIsoCurrencyXml,
  parseFallbackCurrencyDirectory
} from '../../backend/modules/currency-converter/service.js';

test('normalizes only valid three-letter ISO codes', () => {
  assert.equal(normalizeCurrencyCode(' usd '), 'USD');
  assert.equal(normalizeCurrencyCode('JMD'), 'JMD');
  assert.equal(normalizeCurrencyCode('US'), null);
  assert.equal(normalizeCurrencyCode('USDD'), null);
  assert.equal(normalizeCurrencyCode('123'), null);
});

test('parses and deduplicates the official current ISO currency list', () => {
  const xml = `<?xml version="1.0"?><ISO_4217><CcyTbl>
    <CcyNtry><CtryNm>UNITED STATES</CtryNm><CcyNm>US Dollar</CcyNm><Ccy>USD</Ccy><CcyNbr>840</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>JAMAICA</CtryNm><CcyNm>Jamaican Dollar</CcyNm><Ccy>JMD</Ccy><CcyNbr>388</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>UNITED STATES MINOR OUTLYING ISLANDS</CtryNm><CcyNm>US Dollar</CcyNm><Ccy>USD</Ccy><CcyNbr>840</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>BULGARIA</CtryNm><CcyNm>Euro</CcyNm><Ccy>EUR</Ccy><CcyNbr>978</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>ANTARCTICA</CtryNm></CcyNtry>
    <CcyNtry><CtryNm>NO CURRENCY</CtryNm><CcyNm>No currency</CcyNm><Ccy>XXX</Ccy><CcyNbr>999</CcyNbr><CcyMnrUnts>N.A.</CcyMnrUnts></CcyNtry>
  </CcyTbl></ISO_4217>`;
  const currencies = parseIsoCurrencyXml(xml);
  assert.deepEqual(currencies.map(item => item.code), ['EUR', 'JMD', 'USD']);
  const usd = currencies.find(item => item.code === 'USD');
  assert.equal(usd.name, 'US Dollar');
  assert.deepEqual(usd.entities, ['UNITED STATES', 'UNITED STATES MINOR OUTLYING ISLANDS']);
  assert.equal(usd.numericCode, '840');
  assert.equal(usd.minorUnit, 2);
});

test('parses provider fallback but excludes crypto and duplicate codes', () => {
  const currencies = parseFallbackCurrencyDirectory([
    { type: 'currency', iso_code: 'JMD', name: 'Jamaican Dollar', iso_numeric: '388', minor_unit: 2 },
    { type: 'crypto', iso_code: 'BTC', name: 'Bitcoin' },
    { type: 'currency', iso_code: 'JMD', name: 'Duplicate' }
  ]);
  assert.equal(currencies.length, 1);
  assert.equal(currencies[0].code, 'JMD');
});

test('converts arbitrary decimal amounts without truncating input', () => {
  assert.equal(convertCurrencyAmount(12.345, 158.5), 1956.6675);
  assert.equal(convertCurrencyAmount(0, 1.25), 0);
  assert.throws(() => convertCurrencyAmount(-1, 2), /zero or greater/);
  assert.throws(() => convertCurrencyAmount(2, 0), /positive finite number/);
  assert.throws(() => convertCurrencyAmount('NaN', 2), /valid amount/);
});
