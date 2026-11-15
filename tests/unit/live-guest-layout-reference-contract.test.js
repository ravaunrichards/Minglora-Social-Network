import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/live-guest-layout-reference.css'), 'utf8');

const screenLayouts = [
  ['full-screen', 'Full Screen', 'Full Screen.jpg'],
  ['fluid-panel', 'Fluid Panel', 'Fluid Panel.jpg'],
  ['fluid-grid', 'Fluid Grid', 'Fluid Grid.jpg'],
  ['fixed-grid', 'Fixed Grid', 'Fixed Grid.jpg'],
  ['fixed-panel', 'Fixed Panel', 'Fixed Panel.jpg'],
  ['side-by-side', 'Side by Side', 'Side by Side.jpg'],
  ['spotlight', 'Spotlight', 'Spotlight.jpg']
];
const guestLayouts = [
  ['roundtable-1', 'Roundtable 1', 'Roundtable 1.jpg'],
  ['roundtable-2', 'Roundtable 2', 'Roundtable 2.jpg']
];

test('All seven screen layouts and two guest-box layouts keep their supplied names', () => {
  for (const [value, label, reference] of [...screenLayouts, ...guestLayouts]) {
    assert.ok(app.includes("value:'" + value + "',label:'" + label + "'"),
      label + ' must keep its exact visible label and stable layout value');
    assert.ok(fs.existsSync(path.join(root, 'assets/Guests Layout', reference)),
      label + ' supplied reference diagram must remain present and unchanged');
  }
  assert.match(app, /const LIVE_SCREEN_LAYOUT_OPTIONS=Object\.freeze/);
  assert.match(app, /const LIVE_GUEST_LAYOUT_OPTIONS=Object\.freeze/);
});

test('The canonical reference stylesheet loads after legacy LIVE and global CSS', () => {
  const canonical = html.indexOf('/live-guest-layout-reference.css');
  assert.ok(canonical >= 0, 'canonical layout stylesheet must be linked');
  for (const earlier of [
    '/live-room-fit.css',
    '/live-tiktok-compact.css',
    '/live-interface-guardrails.css',
    '/profile-style-system.css'
  ]) {
    assert.ok(html.indexOf(earlier) >= 0 && html.indexOf(earlier) < canonical,
      canonical + ' must load after ' + earlier);
  }
});

test('Full Screen is one portrait stage tile, without extra guest boxes', () => {
  assert.match(css, /data-live-layout="full-screen"\][\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /data-live-layout="full-screen"\]\s*>\.live-guest-seat:not\(\.is-host\)\{display:none!important\}/);
  assert.match(css, /aspect-ratio:9\/16!important/);
});

test('Fluid Panel is one large stage with exactly two small overlay guest boxes', () => {
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1\/-1!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(3\)\{[\s\S]*?grid-column:4!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(4\)\{[\s\S]*?grid-column:4!important/);
  assert.match(css, /data-live-layout="fluid-panel"\]\s*>\.live-guest-seat:nth-child\(n\+5\)\{display:none!important\}/);
});

test('Fluid Grid is one large left tile with two vertically stacked right tiles', () => {
  assert.match(css, /data-live-layout="fluid-grid"\]\{[\s\S]*?grid-template-columns:minmax\(0,1\.35fr\) minmax\(0,\.65fr\)!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1!important;\s*grid-row:2\/4!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat:nth-child\(3\)\{[\s\S]*?grid-row:2!important/);
  assert.match(css, /data-live-layout="fluid-grid"\]\s*>\.live-guest-seat:nth-child\(4\)\{[\s\S]*?grid-row:3!important/);
});

test('Fixed Grid remains exactly nine equal cells in three columns and three rows', () => {
  const fixedGrid = css.slice(css.indexOf('/* 4. Fixed Grid'), css.indexOf('/* 5. Fixed Panel'));
  assert.match(fixedGrid, /grid-template-columns:repeat\(3,minmax\(0,1fr\))!important/);
  assert.match(fixedGrid, /grid-template-rows:repeat\(3,minmax\(72px,1fr\))!important/);
  assert.match(fixedGrid, /aspect-ratio:1\/1!important/);
  assert.doesNotMatch(fixedGrid, /repeat\(2,minmax\(0,1fr\)\)/);
});

test('Fixed Panel has one large left panel and exactly three right-side guest boxes', () => {
  const fixedPanel = css.slice(css.indexOf('/* 5. Fixed Panel'), css.indexOf('/* 6. Side by Side'));
  assert.match(fixedPanel, /grid-template-columns:minmax\(0,1\.7fr\) minmax\(76px,\.7fr\)!important/);
  assert.match(fixedPanel, /\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1!important;\s*grid-row:1\/4!important/);
  for (const child of [3, 4, 5]) assert.ok(fixedPanel.includes('nth-child(' + child + ')'));
  assert.match(fixedPanel, /nth-child\(n\+6\)\{display:none!important\}/);
});

test('Side by Side has two large top tiles and the smaller four-column guest rows', () => {
  const side = css.slice(css.indexOf('/* 6. Side by Side'), css.indexOf('/* 7. Spotlight'));
  assert.match(side, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(side, /\.live-guest-seat\.is-host\{\s*grid-column:1\/3!important;grid-row:2!important/);
  assert.match(side, /\.live-guest-seat:nth-child\(3\)\{\s*grid-column:3\/5!important;grid-row:2!important/);
});

test('Spotlight has one wide upper tile with eight smaller participant cells below', () => {
  const spotlight = css.slice(css.indexOf('/* 7. Spotlight'), css.indexOf('/* Roundtable layouts'));
  assert.match(spotlight, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(spotlight, /\.live-guest-seat\.is-host\{[\s\S]*?grid-column:1\/-1!important;\s*grid-row:2!important/);
  assert.match(spotlight, /repeat\(2,minmax\(54px,\.6fr\)\)/);
});

test('Roundtable 1 uses a wide central host with two four-seat vertical guest columns', () => {
  const start = css.indexOf('data-live-guest-layout="roundtable-1"');
  const end = css.indexOf('data-live-guest-layout="roundtable-2"', start);
  const roundtable = css.slice(start, end);
  assert.match(roundtable, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(roundtable, /grid-column:2\/4!important;grid-row:2\/6!important/);
  for (const child of [3, 4, 5, 6, 7, 8, 9, 10]) assert.ok(roundtable.includes('nth-child(' + child + ')'));
});

test('Roundtable 2 uses a narrow central host with two four-seat vertical guest columns', () => {
  const start = css.indexOf('data-live-guest-layout="roundtable-2"');
  const roundtable = css.slice(start);
  assert.match(roundtable, /grid-template-columns:repeat\(3,minmax\(0,1fr\))!important/);
  assert.match(roundtable, /grid-column:2!important;grid-row:2\/6!important/);
  for (const child of [3, 4, 5, 6, 7, 8, 9, 10]) assert.ok(roundtable.includes('nth-child(' + child + ')'));
});

test('All nine layout choices display their own visual mini-preview', () => {
  for (const [value] of [...screenLayouts, ...guestLayouts]) {
    assert.ok(css.includes('[data-live-' + (value.startsWith('roundtable') ? 'guest-' : 'screen-') +
      'layout="' + value + '"]::before{background-image:url("data:image/svg+xml;'),
      value + ' needs its own preview diagram');
  }
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /fixed-grid"\]\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
});
