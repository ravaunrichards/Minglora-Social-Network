(() => {
  'use strict';

  const STORAGE_KEY = 'minglora.quick-currency.v1';
  const state = {
    currencies: [],
    byCode: new Map(),
    from: 'USD',
    to: 'JMD',
    fromAmount: '1',
    toAmount: '',
    lastEdited: 'from',
    rate: null,
    rateDate: '',
    provider: '',
    stale: false,
    loading: false,
    error: '',
    search: '',
    requestId: 0
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const getRoot = () => $('#recharge-currency-embed') || $('#main-content');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const validCode = value => /^[A-Z]{3}$/.test(String(value || '').toUpperCase());

  function readSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (validCode(saved.from)) state.from = saved.from.toUpperCase();
      if (validCode(saved.to)) state.to = saved.to.toUpperCase();
      if (typeof saved.fromAmount === 'string' && saved.fromAmount.length <= 30) state.fromAmount = saved.fromAmount;
      if (typeof saved.toAmount === 'string' && saved.toAmount.length <= 30) state.toAmount = saved.toAmount;
      if (saved.lastEdited === 'to') state.lastEdited = 'to';
    } catch {
      // A blocked or malformed local preference store must not block conversion.
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        from: state.from,
        to: state.to,
        fromAmount: String(state.fromAmount).slice(0, 30),
        toAmount: String(state.toAmount).slice(0, 30),
        lastEdited: state.lastEdited
      }));
    } catch {
      // The converter remains usable without local storage.
    }
  }

  function currencySymbol(currency) {
    if (currency?.symbol && currency.symbol !== currency.code) return currency.symbol;
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.code,
        currencyDisplay: 'narrowSymbol'
      }).formatToParts(0);
      return parts.find(part => part.type === 'currency')?.value || currency.code;
    } catch {
      return currency?.code || '';
    }
  }

  function fractionDigits(code) {
    const digits = Number(state.byCode.get(code)?.minorUnit);
    return Number.isInteger(digits) && digits >= 0 && digits <= 4 ? digits : 2;
  }

  function formatAmount(value, code) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return new Intl.NumberFormat(undefined, {
      useGrouping: true,
      minimumFractionDigits: fractionDigits(code),
      maximumFractionDigits: fractionDigits(code)
    }).format(amount);
  }

  function formatRate(value) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) return '—';
    return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(rate);
  }

  function parseAmount(value) {
    const cleaned = String(value ?? '').trim().replace(/,/g, '');
    if (cleaned === '') return null;
    if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(cleaned)) return NaN;
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
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
    if (!response.ok) throw new Error(payload.error || 'Currency request failed (' + response.status + ').');
    return payload;
  }

  function currencyOptions(selectedCode) {
    const needle = state.search.trim().toLowerCase();
    const list = state.currencies.filter(currency => {
      if (currency.code === selectedCode) return true;
      if (!needle) return true;
      return [currency.code, currency.name, currency.symbol, ...(currency.entities || [])]
        .join(' ').toLowerCase().includes(needle);
    });
    return list.map(currency =>
      '<option value="' + escapeHtml(currency.code) + '">' +
      escapeHtml(currency.code + ' — ' + currency.name + ' (' + currencySymbol(currency) + ')') +
      '</option>'
    ).join('');
  }

  function render() {
    const root = getRoot();
    if (!root) return;
    const fromCurrency = state.byCode.get(state.from);
    const toCurrency = state.byCode.get(state.to);
    const rateAvailable = Number.isFinite(state.rate) && state.rate > 0;
    const sourceAmount = parseAmount(state.fromAmount);
    const targetAmount = parseAmount(state.toAmount);
    const sourceValid = sourceAmount !== null && Number.isFinite(sourceAmount);
    const targetValid = targetAmount !== null && Number.isFinite(targetAmount);
    const rateLine = rateAvailable
      ? '1 ' + state.from + ' = ' + formatRate(state.rate) + ' ' + state.to
      : state.loading ? 'Loading the selected exchange rate…' : state.error ? 'Rate unavailable for this pair' : 'Select currencies to view the rate';
    const inverseLine = rateAvailable
      ? '1 ' + state.to + ' = ' + formatRate(1 / state.rate) + ' ' + state.from
      : '';
    const sourceSymbol = currencySymbol(fromCurrency);
    const targetSymbol = currencySymbol(toCurrency);

    root.innerHTML =
      '<section class="qcc-page">' +
        '<header class="qcc-heading">' +
          '<div><span class="qcc-eyebrow">MINGLORA · TWO-WAY CURRENCY</span><h1>Currency Converter</h1>' +
          '<p>Enter an amount on either side. The other currency updates automatically.</p></div>' +
          '<span class="qcc-world-badge">🌐 ' + state.currencies.length + ' active ISO currencies</span>' +
        '</header>' +
        '<section class="qcc-card" aria-label="Two-way currency calculator">' +
          '<div class="qcc-card-top"><div><h2>Two-way currency calculator</h2><p>USD to JMD, JMD to USD, and other supported pairs.</p></div>' +
            '<button type="button" class="qcc-refresh" data-qcc-refresh ' + (state.loading ? 'disabled' : '') + ' aria-label="Refresh exchange rate" title="Refresh rate">↻ Refresh</button></div>' +
          '<label class="qcc-search"><span>Find a currency</span><input type="search" data-qcc-search value="' + escapeHtml(state.search) + '" placeholder="Search by code, name or country" autocomplete="off"></label>' +
          '<div class="qcc-pair-grid">' +
            '<section class="qcc-side qcc-side-from" aria-label="First currency">' +
              '<div class="qcc-side-heading"><span class="qcc-side-label">YOU HAVE</span><span class="qcc-code-pill">' + escapeHtml(state.from) + '</span></div>' +
              '<label class="qcc-currency-label" for="qcc-from-select">From currency</label>' +
              '<select id="qcc-from-select" data-qcc-select="from">' + currencyOptions(state.from) + '</select>' +
              '<label class="qcc-amount-label" for="qcc-from-amount">Amount in ' + escapeHtml(state.from) + '</label>' +
              '<div class="qcc-input-wrap"><span>' + escapeHtml(sourceSymbol) + '</span><input id="qcc-from-amount" data-qcc-amount="from" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="30" value="' + escapeHtml(state.fromAmount) + '" placeholder="1.00" aria-label="Amount in ' + escapeHtml(state.from) + '"></div>' +
              '<p class="qcc-currency-name">' + escapeHtml(fromCurrency?.name || state.from) + '</p>' +
            '</section>' +
            '<button type="button" class="qcc-swap" data-qcc-swap aria-label="Rotate currencies" title="Rotate currencies"><span aria-hidden="true">⇄</span><small>ROTATE</small></button>' +
            '<section class="qcc-side qcc-side-to" aria-label="Second currency">' +
              '<div class="qcc-side-heading"><span class="qcc-side-label">YOU GET</span><span class="qcc-code-pill">' + escapeHtml(state.to) + '</span></div>' +
              '<label class="qcc-currency-label" for="qcc-to-select">To currency</label>' +
              '<select id="qcc-to-select" data-qcc-select="to">' + currencyOptions(state.to) + '</select>' +
              '<label class="qcc-amount-label" for="qcc-to-amount">Amount in ' + escapeHtml(state.to) + '</label>' +
              '<div class="qcc-input-wrap"><span>' + escapeHtml(targetSymbol) + '</span><input id="qcc-to-amount" data-qcc-amount="to" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="30" value="' + escapeHtml(state.toAmount) + '" placeholder="' + (rateAvailable ? '0.00' : 'Rate unavailable') + '" aria-label="Amount in ' + escapeHtml(state.to) + '"></div>' +
              '<p class="qcc-currency-name">' + escapeHtml(toCurrency?.name || state.to) + '</p>' +
            '</section>' +
          '</div>' +
          '<div class="qcc-rate-panel" aria-live="polite">' +
            '<div class="qcc-rate-title"><span>Exchange rate</span><span class="qcc-rate-status ' + (rateAvailable ? 'is-ready' : state.error ? 'is-error' : '') + '">' + (rateAvailable ? '● Rate loaded' : state.loading ? '◌ Loading' : '● ' + (state.error ? 'Unavailable' : 'Waiting')) + '</span></div>' +
            '<strong>' + escapeHtml(rateLine) + '</strong>' +
            (inverseLine ? '<p>' + escapeHtml(inverseLine) + '</p>' : '') +
            '<small>' + escapeHtml(state.error || (state.rateDate ? 'Rate date: ' + state.rateDate + (state.stale ? ' · cached reference rate' : '') + ' · ' + state.provider : 'Rates are indicative reference rates, not payment quotes.')) + '</small>' +
          '</div>' +
          '<div class="qcc-equation-row">' +
            '<div><span>FROM</span><strong>' + (sourceValid ? escapeHtml(formatAmount(sourceAmount, state.from)) : '—') + ' ' + escapeHtml(state.from) + '</strong></div>' +
            '<span class="qcc-equals">=</span>' +
            '<div><span>TO</span><strong>' + (targetValid ? escapeHtml(formatAmount(targetAmount, state.to)) : '—') + ' ' + escapeHtml(state.to) + '</strong></div>' +
          '</div>' +
          '<p class="qcc-disclaimer">Reference-rate calculator only. Your bank, card or transfer provider may use a different rate and fees. Minglora does not exchange, send or withdraw money here.</p>' +
        '</section>' +
        '<p class="qcc-source-note">The currency list uses active ISO 4217 currency codes. A rate may be unavailable for some currencies or pairs; unavailable rates are never estimated or invented.</p>' +
      '</section>';

    bindEvents(root);
  }

  function refreshAmountFields(root = getRoot()) {
    if (!root) return;
    const fromInput = $('[data-qcc-amount="from"]', root);
    const toInput = $('[data-qcc-amount="to"]', root);
    if (fromInput && document.activeElement !== fromInput) fromInput.value = state.fromAmount;
    if (toInput && document.activeElement !== toInput) toInput.value = state.toAmount;
    const sourceAmount = parseAmount(state.fromAmount);
    const targetAmount = parseAmount(state.toAmount);
    const sourceValid = sourceAmount !== null && Number.isFinite(sourceAmount);
    const targetValid = targetAmount !== null && Number.isFinite(targetAmount);
    const equationFrom = $('.qcc-equation-row > div:first-child strong', root);
    const equationTo = $('.qcc-equation-row > div:last-child strong', root);
    if (equationFrom) equationFrom.textContent = sourceValid ? formatAmount(sourceAmount, state.from) + ' ' + state.from : '—';
    if (equationTo) equationTo.textContent = targetValid ? formatAmount(targetAmount, state.to) + ' ' + state.to : '—';
    const refresh = $('[data-qcc-refresh]', root);
    if (refresh) refresh.disabled = state.loading;
  }

  function calculateFromSource() {
    const amount = parseAmount(state.fromAmount);
    state.toAmount = amount === null || !Number.isFinite(amount) || !Number.isFinite(state.rate)
      ? '' : formatAmount(amount * state.rate, state.to);
  }

  function calculateFromTarget() {
    const amount = parseAmount(state.toAmount);
    state.fromAmount = amount === null || !Number.isFinite(amount) || !Number.isFinite(state.rate)
      ? '' : formatAmount(amount / state.rate, state.from);
  }

  function syncAmounts() {
    if (!Number.isFinite(state.rate)) {
      if (state.lastEdited === 'from') state.toAmount = '';
      else state.fromAmount = '';
      return;
    }
    if (state.lastEdited === 'to') calculateFromTarget();
    else calculateFromSource();
  }

  function updateRateText(root = getRoot()) {
    if (!root) return;
    const panel = $('.qcc-rate-panel', root);
    if (!panel) return;
    const ready = Number.isFinite(state.rate) && state.rate > 0;
    const rateLine = ready
      ? '1 ' + state.from + ' = ' + formatRate(state.rate) + ' ' + state.to
      : state.loading ? 'Loading the selected exchange rate…' : state.error ? 'Rate unavailable for this pair' : 'Select currencies to view the rate';
    const inverseLine = ready ? '1 ' + state.to + ' = ' + formatRate(1 / state.rate) + ' ' + state.from : '';
    panel.innerHTML =
      '<div class="qcc-rate-title"><span>Exchange rate</span><span class="qcc-rate-status ' + (ready ? 'is-ready' : state.error ? 'is-error' : '') + '">' +
      (ready ? '● Rate loaded' : state.loading ? '◌ Loading' : '● ' + (state.error ? 'Unavailable' : 'Waiting')) + '</span></div>' +
      '<strong>' + escapeHtml(rateLine) + '</strong>' +
      (inverseLine ? '<p>' + escapeHtml(inverseLine) + '</p>' : '') +
      '<small>' + escapeHtml(state.error || (state.rateDate ? 'Rate date: ' + state.rateDate + (state.stale ? ' · cached reference rate' : '') + ' · ' + state.provider : 'Rates are indicative reference rates, not payment quotes.')) + '</small>';
    const refresh = $('[data-qcc-refresh]', root);
    if (refresh) refresh.disabled = state.loading;
  }

  async function loadRate({ refresh = false } = {}) {
    const requestId = ++state.requestId;
    state.loading = true;
    state.error = '';
    updateRateText();
    try {
      const payload = await api('/currency/rate?base=' + encodeURIComponent(state.from) + '&quote=' + encodeURIComponent(state.to) + (refresh ? '&refresh=1' : ''));
      if (requestId !== state.requestId) return;
      const rate = Number(payload.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Minglora received an invalid reference rate.');
      state.rate = rate;
      state.rateDate = String(payload.date || '');
      state.provider = String(payload.provider || 'Reference-rate provider');
      state.stale = Boolean(payload.stale);
      state.error = '';
      syncAmounts();
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.rate = null;
      state.rateDate = '';
      state.provider = '';
      state.stale = false;
      state.error = error.message || 'The reference rate is unavailable.';
      if (state.lastEdited === 'from') state.toAmount = '';
      else state.fromAmount = '';
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        updateRateText();
        refreshAmountFields();
        saveState();
      }
    }
  }

  function refreshCurrencySelects(root = getRoot()) {
    if (!root) return;
    ['from', 'to'].forEach(side => {
      const select = $('[data-qcc-select="' + side + '"]', root);
      if (!select) return;
      const selected = side === 'from' ? state.from : state.to;
      select.innerHTML = currencyOptions(selected);
      select.value = selected;
    });
  }

  function bindEvents(root) {
    $('[data-qcc-search]', root)?.addEventListener('input', event => {
      state.search = event.target.value;
      refreshCurrencySelects(root);
    });

    root.querySelectorAll('[data-qcc-select]').forEach(select => select.addEventListener('change', () => {
      const side = select.dataset.qccSelect;
      const code = String(select.value || '').toUpperCase();
      if (!state.byCode.has(code)) return;
      if (side === 'from') state.from = code;
      else state.to = code;
      state.rate = null;
      state.rateDate = '';
      state.provider = '';
      state.stale = false;
      state.error = '';
      saveState();
      render();
      void loadRate();
    }));

    root.querySelectorAll('[data-qcc-amount]').forEach(input => input.addEventListener('input', () => {
      const cleaned = input.value.trim().replace(/,/g, '');
      if (cleaned && !/^\d*(?:\.\d*)?$/.test(cleaned)) return;
      if (input.dataset.qccAmount === 'from') {
        state.lastEdited = 'from';
        state.fromAmount = cleaned.slice(0, 30);
        if (state.fromAmount === '' || !Number.isFinite(state.rate)) state.toAmount = '';
        else calculateFromSource();
      } else {
        state.lastEdited = 'to';
        state.toAmount = cleaned.slice(0, 30);
        if (state.toAmount === '' || !Number.isFinite(state.rate)) state.fromAmount = '';
        else calculateFromTarget();
      }
      refreshAmountFields(root);
      saveState();
    }));

    $('[data-qcc-swap]', root)?.addEventListener('click', () => {
      const oldFrom = state.from;
      const oldAmount = state.fromAmount;
      state.from = state.to;
      state.to = oldFrom;
      state.fromAmount = state.toAmount;
      state.toAmount = oldAmount;
      state.lastEdited = 'from';
      state.rate = null;
      state.rateDate = '';
      state.provider = '';
      state.stale = false;
      state.error = '';
      saveState();
      render();
      void loadRate();
    });

    $('[data-qcc-refresh]', root)?.addEventListener('click', () => void loadRate({ refresh: true }));
  }

  async function renderPage() {
    readSavedState();
    const root = getRoot();
    if (!root) return;
    root.innerHTML = '<section class="qcc-page"><div class="qcc-loading"><span class="qcc-spinner"></span><strong>Loading all active currencies…</strong><small>Connecting to Minglora’s currency directory.</small></div></section>';
    try {
      const payload = await api('/currency/currencies');
      state.currencies = Array.isArray(payload.currencies) ? payload.currencies : [];
      state.byCode = new Map(state.currencies.map(item => [item.code, item]));
      if (!state.currencies.length) throw new Error('The currency directory returned no active currencies.');
      if (!state.byCode.has(state.from)) state.from = state.byCode.has('USD') ? 'USD' : state.currencies[0].code;
      if (!state.byCode.has(state.to)) state.to = state.byCode.has('JMD') ? 'JMD' : state.currencies.find(item => item.code !== state.from)?.code;
      state.fromAmount = String(state.fromAmount || '1');
      state.toAmount = String(state.toAmount || '');
      render();
      await loadRate();
    } catch (error) {
      root.innerHTML = '<section class="qcc-page"><div class="qcc-error"><h2>Currency list unavailable</h2><p>' + escapeHtml(error.message || 'Please try again.') + '</p><button type="button" data-qcc-retry>Try again</button></div></section>';
      $('[data-qcc-retry]', root)?.addEventListener('click', () => void renderPage());
    }
  }

  window.MingloraQuickCurrency = { render: renderPage };
})();