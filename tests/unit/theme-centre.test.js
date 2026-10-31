import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('src/server.js');
const settings = read('public/settings.js');
const app = read('public/app.js');
const css = read('public/styles.css');
const html = read('public/index.html');
const sw = read('public/sw.js');

test('app palettes and LIVE room styles are explicit allow-lists with sensible defaults', () => {
  assert.match(server, /APP_COLOR_THEMES=\['minglora','ocean','tropical','royal','emerald','rose','golden','lavender','midnight','graphite'\]/);
  assert.match(server, /LIVE_ROOM_THEMES=\['studio','ocean','tropical','royal','neon','sunset','garden','social'\]/);
  assert.match(server, /colorTheme:'minglora',liveRoomTheme:'studio'/);
  assert.match(server, /Choose a supported Minglora colour theme/);
  assert.match(server, /Choose a supported LIVE room theme/);
});

test('Theme Centre previews and persists app and LIVE preferences separately', () => {
  assert.match(settings, /id="settings-preferences"/);
  assert.match(settings, /Theme Centre/);
  assert.ok(settings.includes('name="${name}"'), 'theme radio helper applies the supplied preference name');
  assert.match(settings, /renderThemeChoices\('liveRoomTheme', LIVE_THEMES/);
  assert.match(settings, /renderThemeChoices\('colorTheme', APP_THEMES/);
  assert.match(settings, /colorTheme: formData\.get\('colorTheme'\)/);
  assert.match(settings, /liveRoomTheme: formData\.get\('liveRoomTheme'\)/);
  assert.match(settings, /document\.body\.dataset\.colorTheme = colorTheme/);
});

test('saved LIVE room style remains in Settings and is applied to newly created broadcasts', () => {
  assert.match(settings, /renderThemeChoices\('liveRoomTheme', LIVE_THEMES/);
  assert.match(settings, /liveRoomTheme: formData\.get\('liveRoomTheme'\)/);
  assert.match(server, /getUserSettings\(user\)\.preferences\.liveRoomTheme/);
  assert.match(server, /broadcastType, liveTheme, status: 'live'/);
  assert.doesNotMatch(app, /live-room-theme-select|live-style-field|live-room-theme-control/);
  assert.doesNotMatch(css, /\.live-style-field|\.live-room-theme-control/);
  assert.doesNotMatch(app, /liveTheme:values\.get\(["']liveTheme["']\)/);
});

test('all advertised themes have previews and responsive visual treatment', () => {
  for (const theme of ['minglora','ocean','tropical','royal','emerald','rose','golden','lavender','midnight','graphite']) {
    assert.ok(css.includes('data-color-theme="' + theme + '"'), 'missing app palette ' + theme);
    assert.ok(css.includes('app-theme-art-' + theme), 'missing app preview ' + theme);
  }
  for (const theme of ['studio','ocean','tropical','royal','neon','sunset','garden','social']) {
    assert.ok(css.includes('live-theme-art-' + theme), 'missing LIVE preview ' + theme);
    if (theme !== 'studio') assert.ok(css.includes('live-theme-' + theme), 'missing LIVE room style ' + theme);
  }
  assert.match(html, /styles\.css\?v=20261031-creator-stage-sticky-fallback-1/);
  assert.match(html, /app\.js\?v=20261031-creator-stage-sticky-fallback-1/);
  assert.match(html, /settings\.js\?v=20261031-logout-in-settings-1/);
  assert.match(sw, /minglora-shell-v24-creator-stage-sticky-fallback/);
  assert.match(sw, /settings\.js\?v=20261031-logout-in-settings-1/);
});
