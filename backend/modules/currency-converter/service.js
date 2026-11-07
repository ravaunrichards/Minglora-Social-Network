const SIX_CURRENCY_LIST_URL = 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml';
const FRANKFURTER_API_BASE = 'https://api.frankfurter.dev/v2';
const DIRECTORY_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_TTL_MS = 30 * 60 * 1000;
const STALE_RATE_TTL_MS = 36 * 60 * 60 * 1000;

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .trim();
}

function xmlField(entry, tag) {
  const match = entry.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, '')) : '';
}

export function normalizeCurrencyCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function parseIsoCurrencyXml(xml) {
  if (typeof xml !== 'string' || !xml.includes('<CcyTbl')) {
    throw new Error('The official ISO currency directory returned an invalid document.');
  }
  const currencies = new Map();
  for (const match of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/gi)) {
    const entry = match[1];
    const code = normalizeCurrencyCode(xmlField(entry, 'Ccy'));
    const name = xmlField(entry, 'CcyNm');
    const entity = xmlField(entry, 'CtryNm');
    if (!code || code === 'XXX' || !name) continue;
    const numericCode = xmlField(entry, 'CcyNbr');
    const minorUnitRaw = xmlField(entry, 'CcyMnrUnts');
    const minorUnitValue = Number(minorUnitRaw);
    const minorUnit = Number.isInteger(minorUnitValue) && minorUnitValue >= 0 && minorUnitValue <= 4
      ? minorUnitValue
      : 2;
    const existing = currencies.get(code);
    if (existing) {
      if (entity && !existing.entities.includes(entity)) existing.entities.push(entity);
      continue;
    }
    currencies.set(code, {
      code,
      name,
      numericCode: /^\d{3}$/.test(numericCode) ? numericCode : null,
      minorUnit,
      entities: entity ? [entity] : [],
      activeIso4217: true
    });
  }
  const result = [...currencies.values()].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  if (!result.length) throw new Error('The official ISO currency directory contained no current currency codes.');
  return result;
}

export function parseFallbackCurrencyDirectory(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const seen = new Set();
  return rows
    .filter(row => row && row.type === 'currency')
    .map(row => {
      const code = normalizeCurrencyCode(row.iso_code);
      if (!code || code === 'XXX' || seen.has(code)) return null;
      seen.add(code);
      const minor = Number(row.minor_unit);
      return {
        code,
        name: String(row.name || code),
        symbol: String(row.symbol || code),
        numericCode: /^\d{3}$/.test(String(row.iso_numeric || '')) ? String(row.iso_numeric) : null,
        minorUnit: Number.isInteger(minor) && minor >= 0 && minor <= 4 ? minor : 2,
        entities: Array.isArray(row.countries) ? row.countries.map(String) : [],
        activeIso4217: true
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

export function convertCurrencyAmount(amount, rate) {
  const parsedAmount = Number(amount);
  const parsedRate = Number(rate);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    throw new TypeError('Enter a valid amount that is zero or greater.');
  }
  if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
    throw new TypeError('The exchange rate must be a positive finite number.');
  }
  const converted = parsedAmount * parsedRate;
  if (!Number.isFinite(converted)) throw new RangeError('The converted amount is outside the supported numeric range.');
  return converted;
}

export function createCurrencyConverterService({
  fetcher = globalThis.fetch,
  now = () => Date.now(),
  directoryTtlMs = DIRECTORY_TTL_MS,
  rateTtlMs = RATE_TTL_MS,
  staleRateTtlMs = STALE_RATE_TTL_MS
} = {}) {
  if (typeof fetcher !== 'function') throw new TypeError('A fetch implementation is required.');
  let directoryCache = null;
  let directoryExpiresAt = 0;
  const rateCache = new Map();

  async function safeFetch(url, accept = 'application/json') {
    const response = await fetcher(url, {
      headers: { Accept: accept },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) {
      const error = new Error('Currency data provider returned HTTP ' + response.status + '.');
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function getCurrencyDirectory() {
    const timestamp = now();
    if (directoryCache && directoryExpiresAt > timestamp) return directoryCache;
    try {
      const response = await safeFetch(SIX_CURRENCY_LIST_URL, 'application/xml,text/xml;q=0.9,*/*;q=0.8');
      const xml = await response.text();
      const currencies = parseIsoCurrencyXml(xml);
      directoryCache = {
        currencies,
        source: 'SIX — ISO 4217 List One (current currencies)',
        sourceUrl: 'https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html',
        fetchedAt: new Date(timestamp).toISOString(),
        stale: false
      };
      directoryExpiresAt = timestamp + directoryTtlMs;
      return directoryCache;
    } catch (officialError) {
      try {
        const response = await safeFetch(FRANKFURTER_API_BASE + '/currencies');
        const payload = await response.json();
        const currencies = parseFallbackCurrencyDirectory(payload);
        if (!currencies.length) throw new Error('The fallback provider returned no current currencies.');
        directoryCache = {
          currencies,
          source: 'Frankfurter current currency directory (fallback)',
          sourceUrl: 'https://frankfurter.dev/',
          fetchedAt: new Date(timestamp).toISOString(),
          stale: false,
          directoryNotice: 'The official ISO directory is temporarily unavailable; provider coverage is shown instead.'
        };
        directoryExpiresAt = timestamp + Math.min(directoryTtlMs, 60 * 60 * 1000);
        return directoryCache;
      } catch (fallbackError) {
        if (directoryCache) return { ...directoryCache, stale: true, directoryNotice: 'Live directory refresh failed. Showing the last verified currency list.' };
        const error = new Error('Minglora could not load the current ISO currency list. Please try again.');
        error.status = 503;
        error.cause = fallbackError || officialError;
        throw error;
      }
    }
  }

  async function getRate(baseInput, quoteInput, { refresh = false } = {}) {
    const base = normalizeCurrencyCode(baseInput);
    const quote = normalizeCurrencyCode(quoteInput);
    if (!base || !quote) {
      const error = new Error('Choose two valid three-letter ISO currency codes.');
      error.status = 400;
      throw error;
    }
    if (base === quote) {
      return { base, quote, rate: 1, date: new Date(now()).toISOString().slice(0, 10), provider: 'Minglora identity rate', stale: false };
    }
    const directory = await getCurrencyDirectory();
    const supported = new Set(directory.currencies.map(currency => currency.code));
    if (!supported.has(base) || !supported.has(quote)) {
      const error = new Error('One of the selected codes is not an active currency in the current ISO 4217 directory.');
      error.status = 400;
      throw error;
    }

    const key = base + ':' + quote;
    const timestamp = now();
    const cached = rateCache.get(key);
    if (!refresh && cached && cached.expiresAt > timestamp) return cached.value;
    try {
      const response = await safeFetch(FRANKFURTER_API_BASE + '/rate/' + base.toLowerCase() + '/' + quote.toLowerCase());
      const payload = await response.json();
      const rate = Number(payload?.rate);
      if (payload?.base?.toUpperCase() !== base || payload?.quote?.toUpperCase() !== quote ||
          !Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) {
        throw new Error('The exchange-rate provider returned an invalid rate response.');
      }
      const value = {
        base,
        quote,
        rate,
        date: payload.date,
        provider: 'Frankfurter reference rates',
        sourceUrl: 'https://frankfurter.dev/',
        stale: false,
        fetchedAt: new Date(timestamp).toISOString()
      };
      rateCache.set(key, { value, expiresAt: timestamp + rateTtlMs, staleUntil: timestamp + staleRateTtlMs });
      return value;
    } catch (error) {
      if (cached && cached.staleUntil > timestamp) return { ...cached.value, stale: true };
      const unavailable = new Error('A reference rate is not available for ' + base + ' → ' + quote + ' right now. Try another pair or refresh later.');
      unavailable.status = 503;
      unavailable.cause = error;
      throw unavailable;
    }
  }

  return { getCurrencyDirectory, getRate };
}
