import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EXPERIENCE_SETTINGS, validateExperienceSettingsPatch } from '../../src/domain/experience-settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const experience = read('public/experience-center.js');
const experienceCss = read('public/experience-center.css');
const settings = read('public/settings.js');
const app = read('public/app.js');
const html = read('public/index.html');
const serviceWorker = read('public/sw.js');

test('saved appearance hydrates on every authenticated session without opening Settings', () => {
  const listener = experience.indexOf("window.addEventListener('minglora:settings-loaded',handleSettingsLoaded)");
  const attach = experience.indexOf('function attach(form)');
  assert.ok(listener >= 0, 'global settings-loaded listener is registered');
  assert.ok(attach >= 0 && listener < attach, 'listener is registered outside the Settings-only mount');
  assert.match(experience, /function handleSettingsLoaded\(event\)[\s\S]*?const experience=event\.detail\?\.experience[\s\S]*?apply\(current\)/);
  assert.match(settings, /window\.addEventListener\('minglora:session-ready',[\s\S]*?minglora:settings-loaded/);
  assert.match(app, /dispatchEvent\(new Event\('minglora:session-ready'\)\)/);
  assert.ok(html.includes('src="'+ '/experience-center.js?v=20261112-session-style-hydration-1' +'"'), 'HTML loads the corrected script version');
  assert.ok(serviceWorker.includes("'/experience-center.js?v=20261112-session-style-hydration-1'"), 'service worker precaches the corrected script version');
  assert.match(serviceWorker, /CACHE_NAME='minglora-shell-v\d+-self-updating-1'/);
});

test('sign-out clears the previous account appearance before the next account signs in', () => {
  assert.match(app, /dispatchEvent\(new Event\('minglora:session-ended'\)\)/);
  assert.match(experience, /window\.addEventListener\('minglora:session-ended',[\s\S]*?current=\{\.\.\.DEFAULTS\}[\s\S]*?apply\(current\)/);
});

test('every advertised account palette and design style is accepted and has matching CSS', () => {
  const paletteBlock = experience.split('const THEMES = [')[1]?.split('];')[0] || '';
  const styleBlock = experience.split('const STYLE_VARIANTS = [')[1]?.split('];')[0] || '';
  const palettes = [...paletteBlock.matchAll(/^\s*\['([^']+)'/gm)].map(match => match[1]);
  const styles = [...styleBlock.matchAll(/^\s*\['([^']+)'/gm)].map(match => match[1]);

  assert.equal(palettes.length, 7, 'all seven appearance palettes remain available');
  assert.equal(styles.length, 19, 'the default plus eighteen design variants remain available');

  for (const style of palettes) {
    const result = validateExperienceSettingsPatch(DEFAULT_EXPERIENCE_SETTINGS, { style });
    assert.equal(result.valid, true, 'server accepts palette ' + style);
    assert.ok(experienceCss.includes('data-minglora-style="' + style + '"'), 'palette CSS exists: ' + style);
  }
  for (const chlStyle of styles) {
    const result = validateExperienceSettingsPatch(DEFAULT_EXPERIENCE_SETTINGS, { chlStyle });
    assert.equal(result.valid, true, 'server accepts design style ' + chlStyle);
    assert.ok(experienceCss.includes('data-minglora-variant="' + chlStyle + '"'), 'design CSS exists: ' + chlStyle);
  }
});

test('appearance reset still restores defaults and persists the member choice', () => {
  assert.match(experience, /data-exp-reset/);
  assert.match(experience, /current=\{\.\.\.DEFAULTS\}/);
  assert.match(experience, /api\('\/settings',\{method:'PATCH',body:JSON\.stringify\(\{experience:p\}\)\}\)/);
});
