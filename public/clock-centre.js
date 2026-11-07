(() => {
  'use strict';

  const STORAGE_PREFIX = 'minglora-clock-centre-v1:';
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CITY_OPTIONS = [
    ['Kingston, Jamaica', 'America/Jamaica'], ['Nassau, Bahamas', 'America/Nassau'], ['Havana, Cuba', 'America/Havana'], ['Port of Spain, Trinidad', 'America/Port_of_Spain'], ['New York, USA', 'America/New_York'], ['Toronto, Canada', 'America/Toronto'], ['Chicago, USA', 'America/Chicago'], ['Denver, USA', 'America/Denver'], ['Los Angeles, USA', 'America/Los_Angeles'], ['Mexico City, Mexico', 'America/Mexico_City'], ['São Paulo, Brazil', 'America/Sao_Paulo'], ['Buenos Aires, Argentina', 'America/Argentina/Buenos_Aires'], ['Reykjavik, Iceland', 'Atlantic/Reykjavik'], ['London, UK', 'Europe/London'], ['Paris, France', 'Europe/Paris'], ['Berlin, Germany', 'Europe/Berlin'], ['Rome, Italy', 'Europe/Rome'], ['Athens, Greece', 'Europe/Athens'], ['Istanbul, Türkiye', 'Europe/Istanbul'], ['Cairo, Egypt', 'Africa/Cairo'], ['Nairobi, Kenya', 'Africa/Nairobi'], ['Johannesburg, South Africa', 'Africa/Johannesburg'], ['Dubai, UAE', 'Asia/Dubai'], ['Riyadh, Saudi Arabia', 'Asia/Riyadh'], ['Karachi, Pakistan', 'Asia/Karachi'], ['Mumbai, India', 'Asia/Kolkata'], ['Bangkok, Thailand', 'Asia/Bangkok'], ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'], ['Shanghai, China', 'Asia/Shanghai'], ['Seoul, South Korea', 'Asia/Seoul'], ['Tokyo, Japan', 'Asia/Tokyo'], ['Perth, Australia', 'Australia/Perth'], ['Sydney, Australia', 'Australia/Sydney'], ['Auckland, New Zealand', 'Pacific/Auckland']
  ];
  const DEFAULTS = {
    activeTab: 'clock',
    alarms: [],
    worldClocks: [
      { id: 'kingston', city: 'Kingston, Jamaica', zone: 'America/Jamaica' },
      { id: 'new-york', city: 'New York, USA', zone: 'America/New_York' },
      { id: 'london', city: 'London, UK', zone: 'Europe/London' }
    ],
    timers: [],
    stopwatch: { running: false, elapsedMs: 0, startedAt: 0, laps: [] },
    sleep: { bedtime: '22:00', wake: '06:30', windDown: 30, days: [0,1,2,3,4,5,6], enabled: false },
    focus: { mode: 'work', running: false, remainingMs: 25 * 60 * 1000, startedAt: 0, workMinutes: 25, shortBreak: 5, longBreak: 15, sessions: 0 },
    countdowns: [],
    settings: { theme: 'luxury', timeFormat: '12h', sortAlarms: 'time', clockView: 'both', face: 'luxury', tickSound: false, vibration: true, reduceMotion: false, customSoundData: '', customSoundName: '' }
  };

  let state = null;
  let storageKey = STORAGE_PREFIX + 'local';
  let host = null;
  let ticker = 0;
  let alarmAudio = null;
  let lastAlarmMinute = '';
  let lastTimerAlerts = new Set();
  let editingAlarmId = null;
  let editingCountdownId = null;
  let ringingAlarm = null;

  const $ = (selector, root = host) => root?.querySelector(selector) || null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'cc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
  const localDate = date => {
    const d = date instanceof Date ? date : new Date(date);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const formatTime = (date, zone) => {
    const opts = { hour: '2-digit', minute: '2-digit', ...(state.settings.timeFormat === '24h' ? { hourCycle: 'h23' } : { hour12: true }) };
    return new Intl.DateTimeFormat(undefined, { ...opts, ...(zone ? { timeZone: zone } : {}) }).format(date);
  };
  const formatDuration = ms => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
  };
  const readStoredState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || typeof saved !== 'object') return structuredClone(DEFAULTS);
      return {
        ...structuredClone(DEFAULTS),
        ...saved,
        settings: { ...DEFAULTS.settings, ...(saved.settings || {}) },
        sleep: { ...DEFAULTS.sleep, ...(saved.sleep || {}) },
        stopwatch: { ...DEFAULTS.stopwatch, ...(saved.stopwatch || {}) },
        focus: { ...DEFAULTS.focus, ...(saved.focus || {}) },
        alarms: Array.isArray(saved.alarms) ? saved.alarms : [],
        worldClocks: Array.isArray(saved.worldClocks) ? saved.worldClocks : structuredClone(DEFAULTS.worldClocks),
        timers: Array.isArray(saved.timers) ? saved.timers : [],
        countdowns: Array.isArray(saved.countdowns) ? saved.countdowns : []
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  };
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { showToast('Device storage is full. Remove a custom sound or old record and try again.'); }
  };
  const showToast = message => {
    let toast = $('#clock-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'clock-toast';
      toast.className = 'clock-toast';
      host?.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  };
  const clockHandAngles = now => ({
    hour: ((now.getHours() % 12) + now.getMinutes() / 60) * 30,
    minute: (now.getMinutes() + now.getSeconds() / 60) * 6,
    second: (now.getSeconds() + now.getMilliseconds() / 1000) * 6
  });
  const applyClockHands = now => {
    const angles = clockHandAngles(now);
    const hour = $('#clock-hour-hand'), minute = $('#clock-minute-hand'), second = $('#clock-second-hand');
    if (hour) hour.style.transform = 'translateX(-50%) rotate(' + angles.hour + 'deg)';
    if (minute) minute.style.transform = 'translateX(-50%) rotate(' + angles.minute + 'deg)';
    if (second) second.style.transform = 'translateX(-50%) rotate(' + angles.second + 'deg)';
  };
  let lastTickSecond = -1;
  const playTick = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 1250;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.035);
      oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.04);
      setTimeout(() => context.close().catch(() => {}), 100);
    } catch {}
  };
  const beep = (soft = false, volume = 0.8) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const notes = soft ? [523.25, 659.25] : [880, 660, 880];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = soft ? 'sine' : 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.2);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.025, Math.min(0.35, Number(volume) || 0.8) * (soft ? 0.15 : 0.25)), context.currentTime + index * 0.2 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.2 + 0.17);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + index * 0.2);
        oscillator.stop(context.currentTime + index * 0.2 + 0.19);
      });
      setTimeout(() => context.close().catch(() => {}), 1200);
    } catch {}
  };
  const playAlarmSound = alarm => {
    stopAlarmSound();
    if (alarm?.sound === 'custom' && state.settings.customSoundData) {
      try {
        alarmAudio = new Audio(state.settings.customSoundData);
        alarmAudio.loop = true;
        alarmAudio.volume = Math.max(0.1, Math.min(1, Number(alarm.volume ?? 0.8)));
        alarmAudio.play().catch(() => beep(alarm.mode === 'smart'));
      } catch { beep(alarm.mode === 'smart'); }
    } else beep(alarm?.mode === 'smart' || alarm?.sound === 'gentle', alarm?.volume ?? 0.8);
    if (state.settings.vibration && alarm?.vibrate !== false && navigator.vibrate) navigator.vibrate([350, 200, 350, 200, 700]);
  };
  const stopAlarmSound = () => {
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  };
  const renderAlarmAlert = () => {
    const existing = $('#clock-ringing-alert');
    if (existing) existing.remove();
    if (!ringingAlarm) return;
    const alert = document.createElement('section');
    alert.id = 'clock-ringing-alert';
    alert.className = 'clock-ringing-alert';
    alert.setAttribute('role', 'alertdialog');
    alert.innerHTML = '<div class="clock-ringing-icon">◷</div><div><strong>' + escapeHtml(ringingAlarm.label || 'Alarm') + '</strong><span>' + escapeHtml(ringingAlarm.time) + ' · ' + (ringingAlarm.mode === 'smart' ? 'Smart Wake-Up' : 'Advanced Alarm') + '</span><small>Alarm is ringing on this open device.</small></div><div class="clock-ringing-actions"><button type="button" data-alarm-snooze>+5 min snooze</button><button type="button" data-alarm-dismiss>Dismiss</button></div>';
    host.prepend(alert);
  };
  const triggerAlarm = alarm => {
    ringingAlarm = alarm;
    playAlarmSound(alarm);
    renderAlarmAlert();
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(alarm.label || 'Minglora alarm', { body: 'Your alarm is ringing.', tag: 'minglora-clock-' + alarm.id }); } catch {}
    }
    if (!alarm.days?.length) {
      alarm.enabled = false;
      persist();
    }
  };
  const checkAlarms = now => {
    const minuteKey = localDate(now) + 'T' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    if (minuteKey === lastAlarmMinute) return;
    lastAlarmMinute = minuteKey;
    if (ringingAlarm) return;
    const alarm = state.alarms.find(item => {
      if (!item.enabled || item.time !== minuteKey.slice(11)) return false;
      if (Array.isArray(item.days) && item.days.length) return item.days.includes(now.getDay());
      return item.date === localDate(now);
    });
    if (alarm) triggerAlarm(alarm);
  };
  const updateTimerState = now => {
    state.timers.forEach(timer => {
      if (!timer.running || !timer.endAt || timer.done) return;
      const remaining = timer.endAt - now.getTime();
      timer.remainingMs = Math.max(0, remaining);
      if (remaining <= 0) {
        timer.running = false;
        timer.done = true;
        if (!lastTimerAlerts.has(timer.id)) {
          lastTimerAlerts.add(timer.id);
          beep(false);
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(timer.label || 'Timer complete', { body: 'Your countdown has finished.' }); } catch {}
          }
        }
      }
    });
  };
  const remainingFocus = now => state.focus.running ? Math.max(0, state.focus.remainingMs - (now - state.focus.startedAt)) : state.focus.remainingMs;
  const updateFocus = now => {
    if (!state.focus.running) return;
    const remaining = remainingFocus(now);
    if (remaining > 0) return;
    state.focus.running = false;
    state.focus.remainingMs = 0;
    if (state.focus.mode === 'work') {
      state.focus.sessions += 1;
      state.focus.mode = state.focus.sessions % 4 === 0 ? 'longBreak' : 'shortBreak';
      state.focus.remainingMs = (state.focus.mode === 'longBreak' ? state.focus.longBreak : state.focus.shortBreak) * 60000;
      showToast('Focus session complete. Break time.');
    } else {
      state.focus.mode = 'work';
      state.focus.remainingMs = state.focus.workMinutes * 60000;
      showToast('Break complete. Ready for another focus session?');
    }
    beep(true);
    persist();
    renderTab();
  };
  const tick = () => {
    if (!host?.isConnected) { clearInterval(ticker); ticker = 0; return; }
    const now = new Date();
    const time = $('#clock-live-time');
    const date = $('#clock-live-date');
    if (time) time.textContent = formatTime(now);
    if (date) date.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
    const digital = $('#clock-digital-secondary');
    if (digital) digital.textContent = new Intl.DateTimeFormat(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', ...(state.settings.timeFormat === '24h' ? {hourCycle:'h23'} : {hour12:true}) }).format(now);
    const digitalDate = $('#clock-digital-date');
    if (digitalDate) digitalDate.textContent = new Intl.DateTimeFormat(undefined, { weekday:'short', month:'short', day:'numeric' }).format(now);
    if (state.settings.tickSound && now.getSeconds() !== lastTickSecond) { lastTickSecond = now.getSeconds(); playTick(); }
    applyClockHands(now);
    host.querySelectorAll('[data-world-zone]').forEach(node => {
      try { node.textContent = formatTime(now, node.dataset.worldZone); } catch { node.textContent = 'Unavailable'; }
    });
    host.querySelectorAll('[data-world-date]').forEach(node => {
      try { node.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: node.dataset.worldDate }).format(now); } catch { node.textContent = ''; }
    });
    host.querySelectorAll('[data-timer-id]').forEach(node => {
      const timer = state.timers.find(item => item.id === node.dataset.timerId);
      if (timer) node.textContent = timer.done ? '00:00:00' : formatDuration(timer.running ? timer.endAt - now.getTime() : timer.remainingMs);
    });
    const swDisplay = $('#clock-stopwatch-display');
    if (swDisplay) swDisplay.textContent = formatDuration(state.stopwatch.running ? state.stopwatch.elapsedMs + (now.getTime() - state.stopwatch.startedAt) : state.stopwatch.elapsedMs);
    const focusDisplay = $('#clock-focus-display');
    if (focusDisplay) focusDisplay.textContent = formatDuration(remainingFocus(now));
    host.querySelectorAll('[data-countdown-id]').forEach(node => {
      const item = state.countdowns.find(entry => entry.id === node.dataset.countdownId);
      if (!item) return;
      const target = countdownTarget(item, now);
      const diff = target.getTime() - now.getTime();
      node.textContent = diff <= 0 ? 'Event time reached' : countdownText(diff);
    });
    updateTimerState(now);
    checkAlarms(now);
    updateFocus(now.getTime());
  };
  const countdownTarget = (item, now = new Date()) => {
    const original = new Date(item.at);
    if (!item.annual || original.getTime() >= now.getTime()) return original;
    const month = original.getMonth(), day = original.getDate();
    for (let year = now.getFullYear(); year <= now.getFullYear() + 8; year++) {
      const candidate = new Date(year, month, day, original.getHours(), original.getMinutes(), original.getSeconds(), 0);
      if (candidate.getMonth() === month && candidate.getDate() === day && candidate.getTime() >= now.getTime()) return candidate;
    }
    return new Date(now.getFullYear() + 1, month, day, original.getHours(), original.getMinutes(), original.getSeconds(), 0);
  };
  const countdownText = diff => {
    const total = Math.floor(diff / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return days + 'd ' + String(hours).padStart(2,'0') + 'h ' + String(minutes).padStart(2,'0') + 'm ' + String(seconds).padStart(2,'0') + 's';
  };
  const themeClass = () => 'clock-theme-' + (state.settings.theme || 'luxury');
  const renderTabs = () => {
    const tabs = [
      ['clock','Clock','◷'], ['alarms','Alarm','⏰'], ['world','World Clock','🌍'],
      ['stopwatch','Stopwatch','⏱'], ['timers','Timers','⌛'], ['sleep','Sleep','☾'],
      ['focus','Focus','◎'], ['countdowns','Countdowns','◴'], ['settings','Settings','⚙']
    ];
    return '<nav class="clock-centre-tabs" aria-label="Clock Centre sections">' + tabs.map(([id,label,icon]) => '<button type="button" data-clock-tab="' + id + '" class="' + (state.activeTab === id ? 'is-active' : '') + '" aria-current="' + (state.activeTab === id ? 'page' : 'false') + '"><span aria-hidden="true">' + icon + '</span><small>' + label + '</small></button>').join('') + '</nav>';
  };
  const clockFaceMarkup = () => {
    const marks = Array.from({length:60}, (_, index) => {
      const major = index % 5 === 0;
      return '<i class="clock-mark ' + (major ? 'is-major' : '') + '" style="--mark-angle:' + (index * 6) + 'deg"></i>';
    }).join('');
    const numbers = Array.from({length:12}, (_, index) => {
      const n = index || 12;
      return '<b class="clock-number" style="--number-angle:' + (index * 30) + 'deg">' + n + '</b>';
    }).join('');
    return '<div class="clock-face-stage"><div class="clock-face-shell" id="clock-face-shell" aria-label="Live three-dimensional analogue clock"><div class="clock-face-bezel"></div><div class="clock-face-dial"><div class="clock-face-inner"></div>' + marks + numbers + '<i class="clock-hand clock-hour-hand" id="clock-hour-hand"></i><i class="clock-hand clock-minute-hand" id="clock-minute-hand"></i><i class="clock-hand clock-second-hand" id="clock-second-hand"></i><i class="clock-hand-hub"></i><span class="clock-face-brand">MINGLORA</span></div></div></div>';
  };
  const renderClockTab = () => {
    const view = state.settings.clockView || 'both';
    const face = state.settings.face || 'luxury';
    const world = state.worldClocks.slice(0, 3);
    return '<section class="clock-hero"><div class="clock-hero-copy"><span class="clock-eyebrow">YOUR TIME, BEAUTIFULLY PRESENTED</span><h2>Clock Centre</h2><p>Your live clock and time tools, in one place.</p><div class="clock-live-reading" id="clock-live-time">--:--</div><div class="clock-live-date" id="clock-live-date"></div><div class="clock-hero-controls"><label>Clock display<select id="clock-display-select"><option value="both"' + (view === 'both' ? ' selected' : '') + '>Analogue + digital</option><option value="analog"' + (view === 'analog' ? ' selected' : '') + '>Analogue only</option><option value="digital"' + (view === 'digital' ? ' selected' : '') + '>Digital only</option></select></label><label>Clock style<select id="clock-face-select">' + [['luxury','Luxury'],['silver','Silver'],['classic','Classic'],['neon','Neon'],['futuristic','Futuristic'],['glass','Glass'],['wood','Wood'],['skeleton','Mechanical skeleton'],['minimalist','Minimalist']].map(([value,label]) => '<option value="' + value + '"' + (face === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label></div></div><div class="clock-hero-visual ' + (view === 'digital' ? 'show-digital-only' : view === 'analog' ? 'show-analog-only' : '') + ' ' + themeClass() + '"><div class="clock-analog-card">' + clockFaceMarkup() + '<small>LIVE ANALOGUE</small></div><div class="clock-digital-card"><span>LOCAL TIME</span><strong id="clock-digital-secondary">--:--:--</strong><small id="clock-digital-date"></small></div></div></section><section class="clock-overview-grid"><article class="clock-info-card"><div class="clock-card-heading"><span>🌍</span><strong>World clocks</strong><button type="button" data-clock-tab="world">Manage</button></div><div class="clock-mini-worlds">' + world.map(city => '<div><span>' + escapeHtml(city.city) + '</span><strong data-world-zone="' + escapeHtml(city.zone) + '">--:--</strong></div>').join('') + '</div></article><article class="clock-info-card"><div class="clock-card-heading"><span>⏰</span><strong>Next alarm</strong><button type="button" data-clock-tab="alarms">Manage</button></div>' + renderNextAlarm() + '</article><article class="clock-info-card"><div class="clock-card-heading"><span>⌛</span><strong>Active timers</strong><button type="button" data-clock-tab="timers">Open</button></div><div class="clock-metric"><strong>' + state.timers.filter(item => item.running && !item.done).length + '</strong><span>running right now</span></div></article></section><p class="clock-platform-note"><span>ⓘ</span> Web alarms ring while this Clock Centre page is open. For dependable alarms after the app is closed or the phone restarts, use the standalone Android app with native alarm scheduling.</p>';
  };
  const renderNextAlarm = () => {
    const next = state.alarms.filter(item => item.enabled).sort((a,b) => a.time.localeCompare(b.time))[0];
    return next ? '<div class="clock-next-alarm"><strong>' + escapeHtml(next.time) + '</strong><span>' + escapeHtml(next.label || 'Alarm') + '</span></div>' : '<div class="clock-empty-inline">No active alarms</div>';
  };
  const renderAlarmsTab = () => {
    const item = state.alarms.find(alarm => alarm.id === editingAlarmId);
    const days = Array.isArray(item?.days) ? item.days : [];
    const alarmRows = [...state.alarms].sort((a,b) => state.settings.sortAlarms === 'label' ? String(a.label).localeCompare(String(b.label)) : a.time.localeCompare(b.time));
    return '<section class="clock-section-heading"><div><span class="clock-eyebrow">WAKE UP YOUR WAY</span><h2>Alarms</h2><p>Advanced alarms and Smart Wake-Up are both available. Choose a mode for each alarm.</p></div><label class="clock-sort-control">Sort<select id="clock-alarm-sort"><option value="time"' + (state.settings.sortAlarms === 'time' ? ' selected' : '') + '>By time</option><option value="label"' + (state.settings.sortAlarms === 'label' ? ' selected' : '') + '>By name</option></select></label></section><div class="clock-two-column"><form id="clock-alarm-form" class="clock-panel clock-form"><div class="clock-panel-heading"><h3>' + (item ? 'Edit alarm' : 'Create alarm') + '</h3>' + (item ? '<button type="button" class="clock-text-button" data-alarm-cancel-edit>Cancel edit</button>' : '') + '</div><div class="clock-form-grid"><label>Time<input name="time" type="time" required value="' + escapeHtml(item?.time || '07:00') + '"></label><label>Label<input name="label" maxlength="60" placeholder="Wake up" value="' + escapeHtml(item?.label || '') + '"></label><label>Date (one-time)<input name="date" type="date" value="' + escapeHtml(item?.date || localDate(new Date())) + '"></label><label>Alarm mode<select name="mode"><option value="advanced"' + (!item || item.mode === 'advanced' ? ' selected' : '') + '>Advanced Alarm</option><option value="smart"' + (item?.mode === 'smart' ? ' selected' : '') + '>Smart Wake-Up</option></select></label><label>Wake window<select name="wakeWindow"><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15" selected>15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select></label><label>Sound<select name="sound"><option value="classic"' + (!item || item.sound === 'classic' ? ' selected' : '') + '>Classic chime</option><option value="gentle"' + (item?.sound === 'gentle' ? ' selected' : '') + '>Gentle tone</option><option value="custom"' + (item?.sound === 'custom' ? ' selected' : '') + '>My uploaded sound</option></select></label><label>Volume <input name="volume" type="range" min="10" max="100" value="' + Math.round((item?.volume ?? 0.8) * 100) + '"></label></div><fieldset class="clock-day-fieldset"><legend>Repeat on days (leave blank for one-time)</legend><div class="clock-day-picker">' + DAY_NAMES.map((name,index) => '<label><input type="checkbox" name="days" value="' + index + '"' + (days.includes(index) ? ' checked' : '') + '><span>' + name + '</span></label>').join('') + '</div></fieldset><label class="clock-toggle-row"><input type="checkbox" name="vibrate" ' + (item?.vibrate !== false ? 'checked' : '') + '><span>Vibrate when ringing</span></label><button class="clock-primary-button" type="submit">' + (item ? 'Save alarm changes' : 'Add alarm') + '</button><button class="clock-secondary-button" type="button" id="clock-test-alarm">Preview sound</button><small class="clock-form-hint">Smart Wake-Up uses the configured gentle wake time in this web version. Sleep-stage-aware waking requires compatible native sensors or a wearable.</small></form><div class="clock-panel clock-list-panel"><div class="clock-panel-heading"><h3>Saved alarms</h3><span class="clock-count-pill">' + state.alarms.length + '</span></div>' + (alarmRows.length ? '<div class="clock-alarm-list">' + alarmRows.map(alarm => '<article class="clock-alarm-row ' + (alarm.enabled ? '' : 'is-disabled') + '"><label class="clock-switch"><input type="checkbox" data-alarm-toggle="' + escapeHtml(alarm.id) + '"' + (alarm.enabled ? ' checked' : '') + '><span></span></label><div class="clock-alarm-main"><strong>' + escapeHtml(alarm.time) + '</strong><span>' + escapeHtml(alarm.label || 'Alarm') + '</span><small>' + (alarm.days?.length ? alarm.days.map(day => DAY_NAMES[day]).join(' · ') : 'One time · ' + escapeHtml(alarm.date || 'Today')) + ' · ' + (alarm.mode === 'smart' ? 'Smart Wake-Up · ' + Number(alarm.wakeWindowMinutes || 15) + 'm window' : 'Advanced Alarm') + '</small></div><div class="clock-row-actions"><button type="button" data-alarm-edit="' + escapeHtml(alarm.id) + '" aria-label="Edit alarm">Edit</button><button type="button" data-alarm-delete="' + escapeHtml(alarm.id) + '" aria-label="Delete alarm">Delete</button></div></article>').join('') + '</div>' : '<div class="clock-empty-state"><span>◷</span><strong>No alarms saved yet</strong><p>Create your first alarm using the form.</p></div>') + '</div></div>';
  };
  const renderWorldTab = () => '<section class="clock-section-heading"><div><span class="clock-eyebrow">TIME AROUND THE WORLD</span><h2>World Clock</h2><p>Compare local times across cities and time zones.</p></div></section><div class="clock-panel clock-form"><form id="clock-world-add-form" class="clock-inline-form"><label>Search cities<input id="clock-world-search" type="search" placeholder="Search city or country"></label><label>Choose a city<select name="city" id="clock-world-city-select" required>' + CITY_OPTIONS.map(([city,zone]) => '<option value="' + escapeHtml(zone) + '">' + escapeHtml(city) + '</option>').join('') + '</select></label><button class="clock-primary-button" type="submit">Add city</button></form><div class="clock-world-list">' + state.worldClocks.map(city => '<article class="clock-world-card"><div><span class="clock-world-city">' + escapeHtml(city.city) + '</span><small>' + escapeHtml(city.zone) + '</small><span class="clock-world-date" data-world-date="' + escapeHtml(city.zone) + '"></span></div><strong data-world-zone="' + escapeHtml(city.zone) + '">--:--</strong><button type="button" data-world-remove="' + escapeHtml(city.id) + '">Remove</button></article>').join('') + '</div></div><section class="clock-panel clock-converter-panel"><div class="clock-panel-heading"><h3>Time-zone converter</h3><span class="clock-status-pill">Live</span></div><div class="clock-converter-grid"><label>Source city<select id="clock-convert-from">' + CITY_OPTIONS.map(([city,zone]) => '<option value="' + escapeHtml(zone) + '"' + (zone === 'America/Jamaica' ? ' selected' : '') + '>' + escapeHtml(city) + '</option>').join('') + '</select></label><label>Target city<select id="clock-convert-to">' + CITY_OPTIONS.map(([city,zone]) => '<option value="' + escapeHtml(zone) + '"' + (zone === 'America/New_York' ? ' selected' : '') + '>' + escapeHtml(city) + '</option>').join('') + '</select></label><label>Source time<input type="datetime-local" id="clock-convert-time" value="' + escapeHtml(new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)) + '"></label><div class="clock-convert-result" id="clock-convert-result">Select a time to compare locations.</div></div><button type="button" class="clock-secondary-button" id="clock-convert-run">Convert time</button></section>';
  const renderStopwatchTab = () => {
    const sw = state.stopwatch;
    const now = Date.now();
    const elapsed = sw.running ? sw.elapsedMs + (now - sw.startedAt) : sw.elapsedMs;
    return '<section class="clock-section-heading"><div><span class="clock-eyebrow">PRECISE TIME TRACKING</span><h2>Stopwatch</h2><p>Measure elapsed time, laps and split results.</p></div></section><div class="clock-panel clock-stopwatch-panel"><div class="clock-stopwatch-display" id="clock-stopwatch-display">' + formatDuration(elapsed) + '</div><div class="clock-control-row"><button class="clock-primary-button" type="button" data-stopwatch-action="' + (sw.running ? 'pause' : 'start') + '">' + (sw.running ? 'Pause' : sw.elapsedMs ? 'Resume' : 'Start') + '</button><button class="clock-secondary-button" type="button" data-stopwatch-action="lap" ' + (sw.running ? '' : 'disabled') + '>Lap / split</button><button class="clock-secondary-button" type="button" data-stopwatch-action="reset">Reset</button></div><div class="clock-lap-list">' + (sw.laps.length ? '<h3>Lap history</h3>' + sw.laps.map((lap,index) => '<div><span>Lap ' + (index+1) + '</span><strong>' + formatDuration(lap.total) + '</strong><small>Split ' + formatDuration(lap.split) + '</small></div>').join('') : '<p>No laps recorded yet.</p>') + '</div></div>';
  };
  const renderTimersTab = () => '<section class="clock-section-heading"><div><span class="clock-eyebrow">RUN MORE THAN ONE AT ONCE</span><h2>Timers</h2><p>Create named countdowns and let them run independently.</p></div></section><div class="clock-two-column"><form id="clock-timer-form" class="clock-panel clock-form"><h3>New timer</h3><label>Timer name<input name="label" maxlength="50" placeholder="Tea, workout, study..." required></label><div class="clock-form-grid"><label>Hours<input name="hours" type="number" min="0" max="99" value="0"></label><label>Minutes<input name="minutes" type="number" min="0" max="59" value="5"></label><label>Seconds<input name="seconds" type="number" min="0" max="59" value="0"></label></div><button class="clock-primary-button" type="submit">Start timer</button></form><div class="clock-panel clock-list-panel"><div class="clock-panel-heading"><h3>Your timers</h3><span class="clock-count-pill">' + state.timers.length + '</span></div>' + (state.timers.length ? '<div class="clock-timer-list">' + state.timers.map(timer => '<article class="clock-timer-card ' + (timer.done ? 'is-done' : '') + '"><div><span>' + escapeHtml(timer.label) + '</span><strong data-timer-id="' + escapeHtml(timer.id) + '">' + formatDuration(timer.running ? timer.endAt-Date.now() : timer.remainingMs) + '</strong><small>' + (timer.done ? 'Completed' : timer.running ? 'Running' : 'Paused') + '</small></div><div class="clock-row-actions"><button type="button" data-timer-action="toggle" data-timer-id="' + escapeHtml(timer.id) + '" ' + (timer.done ? 'disabled' : '') + '>' + (timer.running ? 'Pause' : 'Resume') + '</button><button type="button" data-timer-action="add" data-timer-id="' + escapeHtml(timer.id) + '">+1 min</button><button type="button" data-timer-action="delete" data-timer-id="' + escapeHtml(timer.id) + '">Delete</button></div></article>').join('') + '</div>' : '<div class="clock-empty-state"><span>⌛</span><strong>No timers running</strong><p>Create as many separate timers as you need.</p></div>') + '</div></div>';
  const renderSleepTab = () => {
    const sleep = state.sleep;
    return '<section class="clock-section-heading"><div><span class="clock-eyebrow">REST AND RECOVERY</span><h2>Sleep Schedule</h2><p>Build a regular bedtime and wake-up routine.</p></div></section><div class="clock-two-column"><form id="clock-sleep-form" class="clock-panel clock-form"><label class="clock-toggle-row"><input type="checkbox" name="enabled" ' + (sleep.enabled ? 'checked' : '') + '><span>Enable sleep schedule</span></label><div class="clock-form-grid"><label>Bedtime<input type="time" name="bedtime" value="' + escapeHtml(sleep.bedtime) + '" required></label><label>Wake-up<input type="time" name="wake" value="' + escapeHtml(sleep.wake) + '" required></label><label>Wind-down reminder<select name="windDown">' + [0,15,30,45,60,90].map(v => '<option value="' + v + '"' + (Number(sleep.windDown) === v ? ' selected' : '') + '>' + (v ? v + ' minutes before' : 'Off') + '</option>').join('') + '</select></label></div><fieldset class="clock-day-fieldset"><legend>Repeat schedule</legend><div class="clock-day-picker">' + DAY_NAMES.map((name,index) => '<label><input type="checkbox" name="days" value="' + index + '"' + (sleep.days.includes(index) ? ' checked' : '') + '><span>' + name + '</span></label>').join('') + '</div></fieldset><button class="clock-primary-button" type="submit">Save sleep schedule</button><small class="clock-form-hint">Sleep mode can prepare a reminder and wake-up alarm. Do Not Disturb is controlled by Android only when the user grants the required permission.</small></form><div class="clock-panel clock-sleep-preview"><div class="clock-sleep-moon">☾</div><h3>Your sleep routine</h3><div><span>Wind down</span><strong>' + escapeHtml(sleep.windDown ? shiftTime(sleep.bedtime, -Number(sleep.windDown)) : 'Off') + '</strong></div><div><span>Bedtime</span><strong>' + escapeHtml(sleep.bedtime) + '</strong></div><div><span>Wake-up</span><strong>' + escapeHtml(sleep.wake) + '</strong></div><div><span>Days</span><strong>' + (sleep.days.length ? sleep.days.map(day => DAY_NAMES[day]).join(', ') : 'Not selected') + '</strong></div></div></div>';
  };
  const shiftTime = (time, minutes) => {
    const [h,m] = String(time || '22:00').split(':').map(Number);
    const d = new Date(2000,0,1,h,m + minutes);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  };
  const renderFocusTab = () => {
    const f = state.focus;
    const modeLabel = f.mode === 'work' ? 'Focus session' : f.mode === 'longBreak' ? 'Long break' : 'Short break';
    return '<section class="clock-section-heading"><div><span class="clock-eyebrow">MAKE TIME FOR WHAT MATTERS</span><h2>Focus / Pomodoro</h2><p>Work in focused sessions with planned breaks.</p></div></section><div class="clock-focus-panel"><div class="clock-focus-ring"><span>' + modeLabel + '</span><strong id="clock-focus-display">' + formatDuration(remainingFocus(Date.now())) + '</strong><small>' + f.sessions + ' completed focus sessions</small></div><div class="clock-focus-controls"><button class="clock-primary-button" type="button" data-focus-action="' + (f.running ? 'pause' : 'start') + '">' + (f.running ? 'Pause' : 'Start') + '</button><button class="clock-secondary-button" type="button" data-focus-action="reset">Reset</button><button class="clock-secondary-button" type="button" data-focus-action="skip">Skip phase</button></div><form id="clock-focus-settings" class="clock-focus-settings"><label>Work minutes<input name="workMinutes" type="number" min="1" max="180" value="' + f.workMinutes + '"></label><label>Short break<input name="shortBreak" type="number" min="1" max="60" value="' + f.shortBreak + '"></label><label>Long break<input name="longBreak" type="number" min="1" max="90" value="' + f.longBreak + '"></label><button class="clock-secondary-button" type="submit">Save durations</button></form></div>';
  };
  const renderCountdownsTab = () => {
    const item = state.countdowns.find(entry => entry.id === editingCountdownId);
    return '<section class="clock-section-heading"><div><span class="clock-eyebrow">LOOK FORWARD TO IT</span><h2>Countdowns</h2><p>Keep birthdays, events and important dates in view.</p></div></section><div class="clock-two-column"><form id="clock-countdown-form" class="clock-panel clock-form"><h3>' + (item ? 'Edit countdown' : 'New countdown') + '</h3><label>Event name<input name="label" maxlength="80" required value="' + escapeHtml(item?.label || '') + '" placeholder="Birthday, trip, appointment..."></label><label>Date and time<input name="at" type="datetime-local" required value="' + escapeHtml(item?.at ? new Date(new Date(item.at).getTime()-new Date(item.at).getTimezoneOffset()*60000).toISOString().slice(0,16) : '') + '"></label><label class="clock-toggle-row"><input name="annual" type="checkbox" ' + (item?.annual ? 'checked' : '') + '><span>Repeat annually</span></label><label class="clock-toggle-row"><input name="syncCalendar" type="checkbox" ' + (!item || item.calendarEventId ? 'checked' : '') + '><span>Also add to Minglora Calendar</span></label><div class="clock-row-actions"><button class="clock-primary-button" type="submit">' + (item ? 'Save countdown' : 'Add countdown') + '</button>' + (item ? '<button type="button" class="clock-secondary-button" data-countdown-cancel>Cancel</button>' : '') + '</div></form><div class="clock-panel clock-list-panel"><div class="clock-panel-heading"><h3>Saved countdowns</h3><span class="clock-count-pill">' + state.countdowns.length + '</span></div>' + (state.countdowns.length ? '<div class="clock-countdown-list">' + state.countdowns.map(entry => '<article class="clock-countdown-card"><div><strong>' + escapeHtml(entry.label) + '</strong><span data-countdown-id="' + escapeHtml(entry.id) + '">' + countdownText(countdownTarget(entry, new Date()).getTime()-Date.now()) + '</span><small>' + new Date(entry.at).toLocaleString() + (entry.annual ? ' · Annual' : '') + '</small></div><div class="clock-row-actions"><button type="button" data-countdown-edit="' + escapeHtml(entry.id) + '">Edit</button><button type="button" data-countdown-delete="' + escapeHtml(entry.id) + '">Delete</button></div></article>').join('') + '</div>' : '<div class="clock-empty-state"><span>◴</span><strong>No countdowns yet</strong><p>Add a meaningful date to start counting down.</p></div>') + '</div></div><div class="clock-panel clock-calendar-export"><div><strong>Calendar integration</strong><p>Export your saved countdowns as an .ics calendar file that can be imported into compatible calendar apps.</p></div><button type="button" class="clock-secondary-button" id="clock-export-calendar" ' + (state.countdowns.length ? '' : 'disabled') + '>Export calendar file</button></div>';
  };
  const renderSettingsTab = () => '<section class="clock-section-heading"><div><span class="clock-eyebrow">MAKE IT YOURS</span><h2>Clock Settings</h2><p>Choose the clock style, display and personal preferences.</p></div></section><div class="clock-settings-grid"><section class="clock-panel clock-form"><h3>Appearance</h3><label>Theme<select id="clock-theme-select">' + [['luxury','Luxury gold'],['silver','Silver'],['classic','Classic'],['neon','Neon'],['futuristic','Futuristic'],['glass','Glass'],['wood','Wood'],['skeleton','Mechanical skeleton'],['minimalist','Minimalist']].map(([v,l]) => '<option value="' + v + '"' + (state.settings.theme === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label><label>Clock face<select id="clock-settings-face">' + [['luxury','Luxury'],['classic','Classic'],['neon','Neon'],['glass','Glass'],['wood','Wood']].map(([v,l]) => '<option value="' + v + '"' + (state.settings.face === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label><label>Time format<select id="clock-time-format"><option value="12h"' + (state.settings.timeFormat === '12h' ? ' selected' : '') + '>12-hour</option><option value="24h"' + (state.settings.timeFormat === '24h' ? ' selected' : '') + '>24-hour</option></select></label><label class="clock-toggle-row"><input id="clock-tick-sound" type="checkbox" ' + (state.settings.tickSound ? 'checked' : '') + '><span>Tick sound (while Clock tab is open)</span></label><label class="clock-toggle-row"><input id="clock-vibration" type="checkbox" ' + (state.settings.vibration ? 'checked' : '') + '><span>Vibration where supported</span></label><label class="clock-toggle-row"><input id="clock-reduce-motion" type="checkbox" ' + (state.settings.reduceMotion ? 'checked' : '') + '><span>Reduce animations</span></label></section><section class="clock-panel clock-form"><h3>Custom alarm sound</h3><p class="clock-form-hint">Choose a short audio file (up to 1 MB). It is stored on this device only.</p><input id="clock-custom-sound" type="file" accept="audio/*"><p class="clock-form-hint" id="clock-custom-sound-status">' + escapeHtml(state.settings.customSoundName || 'No custom sound selected') + '</p><div class="clock-row-actions"><button type="button" id="clock-preview-custom-sound" class="clock-secondary-button" ' + (state.settings.customSoundData ? '' : 'disabled') + '>Preview</button><button type="button" id="clock-remove-custom-sound" class="clock-secondary-button" ' + (state.settings.customSoundData ? '' : 'disabled') + '>Remove</button></div><hr><h3>Data and privacy</h3><p class="clock-form-hint">Your Clock Centre data is saved locally in this browser profile. Cloud sync and native Android widgets are reserved for the standalone app integration.</p><button type="button" id="clock-export-data" class="clock-secondary-button">Export Clock Centre data</button><button type="button" id="clock-reset-data" class="clock-danger-button">Reset Clock Centre data</button></section></div>';
  const renderTab = () => {
    if (!host) return;
    const panel = $('#clock-tab-panel');
    if (!panel) return;
    const renderers = { clock:renderClockTab, alarms:renderAlarmsTab, world:renderWorldTab, stopwatch:renderStopwatchTab, timers:renderTimersTab, sleep:renderSleepTab, focus:renderFocusTab, countdowns:renderCountdownsTab, settings:renderSettingsTab };
    panel.innerHTML = (renderers[state.activeTab] || renderClockTab)();
    const appShell = $('.clock-centre-app');
    host.querySelectorAll('[data-clock-tab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.clockTab === state.activeTab);
      button.setAttribute('aria-current', button.dataset.clockTab === state.activeTab ? 'page' : 'false');
    });
    appShell?.classList.remove('clock-theme-luxury','clock-theme-silver','clock-theme-classic','clock-theme-neon','clock-theme-futuristic','clock-theme-glass','clock-theme-wood','clock-theme-skeleton','clock-theme-minimalist');
    appShell?.classList.add(themeClass());
    appShell?.classList.toggle('is-reduced-motion', Boolean(state.settings.reduceMotion));
    applyClockHands(new Date());
    tick();
  };
  const bindPointerRotation = () => {
    const shell = $('#clock-face-shell');
    if (!shell || shell.dataset.rotationBound) return;
    shell.dataset.rotationBound = 'true';
    let active = false, startX = 0, startY = 0, tiltX = 12, tiltY = 0;
    shell.addEventListener('pointerdown', event => {
      active = true; startX = event.clientX; startY = event.clientY;
      shell.setPointerCapture?.(event.pointerId);
    });
    shell.addEventListener('pointermove', event => {
      if (!active) return;
      tiltY = Math.max(-28, Math.min(28, tiltY + (event.clientX - startX) * 0.12));
      tiltX = Math.max(0, Math.min(34, tiltX - (event.clientY - startY) * 0.12));
      startX = event.clientX; startY = event.clientY;
      shell.style.setProperty('--tilt-x', tiltX + 'deg');
      shell.style.setProperty('--tilt-y', tiltY + 'deg');
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name => shell.addEventListener(name, () => { active = false; }));
  };
  const filterWorldCities = query => {
    const select = $('#clock-world-city-select');
    if (!select) return;
    const needle = String(query || '').trim().toLowerCase();
    const previous = select.value;
    const options = CITY_OPTIONS.filter(([city,zone]) => !needle || (city + ' ' + zone).toLowerCase().includes(needle));
    select.innerHTML = options.map(([city,zone]) => '<option value="' + escapeHtml(zone) + '">' + escapeHtml(city) + '</option>').join('');
    if (options.some(([,zone]) => zone === previous)) select.value = previous;
  };
  const requestCalendar = async (path, method, payload) => {
    const response = await fetch('/api/calendar/events' + path, { method, credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json','X-Minglora-Time-Zone':Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}, ...(payload ? { body:JSON.stringify(payload) } : {}) });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Calendar sync failed (' + response.status + ').');
    return data;
  };
  const syncCountdownToCalendar = async (entry, enabled) => {
    if (!enabled && entry.calendarEventId) { await requestCalendar('/' + encodeURIComponent(entry.calendarEventId),'DELETE'); entry.calendarEventId = null; return; }
    if (!enabled) return;
    const payload = { title:entry.label, kind:'event', calendarName:'Clock Centre', startAt:entry.at, endAt:null, allDay:false, completed:false, recurrence:entry.annual ? 'yearly' : 'none', repeatUntil:null, reminderMinutes:0, color:'#b98a4c', location:'', description:'Created from Minglora Clock Centre', timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
    const data = await requestCalendar(entry.calendarEventId ? '/' + encodeURIComponent(entry.calendarEventId) : '', entry.calendarEventId ? 'PATCH' : 'POST', payload);
    entry.calendarEventId = data.event?.id || entry.calendarEventId || null;
  };
  const bind = () => {
    if (host.dataset.clockEventsBound) return;
    host.dataset.clockEventsBound = 'true';
    host.addEventListener('click', event => {
      const tab = event.target.closest('[data-clock-tab]');
      if (tab) { state.activeTab = tab.dataset.clockTab; persist(); renderTab(); return; }
      const action = event.target.closest('[data-alarm-toggle],[data-alarm-edit],[data-alarm-delete],[data-alarm-dismiss],[data-alarm-snooze],[data-world-remove],[data-stopwatch-action],[data-timer-action],[data-focus-action],[data-countdown-edit],[data-countdown-delete],[data-countdown-cancel],[data-alarm-cancel-edit]');
      if (action?.dataset.alarmToggle) {
        const alarm = state.alarms.find(item => item.id === action.dataset.alarmToggle);
        if (alarm) { alarm.enabled = action.checked; persist(); renderTab(); }
      } else if (action?.dataset.alarmEdit) {
        editingAlarmId = action.dataset.alarmEdit; renderTab();
      } else if (action?.dataset.alarmDelete) {
        state.alarms = state.alarms.filter(item => item.id !== action.dataset.alarmDelete); persist(); renderTab();
      } else if (action?.hasAttribute('data-alarm-dismiss')) {
        stopAlarmSound(); ringingAlarm = null; $('#clock-ringing-alert')?.remove();
      } else if (action?.hasAttribute('data-alarm-snooze')) {
        stopAlarmSound();
        const snoozeAt = new Date(Date.now() + 5 * 60000);
        const snooze = { ...ringingAlarm, id: uid(), time: String(snoozeAt.getHours()).padStart(2,'0') + ':' + String(snoozeAt.getMinutes()).padStart(2,'0'), date: localDate(snoozeAt), days: [], label: (ringingAlarm?.label || 'Alarm') + ' · Snooze', enabled: true };
        state.alarms.push(snooze); persist(); ringingAlarm = null; $('#clock-ringing-alert')?.remove(); showToast('Snoozed for five minutes.');
      } else if (action?.dataset.alarmCancelEdit !== undefined) {
        editingAlarmId = null; renderTab();
      } else if (action?.dataset.worldRemove) {
        state.worldClocks = state.worldClocks.filter(item => item.id !== action.dataset.worldRemove); persist(); renderTab();
      } else if (action?.dataset.stopwatchAction) {
        const sw = state.stopwatch, now = Date.now();
        if (action.dataset.stopwatchAction === 'start' && !sw.running) { sw.startedAt = now; sw.running = true; }
        if (action.dataset.stopwatchAction === 'pause' && sw.running) { sw.elapsedMs += now - sw.startedAt; sw.startedAt = 0; sw.running = false; }
        if (action.dataset.stopwatchAction === 'lap' && sw.running) {
          const total = sw.elapsedMs + (now - sw.startedAt);
          const previous = sw.laps.length ? sw.laps[sw.laps.length-1].total : 0;
          sw.laps.push({ total, split: total - previous });
        }
        if (action.dataset.stopwatchAction === 'reset') { sw.running = false; sw.elapsedMs = 0; sw.startedAt = 0; sw.laps = []; }
        persist(); renderTab();
      } else if (action?.dataset.timerAction) {
        const timer = state.timers.find(item => item.id === action.dataset.timerId);
        if (!timer) return;
        if (action.dataset.timerAction === 'toggle' && !timer.done) {
          if (timer.running) { timer.remainingMs = Math.max(0, timer.endAt - Date.now()); timer.running = false; timer.endAt = 0; }
          else { timer.running = true; timer.endAt = Date.now() + timer.remainingMs; }
        }
        if (action.dataset.timerAction === 'add' && !timer.done) {
          if (timer.running) timer.endAt += 60000; else timer.remainingMs += 60000;
        }
        if (action.dataset.timerAction === 'delete') state.timers = state.timers.filter(item => item.id !== timer.id);
        persist(); renderTab();
      } else if (action?.dataset.focusAction) {
        const f = state.focus, now = Date.now();
        if (action.dataset.focusAction === 'start' && !f.running) { f.startedAt = now; f.running = true; }
        if (action.dataset.focusAction === 'pause' && f.running) { f.remainingMs = remainingFocus(now); f.startedAt = 0; f.running = false; }
        if (action.dataset.focusAction === 'reset') { f.running = false; f.startedAt = 0; f.mode = 'work'; f.remainingMs = f.workMinutes * 60000; }
        if (action.dataset.focusAction === 'skip') { f.running = false; f.startedAt = 0; f.mode = f.mode === 'work' ? 'shortBreak' : 'work'; f.remainingMs = (f.mode === 'work' ? f.workMinutes : f.shortBreak) * 60000; }
        persist(); renderTab();
      } else if (action?.dataset.countdownEdit) {
        editingCountdownId = action.dataset.countdownEdit; renderTab();
      } else if (action?.dataset.countdownDelete) {
        state.countdowns = state.countdowns.filter(item => item.id !== action.dataset.countdownDelete); persist(); renderTab();
      } else if (action?.hasAttribute('data-countdown-cancel')) {
        editingCountdownId = null; renderTab();
      }
    });
    host.addEventListener('input', event => {
      if (event.target.id === 'clock-world-search') filterWorldCities(event.target.value);
    });
    host.addEventListener('change', event => {
      const target = event.target;
      if (target.id === 'clock-display-select') { state.settings.clockView = target.value; persist(); renderTab(); }
      if (target.id === 'clock-face-select' || target.id === 'clock-settings-face') { state.settings.face = target.value; state.settings.theme = target.value; persist(); renderTab(); }
      if (target.id === 'clock-theme-select') { state.settings.theme = target.value; persist(); renderTab(); }
      if (target.id === 'clock-time-format') { state.settings.timeFormat = target.value; persist(); renderTab(); }
      if (target.id === 'clock-tick-sound') { state.settings.tickSound = target.checked; persist(); }
      if (target.id === 'clock-vibration') { state.settings.vibration = target.checked; persist(); }
      if (target.id === 'clock-reduce-motion') { state.settings.reduceMotion = target.checked; persist(); renderTab(); }
      if (target.id === 'clock-alarm-sort') { state.settings.sortAlarms = target.value; persist(); renderTab(); }
      if (target.matches('[data-alarm-toggle]')) {
        const alarm = state.alarms.find(item => item.id === target.dataset.alarmToggle);
        if (alarm) { alarm.enabled = target.checked; persist(); renderTab(); }
      }
      if (target.id === 'clock-custom-sound') handleCustomSound(target.files?.[0]);
    });
    host.addEventListener('submit', async event => {
      const form = event.target;
      if (form.id === 'clock-alarm-form') {
        event.preventDefault();
        const data = new FormData(form);
        const days = data.getAll('days').map(Number);
        const alarm = {
          id: editingAlarmId || uid(), time: String(data.get('time')), label: String(data.get('label') || '').trim(),
          date: days.length ? '' : String(data.get('date') || localDate(new Date())), days,
          mode: String(data.get('mode') || 'advanced'), wakeWindowMinutes: Number(data.get('wakeWindow') || 15), sound: String(data.get('sound') || 'classic'),
          volume: Number(data.get('volume') || 80) / 100, vibrate: data.get('vibrate') === 'on', enabled: true
        };
        if (editingAlarmId) state.alarms = state.alarms.map(item => item.id === editingAlarmId ? alarm : item);
        else state.alarms.push(alarm);
        editingAlarmId = null; persist(); renderTab(); showToast('Alarm saved on this device.');
      }
      if (form.id === 'clock-world-add-form') {
        event.preventDefault();
        const zone = String(new FormData(form).get('city'));
        const city = CITY_OPTIONS.find(item => item[1] === zone);
        if (city && !state.worldClocks.some(item => item.zone === zone)) state.worldClocks.push({ id:uid(), city:city[0], zone });
        persist(); renderTab();
      }
      if (form.id === 'clock-timer-form') {
        event.preventDefault();
        const data = new FormData(form);
        const total = (Number(data.get('hours')||0)*3600 + Number(data.get('minutes')||0)*60 + Number(data.get('seconds')||0))*1000;
        if (total <= 0) { showToast('Enter a timer duration greater than zero.'); return; }
        const timer = { id:uid(), label:String(data.get('label')||'Timer').trim(), remainingMs:total, endAt:Date.now()+total, running:true, done:false };
        state.timers.unshift(timer); persist(); renderTab(); showToast('Timer started.');
      }
      if (form.id === 'clock-sleep-form') {
        event.preventDefault();
        const data = new FormData(form);
        const sleep = { enabled:data.get('enabled') === 'on', bedtime:String(data.get('bedtime')), wake:String(data.get('wake')), windDown:Number(data.get('windDown')), days:data.getAll('days').map(Number) };
        const managedIds = new Set(['clock-sleep-winddown','clock-sleep-bedtime','clock-sleep-wake']);
        state.alarms = state.alarms.filter(alarm => !managedIds.has(alarm.id));
        if (sleep.enabled) {
          if (!sleep.days.length) { showToast('Choose at least one day for your sleep schedule.'); return; }
          if (sleep.windDown > 0) state.alarms.push({ id:'clock-sleep-winddown', label:'Wind-down reminder', time:shiftTime(sleep.bedtime,-sleep.windDown), date:'', days:[...sleep.days], mode:'advanced', sound:'gentle', volume:0.35, vibrate:false, enabled:true, managedBySleepSchedule:true });
          state.alarms.push({ id:'clock-sleep-bedtime', label:'Bedtime', time:sleep.bedtime, date:'', days:[...sleep.days], mode:'advanced', sound:'gentle', volume:0.35, vibrate:false, enabled:true, managedBySleepSchedule:true });
          state.alarms.push({ id:'clock-sleep-wake', label:'Wake up', time:sleep.wake, date:'', days:[...sleep.days], mode:'smart', wakeWindowMinutes:15, sound:'gentle', volume:0.7, vibrate:true, enabled:true, managedBySleepSchedule:true });
        }
        state.sleep = sleep;
        persist(); renderTab(); showToast(sleep.enabled ? 'Sleep schedule and its alarms were saved.' : 'Sleep schedule disabled.');
      }
      if (form.id === 'clock-focus-settings') {
        event.preventDefault();
        const data = new FormData(form), f = state.focus;
        f.workMinutes = Math.max(1, Math.min(180, Number(data.get('workMinutes')) || 25));
        f.shortBreak = Math.max(1, Math.min(60, Number(data.get('shortBreak')) || 5));
        f.longBreak = Math.max(1, Math.min(90, Number(data.get('longBreak')) || 15));
        if (!f.running) f.remainingMs = f.workMinutes * 60000;
        persist(); renderTab(); showToast('Focus durations saved.');
      }
      if (form.id === 'clock-countdown-form') {
        event.preventDefault();
        const data = new FormData(form);
        const at = new Date(String(data.get('at'))).toISOString();
        const previous = state.countdowns.find(item => item.id === editingCountdownId);
        const entry = { id:editingCountdownId || uid(), label:String(data.get('label')).trim(), at, annual:data.get('annual') === 'on', calendarEventId:previous?.calendarEventId || null };
        let calendarSyncError = '';
        try { await syncCountdownToCalendar(entry, data.get('syncCalendar') === 'on'); }
        catch (error) { calendarSyncError = error.message; }
        if (editingCountdownId) state.countdowns = state.countdowns.map(item => item.id === editingCountdownId ? entry : item);
        else state.countdowns.push(entry);
        editingCountdownId = null; persist(); renderTab();
        if (calendarSyncError) showToast('Countdown saved locally; Calendar sync failed: ' + calendarSyncError);
        else showToast(entry.calendarEventId ? 'Countdown saved and added to Minglora Calendar.' : 'Countdown saved locally.');
      }
    });
    host.addEventListener('click', event => {
      if (event.target.id === 'clock-test-alarm') beep(false);
      if (event.target.id === 'clock-convert-run') runConverter();
      if (event.target.id === 'clock-export-calendar') exportCalendar();
      if (event.target.id === 'clock-preview-custom-sound') previewCustomSound();
      if (event.target.id === 'clock-remove-custom-sound') {
        state.settings.customSoundData = ''; state.settings.customSoundName = ''; persist(); renderTab(); showToast('Custom alarm sound removed.');
      }
      if (event.target.id === 'clock-export-data') exportData();
      if (event.target.id === 'clock-reset-data') {
        if (confirm('Reset this device’s Clock Centre data? This cannot be undone.')) {
          localStorage.removeItem(storageKey); state = structuredClone(DEFAULTS); editingAlarmId = null; editingCountdownId = null; persist(); renderTab(); showToast('Clock Centre data reset.');
        }
      }
    });
  };
  const handleCustomSound = file => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) { showToast('Choose an audio file.'); return; }
    if (file.size > 1024 * 1024) { showToast('Custom sounds must be 1 MB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.customSoundData = String(reader.result || '');
      state.settings.customSoundName = file.name;
      persist(); renderTab(); showToast('Custom sound saved on this device.');
    };
    reader.onerror = () => showToast('Could not read that audio file.');
    reader.readAsDataURL(file);
  };
  const previewCustomSound = () => {
    if (!state.settings.customSoundData) return;
    try { const audio = new Audio(state.settings.customSoundData); audio.play().catch(() => showToast('Tap Preview again after interacting with the page.')); }
    catch { showToast('This audio format is not supported by the browser.'); }
  };
  const localWallTimeInZone = (value, zone) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) throw new Error('Choose a valid source date and time.');
    const wanted = { year:+match[1], month:+match[2], day:+match[3], hour:+match[4], minute:+match[5] };
    const targetAsUtc = Date.UTC(wanted.year, wanted.month-1, wanted.day, wanted.hour, wanted.minute);
    let guess = targetAsUtc;
    for (let attempt=0; attempt<5; attempt++) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(guess));
      const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
      const observedAsUtc = Date.UTC(values.year, values.month-1, values.day, values.hour, values.minute);
      const delta = targetAsUtc - observedAsUtc;
      if (!delta) break;
      guess += delta;
    }
    const date = new Date(guess);
    const check = new Intl.DateTimeFormat('en-CA', { timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
    const actual = Object.fromEntries(check.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    if (actual.year !== wanted.year || actual.month !== wanted.month || actual.day !== wanted.day || actual.hour !== wanted.hour || actual.minute !== wanted.minute) throw new Error('That source time does not exist because of a daylight-saving clock change. Choose another time.');
    return date;
  };
  const runConverter = () => {
    const from = $('#clock-convert-from')?.value;
    const to = $('#clock-convert-to')?.value;
    const value = $('#clock-convert-time')?.value;
    if (!from || !to || !value) { showToast('Choose both cities and a source time.'); return; }
    try {
      const date = localWallTimeInZone(value, from);
      const source = new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', timeZone:from }).format(date);
      const target = new Intl.DateTimeFormat(undefined, { dateStyle:'full', timeStyle:'short', timeZone:to, timeZoneName:'short' }).format(date);
      const result = $('#clock-convert-result');
      if (result) result.textContent = source + ' → ' + target;
    } catch (error) { showToast(error.message); }
  };
  const exportCalendar = () => {
    if (!state.countdowns.length) return;
    const icsEscape = value => String(value).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
    const stamp = date => new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Minglora//Clock Centre//EN'];
    state.countdowns.forEach(item => {
      const at = new Date(item.at);
      const end = new Date(at.getTime()+30*60000);
      lines.push('BEGIN:VEVENT','UID:'+item.id+'@minglora-clock','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(at),'DTEND:'+stamp(end),'SUMMARY:'+icsEscape(item.label));
      if (item.annual) lines.push('RRULE:FREQ=YEARLY');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    downloadFile('minglora-clock-countdowns.ics',lines.join('\r\n'),'text/calendar');
  };
  const exportData = () => downloadFile('minglora-clock-centre-backup.json',JSON.stringify(state,null,2),'application/json');
  const downloadFile = (name, content, type) => {
    const blob = new Blob([content],{type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  };

  const render = (context = {}) => {
    const userId = context.user?.id || 'local';
    storageKey = STORAGE_PREFIX + String(userId).replace(/[^a-zA-Z0-9_-]/g,'_');
    state = readStoredState();
    host = document.querySelector('#main-content');
    if (!host) return;
    editingAlarmId = null;
    editingCountdownId = null;
    ringingAlarm = null;
    host.innerHTML = '<section class="clock-centre-app ' + themeClass() + '"><header class="clock-centre-header"><div class="clock-brand-mark">◷</div><div><span class="clock-eyebrow">MINGLORA PRODUCTIVITY TOOLS</span><h1>Clock Centre</h1><p>Time, routines and productivity — together.</p></div><div class="clock-header-actions"><span class="clock-local-badge"><i></i> Local time</span><button type="button" class="clock-icon-button" data-clock-tab="settings" aria-label="Clock settings">⚙</button></div></header>' + renderTabs() + '<main id="clock-tab-panel" class="clock-tab-panel"></main></section>';
    bind();
    renderTab();
    bindPointerRotation();
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick,1000);
    tick();
  };
  window.MingloraClockCentre = { render, stop:() => { clearInterval(ticker); ticker = 0; stopAlarmSound(); } };
})();