import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrencyConverterService } from '../../backend/modules/currency-converter/service.js';

const currencyXml = `<?xml version="1.0"?><ISO_4217><CcyTbl>
  <CcyNtry><CtryNm>UNITED STATES</CtryNm><CcyNm>US Dollar</CcyNm><Ccy>USD</Ccy><CcyNbr>840</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
  <CcyNtry><CtryNm>JAMAICA</CtryNm><CcyNm>Jamaican Dollar</CcyNm><Ccy>JMD</Ccy><CcyNbr>388</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
  <CcyNtry><CtryNm>EUROPEAN UNION</CtryNm><CcyNm>Euro</CcyNm><Ccy>EUR</Ccy><CcyNbr>978</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
</CcyTbl></ISO_4217>`;

function response({ ok = true, status = 200, data, text } = {}) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => text
  };
}

test('loads and caches the official SIX currency directory and live provider rates', async () => {
  let calls = 0;
  const fetcher = async url => {
    calls += 1;
    if (url.includes('list-one.xml')) return response({ text: currencyXml });
    if (url.endsWith('/rate/usd/jmd')) return response({
      data: { base: 'USD', quote: 'JMD', rate: 158.75, date: '2026-11-06' }
    });
    throw new Error('Unexpected request: ' + url);
  };
  const service = createCurrencyConverterService({ fetcher, now: () => Date.parse('2026-11-06T12:00:00Z') });

  const directory = await service.getCurrencyDirectory();
  assert.equal(directory.source, 'SIX — ISO 4217 List One (current currencies)');
  assert.deepEqual(directory.currencies.map(item => item.code), ['EUR', 'JMD', 'USD']);

  const rate = await service.getRate('usd', 'jmd');
  assert.equal(rate.rate, 158.75);
  assert.equal(rate.date, '2026-11-06');
  assert.equal(rate.base, 'USD');
  assert.equal(rate.quote, 'JMD');
  assert.equal(rate.stale, false);

  await service.getCurrencyDirectory();
  await service.getRate('USD', 'JMD');
  assert.equal(calls, 2, 'directory and exchange rate should be cached');
});

test('uses only active currency entries in the current Frankfurter fallback directory', async () => {
  const fetcher = async url => {
    if (url.includes('list-one.xml')) return response({ ok: false, status: 503 });
    if (url.endsWith('/currencies')) return response({
      data: [
        { iso_code: 'USD', name: 'US Dollar', symbol: '$', iso_numeric: '840', type: 'currency' },
        { iso_code: 'JMD', name: 'Jamaican Dollar', symbol: '$', iso_numeric: '388', type: 'currency' },
        { iso_code: 'BTC', name: 'Bitcoin', symbol: '₿', type: 'crypto' },
        { iso_code: 'BGN', name: 'Bulgarian Lev', type: 'currency', end_date: '2025-12-31' }
      ]
    });
    throw new Error('Unexpected request: ' + url);
  };
  const service = createCurrencyConverterService({ fetcher });
  const directory = await service.getCurrencyDirectory();
  assert.equal(directory.source, 'Frankfurter current currency directory (fallback)');
  assert.deepEqual(directory.currencies.map(item => item.code), ['JMD', 'USD']);
  assert.ok(directory.directoryNotice);
});

test('uses a recent cached reference rate when the provider temporarily fails', async () => {
  let time = Date.parse('2026-11-06T12:00:00Z');
  let rateOnline = true;
  const fetcher = async url => {
    if (url.includes('list-one.xml')) return response({ text: currencyXml });
    if (url.endsWith('/rate/usd/jmd')) {
      if (!rateOnline) throw new Error('temporary provider outage');
      return response({ data: { base: 'USD', quote: 'JMD', rate: 158.75, date: '2026-11-06' } });
    }
    throw new Error('Unexpected request: ' + url);
  };
  const service = createCurrencyConverterService({ fetcher, now: () => time });
  await service.getRate('USD', 'JMD');
  time += 60 * 60 * 1000;
  rateOnline = false;

  const staleRate = await service.getRate('USD', 'JMD');
  assert.equal(staleRate.rate, 158.75);
  assert.equal(staleRate.stale, true);
});

test('rejects currencies outside the current ISO directory instead of inventing a rate', async () => {
  let rateRequests = 0;
  const fetcher = async url => {
    if (url.includes('list-one.xml')) return response({ text: currencyXml });
    rateRequests += 1;
    throw new Error('A rate request should not be made for an unsupported currency.');
  };
  const service = createCurrencyConverterService({ fetcher });
  await assert.rejects(service.getRate('USD', 'BGN'), /not an active currency/);
  assert.equal(rateRequests, 0);
});


test('accepts identity conversion only for a currency in the current ISO directory', async () => {
  const fetcher = async url => {
    if (url.includes('list-one.xml')) return response({ text: currencyXml });
    throw new Error('No external rate should be needed for an identity conversion.');
  };
  const service = createCurrencyConverterService({ fetcher });
  const identity = await service.getRate('USD', 'USD');
  assert.equal(identity.rate, 1);
  assert.equal(identity.base, 'USD');
  await assert.rejects(service.getRate('ZZZ', 'ZZZ'), /not an active currency/);
});
