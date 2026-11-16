(function (root) {
  'use strict';

  const HISTORY_KEY = 'minglora:calculator-history:v1';
  const state = {
    expression: '',
    result: '0',
    lastValue: 0,
    memory: 0,
    angle: 'DEG',
    scientific: false,
    history: loadHistory(),
    justEvaluated: false
  };
  const functionNames = new Set([
    'sin','cos','tan','asin','acos','atan','sinh','cosh','tanh',
    'sqrt','cbrt','ln','log','log2','exp','abs','floor','ceil','round'
  ]);

  function loadHistory() {
    try {
      const saved = JSON.parse(root.localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(saved) ? saved.slice(0, 40).filter(item =>
        item && typeof item.expression === 'string' && typeof item.result === 'string'
      ) : [];
    } catch (_) {
      return [];
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
  }

  function normalizeExpression(expression) {
    return String(expression || '')
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[−]/g, '-')
      .replace(/π/g, 'pi');
  }

  function tokenize(expression) {
    const source = normalizeExpression(expression);
    const pattern = /\s*(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]+|[()+\-*/^%!])/y;
    const tokens = [];
    let position = 0;
    while (position < source.length) {
      pattern.lastIndex = position;
      const match = pattern.exec(source);
      if (!match) throw new Error('Check the expression.');
      tokens.push(match[0].trim());
      position = pattern.lastIndex;
    }
    if (!tokens.length) throw new Error('Enter a calculation first.');
    return tokens;
  }

  function factorial(value) {
    if (!Number.isInteger(value) || value < 0 || value > 170) {
      throw new Error('Factorial needs a whole number from 0 to 170.');
    }
    let result = 1;
    for (let number = 2; number <= value; number += 1) result *= number;
    return result;
  }

  function applyFunction(name, value, angle) {
    const radians = angle === 'DEG' ? value * Math.PI / 180 : value;
    let result;
    switch (name) {
      case 'sin': result = Math.sin(radians); break;
      case 'cos': result = Math.cos(radians); break;
      case 'tan': result = Math.tan(radians); break;
      case 'asin': result = Math.asin(value); break;
      case 'acos': result = Math.acos(value); break;
      case 'atan': result = Math.atan(value); break;
      case 'sinh': result = Math.sinh(value); break;
      case 'cosh': result = Math.cosh(value); break;
      case 'tanh': result = Math.tanh(value); break;
      case 'sqrt': result = Math.sqrt(value); break;
      case 'cbrt': result = Math.cbrt(value); break;
      case 'ln': result = Math.log(value); break;
      case 'log': result = Math.log10(value); break;
      case 'log2': result = Math.log2(value); break;
      case 'exp': result = Math.exp(value); break;
      case 'abs': result = Math.abs(value); break;
      case 'floor': result = Math.floor(value); break;
      case 'ceil': result = Math.ceil(value); break;
      case 'round': result = Math.round(value); break;
      default: throw new Error('Unknown function.');
    }
    if (name === 'asin' || name === 'acos' || name === 'atan') {
      return angle === 'DEG' ? result * 180 / Math.PI : result;
    }
    return result;
  }

  function evaluate(expression, angle) {
    const tokens = tokenize(expression);
    let cursor = 0;
    const peek = () => tokens[cursor];
    const take = () => tokens[cursor++];
    const startsPrimary = token => token === '(' || /^[A-Za-z]/.test(token || '') || /^(\d|\.)/.test(token || '');

    function parseExpression() {
      let value = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const operator = take();
        const right = parseTerm();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      let value = parseUnary();
      while (peek() === '*' || peek() === '/' || startsPrimary(peek())) {
        let operator = '*';
        if (peek() === '*' || peek() === '/') operator = take();
        const right = parseUnary();
        if (operator === '/') {
          if (right === 0) throw new Error('Cannot divide by zero.');
          value /= right;
        } else {
          value *= right;
        }
      }
      return value;
    }

    function parseUnary() {
      if (peek() === '+') { take(); return parseUnary(); }
      if (peek() === '-') { take(); return -parseUnary(); }
      return parsePower();
    }

    function parsePower() {
      const value = parsePostfix();
      if (peek() === '^') {
        take();
        return Math.pow(value, parseUnary());
      }
      return value;
    }

    function parsePostfix() {
      let value = parsePrimary();
      while (peek() === '%' || peek() === '!') {
        const operator = take();
        value = operator === '%' ? value / 100 : factorial(value);
      }
      return value;
    }

    function parsePrimary() {
      const token = take();
      if (!token) throw new Error('Complete the expression.');
      if (/^(\d|\.)/.test(token)) {
        const value = Number(token);
        if (!Number.isFinite(value)) throw new Error('That number is too large.');
        return value;
      }
      if (token === '(') {
        const value = parseExpression();
        if (take() !== ')') throw new Error('Add a closing parenthesis.');
        return value;
      }
      if (/^[A-Za-z]+$/.test(token)) {
        const name = token.toLowerCase();
        if (functionNames.has(name)) {
          if (take() !== '(') throw new Error('Add parentheses after ' + name + '.');
          const argument = parseExpression();
          if (take() !== ')') throw new Error('Add a closing parenthesis.');
          return applyFunction(name, argument, angle);
        }
        if (name === 'pi') return Math.PI;
        if (name === 'e') return Math.E;
        if (name === 'ans') return state.lastValue;
      }
      throw new Error('Check the expression.');
    }

    const result = parseExpression();
    if (cursor !== tokens.length) throw new Error('Check the expression.');
    if (!Number.isFinite(result)) throw new Error('This calculation has no real finite result.');
    return result;
  }

  function formatResult(value) {
    if (Object.is(value, -0)) value = 0;
    if (value !== 0 && (Math.abs(value) < 1e-8 || Math.abs(value) >= 1e12)) {
      return Number(value.toPrecision(10)).toExponential(6);
    }
    const rounded = Number(value.toPrecision(12));
    return rounded.toLocaleString(undefined, { maximumFractionDigits: 10 });
  }

  function saveHistory() {
    try { root.localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 40))); } catch (_) {}
  }

  function displayExpression() {
    return state.expression.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, '−');
  }

  function updateDisplay() {
    const expressionNode = document.querySelector('[data-calc-expression]');
    const resultNode = document.querySelector('[data-calc-result]');
    const statusNode = document.querySelector('[data-calc-status]');
    if (!expressionNode || !resultNode) return;
    expressionNode.textContent = displayExpression() || 'Ready';
    if (!state.expression) {
      state.result = '0';
      state.lastValue = 0;
      resultNode.textContent = '0';
      if (statusNode) statusNode.textContent = state.memory ? 'Memory stored' : 'Ready';
      return;
    }
    try {
      const value = evaluate(state.expression, state.angle);
      state.lastValue = value;
      state.result = formatResult(value);
      resultNode.textContent = state.result;
      if (statusNode) statusNode.textContent = state.angle + ' · Live result';
    } catch (error) {
      state.result = '—';
      resultNode.textContent = '—';
      if (statusNode) statusNode.textContent = error.message;
    }
  }

  function updateHistory() {
    const list = document.querySelector('[data-calc-history]');
    if (!list) return;
    if (!state.history.length) {
      list.innerHTML = '<div class="ml-calc-history-empty"><span aria-hidden="true">∑</span><strong>No calculations yet</strong><small>Your recent calculations will appear here.</small></div>';
      return;
    }
    list.innerHTML = state.history.map((item, index) =>
      '<button type="button" class="ml-calc-history-item" data-calc-history-index="' + index + '">' +
        '<span>' + escapeHtml(item.expression) + '</span><strong>' + escapeHtml(item.result) + '</strong>' +
      '</button>'
    ).join('');
  }

  function addHistory(expression, result) {
    state.history.unshift({ expression, result, createdAt: Date.now() });
    state.history = state.history.slice(0, 40);
    saveHistory();
    updateHistory();
  }

  function insert(value) {
    if (state.justEvaluated) {
      if (/^[0-9.]$/.test(value) || value === 'pi' || value === 'e' || value === '(' || functionNames.has(value)) {
        state.expression = '';
      }
      state.justEvaluated = false;
    }
    const last = state.expression.slice(-1);
    if (/^[0-9.]$/.test(value)) {
      if (value === '.') {
        const lastNumber = state.expression.match(/(?:^|[+\-*/^(])(\d*\.?\d*)$/);
        if (lastNumber && lastNumber[1].includes('.')) return;
      }
      if (last === ')' || /(?:pi|e)$/i.test(state.expression)) state.expression += '*';
      state.expression += value;
    } else if (['+','-','*','/','^'].includes(value)) {
      if (!state.expression && value !== '-' && value !== '+') return;
      if (/[+\-*/^.]$/.test(state.expression)) state.expression = state.expression.slice(0, -1);
      state.expression += value;
    } else if (value === '(') {
      if (last === ')' || /(?:pi|e|\d)$/i.test(state.expression)) state.expression += '*';
      state.expression += '(';
    } else if (value === ')') {
      const opens = (state.expression.match(/\(/g) || []).length;
      const closes = (state.expression.match(/\)/g) || []).length;
      if (opens > closes && !/[+\-*/^(]$/.test(state.expression)) state.expression += ')';
    } else if (value === 'pi' || value === 'e') {
      if (last === ')' || /\d$/.test(state.expression)) state.expression += '*';
      state.expression += value;
    } else if (value === '%') {
      if (/\d|\)|pi$|e$/i.test(state.expression)) state.expression += '%';
    } else if (value === '!') {
      if (/\d|\)/.test(last)) state.expression += '!';
    } else if (functionNames.has(value)) {
      if (last === ')' || /\d$/.test(state.expression)) state.expression += '*';
      state.expression += value + '(';
    }
    updateDisplay();
  }

  function clearEntry() {
    const match = state.expression.match(/(\d+(?:\.\d*)?|\.\d+)$/);
    state.expression = match ? state.expression.slice(0, -match[0].length) : state.expression.slice(0, -1);
    updateDisplay();
  }

  function deleteLast() {
    const functionMatch = state.expression.match(/([A-Za-z]+)\($/);
    state.expression = functionMatch
      ? state.expression.slice(0, -functionMatch[0].length)
      : state.expression.slice(0, -1);
    updateDisplay();
  }

  function calculate() {
    if (!state.expression) return;
    const expression = state.expression;
    try {
      const value = evaluate(expression, state.angle);
      const result = formatResult(value);
      state.lastValue = value;
      state.expression = String(Number(value.toPrecision(12)));
      state.result = result;
      state.justEvaluated = true;
      addHistory(displayExpressionFrom(expression), result);
      updateDisplay();
      const status = document.querySelector('[data-calc-status]');
      if (status) status.textContent = 'Calculation saved';
    } catch (error) {
      state.result = '—';
      const resultNode = document.querySelector('[data-calc-result]');
      const status = document.querySelector('[data-calc-status]');
      if (resultNode) resultNode.textContent = '—';
      if (status) status.textContent = error.message;
    }
  }

  function displayExpressionFrom(expression) {
    return String(expression).replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, '−');
  }

  function currentValue() {
    return state.expression ? evaluate(state.expression, state.angle) : state.lastValue;
  }

  function handleKey(key) {
    if (/^\d$/.test(key) || key === '.') { insert(key); return; }
    if (['+','-','*','/','^','(',')','%','!','pi','e'].includes(key) || functionNames.has(key)) {
      insert(key);
      return;
    }
    if (key === 'AC') {
      state.expression = '';
      state.lastValue = 0;
      state.justEvaluated = false;
      updateDisplay();
      return;
    }
    if (key === 'CE') { clearEntry(); return; }
    if (key === 'DEL') { deleteLast(); return; }
    if (key === '=') { calculate(); return; }
    if (key === '±') {
      if (state.expression) state.expression = '-(' + state.expression + ')';
      else state.expression = '-';
      updateDisplay();
      return;
    }
    if (key === 'x2') {
      if (state.expression) state.expression = '(' + state.expression + ')^2';
      updateDisplay();
      return;
    }
    if (key === 'inv') {
      if (state.expression) state.expression = '1/(' + state.expression + ')';
      updateDisplay();
    }
  }

  function handleAction(action) {
    if (action === 'angle') {
      state.angle = state.angle === 'DEG' ? 'RAD' : 'DEG';
      document.querySelectorAll('[data-calc-action="angle"]').forEach(button => button.textContent = state.angle);
      document.querySelectorAll('[data-calc-angle-label]').forEach(label => label.textContent = state.angle);
      const note = document.querySelector('.ml-calc-footnote');
      if (note) note.textContent = 'Calculations stay on this device. Scientific trigonometry uses ' + state.angle + ' mode.';
      updateDisplay();
      return;
    }
    if (action === 'scientific') {
      state.scientific = !state.scientific;
      const panel = document.querySelector('[data-calc-scientific]');
      const button = document.querySelector('[data-calc-action="scientific"]');
      if (panel) panel.hidden = !state.scientific;
      if (button) {
        button.setAttribute('aria-expanded', state.scientific ? 'true' : 'false');
        button.classList.toggle('is-active', state.scientific);
      }
      return;
    }
    if (action === 'MC') state.memory = 0;
    if (action === 'MR') {
      const last = state.expression.slice(-1);
      if (last === ')' || /(?:pi|e|\d)$/i.test(state.expression)) state.expression += '*';
      state.expression += String(state.memory);
      updateDisplay();
    }
    if (action === 'MS') {
      try { state.memory = currentValue(); } catch (error) { showError(error.message); }
    }
    if (action === 'M+') {
      try { state.memory += currentValue(); } catch (error) { showError(error.message); }
    }
    if (action === 'M-') {
      try { state.memory -= currentValue(); } catch (error) { showError(error.message); }
    }
    if (action === 'copy') {
      const copyValue = state.result === '—' ? '' : String(state.lastValue);
      if (!copyValue) { showError('There is no result to copy.'); return; }
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(copyValue).then(() => showError('Result copied.')).catch(() => showError('Copy is unavailable in this browser.'));
      } else {
        showError('Copy is unavailable in this browser.');
      }
      return;
    }
    if (action === 'clear-history') {
      state.history = [];
      saveHistory();
      updateHistory();
    }
    const status = document.querySelector('[data-calc-status]');
    if (status && ['MC','MR','MS','M+','M-'].includes(action)) status.textContent = 'Memory: ' + formatResult(state.memory);
  }

  function showError(message) {
    const status = document.querySelector('[data-calc-status]');
    if (status) status.textContent = message;
  }

  function onClick(event) {
    const key = event.target.closest('[data-calc-key]');
    if (key) {
      handleKey(key.dataset.calcKey);
      return;
    }
    const action = event.target.closest('[data-calc-action]');
    if (action) {
      handleAction(action.dataset.calcAction);
      return;
    }
    const historyItem = event.target.closest('[data-calc-history-index]');
    if (historyItem) {
      const item = state.history[Number(historyItem.dataset.calcHistoryIndex)];
      if (!item) return;
      state.expression = normalizeExpression(item.expression);
      state.justEvaluated = false;
      updateDisplay();
      return;
    }
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^\d$/.test(event.key) || ['.','+','-','*','/','^','(',')','%','!'].includes(event.key)) {
      event.preventDefault();
      insert(event.key);
    } else if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      calculate();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      deleteLast();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleKey('AC');
    }
  }

  function render(target) {
    const mount = typeof target === 'string' ? document.querySelector(target) : target;
    if (!mount) return false;
    if (mount._mingloraCalculatorClick) mount.removeEventListener('click', mount._mingloraCalculatorClick);
    if (mount._mingloraCalculatorKey) mount.removeEventListener('keydown', mount._mingloraCalculatorKey);
    mount.innerHTML =
      '<div class="ml-calc-shell">' +
        '<header class="ml-calc-heading"><div><span class="eyebrow">MINGLORA TOOLS</span><h2>Digital Calculator</h2><p>Everyday maths, with scientific tools when you need them.</p></div>' +
          '<div class="ml-calc-heading-actions"><button type="button" data-calc-action="scientific" aria-expanded="' + (state.scientific ? 'true' : 'false') + '" class="ml-calc-mode-button' + (state.scientific ? ' is-active' : '') + '">Scientific</button><button type="button" data-calc-action="copy" class="ml-calc-copy">Copy result</button></div></header>' +
        '<div class="ml-calc-workspace">' +
          '<section class="ml-calc-device" aria-label="Minglora digital calculator">' +
            '<div class="ml-calc-screen"><div class="ml-calc-screen-brand"><strong>MINGLORA</strong><span>DUAL POWER · DIGITAL</span></div>' +
              '<div class="ml-calc-memory-line"><span>MEM</span><span data-calc-angle-label>DEG</span></div>' +
              '<div class="ml-calc-expression" data-calc-expression aria-label="Expression">Ready</div>' +
              '<output class="ml-calc-result" data-calc-result aria-live="polite">0</output>' +
              '<div class="ml-calc-screen-footer"><span data-calc-status role="status">Ready</span><button type="button" data-calc-action="angle" aria-label="Switch between degrees and radians">DEG</button></div>' +
            '</div>' +
            '<div class="ml-calc-memory-keys">' + ['MC','MR','M+','M-','MS'].map(key => '<button type="button" data-calc-action="' + key + '">' + key + '</button>').join('') + '</div>' +
            '<div class="ml-calc-scientific" data-calc-scientific' + (state.scientific ? '' : ' hidden') + '>' +
              ['sin','cos','tan','sqrt','ln','log','log2','exp','asin','acos','atan','cbrt','x2','inv','pi','e','!','abs','floor','round'].map(key => {
                const label = ({sqrt:'√',cbrt:'∛',x2:'x²',inv:'1/x',pi:'π',exp:'eˣ'})[key] || key;
                const value = ({x2:'x2',inv:'inv'})[key] || key;
                return '<button type="button" data-calc-key="' + value + '">' + label + '</button>';
              }).join('') +
              '<button type="button" data-calc-action="angle" class="ml-calc-angle-science">' + state.angle + '</button>' +
            '</div>' +
            '<div class="ml-calc-clear-keys"><button type="button" data-calc-key="AC" class="ml-calc-clear-all">AC</button><button type="button" data-calc-key="CE">CE</button><button type="button" data-calc-key="DEL">DEL</button><button type="button" data-calc-key="%">%</button></div>' +
            '<div class="ml-calc-keypad">' +
              [['7','8','9','/'],['4','5','6','*'],['1','2','3','-'],['0','.','±','+'],['(',')','pi','=']].map(row => row.map(key => {
                const label = ({'/':'÷','*':'×','-':'−',pi:'π'})[key] || key;
                const classes = (['/','*','-','+'].includes(key) ? 'is-operator' : '') + (key === '=' ? ' is-equals' : '') + (key === '0' ? ' is-zero' : '');
                return '<button type="button" data-calc-key="' + key + '" class="' + classes.trim() + '">' + label + '</button>';
              }).join('')).join('') +
            '</div>' +
          '</section>' +
          '<aside class="ml-calc-history-panel"><div class="ml-calc-history-heading"><div><span class="eyebrow">YOUR WORK</span><h3>Recent calculations</h3></div><button type="button" data-calc-action="clear-history">Clear</button></div><div class="ml-calc-history-list" data-calc-history></div></aside>' +
        '</div>' +
        '<p class="ml-calc-footnote">Calculations stay on this device. Scientific trigonometry uses ' + state.angle + ' mode.</p>' +
      '</div>';
    mount.tabIndex = 0;
    mount._mingloraCalculatorClick = onClick;
    mount._mingloraCalculatorKey = onKeyDown;
    mount.addEventListener('click', onClick);
    mount.addEventListener('keydown', onKeyDown);
    const angleLabels = mount.querySelectorAll('[data-calc-angle-label]');
    angleLabels.forEach(label => label.textContent = state.angle);
    const angleButtons = mount.querySelectorAll('[data-calc-action="angle"]');
    angleButtons.forEach(button => button.textContent = state.angle);
    updateDisplay();
    updateHistory();
    return true;
  }

  root.MingloraCalculator = { render, evaluate, formatResult };
})(globalThis);
