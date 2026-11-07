(() => {
  'use strict';

  const STORAGE_KEY = 'minglora.currency-converter.v1';
  const state = {
    currencies: [],
    byCode: new Map(),
    from: 'USD',
    to: 'JMD',
    amount: '1',
    rate: null,
    rateDate: '',
    provider: '',
    loading: false,
    error: '',
    directoryNotice: '',
    picker: '',
    search: '',
    favorites: [],
    history: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const getRoot = () => $('#recharge-currency-embed') || $('#main-content');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const validCode = value => /^[A-Z]{3}$/.test(String(value || '').toUpperCase());
  const pairKey = (from, to) => String(from).toUpperCase() + ':' + String(to).toUpperCase();

  function readLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.favorites = Array.isArray(saved.favorites)
        ? saved.favorites.filter(item => item && validCode(item.from) && validCode(item.to)).slice(0, 12)
        : [];
      state.history = Array.isArray(saved.history) ? saved.history.slice(0, 12) : [];
      if (validCode(saved.from)) state.from = saved.from.toUpperCase();
      if (validCode(saved.to)) state.to = saved.to.toUpperCase();
      if (typeof saved.amount === 'string' && saved.amount.length <= 30) state.amount = saved.amount;
    } catch {
      state.favorites = [];
      state.history = [];
    }
  }

  function saveLocalState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        favorites: state.favorites.slice(0, 12),
        history: state.history.slice(0, 12),
        from: state.from,
        to: state.to,
        amount: String(state.amount).slice(0, 30)
      }));
    } catch {
      // Converter remains usable when browser storage is disabled or full.
    }
  }

  function currencyFlag(code, currency) {
    const regional = {
      EUR: '🇪🇺', XAF: '🌍', XOF: '🌍', XCD: '🌴', XPF: '🌴',
      XDR: '🌐', XUA: '🌍', BOV: '🇧🇴', CHE: '🇨🇭', CHW: '🇨🇭',
      CLF: '🇨🇱', COU: '🇨🇴', MXV: '🇲🇽', USN: '🇺🇸', USS: '🇺🇸'
    };
    if (regional[code]) return regional[code];
    const entity = String(currency?.entities?.[0] || '').toUpperCase();
    const countryCodes = {
      'JAMAICA': 'JM', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA (THE)': 'US',
      'UNITED KINGDOM': 'GB', 'CANADA': 'CA', 'AUSTRALIA': 'AU', 'NEW ZEALAND': 'NZ',
      'INDIA': 'IN', 'JAPAN': 'JP', 'CHINA': 'CN', 'SOUTH AFRICA': 'ZA',
      'NIGERIA': 'NG', 'GHANA': 'GH', 'KENYA': 'KE', 'TRINIDAD AND TOBAGO': 'TT',
      'BARBADOS': 'BB', 'BAHAMAS (THE)': 'BS', 'GUYANA': 'GY', 'BELIZE': 'BZ',
      'MEXICO': 'MX', 'BRAZIL': 'BR', 'SWITZERLAND': 'CH', 'SINGAPORE': 'SG',
      'HONG KONG': 'HK', 'SOUTH KOREA': 'KR', 'REPUBLIC OF KOREA': 'KR',
      'UNITED ARAB EMIRATES': 'AE', 'SAUDI ARABIA': 'SA', 'TURKEY': 'TR',
      'TÜRKIYE': 'TR', 'FRANCE': 'FR', 'GERMANY': 'DE', 'ITALY': 'IT',
      'SPAIN': 'ES', 'PORTUGAL': 'PT', 'NETHERLANDS (THE)': 'NL',
      'SWEDEN': 'SE', 'NORWAY': 'NO', 'DENMARK': 'DK', 'POLAND': 'PL',
      'RUSSIA': 'RU', 'UKRAINE': 'UA', 'PHILIPPINES (THE)': 'PH',
      'INDONESIA': 'ID', 'THAILAND': 'TH', 'MALAYSIA': 'MY', 'PAKISTAN': 'PK',
      'SRI LANKA': 'LK', 'VIET NAM': 'VN', 'EGYPT': 'EG', 'MOROCCO': 'MA',
      'ZAMBIA': 'ZM', 'ZIMBABWE': 'ZW', 'UGANDA': 'UG', 'TANZANIA': 'TZ'
    };
    const region = countryCodes[entity] || '';
    if (!/^[A-Z]{2}$/.test(region)) return '🌐';
    return String.fromCodePoint(...[...region].map(char => 127397 + char.charCodeAt(0)));
  }

  function symbolFor(currency) {
    if (currency.symbol && currency.symbol !== currency.code) return currency.symbol;
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency.code, currencyDisplay: 'narrowSymbol'
      }).formatToParts(0);
      return parts.find(part => part.type === 'currency')?.value || currency.code;
    } catch {
      return currency.code;
    }
  }

  function decimalsFor(code) {
    const digits = Number(state.byCode.get(code)?.minorUnit);
    return Number.isInteger(digits) && digits >= 0 && digits <= 4 ? digits : 2;
  }

  function formatInputAmount(value, code) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return new Intl.NumberFormat('en-US', {
      useGrouping: false,
      minimumFractionDigits: decimalsFor(code),
      maximumFractionDigits: decimalsFor(code)
    }).format(number);
  }

  function formatCurrency(value, code) {
    const number = Number(value);
    if (!Number.isFinite(number) || !state.byCode.has(code)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: decimalsFor(code),
        maximumFractionDigits: decimalsFor(code)
      }).format(number);
    } catch {
      return symbolFor(state.byCode.get(code)) + ' ' + formatInputAmount(number, code);
    }
  }

  async function api(path) {
    let response;
    try {
      response = await fetch('/api' + path, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
    } catch {
      throw new Error('Minglora could not reach the currency service. Check your connection and try again.');
    }
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload.error || 'Currency service request failed (' + response.status + ').');
    return payload;
  }

  function currencyOption(currency) {
    const flag = currencyFlag(currency.code, currency);
    return '<button type="button" class="mcc-currency-option" data-mcc-select="' + escapeHtml(currency.code) + '">' +
      '<span class="mcc-currency-flag">' + flag + '</span>' +
      '<span class="mcc-currency-option-copy"><strong>' + escapeHtml(currency.code) + ' · ' + escapeHtml(currency.name) + '</strong>' +
      '<small>' + escapeHtml(currency.entities?.slice(0, 2).join(', ') || 'International currency') + '</small></span>' +
      '<span class="mcc-currency-symbol">' + escapeHtml(symbolFor(currency)) + '</span></button>';
  }

  function currentCurrency(side) {
    return state.byCode.get(side === 'to' ? state.to : state.from);
  }

  function pickerMarkup(side) {
    const currency = currentCurrency(side);
    const open = state.picker === side;
    const flag = currency ? currencyFlag(currency.code, currency) : '🌐';
    return '<div class="mcc-currency-select">' +
      '<button type="button" class="mcc-currency-trigger" data-mcc-open="' + side + '" aria-expanded="' + String(open) + '" aria-haspopup="listbox">' +
      '<span class="mcc-currency-trigger-flag">' + flag + '</span>' +
      '<span class="mcc-currency-trigger-copy"><strong>' + escapeHtml(currency?.code || (side === 'from' ? state.from : state.to)) + '</strong><small>' + escapeHtml(currency?.name || 'Select currency') + '</small></span>' +
      '<span class="mcc-chevron" aria-hidden="true">⌄</span></button>' +
      (open ? '<div class="mcc-currency-picker" role="dialog" aria-label="Choose ' + side + ' currency">' +
        '<label class="mcc-search-wrap"><span aria-hidden="true">⌕</span><input type="search" data-mcc-search="' + side + '" value="' + escapeHtml(state.search) + '" placeholder="Search code, country or currency…" autocomplete="off"></label>' +
        '<div class="mcc-currency-list" role="listbox" aria-label="Available currencies">' +
        state.currencies.filter(item => {
          const needle = state.search.trim().toLowerCase();
          if (!needle) return true;
          return [item.code, item.name, item.symbol, ...(item.entities || [])].join(' ').toLowerCase().includes(needle);
        }).slice(0, 250).map(currencyOption).join('') +
        '</div></div>' : '') +
      '</div>';
  }

  function render() {
    const root = getRoot();
    if (!root) return;
    const fromCurrency = currentCurrency('from');
    const toCurrency = currentCurrency('to');
    const hasRate = Number.isFinite(state.rate) && state.rate > 0;
    const numericAmount = state.amount === '' ? NaN : Number(state.amount);
    const hasAmount = Number.isFinite(numericAmount) && numericAmount >= 0;
    const outputAmount = hasRate && hasAmount ? numericAmount * state.rate : NaN;
    const hasConvertedAmount = Number.isFinite(outputAmount);
    const rateText = hasRate
      ? '1 ' + state.from + ' = ' + new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(state.rate) + ' ' + state.to
      : state.loading ? 'Retrieving reference rate…' : state.error ? 'Rate unavailable' : 'Choose currencies to see the rate';
    const inverseText = hasRate
      ? '1 ' + state.to + ' = ' + new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(1 / state.rate) + ' ' + state.from
      : '';
    const favorite = state.favorites.some(item => item.from === state.from && item.to === state.to);
    const amountOut = hasConvertedAmount ? formatInputAmount(outputAmount, state.to) : '';
    const favoritesMarkup = state.favorites.length
      ? state.favorites.map(item => '<button type="button" class="mcc-pair-chip" data-mcc-pair="' + escapeHtml(item.from) + ':' + escapeHtml(item.to) + '">' +
          '<span>' + escapeHtml(item.from) + '</span><span class="mcc-chip-arrow">→</span><span>' + escapeHtml(item.to) + '</span></button>').join('')
      : '<p class="mcc-muted">Save currency pairs you use often for one-tap access.</p>';
    const historyMarkup = state.history.length
      ? '<div class="mcc-history-list">' + state.history.slice(0, 8).map((item, index) =>
          '<button type="button" class="mcc-history-item" data-mcc-history="' + index + '">' +
          '<span class="mcc-history-pair">' + escapeHtml(item.from) + ' → ' + escapeHtml(item.to) + '</span>' +
          '<span class="mcc-history-value">' + escapeHtml(item.fromAmount) + ' ' + escapeHtml(item.from) + ' = ' + escapeHtml(item.toAmount) + ' ' + escapeHtml(item.to) + '</span>' +
          '<small>' + escapeHtml(new Date(item.savedAt).toLocaleString()) + '</small></button>'
        ).join('') + '</div>'
      : '<p class="mcc-muted">Your saved conversions will appear here on this device.</p>';

    root.innerHTML =
      '<section class="mcc-page">' +
        '<header class="mcc-heading"><div><span class="mcc-eyebrow">MINGLORA WALLET · TOOLS</span><h1>Currency Converter</h1><p>Convert any amount between the world’s current ISO 4217 currencies.</p></div>' +
        '<span class="mcc-global-badge">🌐 Global currencies</span></header>' +
        (state.directoryNotice ? '<div class="mcc-notice" role="status">' + escapeHtml(state.directoryNotice) + '</div>' : '') +
        '<div class="mcc-layout">' +
          '<div class="mcc-primary-column">' +
            '<section class="mcc-converter-card" aria-label="Currency conversion">' +
              '<div class="mcc-card-head"><div><h2>Convert currency</h2><p>Enter an amount in either field.</p></div><span class="mcc-live-dot"><i></i> Reference rates</span></div>' +
              '<div class="mcc-amount-grid">' +
                '<div class="mcc-amount-box"><label for="mcc-from-amount">You convert</label>' +
                  '<input id="mcc-from-amount" data-mcc-amount="from" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + escapeHtml(formatInputAmount(state.amount, state.from)) + '" aria-label="Amount in ' + escapeHtml(state.from) + '">' +
                  '<div class="mcc-currency-slot">' + pickerMarkup('from') + '</div>' +
                  '<p class="mcc-amount-caption">' + escapeHtml(fromCurrency?.name || state.from) + '</p></div>' +
                '<button type="button" class="mcc-swap" data-mcc-swap aria-label="Swap currencies" title="Swap currencies">⇅</button>' +
                '<div class="mcc-amount-box mcc-result-box"><label for="mcc-to-amount">Converted amount</label>' +
                  '<input id="mcc-to-amount" data-mcc-amount="to" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + escapeHtml(amountOut) + '" aria-label="Amount in ' + escapeHtml(state.to) + '" ' + (!hasRate ? 'placeholder="—"' : '') + '>' +
                  '<div class="mcc-currency-slot">' + pickerMarkup('to') + '</div>' +
                  '<p class="mcc-amount-caption">' + escapeHtml(toCurrency?.name || state.to) + '</p></div>' +
              '</div>' +
              '<div class="mcc-rate-panel"><div class="mcc-rate-heading"><span>Exchange rate</span><button type="button" class="mcc-icon-button" data-mcc-refresh title="Refresh exchange rate" aria-label="Refresh exchange rate" ' + (state.loading ? 'disabled' : '') + '>↻</button></div>' +
                '<strong id="mcc-rate-text">' + escapeHtml(rateText) + '</strong>' +
                (inverseText ? '<small>' + escapeHtml(inverseText) + '</small>' : '') +
                '<div class="mcc-rate-meta">' + (state.loading ? 'Contacting the reference-rate provider…' :
                  state.rateDate ? 'Rate date: ' + escapeHtml(state.rateDate) + (state.rateStale ? ' · cached rate' : '') :
                  state.error ? escapeHtml(state.error) : 'Rates refresh as providers publish new data.') + '</div>' +
              '</div>' +
              '<div class="mcc-actions"><button type="button" class="mcc-primary-action" data-mcc-copy ' + (!hasConvertedAmount ? 'disabled' : '') + '>Copy converted amount</button>' +
                '<button type="button" class="mcc-secondary-action" data-mcc-favorite>' + (favorite ? '★ Saved pair' : '☆ Save pair') + '</button>' +
                '<button type="button" class="mcc-secondary-action" data-mcc-save-history ' + (!hasConvertedAmount ? 'disabled' : '') + '>Save conversion</button></div>' +
              '<p class="mcc-disclaimer">Indicative reference rates only. Your bank, card provider or transfer service may use a different rate and charge fees. This tool does not exchange, send or withdraw money.</p>' +
            '</section>' +
            '<section class="mcc-support-card"><div class="mcc-section-title"><div><h2>Favorite pairs</h2><p>Quick access to your common conversions.</p></div><span>' + state.favorites.length + '/12</span></div>' +
              '<div class="mcc-favorites">' + favoritesMarkup + '</div></section>' +
          '</div>' +
          '<aside class="mcc-side-column"><section class="mcc-support-card mcc-directory-card"><div class="mcc-section-title"><div><h2>Currency directory</h2><p>Search by code, currency or country.</p></div><span>' + state.currencies.length + '</span></div>' +
              '<label class="mcc-directory-search"><span aria-hidden="true">⌕</span><input type="search" id="mcc-directory-search" placeholder="Search all currencies…" autocomplete="off"></label>' +
              '<div class="mcc-directory-list" id="mcc-directory-list">' + state.currencies.slice(0, 8).map(currency => '<button type="button" class="mcc-directory-row" data-mcc-directory-code="' + escapeHtml(currency.code) + '">' +
                '<span class="mcc-currency-flag">' + currencyFlag(currency.code, currency) + '</span><span><strong>' + escapeHtml(currency.code) + '</strong><small>' + escapeHtml(currency.name) + '</small></span><span class="mcc-directory-symbol">' + escapeHtml(symbolFor(currency)) + '</span></button>').join('') + '</div>' +
              '<p class="mcc-source-note">Current currency codes: <a href="https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html" target="_blank" rel="noopener noreferrer">SIX, ISO 4217 List One ↗</a></p></section>' +
            '<section class="mcc-support-card"><div class="mcc-section-title"><div><h2>Recent conversions</h2><p>Saved on this device.</p></div><button type="button" class="mcc-text-button" data-mcc-clear-history ' + (!state.history.length ? 'disabled' : '') + '>Clear</button></div>' + historyMarkup + '</section>' +
          '</aside>' +
        '</div>' +
      '</section>';

    bindEvents(root);
  }

  function updateAmountFields(root = getRoot()) {
    if (!root) return;
    const fromInput = $('#mcc-from-amount', root);
    const toInput = $('#mcc-to-amount', root);
    const amount = state.amount === '' ? NaN : Number(state.amount);
    const result = Number.isFinite(amount) && amount >= 0 && Number.isFinite(state.rate) ? amount * state.rate : NaN;
    if (fromInput && document.activeElement !== fromInput) fromInput.value = Number.isFinite(amount) ? formatInputAmount(amount, state.from) : '';
    if (toInput && document.activeElement !== toInput) toInput.value = Number.isFinite(result) ? formatInputAmount(result, state.to) : '';
    const copy = $('[data-mcc-copy]', root);
    const save = $('[data-mcc-save-history]', root);
    if (copy) copy.disabled = !Number.isFinite(result);
    if (save) save.disabled = !Number.isFinite(result);
    const fromLabel = $('[for="mcc-from-amount"]', root);
    const toLabel = $('[for="mcc-to-amount"]', root);
    if (fromLabel) fromLabel.textContent = 'You convert (' + state.from + ')';
    if (toLabel) toLabel.textContent = 'Converted amount (' + state.to + ')';
  }

  function renderDirectory(filter = '') {
    const root = $('#mcc-directory-list');
    if (!root) return;
    const needle = String(filter || '').trim().toLowerCase();
    const items = state.currencies.filter(item =>
      [item.code, item.name, item.symbol, ...(item.entities || [])].join(' ').toLowerCase().includes(needle)
    ).slice(0, 60);
    root.innerHTML = items.length
      ? items.map(currency => '<button type="button" class="mcc-directory-row" data-mcc-directory-code="' + escapeHtml(currency.code) + '">' +
          '<span class="mcc-currency-flag">' + currencyFlag(currency.code, currency) + '</span><span><strong>' + escapeHtml(currency.code) + '</strong><small>' + escapeHtml(currency.name) + '</small></span><span class="mcc-directory-symbol">' + escapeHtml(symbolFor(currency)) + '</span></button>').join('')
      : '<p class="mcc-muted mcc-directory-empty">No matching active currency was found.</p>';
  }

  async function loadRate({refresh = false} = {}) {
    state.loading = true;
    state.error = '';
    render();
    try {
      const payload = await api('/currency/rate?base=' + encodeURIComponent(state.from) + '&quote=' + encodeURIComponent(state.to) + (refresh ? '&refresh=1' : ''));
      state.rate = Number(payload.rate);
      state.rateDate = String(payload.date || '');
      state.provider = String(payload.provider || 'Reference-rate provider');
      state.rateStale = Boolean(payload.stale);
      if (!Number.isFinite(state.rate) || state.rate <= 0) throw new Error('The currency service returned an invalid exchange rate.');
    } catch (error) {
      state.rate = null;
      state.rateDate = '';
      state.rateStale = false;
      state.error = error.message || 'Exchange rate unavailable.';
    } finally {
      state.loading = false;
      render();
    }
  }

  function recordHistory() {
    const amount = Number(state.amount);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(state.rate)) return;
    const value = amount * state.rate;
    if (!Number.isFinite(value)) return;
    const item = {
      from: state.from,
      to: state.to,
      fromAmount: formatInputAmount(amount, state.from),
      toAmount: formatInputAmount(value, state.to),
      rate: state.rate,
      rateDate: state.rateDate,
      savedAt: new Date().toISOString()
    };
    state.history = [item, ...state.history.filter(old =>
      !(old.from === item.from && old.to === item.to && old.fromAmount === item.fromAmount && old.toAmount === item.toAmount)
    )].slice(0, 12);
    saveLocalState();
    render();
  }

  function toggleFavorite() {
    const key = pairKey(state.from, state.to);
    const exists = state.favorites.some(item => pairKey(item.from, item.to) === key);
    if (exists) state.favorites = state.favorites.filter(item => pairKey(item.from, item.to) !== key);
    else {
      if (state.favorites.length >= 12) state.favorites = state.favorites.slice(1);
      state.favorites = [...state.favorites, { from: state.from, to: state.to }];
    }
    saveLocalState();
    render();
  }

  function selectPair(from, to, amount = state.amount) {
    if (!state.byCode.has(from) || !state.byCode.has(to)) return;
    state.from = from;
    state.to = to;
    state.amount = String(amount ?? '');
    state.rate = null;
    state.rateDate = '';
    state.rateStale = false;
    state.error = '';
    state.picker = '';
    state.search = '';
    saveLocalState();
    void loadRate();
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-mcc-open]').forEach(button => button.addEventListener('click', () => {
      const side = button.dataset.mccOpen;
      state.picker = state.picker === side ? '' : side;
      state.search = '';
      render();
      if (state.picker) {
        const search = $('[data-mcc-search="' + state.picker + '"]', root);
        search?.focus();
      }
    }));

    root.querySelectorAll('[data-mcc-search]').forEach(input => input.addEventListener('input', () => {
      state.search = input.value;
      const picker = input.closest('.mcc-currency-picker');
      const list = $('.mcc-currency-list', picker);
      if (list) {
        const needle = state.search.trim().toLowerCase();
        const matches = state.currencies.filter(item =>
          [item.code, item.name, item.symbol, ...(item.entities || [])].join(' ').toLowerCase().includes(needle)
        ).slice(0, 250);
        list.innerHTML = matches.length ? matches.map(currencyOption).join('') : '<p class="mcc-muted mcc-directory-empty">No matching active currency was found.</p>';
      }
    }));

    root.querySelectorAll('[data-mcc-select]').forEach(button => button.addEventListener('click', () => {
      const code = button.dataset.mccSelect;
      if (state.picker === 'from') selectPair(code, state.to);
      else if (state.picker === 'to') selectPair(state.from, code);
    }));

    root.querySelectorAll('[data-mcc-amount]').forEach(input => input.addEventListener('input', () => {
      const value = input.value.trim().replace(/,/g, '');
      if (value && !/^\d*(?:\.\d*)?$/.test(value)) return;
      if (input.dataset.mccAmount === 'from') {
        state.amount = value;
      } else {
        const numeric = value === '' ? NaN : Number(value);
        state.amount = value === '' ? '' : Number.isFinite(numeric) && state.rate ? String(numeric / state.rate) : '';
      }
      updateAmountFields(root);
      saveLocalState();
    }));

    root.querySelector('[data-mcc-swap]')?.addEventListener('click', () => {
      const currentOutput = state.amount !== '' && Number.isFinite(state.rate) ? Number(state.amount) * state.rate : '';
      selectPair(state.to, state.from, currentOutput === '' ? '' : String(currentOutput));
    });
    root.querySelector('[data-mcc-refresh]')?.addEventListener('click', () => void loadRate({ refresh: true }));
    root.querySelector('[data-mcc-favorite]')?.addEventListener('click', toggleFavorite);
    root.querySelector('[data-mcc-save-history]')?.addEventListener('click', recordHistory);
    root.querySelector('[data-mcc-copy]')?.addEventListener('click', async () => {
      const amount = Number(state.amount) * state.rate;
      const text = formatInputAmount(amount, state.to) + ' ' + state.to;
      try {
        await navigator.clipboard.writeText(text);
        if (window.MingloraToast) window.MingloraToast('Converted amount copied.');
      } catch {
        const input = $('#mcc-to-amount', root);
        input?.select();
        document.execCommand('copy');
      }
    });
    root.querySelector('[data-mcc-clear-history]')?.addEventListener('click', () => {
      state.history = [];
      saveLocalState();
      render();
    });
    root.querySelectorAll('[data-mcc-pair]').forEach(button => button.addEventListener('click', () => {
      const [from, to] = button.dataset.mccPair.split(':');
      selectPair(from, to);
    }));
    root.querySelectorAll('[data-mcc-history]').forEach(button => button.addEventListener('click', () => {
      const item = state.history[Number(button.dataset.mccHistory)];
      if (item) selectPair(item.from, item.to, item.fromAmount);
    }));
    root.querySelectorAll('[data-mcc-directory-code]').forEach(button => button.addEventListener('click', () => {
      const code = button.dataset.mccDirectoryCode;
      selectPair(state.from, code);
    }));
    root.querySelector('#mcc-directory-search')?.addEventListener('input', event => renderDirectory(event.target.value));
  }

  async function renderPage() {
    readLocalState();
    const root = getRoot();
    if (!root) return;
    root.innerHTML = '<section class="mcc-page"><div class="mcc-loading-card"><span class="mcc-spinner"></span><strong>Loading world currency directory…</strong><small>Connecting to the official ISO 4217 list.</small></div></section>';
    try {
      const payload = await api('/currency/currencies');
      state.currencies = Array.isArray(payload.currencies) ? payload.currencies : [];
      state.byCode = new Map(state.currencies.map(item => [item.code, item]));
      state.directoryNotice = payload.directoryNotice || (payload.stale ? 'Showing the last verified currency directory while the live directory refreshes.' : '');
      if (!state.byCode.has(state.from)) state.from = state.byCode.has('USD') ? 'USD' : state.currencies[0]?.code;
      if (!state.byCode.has(state.to)) state.to = state.byCode.has('JMD') ? 'JMD' : state.currencies.find(item => item.code !== state.from)?.code;
      state.favorites = state.favorites.filter(item => state.byCode.has(item.from) && state.byCode.has(item.to));
      render();
      await loadRate();
    } catch (error) {
      root.innerHTML = '<section class="mcc-page"><div class="mcc-error-card"><h2>Currency directory unavailable</h2><p>' + escapeHtml(error.message) + '</p><button type="button" class="mcc-primary-action" id="mcc-retry-directory">Try again</button></div></section>';
      $('#mcc-retry-directory', root)?.addEventListener('click', () => void renderPage());
    }
  }

  window.MingloraCurrencyConverter = { render: renderPage };
})();
