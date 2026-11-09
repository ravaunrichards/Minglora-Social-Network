import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const clock = read('public/clock-centre.js');
const css = read('public/clock-centre.css');
const moduleDocs = read('backend/modules/clock-centre/README.md');

test('Clock Centre is an independent Minglora route in desktop and mobile navigation', () => {
  assert.match(app, /state\.view==='clock-centre'\)await window\.MingloraClockCentre\?\.render\(\{user:state\.user\}\)/);
  assert.match(app, /view:'clock-centre'/);
  assert.match(app, /'clock-centre','menstrual-health'/);
  assert.match(app,/label:'Clock Centre'[^}]+view:'clock-centre'/);
  assert.match(html, /clock-centre\.css/);
  assert.match(html, /clock-centre\.js/);
  assert.ok(html.indexOf('/clock-centre.js') < html.indexOf('/app.js'), 'Clock Centre module loads before the app router');
});

test('analogue and digital clocks support all selectable visual styles', () => {
  assert.match(clock, /clock-hour-hand/);
  assert.match(clock, /clock-minute-hand/);
  assert.match(clock, /clock-second-hand/);
  assert.match(clock, /clock-digital-secondary/);
  for (const style of ['luxury','silver','classic','neon','futuristic','glass','wood','skeleton','minimalist']) {
    assert.ok(clock.includes("'" + style + "'"), 'missing selectable style ' + style);
    if (style === 'luxury') assert.match(css, /\.clock-centre-app\{/);
    else assert.ok(css.includes('clock-theme-' + style), 'missing style treatment ' + style);
  }
  assert.match(css, /perspective:/);
  assert.match(css, /transform-style:preserve-3d/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Advanced Alarm and Smart Wake-Up are selectable, with sleep-managed reminders', () => {
  assert.match(clock, /value="advanced"/);
  assert.match(clock, /value="smart"/);
  assert.match(clock, /wakeWindowMinutes/);
  assert.match(clock, /clock-sleep-winddown/);
  assert.match(clock, /clock-sleep-bedtime/);
  assert.match(clock, /clock-sleep-wake/);
  assert.match(clock, /data-alarm-toggle/);
  assert.match(clock, /data-alarm-edit/);
  assert.match(clock, /data-alarm-delete/);
  assert.match(clock, /page is open/);
  assert.match(moduleDocs, /AlarmManager-based scheduling/);
});

test('World Clock and time-zone conversion include searchable cities and DST validation', () => {
  assert.match(clock, /clock-world-search/);
  assert.match(clock, /localWallTimeInZone/);
  assert.match(clock, /daylight-saving clock change/);
  const cities = clock.match(/\['[^']+', '[A-Za-z_\/]+(?:\/[A-Za-z_]+)*'\]/g) || [];
  assert.ok(cities.length >= 30, 'expected a broad searchable city list');
});

test('timers, stopwatch, annual countdowns and Minglora Calendar integration are wired', () => {
  assert.match(clock, /clock-stopwatch-display/);
  assert.match(clock, /data-stopwatch-action="lap"/);
  assert.match(clock, /clock-timer-form/);
  assert.match(clock, /data-timer-action="toggle"/);
  assert.match(clock, /clock-focus-settings/);
  assert.match(clock, /countdownTarget/);
  assert.match(clock, /RRULE:FREQ=YEARLY/);
  assert.match(clock, /syncCountdownToCalendar/);
  assert.match(clock, /\/api\/calendar\/events/);
  assert.match(clock, /data-countdown-delete/);
});

test('Clock Centre keeps local data and exports a backup without pretending web alarms run in background', () => {
  assert.match(clock, /localStorage\.setItem\(storageKey/);
  assert.match(clock, /clock-export-data/);
  assert.match(clock, /clock-centre-backup\.json/);
  assert.match(clock, /Web alarms ring while this Clock Centre page is open/);
  assert.match(moduleDocs, /must always remain local to the device/);
});
